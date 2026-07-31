import { app } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import * as path from 'path'
import { extractChannelUrl } from './dami-tv.service'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RecordingChannel {
  id: string
  name: string
  countryCode: string
  playerUrl?: string
}

/** A candidate source for a recording. CDN types are resolved to a fresh
 *  stream URL at record time (tokens are one-time-use); m3u carries its
 *  stable direct URL. */
export interface RecordingSource {
  type: 'cdnlive' | 'ondemand' | 'dlhd' | 'm3u'
  url?: string
}

export interface Recording {
  id: string
  title: string
  channelName: string
  startTime: number  // epoch ms
  endTime: number    // epoch ms
  actualStartTime: number  // epoch ms (start - 5min)
  actualEndTime: number    // epoch ms (end + 5min)
  filePath: string
  status: 'scheduled' | 'recording' | 'completed' | 'failed'
  error?: string
  durationSec: number
  sizeBytes: number
  source: string
  channel: RecordingChannel
  sources: RecordingSource[]
}

interface ScheduledRecording {
  id: string
  timeout: ReturnType<typeof setTimeout>
  ffmpeg?: ChildProcess
}

// ─── State ───────────────────────────────────────────────────────────────────

const recordings = new Map<string, Recording>()
const scheduled = new Map<string, ScheduledRecording>()

let recordingsFilePath = ''
let recordingsOutputDir = ''
let loaded = false

// ─── Helpers ─────────────────────────────────────────────────────────────────

function debug(...args: unknown[]) {
  console.log('[Recordings]', ...args)
}

