/**
 * LAN-facing HTTP API server for Android TV companion.
 *
 * Only binds when enabled in settings (networkEnabled, networkUsername,
 * networkPassword, networkPort). Every request (except GET /api/health)
 * requires Basic auth (constant-time compare). Per-IP auth failure throttle
 * returns 429 after 10 failures / 5 min window.
 *
 * Playback routing resolves a merged-channel id to an internal HLS URL via
 * the existing provider pipeline, then proxies bytes back to the Android
 * client. Playlist URIs are rewritten so segments never leave the LAN.
 */
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import { timingSafeEqual } from 'node:crypto'
import { app } from 'electron'
import { getSetting, setSetting } from './cache.service'
import * as ChannelMerge from './channel-merge.service'
import { getProvider, extractUrlWithFallback, type LiveTVServerId } from './livetv-providers'
import * as PlayerService from './player.service'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NetworkApiConfig {
  enabled: boolean
  port: number
  username: string
  password: string
}

export interface NetworkApiStatus {
  enabled: boolean
  running: boolean
  port: number
  error?: string
  lanIps: string[]
}

interface StreamSession {
  channelId: string
  clientId: string
  internalUrl: string
  lastActive: number
}

// ─── State ───────────────────────────────────────────────────────────────────

let server: Server | null = null
let config: NetworkApiConfig = { enabled: false, port: 43862, username: '', password: '' }
let statusError: string | undefined
const streams = new Map<string, StreamSession>() // key = channelId (last wins per channel)
export { streams }

// Per-IP auth failure tracking
export const authFailures = new Map<string, { count: number; resetAt: number }>()
export function clearAuthFailures(): void {
  authFailures.clear()
}
const MAX_FAILURES = 10
const FAILURE_WINDOW_MS = 5 * 60_000

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lanIps(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i: any): i is any => !!i && !i.internal && i.family === 'IPv4')
    .map((i: any) => i.address)
}

function loadConfig(): NetworkApiConfig {
  return {
    enabled: !!getSetting('networkEnabled'),
    port: Number(getSetting('networkPort')) || 43862,
    username: String(getSetting('networkUsername') || ''),
    password: String(getSetting('networkPassword') || ''),
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  }).end(JSON.stringify(body))
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

function isAuthorized(req: IncomingMessage): boolean {
  const h = req.headers.authorization || ''
  if (!h.startsWith('Basic ')) return false
  const decoded = Buffer.from(h.slice(6), 'base64').toString('utf8')
  const colon = decoded.indexOf(':')
  if (colon < 0) return false
  const user = decoded.slice(0, colon)
  const pass = decoded.slice(colon + 1)
  return safeEqual(user, config.username) && safeEqual(pass, config.password)
}

function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
  const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '')
  const now = Date.now()
  const f = authFailures.get(ip)

  // Throttle?
  if (f && f.resetAt > now && f.count >= MAX_FAILURES) {
    json(res, 429, { ok: false, error: 'Too many failed attempts' })
    return false
  }

  // Health is always allowed (no auth required)
  const urlObj = new URL(req.url!, 'http://x')
  if (urlObj.pathname === '/api/health') return true

  // Authorized?
  if (isAuthorized(req)) {
    authFailures.delete(ip)
    return true
  }

  // Failed — track
  const nf = f && f.resetAt > now ? { count: f.count + 1, resetAt: f.resetAt } : { count: 1, resetAt: now + FAILURE_WINDOW_MS }
  authFailures.set(ip, nf)
  json(res, 401, { ok: false, error: 'Unauthorized' })
  return false
}

/**
 * Rewrite an HLS playlist so every URI line points back through this API
 * server. Handles both absolute 127.0.0.1 URLs (local-cache proxy sessions)
 * and relative URIs (remux output). Master playlist variant URIs (remote
 * https://api.cdnlivetv.is/...) are also encoded and proxied through here.
 */
export function rewritePlaylist(playlist: string, channelId: string): string {
  // Internal base for resolving relative URIs — matches whatever the player
  // would have received as the source URL from startPlayback().
  const base = `http://127.0.0.1/${channelId}`
  return playlist
    .split('\n')
    .map((line) => {
      const t = line.trim()
      if (!t || t.startsWith('#') || /^data:/i.test(t)) return line
      let abs = t
      if (!/^https?:\/\//i.test(t)) {
        try {
          abs = new URL(t, base).href
        } catch {
          // If URL resolution fails, pass through as-is
          return line
        }
      }
      return `/api/stream/${channelId}/p/${encodeURIComponent(abs)}`
    })
    .join('\n')
}

