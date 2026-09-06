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
  /** Last error message from the FFmpeg process, if any. */
  lastError: string | null
  /** Collects stderr lines for error reporting. */
  stderrBuffer: string[]
  /** File size at open time (file:// inputs only) — used to detect growth. */
  openedBytes: number
  /** True once the stream has ended (ffmpeg done, no respawn) — playlist gets an ENDLIST. */
  ended: boolean
  /** Interval watching for the first real playlist write. */
  readyWatcher?: NodeJS.Timeout
  /** True for http(s) live inputs — chunked into periodic respawns. */
  isLive: boolean
  /** Watchdog timer that SIGTERMs ffmpeg if it misses the chunk boundary. */
  rotationTimer?: NodeJS.Timeout
  /** True when WE initiated the exit (watchdog kill) — respawn on exit. */
  expectingExit: boolean
  /** Playlist sum at the last rotation — detects a stalled/exhausted source
   *  when probing is unavailable (short-chunk fallback). */
  lastChunkSum?: number
}

interface RemuxRequest {
  sessionId: string
  filename: string // "playlist.m3u8" | "segment00000.ts" | ...
  req: IncomingMessage
  res: ServerResponse
}

// ─── State ───────────────────────────────────────────────────────────────────

const sessions = new Map<string, RemuxSession>()
let basePort = 0 // Set by init()

const REMUX_BASE = path.join(os.tmpdir(), 'fynix-remux')
// Live streams are remuxed in bounded chunks: ffmpeg exits cleanly at the
// boundary (-t) and we respawn into the same session/playlist. Each fresh
// process re-syncs A/V and reconnects to the source, bounding timestamp drift
// that accumulates in a single long-running process (stutter + audio drift).
const LIVE_CHUNK_SECONDS = 300 // 5 minutes
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

/** Local torrent server URLs serve a FINITE file — not a live stream.
 *  Chunk rotation on these would respawn ffmpeg at byte 0 and replay the
 *  file from 0:00 (the torrent restart-to-0 bug). */
function isLocalHttpUrl(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(url)
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
  if (filename.endsWith('.ts')) return 'video/mp2t'
  return 'application/octet-stream'
}

// ─── Session Management ──────────────────────────────────────────────────────

