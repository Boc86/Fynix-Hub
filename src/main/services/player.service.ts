/**
 * Player lifecycle service.
 *
 * Wraps ffmpeg-remux.service for browser-based playback. Handles URL
 * resolution (ok.ru, Dailymotion) and decides whether a URL needs
 * FFmpeg remuxing or can be played directly by hls.js.
 *
 * For browser-playable streams that need custom CDN headers (ok.ru/VK),
 * routes through local-cache proxy to inject Referer/Origin headers.
 *
 * Replaces the mpv.service.ts API surface for the renderer process.
 */

import * as FfmpegRemux from './ffmpeg-remux.service'
import type { Chapter, AudioTrackInfo } from './ffmpeg-remux.service'
import * as LocalCache from './local-cache.service'
import * as OkruResolver from './okru-resolver'
import * as DailymotionResolver from './dailymotion-resolver'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StartPlaybackResult {
  /** URL the renderer should feed to VideoJsPlayer. */
  streamUrl: string
  /** Duration in seconds, if known from ffprobe. */
  duration: number | null
  /** Chapter metadata, if available from ffprobe. */
  chapters: Chapter[]
  /** Available audio tracks in the source file. */
  audioTracks: AudioTrackInfo[]
  /** Whether this stream is an FFmpeg remux (vs direct/proxied). */
  isRemux: boolean
}

// ─── State ───────────────────────────────────────────────────────────────────

interface SessionState {
  remuxId: string | null
  proxyId: string | null
  fileSessionId: string | null
  resumePosition: number
  chapters: Chapter[]
  audioTracks: AudioTrackInfo[]
  timer: ReturnType<typeof setInterval> | null
}

/**
 * One playback session per client (e.g. 'desktop', or a future 'android-tv'
 * client) so multiple clients can play concurrently. Each session owns its
 * FFmpeg remux / local-cache proxy / file-session resources, its resume
 * position, its metadata and its watchdog timer.
 */
const sessions = new Map<string, SessionState>()

