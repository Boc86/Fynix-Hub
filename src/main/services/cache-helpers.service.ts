import * as CacheService from './cache.service'

export async function withCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = CacheService.getCache(key)
  if (cached !== null) {
    try { return JSON.parse(cached) as T } catch {}
  }
  const value = await fetcher()
  CacheService.setCache(key, JSON.stringify(value), ttlMs)
  return value
}

// Short TTLs for frequently-changing data
export const TTL = {
  SPORTS_LIST: 86_400_000,      // 24h — sports rarely change
  SPORTS_LEAGUES: 300_000,      // 5 min
  SPORTS_SEASONS: 300_000,      // 5 min
  SPORTS_EVENTS: 300_000,       // 5 min
  SPORTS_TEAMS: 86_400_000,     // 24h
  TMDB_DETAILS: 3_600_000,      // 1 hr
  TMDB_LISTS: 300_000,          // 5 min — trending/discover rotates
  TRAKT_PROGRESS: 300_000,      // 5 min
  DEBRID_CACHE: 120_000,        // 2 min
  SUBTITLES: 1_800_000,         // 30 min
  YOUTUBE_STREAM: 3_600_000,    // 1 hr
  FANART_IMAGES: 86_400_000,    // 24h
  TORRENT_SEARCH: 300_000,      // 5 min
} as const
