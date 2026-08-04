// Shared channel loading logic for Settings, LiveTV, and EPG.
// The CDN+M3U merge runs in the MAIN process (channel-merge.service.ts) and is
// warmed in the background at startup: pulling 700k+ raw M3U rows over IPC and
// merging them on the UI thread used to freeze the window for seconds on every
// screen entry. The renderer gets a bounded slice (CDN first, then M3U by
// country+name, plus curated ids) and caches it for the session.

export interface MergedChannel {
  id: string
  name: string
  /** Logo URL provided by CDN (best quality) */
  logo: string
  /** tv-logo fallback URL computed in main process */
  logoImage: string
  /** tvg-logo URL from the M3U playlist (optional; lower priority than CDN logo) */
  m3uLogo?: string
  /** EPG guide icon (matched by main's channel map) — shown when no CDN/M3U logo */
  epgIcon?: string
  countryCode: string
  countryName: string
  sources: string[]
}

export interface MergedChannelsResponse {
  channels: MergedChannel[]
  /** Total unique merged channels in main (the renderer only gets a slice). */
  total: number
  truncated: boolean
}

const CACHE_KEY_DELIM = '\u0001'

// Session-level cache keyed by the curated-id set: the underlying CDN/M3U
// channel lists are disk-cached in main and only change via the daily portal
// scrape, so re-fetching on every screen mount is pure waste. First caller
// does the work; everyone else gets the cached list instantly.
let mergedCache: { key: string; channels: MergedChannel[] } | null = null
let mergedInflight: Promise<MergedChannel[]> | null = null

/** Invalidate the cached merged list (e.g. after a channel-source refresh). */
export function invalidateMergedChannels(): void {
  mergedCache = null
  window.api.channels.invalidateMerged()
}

/**
 * Load the merged CDN + M3U channel list (computed + cached in main).
 * `includeIds` are always present in the result even when they fall outside
 * the renderer cap (curated visible/ordered channels must never disappear).
 * Result is cached for the session; on fetch failure the stale cache is
 * returned if one exists.
 */
export async function loadMergedChannels(options?: { includeIds?: string[] }): Promise<MergedChannel[]> {
  const includeIds = options?.includeIds || []
  const key = [...includeIds].sort().join(CACHE_KEY_DELIM)
  if (mergedCache && mergedCache.key === key) return mergedCache.channels
  if (!mergedInflight) {
    mergedInflight = window.api.channels
      .getMerged(includeIds)
      .then((data) => {
        mergedCache = { key, channels: data.channels }
        return data.channels
      })
      .catch((err) => {
        // Stale-while-revalidate: fall back to whatever we had
        if (mergedCache) return mergedCache.channels
        throw err
      })
      .finally(() => {
        mergedInflight = null
      })
  }
  return mergedInflight
}

/** Full-list name search against main (Settings can find any channel). */
export async function searchMergedChannels(query: string, limit?: number): Promise<MergedChannel[]> {
  return window.api.channels.searchMerged(query, limit)
}
