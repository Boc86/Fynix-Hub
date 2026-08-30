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
import { createServer, type Server, type IncomingMessage, type ServerResponse, get as httpRequest } from 'node:http'
import { networkInterfaces } from 'node:os'
import { timingSafeEqual } from 'node:crypto'
import { app } from 'electron'
import { getSetting, setSetting, clearMdblistCache, clearImageCache, clearSportsCache, updateWatchProgress, deleteWatchProgress } from './cache.service'
import * as ChannelMerge from './channel-merge.service'
import { getProvider, extractUrlWithFallback, type LiveTVServerId } from './livetv-providers'
import * as PlayerService from './player.service'
import * as TmdbService from './tmdb.service'
import * as FanartService from './fanart.service'
import * as MdblistService from './mdblist.service'
import * as EpgService from './epg.service'
import * as SportsService from './sports.service'
import * as RecordingsService from './recordings.service'
import * as StreamedPkService from './streamedpk.service'
import * as RivestreamService from './rivestream.service'
import * as TorrentSearchService from './torrent-search.service'
import * as UsenetSearchService from './usenet-search.service'
import * as WebTorrentService from './webtorrent.service'
import * as UsenetService from './usenet.service'
import * as DebridService from './debrid.service'

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

  // Health and image proxy are always allowed (no auth required)
  const urlObj = new URL(req.url!, 'http://x')
  if (urlObj.pathname === '/api/health' || urlObj.pathname === '/api/img') return true

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

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      if (!body) { resolve({}) }
      try { resolve(JSON.parse(body)) } catch (e) { resolve({}) }
    })
    req.on('error', reject)
  })
}

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

  // GET /api/img?u=<encoded external image URL> — proxy remote images through
  // the desktop server so the companion never needs direct WAN access to
  // image CDNs (many channel-logo hosts are unreachable from the device's
  // network). The server has full internet reach.
  if (path === '/api/img' && req.method === 'GET') {
    const target = urlObj.searchParams.get('u')
    if (!target) {
      json(res, 400, { ok: false, error: 'u required' })
      return
    }
    let decoded: string
    try {
      decoded = decodeURIComponent(target)
    } catch {
      json(res, 400, { ok: false, error: 'bad u' })
      return
    }
    // Only allow http(s) image hosts.
    if (!/^https?:\/\//i.test(decoded)) {
      json(res, 400, { ok: false, error: 'bad url' })
      return
    }
    try {
      const upstream = await fetch(decoded, {
        headers: { 'User-Agent': 'Mozilla/5.0 (FynixHub ImageProxy)' },
      })
      if (!upstream.ok) {
        json(res, upstream.status, { ok: false, error: `upstream ${upstream.status}` })
        return
      }
      const buf = Buffer.from(await upstream.arrayBuffer())
      const ct = upstream.headers.get('content-type') || 'image/jpeg'
      res.writeHead(200, {
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      })
      res.end(buf)
      return
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'image proxy error' })
      return
    }
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
        const profiles = getSetting<Array<{ id: string; name: string; avatarColor?: string; mdblistAccessToken?: string; mdblistRefreshToken?: string }>>('profiles') || []
        const profile = profiles.find((p) => p.id === profileId)
        setSetting('activeProfileId', profileId)
        // Install the selected profile's MDBList tokens so API calls use the correct profile
        if (profile?.mdblistAccessToken) {
          MdblistService.setTokens(profile.mdblistAccessToken, profile.mdblistRefreshToken || null)
        } else {
          MdblistService.setTokens(null, null)
        }
        // Clear caches so profile-specific data reloads with the new profile's tokens
        clearMdblistCache()
        clearImageCache()
        clearSportsCache()
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

  // GET /api/channels/visible — only channels marked visible in desktop app, in desktop-set order
  if (path === '/api/channels/visible' && req.method === 'GET') {
    try {
      const all = await ChannelMerge.getMergedChannels()
      const visibleIds: string[] = getSetting<string[]>('liveTvVisibleChannels') || []
      const hiddenIds: string[] = getSetting<string[]>('liveTvHiddenChannels') || []
      const channelOrder: string[] = getSetting<string[]>('liveTvChannelOrder') || []
      const visibleSet = new Set(visibleIds)
      const hiddenSet = new Set(hiddenIds)

      let filtered = all.filter(c => {
        // If a visible list is set, channel must be in it
        if (visibleIds.length > 0 && !visibleSet.has(c.id)) return false
        // Channel must not be in hidden list
        if (hiddenSet.has(c.id)) return false
        return true
      })

      // Sort by channelOrder if set
      if (channelOrder.length > 0) {
        const orderMap = new Map(channelOrder.map((id, i) => [id, i]))
        const ordered = filtered.filter(c => orderMap.has(c.id)).sort((a, b) => {
          const ia = orderMap.get(a.id) ?? channelOrder.length
          const ib = orderMap.get(b.id) ?? channelOrder.length
          return ia - ib
        })
        // Channels not in order map go after ordered ones (preserve merged order)
        const notOrdered = filtered.filter(c => !orderMap.has(c.id))
        filtered = [...ordered, ...notOrdered]
      }

      json(res, 200, { ok: true, total: filtered.length, channels: filtered })
    } catch (err: any) {
      json(res, 500, { ok: false, error: err?.message || 'Failed to fetch visible channels' })
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

  // ─── TMDB proxy routes (for Android companion Home/Movies/TV/Sports) ───
  const tmdbMatch = path.match(/^\/api\/tmdb\/(.+)$/)
  if (tmdbMatch && req.method === 'GET') {
    const rest = tmdbMatch[1]
    try {
      const result = await routeTmdb(rest, urlObj.searchParams)
      json(res, 200, result)
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'TMDB proxy error' })
    }
    return
  }

  // GET /api/fanart/images/{tmdbId}/{type}
  const fanartMatch = path.match(/^\/api\/fanart\/images\/(\d+)\/(.+)$/)
  if (fanartMatch && req.method === 'GET') {
    const tmdbId = parseInt(fanartMatch[1], 10)
    const mediaType = fanartMatch[2] as 'movie' | 'tv'
    try {
      const result = await FanartService.getImages(tmdbId, mediaType)
      json(res, 200, result)
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'Fanart error' })
    }
    return
  }

  // GET /api/watch-history — recent watch history (MDBList)
  if (path === '/api/watch-history' && req.method === 'GET') {
    try {
      const result = await MdblistService.getWatchHistory()
      json(res, 200, result)
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'MDBList error' })
    }
    return
  }

  // GET /api/mdblist/watched-progress — in-progress items for Up Next row
  if (path === '/api/mdblist/watched-progress' && req.method === 'GET') {
    try {
      const result = await MdblistService.getWatchedProgress()
      json(res, 200, result)
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'MDBList error' })
    }
    return
  }

  // GET /api/mdblist/watched — watched movie and show IDs (for companion app badges)
  if (path === '/api/mdblist/watched' && req.method === 'GET') {
    try {
      const [watchedMovies, watchedShows] = await Promise.all([
        MdblistService.getWatchedMovies().catch(() => null),
        MdblistService.getWatchedShows().catch(() => null),
      ])
      const movieIds: number[] = (watchedMovies || []).map((m: any) => m.movie?.ids?.tmdb).filter(Boolean)
      const showIds: number[] = (watchedShows || []).map((s: any) => s.show?.ids?.tmdb).filter(Boolean)
      json(res, 200, { movies: movieIds, shows: showIds })
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'MDBList error' })
    }
    return
  }

  // GET /api/mdblist/watched-shows — per-episode watched data for TV shows
  // Returns [{ show: { ids: { tmdb } }, seasons: [{ number, episodes: [{ number }] }] }]
  if (path === '/api/mdblist/watched-shows' && req.method === 'GET') {
    try {
      const watchedShows = await MdblistService.getWatchedShows().catch(() => [])
      json(res, 200, watchedShows)
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'MDBList error' } )
    }
    return
  }

  // GET /api/mdblist/watchlist — watchlist items for the Watchlist row
  // Returns [{ tmdb_id, media_type, title, year, ... }]
  if (path === '/api/mdblist/watchlist' && req.method === 'GET') {
    try {
      const result = await MdblistService.getWatchlist()
      json(res, 200, result)
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'MDBList error' })
    }
    return
  }

  // GET /api/mdblist/playback — currently playing items (MDBList)
  if (path === '/api/mdblist/playback' && req.method === 'GET') {
    try {
      const result = await MdblistService.getPlayback()
      json(res, 200, result)
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'MDBList error' })
    }
    return
  }

  // GET /api/sports/schedule — today's sports matches (streamed.sport)
  if (path === '/api/sports/schedule' && req.method === 'GET') {
    try {
      const sports = await SportsService.getSportsList()
      const sportSlugs = sports.map((s: any) => s.slug).filter(Boolean)
      const CATEGORY_MAP: Record<string, string> = {
        soccer: 'soccer', football: 'soccer', 'american football': 'nfl',
        basketball: 'basketball', nba: 'basketball', hockey: 'hockey', nhl: 'hockey',
        baseball: 'baseball', mlb: 'baseball', tennis: 'tennis', boxing: 'ufc',
        mma: 'ufc', ufc: 'ufc', motorsport: 'motorsport', 'formula 1': 'motorsport',
        f1: 'motorsport', nascar: 'motorsport', motogp: 'motorsport', rugby: 'rugby',
        golf: 'golf', cricket: 'cricket', darts: 'darts', snooker: 'snooker',
        cycling: 'cycling', volleyball: 'volleyball', badminton: 'badminton',
      }
      const categories = new Set<string>()
      for (const sport of sportSlugs) {
        const lower = sport.toLowerCase()
        if (CATEGORY_MAP[lower]) categories.add(CATEGORY_MAP[lower])
        else categories.add(lower)
      }
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      const todayEnd = todayStart + 86400000
      const matches = await StreamedPkService.getMatchesForSports([...categories])
      const todayMatches = (matches || []).filter((m: any) => m.date >= todayStart && m.date <= todayEnd)
      json(res, 200, todayMatches)
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'Sports schedule error' })
    }
    return
  }

  // GET /api/sports/list — sports list for Android companion
  if (path === '/api/sports/list' && req.method === 'GET') {
    try {
      const result = await SportsService.getSportsList()
      // Filter by sportsSelected setting if it exists (matches desktop behavior)
      const selected: string[] = getSetting<string[]>('sportsSelected') || []
      const filtered = selected.length > 0
        ? result.filter((s: any) => selected.includes(s.id))
        : result
      json(res, 200, filtered)
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'Sports error' })
    }
    return
  }

  // GET /api/sports/leagues?sportId=<id> — leagues for a sport
  if (path === '/api/sports/leagues' && req.method === 'GET') {
    const sportId = urlObj.searchParams.get('sportId') || ''
    try {
      const result = await SportsService.getLeaguesBySport(sportId)
      json(res, 200, result)
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'Sports error' })
    }
    return
  }

  // GET /api/sports/seasons?leagueId=<id> — seasons for a league
  if (path === '/api/sports/seasons' && req.method === 'GET') {
    const leagueId = urlObj.searchParams.get('leagueId') || ''
    try {
      const result = await SportsService.getSeasons(leagueId)
      json(res, 200, result)
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'Sports error' })
    }
    return
  }

  // GET /api/sports/events?leagueId=<id>&seasonId=<id>&from=<date>&to=<date>
  if (path === '/api/sports/events' && req.method === 'GET') {
    const leagueId = urlObj.searchParams.get('leagueId') || ''
    const seasonId = urlObj.searchParams.get('seasonId') || ''
    const from = urlObj.searchParams.get('from') || ''
    const to = urlObj.searchParams.get('to') || ''
    try {
      const result = await SportsService.getEventsInRange(leagueId, seasonId, from, to)
      json(res, 200, result)
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'Sports error' })
    }
    return
  }

  // GET /api/sports/team?id=<teamId>
  if (path === '/api/sports/team' && req.method === 'GET') {
    const teamId = urlObj.searchParams.get('id') || ''
    try {
      const result = await SportsService.getTeamDetails(teamId)
      json(res, 200, result)
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'Sports error' })
    }
    return
  }

  // GET /api/epg/channels — EPG channels for Android companion
  if (path === '/api/epg/channels' && req.method === 'GET') {
    try {
      const result = await EpgService.getChannels()
      json(res, 200, result)
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'EPG error' })
    }
    return
  }

  // GET /api/epg/now-next?channelId=<id>
  if (path === '/api/epg/now-next' && req.method === 'GET') {
    const channelId = urlObj.searchParams.get('channelId') || ''
    try {
      const result = EpgService.getNowNext(channelId)
      json(res, 200, result)
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'EPG error' })
    }
    return
  }

  // GET /api/epg/schedule?channelId=<id>&date=<YYYY-MM-DD>
  if (path === '/api/epg/schedule' && req.method === 'GET') {
    const channelId = urlObj.searchParams.get('channelId') || ''
    const date = urlObj.searchParams.get('date') || ''
    try {
      const result = EpgService.getSchedule(channelId, date)
      json(res, 200, result)
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'EPG error' })
    }
    return
  }

  // GET /api/recordings — list all recordings
  if (path === '/api/recordings' && req.method === 'GET') {
    try {
      const result = await RecordingsService.listRecordings()
      json(res, 200, result)
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'Recordings error' })
    }
    return
  }

  // GET /api/recordings/schedule?channelName=<name>&start=<ts>&duration=<sec>
  if (path === '/api/recordings/schedule' && req.method === 'GET') {
    const channelName = urlObj.searchParams.get('channelName') || ''
    const start = parseInt(urlObj.searchParams.get('start') || '0', 10)
    const duration = parseInt(urlObj.searchParams.get('duration') || '0', 10)
    try {
      const result = await RecordingsService.scheduleRecording({
        title: channelName,
        channelName,
        startTime: start,
        endTime: start + duration,
        channel: { id: channelName, name: channelName, countryCode: '', playerUrl: '' },
        sources: [],
      })
      json(res, 200, { ok: true, id: result })
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'Recordings error' })
    }
    return
  }

  // POST /api/mdblist/mark-watched — mark movie/show/episode as watched
  if (path === '/api/mdblist/mark-watched' && req.method === 'POST') {
    try {
      const body = await readBody(req)
      const result = await MdblistService.markWatched(body)
      json(res, 200, result)
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'MDBList error' })
    }
    return
  }

  // POST /api/mdblist/mark-unwatched — mark movie/show/episode as unwatched
  if (path === '/api/mdblist/mark-unwatched' && req.method === 'POST') {
    try {
      const body = await readBody(req)
      const result = await MdblistService.markUnwatched(body)
      json(res, 200, result)
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'MDBList error' })
    }
    return
  }

  // POST /api/mdblist/scrobble — scrobble playback (start/pause/stop)
  if (path === '/api/mdblist/scrobble' && req.method === 'POST') {
    try {
      const body = await readBody(req)
      const { action, media } = body
      const result = await MdblistService.scrobble(action, media)
      json(res, 200, result)
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'MDBList scrobble error' })
    }
    return
  }

  // POST /api/watch/progress — save playback progress
  if (path === '/api/watch/progress' && req.method === 'POST') {
    try {
      const body = await readBody(req)
      const { tmdbId, mediaType, progress, season, episode } = body
      updateWatchProgress(tmdbId, mediaType, progress, season, episode)
      json(res, 200, { ok: true })
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'Progress save error' })
    }
    return
  }

  // DELETE /api/watch/progress — delete playback progress (watched or reset)
  if (path === '/api/watch/progress' && req.method === 'DELETE') {
    try {
      const body = await readBody(req)
      const { tmdbId, mediaType, season, episode } = body
      deleteWatchProgress(tmdbId, mediaType, season, episode)
      json(res, 200, { ok: true })
    } catch (err: any) {
      json(res, 502, { ok: false, error: err?.message || 'Progress delete error' })
    }
    return
  }

  // POST /api/play/resolve — search torrents/usenet and return a stream URL
  if (path === '/api/play/resolve' && req.method === 'POST') {
    const timeoutMs = 60000
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      json(res, 408, { ok: false, error: 'Search timed out — try again later' })
    }, timeoutMs)
    readBody(req).then(async (body: any) => {
      if (timedOut) return
      try {
        const { tmdbId, mediaType, title, year, season, episode, autoPlay } = body
        const isEpisode = mediaType === 'tv' && !!episode
        const isCompanion = autoPlay === false
        const searchParams: TorrentSearchService.TorrentQuery = {
          title: title || '',
          year,
          type: isEpisode ? 'episode' : 'movie',
          season: isEpisode ? season : undefined,
          episode: isEpisode ? episode : undefined,
          tmdbId: tmdbId || undefined,
        }

        // Search torrents with streaming - send results as they arrive
        let resultCount = 0
        if (isCompanion) {
          try {
            const enabledIndexers = getSetting<string[]>('enabledIndexers') || []
            const customIndexers = getSetting<any[]>('customIndexers') || []
            const maxSizeBytes = (getSetting<number>('maxTorrentSize') || 10) * 1024 * 1024 * 1024
            console.log('[NetworkApi] Companion search starting for', title)

            // Search torrents with callback
            const torrentSearch = new Promise<void>(async (resolve) => {
              try {
                await TorrentSearchService.searchTorrents(searchParams, enabledIndexers, customIndexers, (r) => {
                  if (timedOut) { resolve(); return }
                  const sizeBytes = r.size || 0
                  if (sizeBytes > maxSizeBytes) return
                  const data = JSON.stringify({ title: r.title, sizeGb: Math.round(sizeBytes / (1024*1024*1024) * 10) / 10, seeders: r.seeders, magnet: r.magnetUri, source: 'torrent' })
                  resultCount++
                  res.write(`data: {"type":"result","data":${data}}\n\n`)
                }, true)
              } catch (e) { console.log('[NetworkApi] Torrent search error:', e) }
              resolve()
            })

            // Search usenet with callback
            const usenetSearch = new Promise<void>(async (resolve) => {
              try {
                const enabledIds = getSetting<string[]>('enabledUsenetIndexers') || []
                const customUsenet = getSetting<any[]>('customUsenetIndexers') || []
                const preferredLangs = getSetting<string[]>('preferredLanguages') || ['English']
                const usenetParams: UsenetSearchService.UsenetQuery = {
                  title: searchParams.title,
                  year: searchParams.year,
                  type: isEpisode ? 'tv' : 'movie',
                  season: searchParams.season,
                  episode: searchParams.episode,
                }
                await UsenetSearchService.searchUsenet(usenetParams, enabledIds, customUsenet, (u) => {
                  if (timedOut) return
                  const data = JSON.stringify({ title: u.title, sizeGb: Math.round((u.size || 0) / (1024*1024*1024) * 10) / 10, source: 'usenet', indexer: u.indexer, quality: u.quality })
                  resultCount++
                  res.write(`data: {"type":"result","data":${data}}\n\n`)
                }, preferredLangs)
              } catch (e) { console.log('[NetworkApi] Usenet search error:', e) }
              resolve()
            })

            // Search vyla with callback
            const vylaSearch = new Promise<void>(async (resolve) => {
              try {
                await RivestreamService.searchRivestream(
                  tmdbId!,
                  isEpisode ? 'tv' : 'movie',
                  isEpisode ? season : undefined,
                  isEpisode ? episode : undefined,
                  (v) => {
                    if (timedOut) return
                    const data = JSON.stringify({ title: v.title, source: 'vyla', streamUrl: v.embedUrl, quality: v.quality, indexer: v.indexer })
                    resultCount++
                    res.write(`data: {"type":"result","data":${data}}\n\n`)
                  }
                )
              } catch (e) { console.log('[NetworkApi] Vyla search error:', e) }
              resolve()
            })

            // Run all searches in parallel
            await Promise.all([torrentSearch, usenetSearch, vylaSearch])
          } catch (e: any) {
            console.log('[NetworkApi] Search error:', e.message)
          }
          clearTimeout(timeout)
          res.write(`data: {"type":"done","count":${resultCount}}\n\n`)
          res.end()
          return
        }
        let results: any[] = []
        try {
          const enabledIndexers = getSetting<string[]>('enabledIndexers') || []
          const customIndexers = getSetting<any[]>('customIndexers') || []
          results = await Promise.race([
            TorrentSearchService.searchTorrents(searchParams, enabledIndexers, customIndexers, () => {}),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Torrent search timeout')), 8000)),
          ])
        } catch (e) { /* ignore */ }

        // Sort by size ascending (prefer smallest files)
        results = results.sort((a: any, b: any) => (a.size || 0) - (b.size || 0))

        const maxSizeBytes = (getSetting<number>('maxTorrentSize') || 10) * 1024 * 1024 * 1024

        // Try each result sequentially — skip if too large
        let addedCount = 0
        for (const r of results) {
          if (timedOut) break
          const sizeBytes = r.size || 0
          if (sizeBytes > maxSizeBytes) continue
          if (isCompanion) continue // companion shows picker, no auto-play
          try {
            const torrent = await WebTorrentService.addTorrent(r.magnetUri)
            if (!torrent.infoHash) continue
            addedCount++
            const stream = await WebTorrentService.getStreamUrl(torrent.infoHash, 0)
            if (stream?.url) {
              clearTimeout(timeout)
              json(res, 200, { ok: true, url: stream.url, title: r.title, source: 'torrent', sizeGb: sizeBytes / (1024*1024*1024) })
              return
            }
          } catch (e) { /* try next */ }
        }

        // Try usenet with timeout
        try {
          const enabledIds = getSetting<string[]>('enabledUsenetIndexers') || []
          const customUsenet = getSetting<any[]>('customUsenetIndexers') || []
          const preferredLangs = getSetting<string[]>('preferredLanguages') || ['English']
          const usenetParams: UsenetSearchService.UsenetQuery = {
            title: searchParams.title,
            year: searchParams.year,
            type: isEpisode ? 'tv' : 'movie',
            season: searchParams.season,
            episode: searchParams.episode,
          }
          const [usenetResults] = await Promise.race([
            Promise.all([
              UsenetSearchService.searchUsenet(usenetParams, enabledIds, customUsenet, () => {}, preferredLangs),
              UsenetService.searchWebdavCache(searchParams.title!, { title: searchParams.title!, year: searchParams.year, type: isEpisode ? 'tv' : 'movie', season: searchParams.season, episode: searchParams.episode }),
            ]),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Usenet search timeout')), 5000)),
          ])
          for (const u of usenetResults) {
            if (u.streamUrl) {
              clearTimeout(timeout)
              json(res, 200, { ok: true, url: u.streamUrl, title: u.title, source: 'usenet-cache' })
              return
            }
            if (u.nzbUrl) {
              try {
                const status = await UsenetService.sendNzb(u.nzbUrl, u.title, u.size)
                if (status?.id) {
                  const streamUrl = await UsenetService.getStreamUrl(status.id)
                  if (streamUrl) {
                    clearTimeout(timeout)
                    json(res, 200, { ok: true, url: streamUrl, title: u.title, source: 'usenet' })
                    return
                  }
                }
              } catch (e) { /* try next */ }
            }
          }
        } catch (e) { /* ignore */ }

        // Return results as a picker for companion (or all results for desktop)
        clearTimeout(timeout)
        const filteredResults = results.filter((r: any) => (r.size || 0) <= maxSizeBytes)
        json(res, 200, {
          ok: true,
          ...(isCompanion
            ? { results: filteredResults.map(r => ({
                title: r.title,
                sizeGb: Math.round((r.size || 0) / (1024*1024*1024) * 10) / 10,
                seeders: r.seeders,
                magnet: r.magnetUri,
                source: 'torrent',
              })),
              count: filteredResults.length }
            : { url: filteredResults[0]?.magnetUri ? 'picker' : null, count: filteredResults.length })
        })
      } catch (err: any) {
        if (!timedOut) clearTimeout(timeout)
        json(res, 502, { ok: false, error: err?.message || 'Playback resolve error' })
      }
    }).catch((e: any) => {
      if (!timedOut) clearTimeout(timeout)
      json(res, 500, { ok: false, error: e?.message || 'Bad request' })
    })
    return
  }

  // POST /api/stream/magnet — add torrent by magnet and return stream URL
  if (path === '/api/stream/magnet' && req.method === 'POST') {
    readBody(req).then(async (body: any) => {
      try {
        const magnet = body?.magnet
        if (!magnet) throw new Error('Missing magnet')
        let torrent
        try {
          torrent = await WebTorrentService.addTorrent(magnet)
        } catch (e: any) {
          // Already cached — extract info hash from error and get existing stream
          if (e.message?.includes('duplicate') || e.message?.includes('already') || e.message?.includes('Cannot add')) {
            // Try to get the info hash from the magnet
            const match = magnet.match(/btih:([a-fA-F0-9]{40})/)
            if (match) {
              const infoHash = match[1].toLowerCase()
              // Wait for torrent to be ready (up to 30s total)
              let attempts = 0
              while (attempts < 30) {
                try {
                  const stream = await WebTorrentService.getStreamUrl(infoHash, 0)
                  if (stream?.url) {
                    // Rewrite localhost URL to use proxy endpoint for remote access
                    const localUrl = stream.url
                    const proxyUrl = `/api/torrent-stream/${infoHash}/0`
                    json(res, 200, { ok: true, url: proxyUrl, title: 'Cached torrent' })
                    return
                  }
                } catch (_) {
                  // Not ready yet
                }
                await new Promise(r => setTimeout(r, 1000))
                attempts++
              }
              json(res, 500, { ok: false, error: 'Torrent not ready after 30s' })
              return
            }
          }
          throw e
        }
        if (!torrent.infoHash) throw new Error('Failed to add torrent')
        const stream = await WebTorrentService.getStreamUrl(torrent.infoHash, 0)
        if (!stream?.url) throw new Error('No stream URL')
        // Rewrite localhost URL to use proxy endpoint for remote access
        const proxyUrl = `/api/torrent-stream/${torrent.infoHash}/0`
        json(res, 200, { ok: true, url: proxyUrl, title: torrent.name })
      } catch (err: any) {
        json(res, 500, { ok: false, error: err?.message || 'Stream failed' })
      }
    }).catch((err: any) => {
      json(res, 500, { ok: false, error: err?.message || 'Request error' })
    })
    return
  }

  // GET /api/torrent-stream/<infoHash>/<fileIndex> — proxy webtorrent stream for remote clients
  const torrentStreamMatch = path.match(/^\/api\/torrent-stream\/([a-fA-F0-9]+)\/(\d+)/)
  if (torrentStreamMatch && req.method === 'GET') {
    // Note: No auth required here - the magnet endpoint already authenticates
    const infoHash = torrentStreamMatch[1].toLowerCase()
    const fileIndex = parseInt(torrentStreamMatch[2], 10)
    try {
      const stream = await WebTorrentService.getStreamUrl(infoHash, fileIndex)
      if (!stream?.url) {
        json(res, 404, { ok: false, error: 'Stream not found' })
        return
      }
      // Forward the request to the local cache using Node.js http
      const upstreamUrl = new URL(stream.url)
      const upstream = await new Promise<any>((resolve, reject) => {
        httpRequest(upstreamUrl.toString(), (upRes: any) => {
          if (upRes.statusCode && upRes.statusCode >= 400) {
            upRes.destroy()
            return reject(new Error(`Upstream returned ${upRes.statusCode}`))
          }
          resolve(upRes)
        }).on('error', reject)
      }) as any
      res.writeHead(upstream.statusCode || 200, {
        'Content-Type': upstream.headers['content-type'] || 'video/mp4',
        'Accept-Ranges': 'bytes',
      })
      upstream.pipe(res)
      upstream.on('error', () => {})
    } catch (err: any) {
      json(res, 500, { ok: false, error: err?.message || 'Stream proxy failed' })
    }
    return
  }

  // 404 for everything else
  json(res, 404, { ok: false, error: 'Not found' })
}

