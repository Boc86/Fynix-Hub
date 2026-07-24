/**
 * FFmpeg HLS remux service.
 *
 * Spawns FFmpeg to transcode/copy media streams into HLS fMP4 format
 * that the browser's MediaSource Extensions (hls.js) can play.
 *
 * Each "session" maps to one FFmpeg process producing segments in a temp dir.
 * The local-cache HTTP server routes /remux/<sessionId>/<file> here.
 *
 * Design notes (lessons from prior failed attempts):
 * - Empty placeholder playlist is served immediately so hls.js doesn't timeout.
 * - We wait (up to 10s) for files to appear before serving them.
 * - We check response writable state before every write.
 * - Range requests are supported for init.mp4 and segment files (finite, seekable).
 * - Sessions are cleaned up on kill or process exit.
 */

import { spawn, type ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { IncomingMessage, ServerResponse } from 'http'

// ─── Types ───────────────────────────────────────────────────────────────────

interface RemuxSession {
  id: string
  process: ChildProcess
  inputUrl: string
  outputDir: string
  startedAt: number
  /** Resolves once the first real (non-placeholder) playlist is written. */
  ready: Promise<void>
  readyResolve: () => void
}

interface RemuxRequest {
  sessionId: string
  filename: string // "playlist.m3u8" | "init.mp4" | "segment00000.m4s" | ...
  req: IncomingMessage
  res: ServerResponse
}

// ─── State ───────────────────────────────────────────────────────────────────

const sessions = new Map<string, RemuxSession>()
let basePort = 0 // Set by init()

const REMUX_BASE = path.join(os.tmpdir(), 'fynix-remux')
const WAIT_FILE_TIMEOUT = 10_000 // ms — max wait for a file to appear
const SEGMENT_POLL_INTERVAL = 200 // ms
const PLACEHOLDER_PLAYLIST =
  '#EXTM3U\n#EXT-X-VERSION:6\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:0\n'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function debug(...args: unknown[]) {
  console.log('[FFmpegRemux]', ...args)
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function getSessionDir(id: string): string {
  return path.join(REMUX_BASE, id)
}

/** Wait for a file to exist, returning its path or null on timeout. */
function waitForFile(filePath: string, timeoutMs = WAIT_FILE_TIMEOUT): Promise<string | null> {
  return new Promise((resolve) => {
    if (fs.existsSync(filePath)) {
      resolve(filePath)
      return
    }
    const start = Date.now()
    const interval = setInterval(() => {
      if (fs.existsSync(filePath)) {
        clearInterval(interval)
        resolve(filePath)
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval)
        resolve(null)
      }
    }, SEGMENT_POLL_INTERVAL)
  })
}

/** Check if response is still writable (not closed, headers not sent when we need to send them). */
function responseIsOpen(res: ServerResponse): boolean {
  return !res.writableEnded && !res.destroyed
}

/** Get MIME type for HLS file. */
function getContentType(filename: string): string {
  if (filename.endsWith('.m3u8')) return 'application/x-mpegURL; charset=utf-8'
  if (filename.endsWith('.mp4') || filename.endsWith('.m4s')) return 'video/mp4'
  return 'application/octet-stream'
}

// ─── Session Management ──────────────────────────────────────────────────────

function buildFFmpegArgs(inputUrl: string, outputDir: string): string[] {
  return [
    '-hide_banner',
    '-loglevel', 'info',
    '-err_detect', 'ignore_err',
    '-fflags', '+genpts+discardcorrupt',
    // Allow generous analysis/probe for slow HTTP streams (torrents).
    '-analyzeduration', '60000000',
    '-probesize', '100000000',
    '-rw_timeout', '60000000',
    '-i', inputUrl,
    '-c:v', 'copy',
    // Always transcode audio to AAC — browser MSE doesn't support AC-3, DTS,
    // TrueHD, etc. AAC is lightweight and universally supported.
    '-c:a', 'aac',
    '-b:a', '256k',
    '-ac', '2',
    '-max_muxing_queue_size', '4096',
    '-f', 'hls',
    '-hls_time', '4',
    '-hls_list_size', '0',
    '-hls_playlist_type', 'event',
    '-hls_segment_type', 'fmp4',
    '-hls_fmp4_init_filename', 'init.mp4',
    '-hls_flags', 'independent_segments+append_list',
    '-hls_segment_filename', path.join(outputDir, 'segment%05d.m4s'),
    path.join(outputDir, 'playlist.m3u8'),
  ]
}

/**
 * Start an FFmpeg HLS remux session.
 * Returns { sessionId, streamUrl } or null on failure.
 */
export function createSession(
  inputUrl: string,
  resumePosition = 0,
): { sessionId: string; streamUrl: string } | null {
  const id = generateId()
  const outputDir = getSessionDir(id)

  fs.mkdirSync(outputDir, { recursive: true })

  // If resume position specified, add -ss before -i for fast seek.
  const args: string[] = []
  if (resumePosition > 0) {
    args.push('-ss', String(resumePosition))
  }
  args.push(...buildFFmpegArgs(inputUrl, outputDir))

  debug('Spawning FFmpeg:', 'ffmpeg', args.join(' '))

  let proc: ChildProcess
  try {
    proc = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err: any) {
    debug('FFmpeg spawn failed:', err?.message)
    try { fs.rmSync(outputDir, { recursive: true, force: true }) } catch {}
    return null
  }

  let readyResolve!: () => void
  const ready = new Promise<void>((r) => { readyResolve = r })

  const session: RemuxSession = {
    id,
    process: proc,
    inputUrl,
    outputDir,
    startedAt: Date.now(),
    ready,
    readyResolve,
  }

  sessions.set(id, session)

  // Write placeholder playlist immediately so the first HLS request succeeds.
  fs.writeFileSync(path.join(outputDir, 'playlist.m3u8'), PLACEHOLDER_PLAYLIST)

  // Monitor FFmpeg output for logging.
  proc.stdout?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim()
    if (line) debug(`[ffmpeg stdout] ${line}`)
  })
  proc.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim()
    if (line) debug(`[ffmpeg stderr] ${line}`)
  })

  proc.on('error', (err) => {
    debug('FFmpeg process error:', err.message)
    cleanupSession(id)
  })

  proc.on('exit', (code, signal) => {
    debug(`FFmpeg exited with code ${code} signal ${signal}`)
    clearInterval(readyWatcher)
    // Don't cleanup on normal completion (code 0) — segments are still
    // being served to the player. Session is cleaned up on player.stop()
    // or shutdown() instead.
    if (code !== 0) {
      cleanupSession(id)
    } else {
      // Mark session as complete so we don't wait for more segments.
      readyResolve()
    }
  })

  // Watch for the first real playlist write to mark the session as ready.
  const playlistPath = path.join(outputDir, 'playlist.m3u8')
  const readyWatcher = setInterval(() => {
    try {
      const stat = fs.statSync(playlistPath)
      // Real playlist is larger than the placeholder.
      if (stat.size > PLACEHOLDER_PLAYLIST.length) {
        clearInterval(readyWatcher)
        readyResolve()
      }
    } catch {}
  }, 300)

  const port = portGetter ? portGetter() : 0
  const streamUrl = `http://127.0.0.1:${port}/remux/${id}/playlist.m3u8`
  debug('Session created:', id, '→', streamUrl)
  return { sessionId: id, streamUrl }
}