// ─── Request handler ─────────────────────────────────────────────────────────

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!checkAuth(req, res)) return

  const urlObj = new URL(req.url!, 'http://x')
  const path = urlObj.pathname

  // GET /api/health — no auth, handled above but routes here if called directly
  if (path === '/api/health' && req.method === 'GET') {
    json(res, 200, {
      ok: true,
      app: 'Fynix Hub',
      version: app.getVersion(),
      apiVersion: 1,
    })
    return
  }

  // GET /api/verify
  if (path === '/api/verify' && req.method === 'GET') {
    json(res, 200, { ok: true, user: config.username })
    return
  }

  // GET /api/profiles — returns lightweight profile list for companion apps
  if (path === '/api/profiles' && req.method === 'GET') {
    try {
      const profiles = getSetting<Array<{ id: string; name: string; avatarColor?: string }>>('profiles') || []
      const activeProfileId = getSetting<string>('activeProfileId')
      json(res, 200, {
        ok: true,
        profiles: profiles.map(p => ({
          id: p.id,
          name: p.name,
          avatarColor: p.avatarColor || '#E50914',
          isActive: p.id === activeProfileId,
        })),
        activeProfileId,
      });
      return
    } catch (err: any) {
      json(res, 500, { ok: false, error: err?.message || 'Failed to fetch profiles' })
      return
    }
  }

  // POST /api/profiles/select — select active profile (companion app)
  if (path === '/api/profiles/select' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const { profileId } = JSON.parse(body)
        if (!profileId || typeof profileId !== 'string') {
          json(res, 400, { ok: false, error: 'profileId required' })
          return
        }
        setSetting('activeProfileId', profileId)
        json(res, 200, { ok: true })
      } catch (err: any) {
        json(res, 500, { ok: false, error: err?.message || 'Failed to select profile' })
      }
    })
    return
  }

  // GET /api/channels
  if (path === '/api/channels' && req.method === 'GET') {
    const limit = Math.min(Number(urlObj.searchParams.get('limit')) || 500, 5000)
    const offset = Number(urlObj.searchParams.get('offset')) || 0
    try {
      const all = await ChannelMerge.getMergedChannels()
      const page = all.slice(offset, offset + limit)
      json(res, 200, { ok: true, total: all.length, limit, offset, channels: page })
    } catch (err: any) {
      json(res, 500, { ok: false, error: err?.message || 'Failed to fetch channels' })
    }
    return
  }

  // GET /api/channels/search
  if (path === '/api/channels/search' && req.method === 'GET') {
    const q = (urlObj.searchParams.get('q') || '').trim()
    if (!q) {
      json(res, 400, { ok: false, error: 'q required' })
      return
    }
    try {
      const hits = await ChannelMerge.searchMergedChannels(q, Number(urlObj.searchParams.get('limit')) || 100)
      json(res, 200, { ok: true, channels: hits })
    } catch (err: any) {
      json(res, 500, { ok: false, error: err?.message || 'Search failed' })
    }
    return
  }

  // GET /api/stream/<channelId>/p/<encoded>
  const streamMatch = path.match(/^\/api\/stream\/([^/]+)\/p\/?(.*)$/)
  if (streamMatch && req.method === 'GET') {
    const channelId = decodeURIComponent(streamMatch[1])
    const encoded = streamMatch[2]

    try {
      // Resolve or reuse session
      let session = streams.get(channelId)
      if (!session) {
        const all = await ChannelMerge.getMergedChannels()
        const ch = all.find((c: any) => c.id === channelId)
        if (!ch) {
          json(res, 404, { ok: false, error: 'Channel not found' })
          return
        }

        const rawSource = ch.sources?.[0] || 'cdnlive'
        // Merged channels use 'm3u'; provider registry uses 'iptv-m3u'
        const resolvedProviderId = (rawSource === 'm3u' ? 'iptv-m3u' : rawSource) as LiveTVServerId

        const result = await extractUrlWithFallback(resolvedProviderId, ch as { id: string; name: string; countryCode: string; playerUrl?: string })
        if (!result.hlsUrl) {
          json(res, 404, { ok: false, error: result.error || 'No stream URL' })
          return
        }

        const clientId = `net:${channelId}`
        const { streamUrl } = await PlayerService.startPlayback(result.hlsUrl, 0, undefined, undefined, undefined, clientId)
        session = { channelId, clientId, internalUrl: streamUrl, lastActive: Date.now() }
        streams.set(channelId, session)
      } else {
        session.lastActive = Date.now()
      }

      // No encoded path — fetch the internal playlist
      if (!encoded) {
        try {
          const resp = await fetch(session.internalUrl)
          const contentType = resp.headers.get('content-type') || ''
          if (contentType.includes('mpegurl') || contentType.includes('vnd.apple.mpegurl') || session.internalUrl.endsWith('.m3u8')) {
            const playlist = await resp.text()
            const rewritten = rewritePlaylist(playlist, channelId)
            json(res, 200, rewritten)
            return
          }
          // Binary segment passthrough
          const buf = Buffer.from(await resp.arrayBuffer())
          res.writeHead(resp.status || 200, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
          })
          res.end(buf)
        } catch (err: any) {
          json(res, 502, { ok: false, error: `Upstream fetch failed: ${err?.message}` })
        }
        return
      }

      // Encoded path — passthrough segment
      try {
        const decoded = decodeURIComponent(encoded)
        const resp = await fetch(decoded)
        const contentType = resp.headers.get('content-type') || 'application/octet-stream'
        const buf = Buffer.from(await resp.arrayBuffer())
        res.writeHead(resp.status || 200, {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
        })
        res.end(buf)
      } catch (err: any) {
        json(res, 502, { ok: false, error: `Segment fetch failed: ${err?.message}` })
      }
      return
    } catch (err: any) {
      json(res, 500, { ok: false, error: err?.message || 'Stream failed' })
    }
    return
  }

  // POST /api/stream/stop
  if (path === '/api/stream/stop' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      try {
        const data = body ? JSON.parse(body) : {}
        const channelId = data.channelId as string | undefined
        if (!channelId) {
          json(res, 400, { ok: false, error: 'channelId required' })
          return
        }
        const session = streams.get(channelId)
        if (session) {
          PlayerService.stopPlayback(session.clientId)
          streams.delete(channelId)
        }
        json(res, 200, { ok: true })
      } catch (err: any) {
        json(res, 400, { ok: false, error: err?.message || 'Invalid body' })
      }
    })
    return
  }

  // 404 for everything else
  json(res, 404, { ok: false, error: 'Not found' })
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

