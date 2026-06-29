import * as CacheService from './cache.service'

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
  return fetchTrakt('/sync/watched/movies')
}

export async function getWatchedShows() {
  return fetchTrakt('/sync/watched/shows')
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
  return fetchTrakt(`/sync/watchlist/${type}`)
}

export async function getPlayback() {
  return fetchTrakt('/sync/playback')
}

export async function getPlaybackMovies() {
  return fetchTrakt('/sync/playback/movies')
}

export async function getPlaybackEpisodes() {
  return fetchTrakt('/sync/playback/episodes')
}

export async function getShowProgress(showTraktId: number) {
  return fetchTrakt(`/shows/${showTraktId}/progress?extended=full`)
}

export async function getWatchedShowsWithProgress() {
  // Single API call — matches the Kodi TMDB Helper plugin approach
  // /sync/watched/shows?extended=full returns aired_episodes, watched_episodes,
  // last_watched_at, and nested seasons/episodes watched data
  const watched = await fetchTrakt('/sync/watched/shows?extended=full') as any[]
  if (!watched || !Array.isArray(watched)) return []

  const results: any[] = []

  for (const entry of watched) {
    const show = entry.show
    if (!show || !show.ids || !show.ids.tmdb) continue

    const aired = show.aired_episodes || 0
    const watchedCount = entry.watched_episodes || 0

    // In progress = more episodes aired than watched
    if (aired <= watchedCount) continue

    // Find next unwatched episode from nested seasons data
    let nextEpisode: { season: number; number: number; title?: string } | null = null

    if (entry.seasons && Array.isArray(entry.seasons)) {
      // Sort seasons by number
      const sortedSeasons = [...entry.seasons].sort((a, b) => (a.number || 0) - (b.number || 0))
      for (const season of sortedSeasons) {
        if (!season.episodes || !Array.isArray(season.episodes)) continue
        // Build a set of watched episode numbers for this season
        const watchedEpisodes = new Set<number>()
        for (const ep of season.episodes) {
          if (ep.number !== undefined) watchedEpisodes.add(ep.number)
        }
        // Find the first unwatched episode in this season
        // Episodes are 1-indexed, find lowest unwatched
        for (let epNum = 1; epNum <= 100; epNum++) {
          if (!watchedEpisodes.has(epNum)) {
            nextEpisode = { season: season.number || 1, number: epNum }
            break
          }
        }
        if (nextEpisode) break
      }
    }

    if (!nextEpisode) continue

    const completion = aired > 0 ? watchedCount / aired : 0

    results.push({
      show: {
        title: show.title,
        year: show.year,
        ids: show.ids,
      },
      next_episode: nextEpisode,
      completion,
      aired,
      completed: watchedCount,
      last_watched_at: entry.last_watched_at || entry.reset_at,
    })
  }

  // Sort by last_watched_at descending (most recently watched first)
  results.sort((a, b) => {
    const aTime = new Date(a.last_watched_at || 0).getTime()
    const bTime = new Date(b.last_watched_at || 0).getTime()
    return bTime - aTime
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
