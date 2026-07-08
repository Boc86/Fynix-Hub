import * as CacheService from './cache.service'
import { withCache, TTL } from './cache-helpers.service'

const TRAKT_BASE = 'https://api.trakt.tv'
const TRAKT_AUTH_BASE = 'https://api.trakt.tv/oauth'
const USER_AGENT = 'FynixHub/1.0.0'

const XOR_KEY = 0xAB

const OBFUSCATED_CLIENT_ID = [
  200, 250, 17, 249, 74, 71, 85, 148, 143, 238, 179, 114,
  228, 226, 207, 116, 129, 70, 115, 113, 186, 233, 118, 87,
  186, 63, 33, 222, 228, 3, 234, 108,
]

const OBFUSCATED_CLIENT_SECRET = [
  212, 38, 59, 91, 148, 207, 145, 249, 12, 126, 196, 48,
  181, 232, 140, 67, 195, 150, 154, 162, 94, 13, 197, 148,
  12, 28, 103, 107, 59, 61, 212, 71,
]

function deobfuscate(bytes: number[]): string {
  return Buffer.from(bytes.map(b => b ^ XOR_KEY)).toString('hex')
}

let clientId = ''
let clientSecret = ''
let accessToken: string | null = null
let refreshToken: string | null = null

export function loadCredentials() {
  clientId = deobfuscate(OBFUSCATED_CLIENT_ID)
  clientSecret = deobfuscate(OBFUSCATED_CLIENT_SECRET)
  accessToken = CacheService.getSetting<string>('traktAccessToken') || null
  refreshToken = CacheService.getSetting<string>('traktRefreshToken') || null
}

export function setTokens(access: string | null, refresh: string | null) {
  accessToken = access
  refreshToken = refresh
  if (access) CacheService.setSetting('traktAccessToken', access)
  else CacheService.setSetting('traktAccessToken', null)
  if (refresh) CacheService.setSetting('traktRefreshToken', refresh)
  else CacheService.setSetting('traktRefreshToken', null)
}

export function getTokens() {
  return { accessToken, refreshToken }
}

export function isAuthenticated(): boolean {
  return !!accessToken
}

async function fetchTrakt(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
    'trakt-api-version': '2',
    'trakt-api-key': clientId,
    ...(options.headers as Record<string, string> || {}),
  }
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }
  const res = await fetch(`${TRAKT_BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    const body = await res.text().catch(() => '(could not read body)')
    throw new Error(`Trakt error: ${res.status} - ${body.slice(0, 500)}`)
  }
  return res.json()
}

export async function getDeviceCode() {
  const res = await fetch(`${TRAKT_AUTH_BASE}/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({ client_id: clientId }),
  })
  if (!res.ok) throw new Error(`Trakt device code error: ${res.status}`)
  return res.json()
}