export function buildFFmpegArgs(inputUrl: string, outputDir: string, headers: string[] = [], transcodeVideo = false, audioTrackIndex?: number, appendList = false, chunkSeconds?: number, outputTsOffset?: number): string[] {
  const args = [
    '-hide_banner',
    '-loglevel', 'info',
    '-err_detect', 'ignore_err',
    '-fflags', '+genpts+discardcorrupt',
    // Analysis probing: short for all HTTP streams (live or local).
    // Even for localhost/WebTorrent, 60s analyzeduration delays the first
    // segment beyond the player's 8s readiness timeout. 5s is enough to read
    // MKV/MP4 headers from a local HTTP source.
    ...(inputUrl.startsWith('http')
         ? ['-analyzeduration', '5000000', '-probesize', '5000000']
         : ['-analyzeduration', '5000000', '-probesize', '5000000']),
    '-rw_timeout', '60000000',
  ]

  // Add headers as a separate FFmpeg option if provided
  if (headers.length > 0) {
    // FFmpeg -headers expects \r\n terminated lines with a blank line at the end.
    const headerStr = headers.map(h => h.trim()).join('\r\n') + '\r\n\r\n'
    args.push('-headers', headerStr)
  }

  args.push(
    // Reconnect for live HTTP streams that drop connections — not needed for
    // local files, and reconnect_at_eof on a FINITE local torrent file would
    // make ffmpeg re-open it at EOF and loop from 0:00.
    ...(inputUrl.startsWith('http') && !isLocalHttpUrl(inputUrl) ? [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_on_network_error', '1',
      '-reconnect_on_http_error', '4xx,5xx',
      '-reconnect_delay_max', '30',
    ] : []),
    '-i', inputUrl,
    // Only map first video + selected audio — skip subtitles and other streams
    // that would generate extra HLS playlists the local cache server doesn't serve.
    '-map', '0:v:0', '-map', `0:a:${audioTrackIndex ?? 0}`,
  )

  if (transcodeVideo) {
    // HEVC → H.264 transcode for Chromium MSE compatibility.
    debug('Transcoding video to H.264 for browser compatibility')
    args.push(
      // Downscale 4K→1080p + HDR→SDR tonemap in one pass.
      // zscale does downscale first (fewer pixels to tonemap), then
      // linearize PQ → hable tonemap → BT.709 TV-range output.
      '-vf', 'scale=1920:1080:flags=lanczos,zscale=t=linear:npl=100,tonemap=hable,zscale=t=bt709:p=bt709:m=bt709:r=tv,format=yuv420p',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
    )
  } else {
    // Copy video bitstream (fast, lossless for the container).
    // FFmpeg auto-detects the correct codec tag (hvc1 for HEVC, avc1 for H.264).
    args.push('-c:v', 'copy')
  }

  args.push(
    // Always transcode audio to AAC — browser MSE doesn't support AC-3, DTS,
    // TrueHD, etc. AAC is lightweight and universally supported.
    // aresample=async=1 resamples audio to follow the video clock, fixing
    // A/V drift from sloppy IPTV source timestamps.
    '-af', 'aresample=async=1',
    '-c:a', 'aac',
    '-b:a', '256k',
    '-ac', '2',
    '-max_muxing_queue_size', '4096',
    // Bounded live chunks: ffmpeg exits cleanly at the boundary, we respawn
    // into the same playlist (see LIVE_CHUNK_SECONDS / scheduleChunkRotation).
    ...(chunkSeconds ? ['-t', String(chunkSeconds)] : []),
    // Respawned chunks continue the timeline instead of restarting at PTS 0:
    // without this, every rotation creates a timestamp hole → hls.js
    // bufferStalledError + seek over the hole (visible stutter) and, in the
    // app, can escalate into a full restart-to-0. Verified empirically.
    ...(outputTsOffset ? ['-output_ts_offset', String(outputTsOffset)] : []),
    '-f', 'hls',
    '-hls_time', '4',
    '-hls_list_size', '0',
    '-hls_playlist_type', 'event',
    // muxdelay 0: first-frame PTS starts at ~0 so the accumulated playlist
    // duration and the media timeline stay aligned across rotations. With the
    // default muxdelay the media PTS runs ~1.4s ahead of the playlist, which
    // turns each rotation's #EXT-X-DISCONTINUITY into a buffer hole (seek).
    '-muxdelay', '0',
    '-muxpreload', '0',
    // MPEG-TS segments (NOT fmp4): -output_ts_offset is baked into the TS
    // packet PTS itself. With fmp4 the offset lands in an edit-list in the
    // init.mp4 that players read once — respawned chunks would restart at 0.
    // omit_endlist: never let ffmpeg write #EXT-X-ENDLIST on a clean -t exit —
    // if hls.js polls the playlist in that window it treats the live stream as
    // ended and stops. The service appends ENDLIST itself when the session truly
    // ends (appendEndList). append_list (respawn only): continue the EXISTING
    // playlist instead of truncating+rewriting it — segment numbering derives
    // from the list, so the media sequence never restarts. With the timestamp
    // offset + muxdelay 0, appended chunks join seamlessly; the residual
    // DISCONTINUITY tag hls.js sees is within maxBufferHole (verified).
    '-hls_flags', appendList ? 'independent_segments+append_list+omit_endlist' : 'independent_segments+omit_endlist',
    '-hls_segment_filename', path.join(outputDir, 'segment%05d.ts'),
    path.join(outputDir, 'playlist.m3u8'),
  )

  return args
}

/**
 * Parse the last `time=HH:MM:SS.MS` line from FFmpeg stderr and return
 * the duration in seconds. Used to find the playback position when we
 * restart FFmpeg against a growing local file.
 */
