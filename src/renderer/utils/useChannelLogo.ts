// React hook that resolves a channel logo URL with a 4-tier priority chain:
//   1. CDN logo        (best quality, provided by the CDN channel list)
//   2. M3U tvg-logo    (from the playlist's #EXTINF line)
//   3. EPG icon        (from the EPG guide data)
//   4. GitHub fallback (HEAD-checked tv-logo/tv-logos repo URL)
//
// Usage:
//   const logoUrl = useChannelLogo(channel.name, channel.logoImage, channel.countryCode, channel.icon)
//
// Returns: the best available logo URL (CDN → M3U → EPG → fallback → '')

import { useEffect, useState } from 'react'
import { bestLogoUrl } from './logos'

const fallbackCache = new Map<string, string | undefined>()

/**
 * Resolve a channel logo URL. Returns the CDN/M3U logo if available,
 * otherwise the EPG icon (when it's an absolute http(s) URL), otherwise
 * falls back to the tv-logo/tv-logos GitHub repo (resolved via main-process
 * IPC with caching).
 */
export function useChannelLogo(
  channelName: string,
  cdnLogo: string,
  countryCode: string,
  epgIcon?: string,
): string {
  const [fallback, setFallback] = useState<string>('')

  // EPG icons can be empty or relative paths — only accept absolute http(s) URLs
  const epg = epgIcon && /^https?:\/\//i.test(epgIcon) ? epgIcon : ''

  useEffect(() => {
    // If CDN logo or EPG icon is present, use it
    if (cdnLogo || epg) return

    if (!channelName || !countryCode) return

    // Skip if we already know there's no fallback
    const cacheKey = `${channelName}|${countryCode}`
    if (fallbackCache.has(cacheKey)) {
      setFallback(fallbackCache.get(cacheKey) || '')
      return
    }

    // Skip if a HEAD request is already in flight for this key
    if (pending.has(cacheKey)) return
    pending.add(cacheKey)

    window.api.channelLogo
      .resolve(channelName, countryCode)
      .then((url: string) => {
        fallbackCache.set(cacheKey, url)
        // Only update state if the CDN logo is still empty for this channel
        if (!cdnLogo) setFallback(url)
      })
      .catch(() => {
        fallbackCache.set(cacheKey, '')
      })
      .finally(() => {
        pending.delete(cacheKey)
      })
  }, [channelName, cdnLogo, countryCode, epg])

  return cdnLogo || epg || fallback || bestLogoUrl(channelName, countryCode)
}

const pending = new Set<string>()
// Prewarming re-resolves every channel's logo on every LiveTV mount; the
// main process caches results on disk, so run the batch once per session.
let prewarmRan = false

/**
 * Prefetch logos for a batch of channels. Call when entering LiveTV
 * so the first render already has resolved logos.
 */
export async function prewarmLogos(channels: { name: string; countryCode: string }[]): Promise<void> {
  if (prewarmRan) return
  prewarmRan = true
  const todo = channels.filter(c => c.name && c.countryCode)
  if (todo.length === 0) return
  try {
    await window.api.channelLogo.prewarm(todo)
  } catch {
    /* ignore */
  }
}