function session(clientId: string): SessionState {
  let s = sessions.get(clientId)
  if (!s) {
    s = {
      remuxId: null,
      proxyId: null,
      fileSessionId: null,
      resumePosition: 0,
      chapters: [],
      audioTracks: [],
      timer: null,
    }
    sessions.set(clientId, s)
  }
  return s
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function debug(...args: unknown[]) {
  console.log('[PlayerService]', ...args)
}

/**
 * Determine if a URL is already browser-playable by hls.js or natively.
 * Returns true for .m3u8 (HLS), .mp4, .webm, .m4a, .mp3.
 */
/** Check if a URL serves browser-playable media (HLS or progressive). */
function isBrowserPlayable(url: string): boolean {
  if (/\.(m3u8|mp4|webm|m4a|mp3|aac|ogg)(\?|$)/i.test(url)) return true
  // ok.ru/VK CDN URLs serve progressive MP4 without a file extension.
  // These are browser-playable via hls.js/MSE when proxied with CDN headers.
  // Routing them through FFmpeg remux causes 400 Bad Request from the CDN
  // (FFmpeg's -headers option sends Origin/Referer in a way the CDN rejects).
  return needsCdnProxy(url)
}

/**
 * Check if URL is a remote CDN stream that requires auth headers.
 * These streams need proxying because the browser can't send custom
 * Referer/Origin headers via hls.js XHR.
 */
function needsCdnProxy(url: string): boolean {
  return /okcdn\.ru|vkuser\.net|vk\.com|vkvideo|dlhd\.st|cdnlivetv\.is/i.test(url)
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Start playback of a URL.
 *
 * 1. Resolves ok.ru / Dailymotion URLs to direct stream URLs.
 * 2. If the URL is browser-playable AND doesn't need CDN headers, passes directly.
 * 3. If the URL is browser-playable BUT needs CDN headers, routes through proxy.
 * 4. Otherwise, spawns FFmpeg to remux to HLS fMP4.
 */
export async function startPlayback(
  inputUrl: string,
  resumePosition?: number,
  referer?: string,
  forceRemux?: boolean,
  audioTrackIndex?: number,
  clientId = 'desktop',
): Promise<StartPlaybackResult> {
  debug('startPlayback called url=', inputUrl.slice(0, 80), 'resumePosition=', resumePosition, 'clientId=', clientId)
  // Tear down any previous session for this client, then create a fresh one.
  await stopPlayback(clientId)
  const s = session(clientId)
  s.resumePosition = resumePosition ?? 0

  let resolvedUrl = inputUrl

  // ── URL resolution ────────────────────────────────────────
  if (OkruResolver.isOkruReplay(inputUrl)) {
    try {
      debug('Resolving ok.ru replay URL')
      resolvedUrl = await OkruResolver.resolveOkruReplay(inputUrl)
      debug('Resolved ok.ru URL:', resolvedUrl.slice(0, 80))
    } catch (err: any) {
      debug('ok.ru resolution failed:', err?.message)
      throw err
    }
  } else if (DailymotionResolver.isDailymotionUrl(inputUrl)) {
    try {
      debug('Resolving Dailymotion URL')
      const resolved = await DailymotionResolver.resolveDailymotionUrl(inputUrl)
      resolvedUrl = resolved.url
      debug('Resolved Dailymotion URL:', resolvedUrl.slice(0, 80))
    } catch (err: any) {
      debug('Dailymotion resolution failed:', err?.message)
      throw err
    }
  }

  // ── Decide playback path ──────────────────────────────────
  // ponytail: Chromium (Electron 42) decodes HEVC natively via VAAPI.
  // Play HLS/.m3u8 directly; remux only for non-browser-playable streams.
  if (isBrowserPlayable(resolvedUrl) && !forceRemux) {
    const isLocal = /^(file:|https?:\/\/(127\.0\.0\.1|localhost))/.test(resolvedUrl)

    // file:// paths (completed usenet downloads) can't be loaded by Chromium
    // from the http://localhost renderer origin — serve over the local HTTP
    // server (Range-enabled) instead.
    if (/^file:\/\//.test(resolvedUrl)) {
      const filePath = resolvedUrl.replace(/^file:\/\//, '')
      const { sessionId, url } = LocalCache.createFileSession(filePath)
      s.fileSessionId = sessionId
      debug('Local file served via HTTP:', url.slice(0, 80))
      return { streamUrl: url, duration: null, chapters: [], audioTracks: [], isRemux: false }
    }

    if (needsCdnProxy(resolvedUrl)) {
      // Browser-playable but needs CDN headers → route through local proxy.
      // The proxy injects Referer/Origin headers that the browser can't send.
      debug('CDN stream needs proxy for auth headers:', resolvedUrl.slice(0, 80))
      const { proxyId, proxyUrl } = LocalCache.createProxySession(resolvedUrl)
      s.proxyId = proxyId
      return { streamUrl: proxyUrl, duration: null, chapters: [], audioTracks: [], isRemux: false }
    }

    if (isLocal) {
      debug('URL is local, passing directly:', resolvedUrl.slice(0, 80))
    } else {
      debug('URL is browser-playable, passing directly:', resolvedUrl.slice(0, 80))
    }
    return { streamUrl: resolvedUrl, duration: null, chapters: [], audioTracks: [], isRemux: false }
  }

  // ── FFmpeg remux (non-browser-playable formats) ──────────
  const isLocal = /^(file:|https?:\/\/(127\.0\.0\.1|localhost))/.test(resolvedUrl)
  const isOkCdn = /okcdn\.ru/i.test(resolvedUrl)
  const isVk = /vk\.com|vkvideo|vkuser\.net/i.test(resolvedUrl)
  const isDailymotion = DailymotionResolver.isDailymotionUrl(inputUrl)
  const isDlhd = /dlhd\.st/i.test(resolvedUrl)

  // Build headers for FFmpeg
  const ffmpegHeaders: string[] = []
  if (!isLocal) {
    ffmpegHeaders.push('User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')
  }
  if (isOkCdn || isVk) {
    ffmpegHeaders.push('Referer: https://ok.ru/')
    ffmpegHeaders.push('Origin: https://ok.ru')
  } else if (isDailymotion) {
    ffmpegHeaders.push('Referer: https://www.dailymotion.com/')
    ffmpegHeaders.push('Origin: https://www.dailymotion.com')
  } else if (isDlhd) {
    ffmpegHeaders.push('Referer: https://dlhd.st/')
    ffmpegHeaders.push('Origin: https://dlhd.st')
  } else if (referer) {
    ffmpegHeaders.push('Referer: ' + referer)
  }

  debug('Starting FFmpeg remux for:', resolvedUrl.slice(0, 80))
  let result: { sessionId: string; streamUrl: string }
  try {
    result = FfmpegRemux.createSession(resolvedUrl, resumePosition || 0, ffmpegHeaders, audioTrackIndex)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to start FFmpeg remux session'
    throw new Error(`FFmpeg remux failed: ${msg}`)
  }

  s.remuxId = result.sessionId

  // Watch for unexpected FFmpeg exit and notify renderer
  if (s.remuxId) {
    s.timer = setInterval(() => {
      if (!s.remuxId) {
        if (s.timer) { clearInterval(s.timer); s.timer = null }
        return
      }
      const err = FfmpegRemux.getSessionError(s.remuxId)
      if (err) {
        if (s.timer) { clearInterval(s.timer); s.timer = null }
        const { BrowserWindow } = require('electron') as typeof import('electron')
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send('player:ffmpeg-error', err)
          }
        }
      }
    }, 2000)
  }

  const duration = FfmpegRemux.probeDuration(resolvedUrl)
  const chapters = FfmpegRemux.probeChapters(resolvedUrl)
  const audioTracks = FfmpegRemux.probeAudioTracks(resolvedUrl)
  s.chapters = chapters
  s.audioTracks = audioTracks

  debug('Remux session started:', result.sessionId, 'duration:', duration)
  return { streamUrl: result.streamUrl, duration, chapters, audioTracks, isRemux: true }
}

/**
 * Tear down one client's session: kill its FFmpeg remux / proxy / file
 * sessions, clear its watchdog timer and drop the record.
 */
function teardownSession(clientId: string): void {
  const s = sessions.get(clientId)
  if (!s) return
  if (s.timer) {
    clearInterval(s.timer)
    s.timer = null
  }
  if (s.fileSessionId) {
    LocalCache.removeFileSession(s.fileSessionId)
    s.fileSessionId = null
  }
  if (s.proxyId) {
    debug('Removing proxy session:', s.proxyId)
    LocalCache.removeProxySession(s.proxyId)
    s.proxyId = null
  }
  if (s.remuxId) {
    debug('Stopping session:', s.remuxId)
    FfmpegRemux.killSession(s.remuxId)
    s.remuxId = null
  }
  sessions.delete(clientId)
}

/**
 * Stop playback. With a clientId, only that client's session is torn down;
 * without one, ALL sessions are stopped (desktop compat — the renderer's
 * player:stop passes no arg and must still kill everything, including any
 * concurrent network-client sessions).
 */
export async function stopPlayback(clientId?: string): Promise<void> {
  if (clientId !== undefined) {
    teardownSession(clientId)
    return
  }
  for (const id of [...sessions.keys()]) {
    teardownSession(id)
  }
  // Belt-and-braces sweep of orphaned remux temp files (old behavior).
  FfmpegRemux.clearAllSessions()
}

/**
 * Switch the active audio track for the current FFmpeg session.
 * Stops the current session, restarts with the selected audio index.
 * Returns the new stream URL, or null if no session is active.
 */
export async function switchAudioTrack(audioIndex: number, clientId = 'desktop'): Promise<string | null> {
  const s = sessions.get(clientId)
  if (!s || !s.remuxId) return null
  const info = FfmpegRemux.getSessionInfo(s.remuxId)
  if (!info) return null
  const inputUrl = info.inputUrl
  // Capture current playback position before tearing down the session —
  // otherwise the user has to seek back to where they were after every
  // language switch.
  const resumePosition = s.resumePosition ?? 0
  await stopPlayback(clientId)
  const result = await startPlayback(inputUrl, resumePosition, undefined, false, audioIndex, clientId)
  return result.streamUrl
}

/**
 * Get chapters for the current playback session.
 */
export function getChapters(clientId = 'desktop'): Chapter[] {
  return sessions.get(clientId)?.chapters ?? []
}

/**
 * Get the current active session ID (or null).
 */
export function getCurrentSessionId(clientId = 'desktop'): string | null {
  return sessions.get(clientId)?.remuxId ?? null
}

/**
 * Shutdown — kill all sessions.
 */
export function shutdown(): void {
  void stopPlayback()
}