function cleanupSession(id: string) {
  const session = sessions.get(id)
  if (!session) return
  sessions.delete(id)

  // Kill FFmpeg if still running.
  try {
    if (session.process && !session.process.killed) {
      session.process.kill('SIGKILL')
    }
  } catch {}

  // Remove temp files (async, non-blocking).
  fs.rm(session.outputDir, { recursive: true, force: true }, () => {})
}

/** Kill a specific session. */
export function killSession(id: string): void {
  const session = sessions.get(id)
  if (!session) return
  debug('Killing session:', id)
  cleanupSession(id)
}

/** Kill all active sessions and clean up. */
export function shutdown(): void {
  debug('Shutting down, killing', sessions.size, 'sessions')
  for (const [id] of sessions) {
    cleanupSession(id)
  }
  sessions.clear()
}

// ─── Request Handling ────────────────────────────────────────────────────────

/**
 * Handle an HTTP request for a remux file.
 *
 * Called from local-cache.service.ts when the URL matches:
 *   /remux/<sessionId>/<playlist.m3u8|init.mp4|segmentNNNNN.m4s>
 */
export async function handleRemuxRequest(
  sessionId: string,
  filename: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) {
    res.writeHead(404)
    res.end('Remux session not found')
    return
  }

  // For playlist.m3u8: serve immediately (may be placeholder initially, refreshable).
  if (filename === 'playlist.m3u8') {
    servePlaylist(session, res)
    return
  }

  // For init.mp4 and segments: wait for the file to appear, then serve.
  const filePath = path.join(session.outputDir, filename)
  const file = await waitForFile(filePath, WAIT_FILE_TIMEOUT)

  if (!responseIsOpen(res)) return // Client disconnected during wait.

  if (!file) {
    res.writeHead(503)
    res.end('File not yet available')
    return
  }

  serveFile(file, req, res)
}

