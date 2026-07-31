// React hook that resolves a channel logo URL with fallback to the
// tv-logo/tv-logos GitHub repo when CDN/M3U doesn't provide one.
//
// Usage:
//   const logoUrl = useChannelLogo(channel.name, channel.logoImage, channel.countryCode)
//
// Returns: the best available logo URL (CDN → fallback → '')

import { useEffect, useState } from 'react'
import { bestLogoUrl } from './logos'

const fallbackCache = new Map<string, string | undefined>()

/**
 * Resolve a channel logo URL. Returns the CDN/M3U logo if available,
 * otherwise falls back to the tv-logo/tv-logos GitHub repo (resolved
 * via main-process IPC with caching).
 */
export function useChannelLogo(
  channelName: string,
  cdnLogo: string,
  countryCode: string,
): string {
  const [fallback, setFallback] = useState<string>('')

  useEffect(() => {
    // If CDN logo is present, use it
    if (cdnLogo) return

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
  }, [channelName, cdnLogo, countryCode])

  return cdnLogo || fallback || bestLogoUrl(channelName, countryCode)
}

const pending = new Set<string>()

/**
 * Prefetch logos for a batch of channels. Call when entering LiveTV
 * so the first render already has resolved logos.
 */
export async function prewarmLogos(channels: { name: string; countryCode: string }[]): Promise<void> {
  const todo = channels.filter(c => c.name && c.countryCode)
  if (todo.length === 0) return
  try {
    await window.api.channelLogo.prewarm(todo)
  } catch {
    /* ignore */
  }
}