export function getStatus(): NetworkApiStatus {
  return { enabled: config.enabled, running: !!server, port: config.port, error: statusError, lanIps: lanIps() }
}

export async function setConfig(cfg: NetworkApiConfig): Promise<NetworkApiStatus> {
  config = cfg
  return reload()
}

export async function reload(): Promise<NetworkApiStatus> {
  // Tear down existing server (await close to avoid EADDRINUSE on rapid reloads)
  if (server) {
    try {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
    } catch {
      // close() may throw if not listening — ignore
    }
    server = null
  }
  statusError = undefined

  // Use the in-memory config (setConfig already updated it).
  // Only init() reads from cache, so tests that call setConfig directly work.
  if (!config.enabled || !config.username || !config.password) {
    return getStatus()
  }

  try {
    const srv = createServer(handleRequest)
    await new Promise<void>((resolve, reject) => {
      srv.once('error', reject)
      srv.listen(config.port, '0.0.0.0', () => resolve())
    })
    server = srv
    const addr = server.address() as { port: number }
    if (config.port === 0) config.port = addr.port
    console.log(`[NetworkApi] listening on http://0.0.0.0:${addr.port} (LAN: ${lanIps().map((i) => `http://${i}:${addr.port}`).join(', ')})`)
  } catch (err: any) {
    statusError = err?.code === 'EADDRINUSE' ? `Port ${config.port} already in use` : String(err?.message || err)
    console.log('[NetworkApi] failed to start:', statusError)
  }

  return getStatus()
}

export async function init(): Promise<void> {
  config = loadConfig()
  if (config.enabled) await reload()
}

// Idle session sweep — kill sessions not touched in 30 min
let idleSweep: ReturnType<typeof setInterval> | null = null

export function startIdleSweep(): void {
  if (idleSweep) return
  idleSweep = setInterval(() => {
    const now = Date.now()
    for (const [channelId, session] of streams) {
      if (now - session.lastActive > 30 * 60 * 1000) {
        console.log(`[NetworkApi] idle session expired: ${channelId}`)
        PlayerService.stopPlayback(session.clientId)
        streams.delete(channelId)
      }
    }
  }, 5 * 60 * 1000) // check every 5 min
}

export function stopIdleSweep(): void {
  if (idleSweep) {
    clearInterval(idleSweep)
    idleSweep = null
  }
}

export async function destroy(): Promise<void> {
  stopIdleSweep()
  // Stop all network sessions
  for (const [channelId, session] of streams) {
    PlayerService.stopPlayback(session.clientId)
  }
  streams.clear()
  if (server) {
    server.close()
    server = null
  }
  authFailures.clear()
}