function parseLastDuration(stderrLines: string[]): number | null {
  let lastTime: number | null = null
  // Match either "time=HH:MM:SS.MS" (HH up to 99 hours, MM/SS 2 digits, MS up to 6 digits)
  // or "Duration: HH:MM:SS.MS" — prefer "time=" (the running clock, not the input duration)
  const re = /time=(\d{1,3}):(\d{2}):(\d{2})(?:\.(\d+))?/
  for (const line of stderrLines) {
    const m = re.exec(line)
    if (m) {
      const h = parseInt(m[1], 10)
      const mm = parseInt(m[2], 10)
      const ss = parseInt(m[3], 10)
      const ms = m[4] ? parseFloat('0.' + m[4]) : 0
      lastTime = h * 3600 + mm * 60 + ss + ms
    }
  }
  return lastTime
}

/** Probe the input file to detect HEVC video codec. */
function probeIsHevc(inputUrl: string): boolean {
  try {
    const result = require('child_process').execSync(
      `ffprobe -v error -analyzeduration 20000000 -probesize 50000000 -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "${inputUrl}"`,
      { timeout: 20000, stdio: ['pipe', 'pipe', 'ignore'] },
    )
    const codec = result.toString().trim().toLowerCase()
    debug('Video codec detected:', codec)
    return codec === 'hevc' || codec === 'h265'
  } catch {
    // If ffprobe fails (e.g. torrent still buffering), assume HEVC
    // and transcode to H.264 to be safe. Worst case: H.264 gets
    // re-encoded (slight quality loss, still fast with -preset veryfast).
    debug('ffprobe failed, assuming HEVC for safety — will transcode to H.264')
    return true
  }
}

/**
 * ffmpeg writes #EXT-X-ENDLIST at clean EOF — including when it exits because
 * the input file is still growing (NZB download / recording). Before respawning
 * in place we must strip it, otherwise the appended segments land AFTER the
 * ENDLIST and hls.js ignores them.
 */