/** Serve the playlist file — live-updating (no wait needed). */
function servePlaylist(session: RemuxSession, res: ServerResponse) {
  const playlistPath = path.join(session.outputDir, 'playlist.m3u8')

  try {
    const content = fs.readFileSync(playlistPath, 'utf-8')
    if (!responseIsOpen(res)) return
    res.writeHead(200, {
      'Content-Type': 'application/x-mpegURL; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*',
    })
    res.end(content)
  } catch {
    if (!responseIsOpen(res)) return
    res.writeHead(503)
    res.end('Playlist not yet available')
  }
}

/** Serve a finite file with Range request support. */
function serveFile(filePath: string, req: IncomingMessage, res: ServerResponse) {
  let stat: fs.Stats
  try {
    stat = fs.statSync(filePath)
  } catch {
    if (!responseIsOpen(res)) return
    res.writeHead(503)
    res.end('File not ready')
    return
  }

  const totalSize = stat.size
  const contentType = getContentType(path.basename(filePath))
  const rangeHeader = req.headers.range

  // Support Range requests for seekable segments.
  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
    if (match) {
      const start = parseInt(match[1], 10)
      const end = match[2] ? parseInt(match[2], 10) : totalSize - 1
      const chunkSize = end - start + 1

      if (!responseIsOpen(res)) return
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      })

      const stream = fs.createReadStream(filePath, { start, end })
      stream.pipe(res)
      stream.on('error', () => { if (!res.writableEnded) res.end() })
      return
    }
  }

  // Full file response.
  if (!responseIsOpen(res)) return
  res.writeHead(200, {
    'Content-Length': totalSize,
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  })

  const stream = fs.createReadStream(filePath)
  stream.pipe(res)
  stream.on('error', () => { if (!res.writableEnded) res.end() })
}

// ─── Init ────────────────────────────────────────────────────────────────────

/** Initialize with a port getter (avoids race with async server.listen). */
let portGetter: (() => number) | null = null

export function init(getPort: () => number): void {
  portGetter = getPort
  fs.mkdirSync(REMUX_BASE, { recursive: true })
  debug('Initialized, base dir:', REMUX_BASE)
}

// ─── Probing ─────────────────────────────────────────────────────────────────

/** Probe a URL for duration using ffprobe. Returns seconds or null. */
export function probeDuration(inputUrl: string): number | null {
  try {
    const result = require('child_process').execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${inputUrl}"`,
      { timeout: 5000, stdio: ['pipe', 'pipe', 'ignore'] },
    )
    const dur = parseFloat(result.toString().trim())
    return isFinite(dur) ? dur : null
  } catch {
    return null
  }
}