function generateId(): string {
  return `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function getRecordingDir(id: string): string {
  return path.join(recordingsOutputDir, id)
}

// ─── Persistence ─────────────────────────────────────────────────────────────

async function loadRecordings(): Promise<void> {
  try {
    const fs = await import('fs/promises')
    const data = await fs.readFile(recordingsFilePath, 'utf-8')
    const arr: Recording[] = JSON.parse(data)
    recordings.clear()
    for (const r of arr) {
      recordings.set(r.id, r)
    }
    debug(`Loaded ${recordings.size} recordings from disk`)
  } catch {
    // File doesn't exist yet or is corrupt — start fresh
    recordings.clear()
    debug('No existing recordings file found, starting fresh')
  }
}

async function saveRecordings(): Promise<void> {
  try {
    const fs = await import('fs/promises')
    const arr = Array.from(recordings.values())
    await fs.writeFile(recordingsFilePath, JSON.stringify(arr, null, 2), 'utf-8')
    notifyRecordingsChanged()
  } catch (err: any) {
    console.error(`[Recordings] Failed to save recordings: ${err?.message}`)
  }
}

// Broadcast recording-list changes to all renderer windows immediately
// (so the Recordings view updates on status transitions without waiting
// for the 10s poll).
function notifyRecordingsChanged(): void {
  try {
    const { BrowserWindow } = require('electron') as typeof import('electron')
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('recordings:changed')
      }
    }
  } catch { /* app may be shutting down */ }
}

// ─── FFmpeg ──────────────────────────────────────────────────────────────────

const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** Headers required to fetch a stream URL (CDN anti-hotlinking etc). */
function headersForUrl(url: string): Record<string, string> {
  const headers: Record<string, string> = { 'User-Agent': BROWSER_UA }
  if (/cdnlivetv\.(is|tv)/i.test(url)) {
    headers['Referer'] = 'https://cdnlivetv.is/'
  } else if (/dlhd\.st/i.test(url)) {
    headers['Referer'] = 'https://dlhd.st/'
  }
  return headers
}

/** CDNLive streams use P2P HLS (p2p-media-loader) whose tokens are consumed
 *  by the browser's tracker handshake. FFmpeg cannot record these — mark them
 *  so we skip them and fail fast with a helpful message instead of a
 *  cryptic "mime type not rfc8216" error. */
function isP2pStream(url: string): boolean {
  return /api\.cdnlivetv\.is\/secure/i.test(url) || /cdnlivetv\.(is|tv)/i.test(url)
}

function spawnFfmpeg(
  sourceUrl: string,
  headers: Record<string, string>,
  outputDir: string,
  durationSec: number,
  id: string,
): ChildProcess {
  const outputPath = path.join(outputDir, `${id}.mkv`)

  const args = [
    '-hide_banner',
    '-loglevel', 'warning',
    '-y',
  ]
  const headersArg = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n'
  if (headersArg) {
    args.push('-headers', headersArg)
  }
  args.push(
    '-i', sourceUrl,
    '-t', String(durationSec),
    '-c', 'copy',
    outputPath,
  )

  debug(`Spawning FFmpeg: ffmpeg ${args.join(' ')}`)

  const proc = spawn('ffmpeg', args, {
    stdio: ['ignore', 'ignore', 'pipe'],
  })

  // Transition to 'recording' immediately — stdout data can't be relied on
  // (FFmpeg -loglevel warning emits to stderr only, so the stdout listener
  // below would never fire for many streams).
  const rec = recordings.get(id)
  if (rec && rec.status === 'scheduled') {
    rec.status = 'recording'
    rec.filePath = outputPath
    saveRecordings()
  }

  let stderr = ''
  proc.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })

  proc.on('error', (err) => {
    debug(`FFmpeg error for ${id}: ${err.message}`)
  })

  proc.on('close', (code) => {
    const outPath = outputPath
    if (code === 0) {
      debug(`FFmpeg completed for ${id}, file: ${outPath}`)
      // Update status to completed
      const rec = recordings.get(id)
      if (rec) {
        rec.status = 'completed'
        rec.filePath = outPath
        updateFileSize(rec).catch(() => {})
        saveRecordings()
      }
    } else {
      debug(`FFmpeg failed for ${id} with code ${code}, stderr: ${stderr.slice(0, 500)}`)
      const rec = recordings.get(id)
      if (rec) {
        rec.status = 'failed'
        rec.error = `FFmpeg exited with code ${code}: ${stderr.slice(0, 200)}`
        saveRecordings()
      }
    }
    scheduled.get(id)?.ffmpeg?.removeAllListeners?.()
    scheduled.get(id)?.ffmpeg?.kill?.()
    scheduled.delete(id)
  })

  return proc
}

async function updateFileSize(rec: Recording): Promise<void> {
  try {
    const fs = await import('fs/promises')
    const stat = await fs.stat(rec.filePath)
    rec.sizeBytes = stat.size
    saveRecordings()
  } catch {
    // ignore
  }
}

// ─── Source URL resolution ────────────────────────────────────────────────────

interface ResolvedSource {
  url: string
  headers: Record<string, string>
  viaProxy: boolean
  proxyId?: string
  remoteUrl?: string
}

/**
 * Resolve candidate stream URLs for a recording at record time.
 * CDN types are extracted fresh (tokens are one-time-use); m3u URLs are
 * stable and used directly. Each URL carries the headers FFmpeg needs
 * (Referer/UA — CDN anti-hotlinking rejects bare requests with 5xx).
 *
 * CDNLive uses P2P HLS whose tokens are consumed by the browser tracker
 * handshake — FFmpeg can't hit the origin directly. Instead we route the
 * stream through the local cache proxy (which injects the required headers
 * and rewrites segment URLs), and record from the proxy URL instead.
 */
async function resolveSourceUrls(rec: Recording): Promise<ResolvedSource[]> {
  const localCache = await import('./local-cache.service')
  const urls: ResolvedSource[] = []
  for (const src of rec.sources || []) {
    if (src.type === 'm3u' && src.url) {
      urls.push({ url: src.url, headers: headersForUrl(src.url), viaProxy: false })
      continue
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await extractChannelUrl({
        id: rec.channel.id,
        name: rec.channel.name,
        countryCode: rec.channel.countryCode,
        playerUrl: rec.channel.playerUrl,
      })
      if (!result.hlsUrl) continue
      const isP2p = isP2pStream(result.hlsUrl)
      if (isP2p) {
        // Route through the local cache proxy — it injects headers and
        // rewrites segment URLs so FFmpeg can grab a token-authed stream.
        const { proxyId, proxyUrl } = localCache.createProxySession(result.hlsUrl)
        debug(`CDNLive stream proxied for recording ${rec.id}: ${proxyUrl}`)
        urls.push({ url: proxyUrl, headers: {}, viaProxy: true, proxyId, remoteUrl: result.hlsUrl })
      } else {
        urls.push({ url: result.hlsUrl, headers: headersForUrl(result.hlsUrl), viaProxy: false })
      }
    } catch (err: any) {
      debug(`Source ${src.type} resolution failed for ${rec.id}: ${err?.message}`)
    }
  }
  return urls
}

// ─── Scheduled Recording Runner ─────────────────────────────────────────────

async function startRecording(
  id: string,
  actualStartTime: number,
  actualEndTime: number,
): Promise<void> {
  const rec = recordings.get(id)
  if (!rec) return

  const sourceUrls = await resolveSourceUrls(rec)
  if (sourceUrls.length === 0) {
    debug(`No source URLs could be resolved for recording ${id}`)
    rec.status = 'failed'
    rec.error = 'No playable source found at record time'
    await saveRecordings()
    scheduled.delete(id)
    return
  }

  const durationSec = Math.round((actualEndTime - actualStartTime) / 1000)
  const recDir = getRecordingDir(id)
  const fs = await import('fs/promises')

  // Ensure output directory exists
  await fs.mkdir(recDir, { recursive: true })

  let lastError: string | undefined
  let proc: ChildProcess | undefined

  for (const src of sourceUrls) {
    debug(`Trying source URL for recording ${id}: ${src.url.slice(0, 100)}`)

    const child = spawnFfmpeg(src.url, src.headers, recDir, durationSec, id)

    proc = child

    // Update the scheduled entry with the ffmpeg process
    const entry = scheduled.get(id)
    if (entry) {
      entry.ffmpeg = child
    }

    // Wait for the process to finish
    const exitCode = await new Promise<number | null>((resolve) => {
      child.on('close', resolve)
      child.on('error', () => resolve(null))
    })

    if (exitCode === 0) {
      // Validate the output file has actual content — FFmpeg can exit 0
      // on an error page (0 frames copied to output), producing a 0-byte file.
      let fileOk = false
      try {
        const fs = await import('fs/promises')
        const stat = await fs.stat(rec.filePath)
        fileOk = stat.size > 0
      } catch { /* file missing or inaccessible */ }
      if (!fileOk) {
        debug(`Recording ${id} produced empty/no output from source: ${src.url.slice(0, 100)}`)
        lastError = 'Empty or invalid output'
        // Clean up proxy session before trying next source
        if (src.viaProxy && src.proxyId) {
          const localCache = await import('./local-cache.service')
          localCache.removeProxySession(src.proxyId)
        }
        continue
      }
      debug(`Recording ${id} succeeded with source: ${src.url.slice(0, 100)}`)
      if (rec) {
        rec.status = 'completed'
        rec.source = src.url
        updateFileSize(rec).catch(() => {})
        saveRecordings()
      }
      // Clean up: remove proxy session if we used one
      if (src.viaProxy && src.proxyId) {
        const localCache = await import('./local-cache.service')
        localCache.removeProxySession(src.proxyId)
      }
      scheduled.delete(id)
      return
    }

    lastError = `FFmpeg exit code ${exitCode}`
    debug(`Source failed for ${id}, trying next...`)
    // Clean up proxy session before trying next source
    if (src.viaProxy && src.proxyId) {
      const localCache = await import('./local-cache.service')
      localCache.removeProxySession(src.proxyId)
    }
    // Give the CDN a moment between attempts (transient 5xx)
    await new Promise(r => setTimeout(r, 3000))
  }

  // All sources failed
  debug(`All sources failed for recording ${id}`)
  if (rec) {
    rec.status = 'failed'
    rec.error = lastError || 'All sources failed'
    saveRecordings()
  }
  scheduled.delete(id)
}

// ─── Exported Functions ─────────────────────────────────────────────────────

export async function scheduleRecording(params: {
  title: string
  channelName: string
  startTime: number
  endTime: number
  channel: RecordingChannel
  sources: RecordingSource[]
}): Promise<string> {
  const id = generateId()
  const actualStartTime = params.startTime - 300_000  // 5 min before
  const actualEndTime = params.endTime + 300_000      // 5 min after
  const durationSec = Math.round((actualEndTime - actualStartTime) / 1000)

  const recDir = getRecordingDir(id)
  const filePath = path.join(recDir, `${id}.mkv`)

  const recording: Recording = {
    id,
    title: params.title,
    channelName: params.channelName,
    startTime: params.startTime,
    endTime: params.endTime,
    actualStartTime,
    actualEndTime,
    filePath,
    status: 'scheduled',
    durationSec,
    sizeBytes: 0,
    source: '',
    channel: params.channel,
    sources: params.sources,
  }

  recordings.set(id, recording)
  await saveRecordings()

  // Calculate delay until actual start
  const now = Date.now()
  const delay = Math.max(0, actualStartTime - now)

  debug(`Scheduled recording "${params.title}" (${id}) in ${Math.round(delay / 1000)}s`)

  const timeout = setTimeout(async () => {
    debug(`Starting scheduled recording ${id} ("${params.title}")`)
    await startRecording(id, actualStartTime, actualEndTime)
  }, delay)

  scheduled.set(id, { id, timeout })

  return id
}

export async function cancelRecording(id: string): Promise<void> {
  const sr = scheduled.get(id)
  if (sr) {
    clearTimeout(sr.timeout)
    if (sr.ffmpeg) {
      sr.ffmpeg.kill('SIGTERM')
      // Give it a moment to terminate gracefully, then SIGKILL
      setTimeout(() => {
        try { sr.ffmpeg?.kill('SIGKILL') } catch {}
      }, 5000)
    }
    scheduled.delete(id)
  }

  const rec = recordings.get(id)
  if (rec) {
    if (rec.status === 'scheduled' || rec.status === 'recording') {
      rec.status = 'failed'
      rec.error = 'Cancelled by user'
      await saveRecordings()
    }
  }
}

export async function deleteRecording(id: string): Promise<void> {
  // Cancel any running recording
  const sr = scheduled.get(id)
  if (sr) {
    clearTimeout(sr.timeout)
    if (sr.ffmpeg) {
      sr.ffmpeg.kill('SIGTERM')
      setTimeout(() => {
        try { sr.ffmpeg?.kill('SIGKILL') } catch {}
      }, 5000)
    }
    scheduled.delete(id)
  }

  // Delete the recording directory from disk
  const recDir = getRecordingDir(id)
  try {
    const fs = await import('fs/promises')
    await fs.rm(recDir, { recursive: true, force: true })
    debug(`Deleted recording directory: ${recDir}`)
  } catch (err: any) {
    debug(`Failed to delete recording directory ${recDir}: ${err?.message}`)
  }

  // Remove from in-memory state + persist
  recordings.delete(id)
  await saveRecordings()
}

export async function listRecordings(): Promise<Recording[]> {
  return Array.from(recordings.values()).sort((a, b) => b.startTime - a.startTime)
}

/**
 * Cancel the recording currently in progress (status 'recording').
 * If a schedule timeout is pending for the same recording, clear it too.
 */
export async function cancelCurrentRecording(): Promise<string | null> {
  const rec = Array.from(recordings.values()).find(r => r.status === 'recording')
  if (!rec) return null
  await cancelRecording(rec.id)
  return rec.id
}

export async function init(): Promise<void> {
  if (loaded) return

  recordingsFilePath = path.join(app.getPath('userData'), 'recordings.json')
  recordingsOutputDir = path.join(app.getPath('userData'), 'recordings')

  // Create output directory
  try {
    const fs = await import('fs')
    fs.mkdirSync(recordingsOutputDir, { recursive: true })
  } catch (err: any) {
    console.error(`[Recordings] Failed to create output dir: ${err?.message}`)
  }

  // Load persisted recordings
  await loadRecordings()
  loaded = true

  // Reschedule any recordings that were 'scheduled' (they were pending when app closed).
  // Channel + sources are persisted, so fresh stream URLs resolve at fire time.
  const now = Date.now()
  for (const rec of recordings.values()) {
    // Migrate legacy recordings (pre channel/sources persistence)
    if (!rec.channel || !rec.sources) {
      if (rec.status === 'scheduled' || rec.status === 'recording') {
        rec.status = 'failed'
        rec.error = 'Recording created by an older version - please re-schedule'
      }
      continue
    }
    if (rec.status === 'scheduled' && rec.actualStartTime > now) {
      const delay = rec.actualStartTime - now
      debug(`Rescheduling recording ${rec.id} ("${rec.title}") in ${Math.round(delay / 1000)}s`)
      const timeout = setTimeout(async () => {
        debug(`Starting rescheduled recording ${rec.id} ("${rec.title}")`)
        await startRecording(rec.id, rec.actualStartTime, rec.actualEndTime)
      }, delay)
      scheduled.set(rec.id, { id: rec.id, timeout })
    } else if (rec.status === 'scheduled' || rec.status === 'recording') {
      // Recording was in progress when app closed — mark as failed
      rec.status = 'failed'
      rec.error = 'App was closed during recording'
    }
  }
  await saveRecordings()
}