function stripEndList(session: RemuxSession): void {
  try {
    const playlistPath = path.join(session.outputDir, 'playlist.m3u8')
    const content = fs.readFileSync(playlistPath, 'utf-8')
    const stripped = content.replace(/\n?#EXT-X-ENDLIST\n?$/, '')
    if (stripped !== content) {
      fs.writeFileSync(playlistPath, stripped)
      debug('Stripped premature #EXT-X-ENDLIST before respawn')
    }
  } catch (err: any) {
    debug('stripEndList failed:', err?.message)
  }
}

/** Sum of #EXTINF durations in the current playlist — the timeline position a
 *  respawned chunk must start at to join seamlessly (-output_ts_offset). */
function sumPlaylistDuration(session: RemuxSession): number {
  try {
    const playlistPath = path.join(session.outputDir, 'playlist.m3u8')
    const content = fs.readFileSync(playlistPath, 'utf-8')
    let sum = 0
    const re = /#EXTINF:([\d.]+)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(content))) sum += parseFloat(m[1])
    return sum
  } catch (err: any) {
    debug('sumPlaylistDuration failed:', err?.message)
    return 0
  }
}

/** Append #EXT-X-ENDLIST so hls.js plays out to the end instead of stalling. */
function appendEndList(session: RemuxSession): void {
  try {
    const playlistPath = path.join(session.outputDir, 'playlist.m3u8')
    const content = fs.readFileSync(playlistPath, 'utf-8')
    if (content.includes('#EXT-X-ENDLIST')) return
    fs.writeFileSync(playlistPath, content + '#EXT-X-ENDLIST\n')
    debug('Appended #EXT-X-ENDLIST')
  } catch (err: any) {
    debug('appendEndList failed:', err?.message)
  }
}

/** Watch for the first real playlist write; clears any previous watcher.
 * Resolves the session's ready promise when the playlist grows beyond the
 * placeholder, or times out after 15s (caller should handle gracefully). */
function armReadyWatcher(session: RemuxSession): void {
  if (session.readyWatcher) clearInterval(session.readyWatcher)
  const playlistPath = path.join(session.outputDir, 'playlist.m3u8')
  const start = Date.now()
  const TIMEOUT_MS = 30_000 // must be > the renderer watchdog (15s for remux streams)
  session.readyWatcher = setInterval(() => {
    try {
      const stat = fs.statSync(playlistPath)
      // Real playlist is larger than the placeholder.
      if (stat.size > PLACEHOLDER_PLAYLIST.length) {
        if (session.readyWatcher) clearInterval(session.readyWatcher)
        session.readyWatcher = undefined
        session.readyResolve()
        return
      }
    } catch {}
    // Timeout: resolve with an error so servePlaylist gets the placeholder
    // (hls.js will retry) and the watchdog in FFmpeg doesn't hang forever.
    if (Date.now() - start >= TIMEOUT_MS) {
      if (session.readyWatcher) clearInterval(session.readyWatcher)
      session.readyWatcher = undefined
      debug('Ready watcher timed out after 15s — serving placeholder playlist')
      session.readyResolve()
    }
  }, 300)
}

/**
 * Live chunk watchdog: ffmpeg exits cleanly at its -t limit (the primary
 * rotation trigger), but if it wedges on a reconnect/stalled source and never
 * reaches the boundary, SIGTERM it after a grace period so the exit handler
 * respawns it (expectingExit). Re-armed on every respawn.
 */
function scheduleChunkRotation(session: RemuxSession, headers: string[], audioTrackIndex?: number): void {
  if (session.rotationTimer) clearTimeout(session.rotationTimer)
  if (!session.isLive || session.ended) return
  session.rotationTimer = setTimeout(() => {
    session.rotationTimer = undefined
    if (session.process && !session.process.killed) {
      session.expectingExit = true
      session.process.kill('SIGTERM')
      debug('Live chunk watchdog: SIGTERM sent to wedged FFmpeg')
    }
  }, LIVE_CHUNK_SECONDS * 1000 + 30_000)
}

/**
 * Wire a fresh FFmpeg child process into a session: log its output, capture
 * stderr, and handle exit. On a clean exit against a STILL-GROWING local file
 * (NZB download / recording), respawn ffmpeg into the SAME session directory
 * with a continuing segment number, so the playlist the renderer is polling
 * keeps growing seamlessly. When the file is complete (or gone — nzbget
 * renamed it), the stream is over: mark ended so the playlist gets an ENDLIST.
 */
function wireProcess(session: RemuxSession, proc: ChildProcess, headers: string[], audioTrackIndex?: number): void {
  proc.stdout?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim()
    if (line) debug(`[ffmpeg stdout] ${line}`)
  })
  proc.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim()
    if (line) {
      debug(`[ffmpeg stderr] ${line}`)
      // Keep last 20 stderr lines for error reporting.
      session.stderrBuffer.push(line)
      if (session.stderrBuffer.length > 20) session.stderrBuffer.shift()
    }
  })
  proc.on('error', (err) => {
    debug('FFmpeg process error:', err.message)
    session.lastError = `FFmpeg process error: ${err.message}`
    if (session.process === proc) cleanupSession(session.id)
  })
  proc.on('exit', (code, signal) => {
    debug(`FFmpeg exited with code ${code} signal ${signal}`)
    if (session.process !== proc) return // superseded by an in-place respawn
    if (session.readyWatcher) { clearInterval(session.readyWatcher); session.readyWatcher = undefined }
    // Live chunk boundary: clean exit at the -t limit, or our watchdog kill.
    const isRotation =
      session.isLive && !session.ended &&
      (code === 0 || (signal === 'SIGTERM' && session.expectingExit))
    if (!isRotation && code !== 0 && !session.lastError) {
      const stderrTail = session.stderrBuffer.slice(-5).join('; ')
      session.lastError = stderrTail
        ? `FFmpeg exited with code ${code}: ${stderrTail}`
        : `FFmpeg exited with code ${code}`
    }
    if (isRotation) {
      // ffmpeg hit its -t chunk limit (or the watchdog caught a wedge).
      // Respawn fresh into the SAME session dir with append_list so the
      // playlist the renderer polls keeps growing — hls.js handles the
      // #EXT-X-DISCONTINUITY at the join (independent_segments).
      session.expectingExit = false
      debug('Live chunk boundary — respawning FFmpeg (append_list)')
      stripEndList(session)
      // Continue the timeline at the exact end of the previous chunk so hls.js
      // sees one continuous growing playlist — no timestamp hole at the join.
      const tsOffset = sumPlaylistDuration(session)
      const args = buildFFmpegArgs(session.inputUrl, session.outputDir, headers, false, audioTrackIndex, true, LIVE_CHUNK_SECONDS, tsOffset)
      let newProc: ChildProcess
      try {
        newProc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
      } catch (err: any) {
        debug('Live chunk respawn failed:', err?.message)
        session.ended = true
        appendEndList(session)
        return
      }
      session.process = newProc
      session.lastError = null
      session.stderrBuffer = []
      wireProcess(session, newProc, headers, audioTrackIndex)
      armReadyWatcher(session)
      scheduleChunkRotation(session, headers, audioTrackIndex)
      debug('Respawned FFmpeg for next live chunk')
      return
    }
    // Growing-file restart: when input is a local file still being written
    // (e.g. NZB download or recording), FFmpeg hits EOF when the current
    // chunk ends. If the file has grown since we opened it, restart from
    // the last reported duration to keep streaming.
    if (code === 0 && session.inputUrl.startsWith('file://')) {
      const filePath = session.inputUrl.replace(/^file:\/\//, '')
      try {
        const stat = fs.statSync(filePath)
        const totalBytes = stat.size
        const lastDuration = parseLastDuration(session.stderrBuffer)
        debug(`Growing-file check: input=${filePath} totalBytes=${totalBytes} lastDuration=${lastDuration}`)
        // Heuristic: if the file is reasonably large (>1MB), assume it's
        // still in-progress. Downloads/recordings always exceed this.
        const looksInProgress = totalBytes > 1024 * 1024 && totalBytes > session.openedBytes
        if (looksInProgress && typeof lastDuration === 'number' && lastDuration > 0) {
          debug(`Respawn in place from ${lastDuration}s (file grew ${session.openedBytes} → ${totalBytes})`)
          // Remove ffmpeg's premature ENDLIST so the appended segments land
          // before the end marker.
          stripEndList(session)
          // -ss is an INPUT seek: ffmpeg re-zeroes output PTS at the seek
          // point, so appended segments must be shifted by the playlist
          // duration or hls.js sees a timestamp hole → bufferSeekOverHole →
          // seek → restart-to-0 (the usenet restart bug, same as live-TV).
          const tsOffset = sumPlaylistDuration(session)
          const args: string[] = ['-ss', String(lastDuration)]
          args.push(...buildFFmpegArgs(session.inputUrl, session.outputDir, headers, false, audioTrackIndex, true, undefined, tsOffset))
          let newProc: ChildProcess
          try {
            newProc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
          } catch (err: any) {
            debug('FFmpeg respawn failed:', err?.message)
            session.ended = true
            appendEndList(session)
            return
          }
          // Same session id + same output dir + append_list → the renderer's
          // playlist URL keeps growing seamlessly with no restart visible.
          session.process = newProc
          session.openedBytes = totalBytes
          session.lastError = null
          session.stderrBuffer = []
          wireProcess(session, newProc, headers, audioTrackIndex)
          armReadyWatcher(session)
          debug('Respawned FFmpeg in place (append_list)')
          return
        }
      } catch (err: any) {
        // File path gone — nzbget renamed the completed file. Stream is over.
        debug('Growing-file check failed (file renamed/complete?):', err?.message)
      }
    }
    // Stream over — let hls.js finish instead of stalling on a live playlist.
    session.ended = true
    appendEndList(session)
    if (code !== 0) {
      cleanupSession(session.id)
    } else {
      session.readyResolve()
    }
  })
}

