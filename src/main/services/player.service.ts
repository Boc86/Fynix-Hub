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
let currentSessionId: string | null = null
let currentProxyId: string | null = null
let currentChapters: Chapter[] = []

// ─── Helpers ─────────────────────────────────────────────────────────────────

function debug(...args: unknown[]) {
  console.log('[PlayerService]', ...args)
}

/**
 * Determine if a URL is already browser-playable by hls.js or natively.
 * Returns true for .m3u8 (HLS), .mp4, .webm, .m4a, .mp3.
 */
function isBrowserPlayable(url: string): boolean {
  return /\.(m3u8|mp4|webm|m4a|mp3|aac|ogg)(\?|$)/i.test(url)
}

/**
 * Check if URL is a remote CDN stream that requires auth headers.
 * These streams need proxying because the browser can't send custom
 * Referer/Origin headers via hls.js XHR.
 */
function needsCdnProxy(url: string): boolean {
  return /okcdn\.ru|vkuser\.net|vk\.com|vkvideo|dlhd\.st/i.test(url)
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
): Promise<StartPlaybackResult> {
  debug('startPlayback called url=', inputUrl.slice(0, 80), 'resumePosition=', resumePosition)
  await stopPlayback()

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
    const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)/.test(resolvedUrl)

    if (needsCdnProxy(resolvedUrl)) {
      // Browser-playable but needs CDN headers → route through local proxy.
      // The proxy injects Referer/Origin headers that the browser can't send.
      debug('CDN stream needs proxy for auth headers:', resolvedUrl.slice(0, 80))
      const { proxyId, proxyUrl } = LocalCache.createProxySession(resolvedUrl)
      currentProxyId = proxyId
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

  currentSessionId = result.sessionId

  // Watch for unexpected FFmpeg exit and notify renderer
  if (currentSessionId) {
    const checkInterval = setInterval(() => {
      if (!currentSessionId) { clearInterval(checkInterval); return }
      const err = FfmpegRemux.getSessionError(currentSessionId)
      if (err) {
        clearInterval(checkInterval)
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
  currentChapters = chapters

  debug('Remux session started:', result.sessionId, 'duration:', duration)
  return { streamUrl: result.streamUrl, duration, chapters, audioTracks, isRemux: true }
}

/**
 * Stop the current playback session.
 */
export async function stopPlayback(): Promise<void> {
  if (currentProxyId) {
    debug('Removing proxy session:', currentProxyId)
    LocalCache.removeProxySession(currentProxyId)
    currentProxyId = null
  }
  if (currentSessionId) {
    debug('Stopping session:', currentSessionId)
    FfmpegRemux.killSession(currentSessionId)
    currentSessionId = null
  }
  currentChapters = []
}

/**
 * Switch the active audio track for the current FFmpeg session.
 * Stops the current session, restarts with the selected audio index.
 * Returns the new stream URL, or null if no session is active.
 */
export async function switchAudioTrack(audioIndex: number): Promise<string | null> {
  if (!currentSessionId) return null
  const info = FfmpegRemux.getSessionInfo(currentSessionId)
  if (!info) return null
  const inputUrl = info.inputUrl
  await stopPlayback()
  const result = await startPlayback(inputUrl, 0, undefined, false, audioIndex)
  return result.streamUrl
}

/**
 * Get chapters for the current playback session.
 */
export function getChapters(): Chapter[] {
  return currentChapters
}

/**
 * Get the current active session ID (or null).
 */
export function getCurrentSessionId(): string | null {
  return currentSessionId
}

/**
 * Shutdown — kill all sessions.
 */
export function shutdown(): void {
  stopPlayback()
}
