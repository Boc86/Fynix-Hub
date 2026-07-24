/**
 * Player lifecycle service.
 *
 * Wraps ffmpeg-remux.service for browser-based playback. Handles URL
 * resolution (ok.ru, Dailymotion) and decides whether a URL needs
 * FFmpeg remuxing or can be played directly by hls.js.
 *
 * Replaces the mpv.service.ts API surface for the renderer process.
 */

import * as FfmpegRemux from './ffmpeg-remux.service'
import * as OkruResolver from './okru-resolver'
import * as DailymotionResolver from './dailymotion-resolver'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StartPlaybackResult {
  /** URL the renderer should feed to VideoJsPlayer. */
  streamUrl: string
  /** Duration in seconds, if known from ffprobe. */
  duration: number | null
}

// ─── State ───────────────────────────────────────────────────────────────────

let currentSessionId: string | null = null

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

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Start playback of a URL.
 *
 * 1. Resolves ok.ru / Dailymotion URLs to direct stream URLs.
 * 2. If the URL is already browser-playable, passes it directly.
 * 3. Otherwise, spawns FFmpeg to remux to HLS fMP4.
 */
export async function startPlayback(
  inputUrl: string,
  resumePosition?: number,
  referer?: string,
): Promise<StartPlaybackResult> {
  await stopPlayback()

  let resolvedUrl = inputUrl

  // ── URL resolution ────────────────────────────────────────────────────
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
      // Dailymotion cookie is used for CDN auth; pass as referer.
      if (resolved.cookie) {
        referer = referer || 'https://www.dailymotion.com/'
      }
    } catch (err: any) {
      debug('Dailymotion resolution failed:', err?.message)
      throw err
    }
  }

  // ── Decide: direct play or remux ──────────────────────────────────────
  if (isBrowserPlayable(resolvedUrl)) {
    debug('URL is browser-playable, passing directly:', resolvedUrl.slice(0, 80))
    currentSessionId = null
    return { streamUrl: resolvedUrl, duration: null }
  }

  // ── FFmpeg remux ──────────────────────────────────────────────────────
  // For remote URLs that need custom headers, FFmpeg can accept them via
  // -headers flag. We build the URL with headers appended.
  let ffmpegInputUrl = resolvedUrl

  const headers: string[] = []
  // Standard Chrome user-agent for non-local streams.
  const isLocal = /^https?:\/\/127\.0\.0\.1/.test(resolvedUrl) || /^https?:\/\/localhost/.test(resolvedUrl)
  if (!isLocal) {
    headers.push('User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')
  }
  if (referer) {
    headers.push(`Referer: ${referer}`)
  }

  // For ok.ru / VK / Dailymotion streams, add origin headers.
  const isOkCdn = /okcdn\.ru/i.test(resolvedUrl)
  const isVk = /vk\.com|vkvideo|vkuser\.net/i.test(resolvedUrl)
  const isDailymotion = DailymotionResolver.isDailymotionUrl(inputUrl)
  if (isOkCdn || isVk) {
    headers.push('Referer: https://ok.ru/')
    headers.push('Origin: https://ok.ru')
  } else if (isDailymotion) {
    headers.push('Referer: https://www.dailymotion.com/')
    headers.push('Origin: https://www.dailymotion.com')
  }

  // Build FFmpeg input URL with headers if needed.
  if (headers.length > 0) {
    // FFmpeg -headers expects \r\n terminated lines.
    const headerStr = headers.join('\r\n') + '\r\n'
    ffmpegInputUrl = `${resolvedUrl}|headers=${headerStr}`
  }

  debug('Starting FFmpeg remux for:', resolvedUrl.slice(0, 80))
  const result = FfmpegRemux.createSession(ffmpegInputUrl, resumePosition || 0)
  if (!result) {
    throw new Error('Failed to start FFmpeg remux session')
  }

  currentSessionId = result.sessionId
  const duration = FfmpegRemux.probeDuration(resolvedUrl)

  debug('Remux session started:', result.sessionId, 'duration:', duration)
  return { streamUrl: result.streamUrl, duration }
}

/**
 * Stop the current playback session.
 */
export async function stopPlayback(): Promise<void> {
  if (currentSessionId) {
    debug('Stopping session:', currentSessionId)
    FfmpegRemux.killSession(currentSessionId)
    currentSessionId = null
  }
}

/**
 * Check if a URL is a remote stream that FFmpeg should handle
 * with custom HTTP headers.
 */
export function needsHttpHeaders(url: string): boolean {
  return !/^https?:\/\/127\.0\.0\.1/.test(url) && !/^https?:\/\//.test(url) === false
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