/**
 * Maps Android companion TMDB proxy paths to raw TMDB API calls.
 * Returns RAW TMDB JSON (snake_case) so the companion's MediaItem data
 * class (poster_path, backdrop_path, release_date, etc.) deserialises
 * correctly. The desktop renderer uses mapKeys() to camelCase, but the
 * companion expects the raw snake_case shape.
 */
async function routeTmdb(rest: string, params: URLSearchParams): Promise<any> {
  const parts = rest.split('/')
  const first = parts[0]
  const second = parts[1]
  const query: Record<string, string> = {}
  params.forEach((v, k) => { query[k] = v })

  // trending/{media_type}/{time_window}
  if (first === 'trending' && parts.length >= 3) {
    return await TmdbService.fetchTmdbRaw(`/trending/${parts[1]}/${parts[2]}`)
  }

  // {type}/popular  →  /{type}/popular
  if (second === 'popular' && (first === 'movie' || first === 'tv')) {
    query.page = query.page || '1'
    return await TmdbService.fetchTmdbRaw(`/${first}/popular`, query)
  }

  // {type}/top_rated  →  /{type}/top_rated
  if (second === 'top_rated' && (first === 'movie' || first === 'tv')) {
    query.page = query.page || '1'
    return await TmdbService.fetchTmdbRaw(`/${first}/top_rated`, query)
  }

  // genre/movie/list | genre/tv/list
  if (first === 'genre' && (second === 'movie' || second === 'tv') && parts[2] === 'list') {
    return await TmdbService.fetchTmdbRaw(`/genre/${second}/list`)
  }

  // discover/movie | discover/tv
  if (first === 'discover' && (second === 'movie' || second === 'tv')) {
    query.page = query.page || '1'
    if (!query.sort_by) query.sort_by = 'popularity.desc'
    return await TmdbService.fetchTmdbRaw(`/discover/${second}`, query)
  }

  // search/movie?q= | search/tv?q=
  if (first === 'search' && (second === 'movie' || second === 'tv')) {
    query.page = query.page || '1'
    return await TmdbService.fetchTmdbRaw(`/search/${second}`, query)
  }

  // movie/{id} | tv/{id}  — details with credits/images/etc
  if ((first === 'movie' || first === 'tv') && parts.length === 2) {
    const append = first === 'movie'
      ? 'credits,videos,images,release_dates'
      : 'credits,videos,images,content_ratings'
    return await TmdbService.fetchTmdbRaw(`/${first}/${second}`, { append_to_response: append })
  }

  // tv/{id}/season/{season} — season details with episodes
  if (first === 'tv' && parts.length === 4 && parts[2] === 'season') {
    return await TmdbService.fetchTmdbRaw(`/tv/${parts[1]}/season/${parts[3]}`, { append_to_response: 'credits' })
  }

  // tv/{id}/season/{season}/episode/{episode} — individual episode
  if (first === 'tv' && parts.length === 6 && parts[2] === 'season' && parts[4] === 'episode') {
    return await TmdbService.fetchTmdbRaw(`/tv/${parts[1]}/season/${parts[3]}/episode/${parts[5]}`, { append_to_response: 'credits' })
  }

  // {type}/{id}/similar — similar movies or TV shows
  if ((first === 'movie' || first === 'tv') && parts.length === 3 && parts[2] === 'similar') {
    return await TmdbService.fetchTmdbRaw(`/${first}/${parts[1]}/similar`)
  }

  throw new Error(`Unknown TMDB path: ${rest}`)
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