export async function pollForToken(deviceCode: string) {
  const res = await fetch(`${TRAKT_AUTH_BASE}/device/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({
      code: deviceCode,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  if (res.status === 400) {
    try {
      const body = await res.json()
      return { error: body.error || 'pending' }
    } catch {
      return { error: 'pending' }
    }
  }
  if (!res.ok) throw new Error(`Trakt auth error: ${res.status}`)
  const data = await res.json()
  accessToken = data.access_token
  refreshToken = data.refresh_token
  setTokens(data.access_token, data.refresh_token)
  return data
}

export async function getWatchedMovies() {
  return withCache('trakt:watched-movies', TTL.TRAKT_PROGRESS, () =>
    fetchTrakt('/sync/watched/movies'))
}

export async function getWatchedShows() {
  const data = await withCache('trakt:watched-shows', TTL.TRAKT_PROGRESS, () =>
    fetchTrakt('/sync/watched/shows?extended=progress'))
  return data
}

export async function scrobble(action: 'start' | 'pause' | 'stop', media: object) {
  return fetchTrakt('/scrobble/' + action, {
    method: 'POST',
    body: JSON.stringify(media),
  })
}

export async function markWatched(media: object) {
  return fetchTrakt('/sync/history', {
    method: 'POST',
    body: JSON.stringify(media),
  })
}

export async function markUnwatched(media: object) {
  return fetchTrakt('/sync/history/remove', {
    method: 'POST',
    body: JSON.stringify(media),
  })
}

export async function getSettings() {
  return fetchTrakt('/users/settings')
}

export async function getWatchlist(type: 'movies' | 'shows') {
  return withCache(`trakt:watchlist:${type}`, TTL.TRAKT_PROGRESS, () =>
    fetchTrakt(`/sync/watchlist/${type}`))
}

export async function getPlayback() {
  return withCache('trakt:playback', TTL.TRAKT_PROGRESS, () =>
    fetchTrakt('/sync/playback'))
}

export async function getPlaybackMovies() {
  return withCache('trakt:playback-movies', TTL.TRAKT_PROGRESS, () =>
    fetchTrakt('/sync/playback/movies'))
}

export async function getPlaybackEpisodes() {
  return withCache('trakt:playback-episodes', TTL.TRAKT_PROGRESS, () =>
    fetchTrakt('/sync/playback/episodes'))
}

export async function getShowWatchedProgress(showId: string) {
  return withCache(`trakt:show-progress:${showId}`, TTL.TRAKT_PROGRESS, () =>
    fetchTrakt(`/shows/${showId}/progress/watched?specials=false&hidden=false`))
}

function findNextEpisodeFromProgress(progress: any): { season: number; number: number; first_aired?: string } | null {
  // Prefer the API-computed next_episode if available
  if (progress.next_episode?.season && progress.next_episode?.number) {
    // Skip if the episode's air date is in the future
    if (progress.next_episode.first_aired && new Date(progress.next_episode.first_aired) > new Date()) {
      return null
    }
    // Skip if no air date is known and all currently aired episodes are watched
    // (the next_episode is a placeholder for a future season)
    if (!progress.next_episode.first_aired && progress.completed >= progress.aired) {
      return null
    }
    return {
      season: progress.next_episode.season,
      number: progress.next_episode.number,
      first_aired: progress.next_episode.first_aired,
    }
  }

  // Fallback: scan seasons array for first unwatched aired episode
  if (!progress.seasons || !Array.isArray(progress.seasons)) return null
  for (const season of progress.seasons) {
    if (!season.number || season.number === 0) continue
    if (!season.episodes || !Array.isArray(season.episodes)) continue
    if (season.completed >= season.aired) continue
    for (const ep of season.episodes) {
      if (ep.number && ep.number > 0 && ep.completed === false) {
        return { season: season.number, number: ep.number }
      }
    }
  }
  return null
}

export async function getWatchedShowsWithProgress() {
  const watched = await withCache('trakt:watched-progress', TTL.TRAKT_PROGRESS, () =>
    fetchTrakt('/sync/watched/shows?extended=progress,full')) as any[]
  if (!watched || !Array.isArray(watched)) return []

  // Filter to shows we can resolve, then fetch per-show progress in parallel
  const candidates = watched.filter(e =>
    e.show?.ids?.tmdb && (e.show?.ids?.imdb || e.show?.ids?.trakt)
  )

  const progressResults = await Promise.all(
    candidates.map(async (entry) => {
      try {
        // Match Umbrella: prefer IMDB ID, fall back to Trakt ID
        const showId = entry.show.ids.imdb || String(entry.show.ids.trakt)
        const progress = await getShowWatchedProgress(showId)
        return { entry, progress }
      } catch {
        return null
      }
    })
  )

  const results: any[] = []

  for (const item of progressResults) {
    if (!item) continue
    const { entry, progress } = item
    if (!progress) continue

    const nextEpisode = findNextEpisodeFromProgress(progress)
    if (!nextEpisode) continue

    const show = entry.show
    results.push({
      show: {
        title: show.title,
        year: show.year,
        ids: show.ids,
      },
      next_episode: nextEpisode,
      completion: progress.aired > 0 ? progress.completed / progress.aired : 0,
      aired: progress.aired,
      completed: progress.completed,
      last_watched_at: progress.last_watched_at || entry.last_watched_at || entry.reset_at,
    })
  }

  results.sort((a, b) => {
    const aWatched = new Date(a.last_watched_at || 0).getTime()
    const bWatched = new Date(b.last_watched_at || 0).getTime()
    return bWatched - aWatched
  })

  return results
}

export function buildScrobblePayload(tmdbId: number, mediaType: string, progress: number, season?: number, episode?: number) {
  if (mediaType === 'tv' && season !== undefined && episode !== undefined) {
    return {
      show: { ids: { tmdb: tmdbId } },
      episode: { season, number: episode },
      progress: Math.round(progress * 100),
    }
  }
  return {
    movie: { ids: { tmdb: tmdbId } },
    progress: Math.round(progress * 100),
  }
}

export function buildHistoryPayload(tmdbId: number, mediaType: string, season?: number, episode?: number) {
  if (mediaType === 'tv' && season !== undefined && episode !== undefined) {
    return {
      shows: [{
        ids: { tmdb: tmdbId },
        seasons: [{ season, episodes: [{ number: episode }] }],
      }],
    }
  }
  return { movies: [{ ids: { tmdb: tmdbId } }] }
}