/**
 * Start an FFmpeg HLS remux session.
 * Returns { sessionId, streamUrl }. Throws on failure.
 */
 export function createSession(
   inputUrl: string,
   resumePosition = 0,
   headers: string[] = [],
   audioTrackIndex?: number,
 ): { sessionId: string; streamUrl: string } {
   const id = generateId()
   const outputDir = getSessionDir(id)

   fs.mkdirSync(outputDir, { recursive: true })

   // If resume position specified, add -ss before -i for fast seek.
   const args: string[] = []
   if (resumePosition > 0) {
     debug('Adding -ss seek to', resumePosition)
     args.push('-ss', String(resumePosition))
   } else {
     debug('No resume seek (resumePosition=', resumePosition, ') — starting from 0:00')
   }
   // ponytail: Chromium (Electron 42) with VAAPI decodes HEVC natively.
   // No transcode needed — just remux (copy) the video stream.
   // Live http(s) streams are chunked: -t caps each FFmpeg process, the exit
   // handler respawns append_list (see LIVE_CHUNK_SECONDS). Localhost HTTP
   // (torrent server) and file:// are FINITE files — chunk rotation would
   // respawn ffmpeg at byte 0 and replay the file from 0:00.
   const isLive = inputUrl.startsWith('http') && !isLocalHttpUrl(inputUrl)
   args.push(...buildFFmpegArgs(inputUrl, outputDir, headers, false, audioTrackIndex, false, isLive ? LIVE_CHUNK_SECONDS : undefined))

   debug('Spawning FFmpeg:', 'ffmpeg', args.join(' '))

   let proc: ChildProcess
   try {
     proc = spawn('ffmpeg', args, {
       stdio: ['ignore', 'pipe', 'pipe'],
     })
   } catch (err: any) {
     debug('FFmpeg spawn failed:', err?.message)
     try { fs.rmSync(outputDir, { recursive: true, force: true }) } catch {}
     throw new Error(`FFmpeg not found or failed to start: ${err?.message || err}`)
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
     lastError: null,
     stderrBuffer: [],
     openedBytes: 0,
     ended: false,
     isLive,
     expectingExit: false,
     }

   sessions.set(id, session)

   // Write placeholder playlist immediately so the first HLS request succeeds.
   fs.writeFileSync(path.join(outputDir, 'playlist.m3u8'), PLACEHOLDER_PLAYLIST)

   // Track the file size at open time so we can detect growth on exit.
   if (inputUrl.startsWith('file://')) {
     try {
       session.openedBytes = fs.statSync(inputUrl.replace(/^file:\/\//, '')).size
     } catch { /* ignore */ }
   }

   // Monitor output, handle respawn-on-growth and end-of-stream below.
   wireProcess(session, proc, headers, audioTrackIndex)
   armReadyWatcher(session)
   if (isLive) scheduleChunkRotation(session, headers, audioTrackIndex)

   const port = portGetter ? portGetter() : 0
   const streamUrl = `http://127.0.0.1:${port}/remux/${id}/playlist.m3u8`
   debug('Session created:', id, '→', streamUrl)
   return { sessionId: id, streamUrl }
 }

function cleanupSession(id: string) {
  const session = sessions.get(id)
  if (!session) return
  sessions.delete(id)
  if (session.rotationTimer) { clearTimeout(session.rotationTimer); session.rotationTimer = undefined }

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

/** Retrieve the last error message for a session (or null). */
export function getSessionError(sessionId: string): string | null {
  const session = sessions.get(sessionId)
  return session?.lastError ?? null
}

/** Kill all active sessions and clean up. */
export function shutdown(): void {
  debug('Shutting down, killing', sessions.size, 'sessions')
  for (const [id] of sessions) {
    cleanupSession(id)
  }
  sessions.clear()
  // Sweep orphaned dirs too (crashed sessions never ran cleanupSession) —
  // otherwise segments survive until the next playback stop.
  sweepOrphanedDirs()
}

/** Remove any session dir under REMUX_BASE not tracked in `sessions`. */
function sweepOrphanedDirs(): void {
  try {
    if (fs.existsSync(REMUX_BASE)) {
      const entries = fs.readdirSync(REMUX_BASE)
      for (const entry of entries) {
        const entryPath = path.join(REMUX_BASE, entry)
        try {
          fs.rmSync(entryPath, { recursive: true, force: true })
        } catch (e: any) {
          debug('Failed to remove orphaned session dir:', entry, e?.message)
        }
      }
    }
  } catch (e: any) {
    debug('Failed to clean remux base dir:', e?.message)
  }
}

/** Kill all sessions and remove all temp files. Called on playback exit. */
export function clearAllSessions(): void {
  debug('Clearing all sessions and temp files')
  for (const [id] of sessions) {
    cleanupSession(id)
  }
  sessions.clear()
  sweepOrphanedDirs()
}

// ─── Request Handling ────────────────────────────────────────────────────────

/**
 * Handle an HTTP request for a remux file.
 *
 * Called from local-cache.service.ts when the URL matches:
 *   /remux/<sessionId>/<playlist.m3u8|segmentNNNNN.ts>
 */
export async function handleRemuxRequest(
  sessionId: string,
  filename: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const session = sessions.get(sessionId)
    if (!session) {
      res.writeHead(404, {
        'Access-Control-Allow-Origin': '*',
      })
      res.end('Remux session not found')
      return
    }

  // For playlist.m3u8: wait for the first real playlist write (FFmpeg
  // replaces the placeholder after the first segment), then serve it.
  // Without this, hls.js gets an empty playlist and the 8s watchdog fires
  // before any segments are listed.
  if (filename === 'playlist.m3u8') {
    await session.ready.catch(() => {})
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
    let content = fs.readFileSync(playlistPath, 'utf-8')
    // Once the stream has ended, make sure hls.js sees the ENDLIST so it
    // plays out the buffered tail and fires "ended" instead of stalling.
    if (session.ended && !content.includes('#EXT-X-ENDLIST')) {
      content += '#EXT-X-ENDLIST\n'
    }
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

/** Chapter metadata extracted from ffprobe. */
export interface Chapter {
  title: string
  startTime: number
  endTime: number
}

/** Audio track metadata extracted from ffprobe. */
export interface AudioTrackInfo {
  index: number
  language: string
  title: string
  codec: string
  channels: number
  isDefault: boolean
}

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

/** Probe a URL for chapter metadata using ffprobe. Returns chapter list. */
export function probeChapters(inputUrl: string): Chapter[] {
  try {
    const result = require('child_process').execSync(
      `ffprobe -v error -show_chapters -print_format json "${inputUrl}"`,
      { timeout: 20000, stdio: ['pipe', 'pipe', 'ignore'] },
    )
    const data = JSON.parse(result.toString())
    if (!data.chapters || !Array.isArray(data.chapters)) return []
    return data.chapters.map((ch: any) => ({
      title: ch.tags?.title || '',
      startTime: parseFloat(ch.start_time),
      endTime: parseFloat(ch.end_time),
    }))
  } catch {
    return []
  }
}

/** Probe a URL for audio track metadata. Returns track list. */
export function probeAudioTracks(inputUrl: string): AudioTrackInfo[] {
  try {
    const result = require('child_process').execSync(
      `ffprobe -v error -select_streams a -show_entries stream=index,codec_name:stream_tags=language,title -of json "${inputUrl}"`,
      { timeout: 20000, stdio: ['pipe', 'pipe', 'ignore'] },
    )
    const data = JSON.parse(result.toString())
    if (!data.streams || !Array.isArray(data.streams)) return []
    return data.streams.map((s: any, i: number) => ({
      index: s.index ?? i,
      language: s.tags?.language || '',
      title: s.tags?.title || '',
      codec: s.codec_name || '',
      channels: s.channels ?? 0,
      isDefault: i === 0,
    }))
  } catch {
    return []
  }
}

/** Get info about an active session (for audio track switching). */
export function getSessionInfo(sessionId: string): { inputUrl: string; resumePosition: number } | null {
  const session = sessions.get(sessionId)
  if (!session) return null
  return { inputUrl: session.inputUrl, resumePosition: 0 }
}
