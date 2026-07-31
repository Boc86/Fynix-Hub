import * as CacheService from './cache.service'
import { withCache, TTL } from './cache-helpers.service'
import { findByImdb } from './tmdb.service'

const MDBLIST_BASE = 'https://api.mdblist.com'

// MDBList sits behind Cloudflare bot protection — a bare Node/undici
// User-Agent (e.g. "node") gets blocked with HTTP 403 / error 1010.
// Send a browser-like UA so device-code and API calls pass.
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const XOR_KEY = 0xAB

// Fynix Media Hub's MDBList Device Code app (registered at mdblist.com/developer).
// XOR-obfuscated with the same scheme Trakt uses; users can still override
// with their own client ID in Settings (stored as `mdblistClientId`).
const OBFUSCATED_CLIENT_ID = [
  231, 159, 153, 236, 192, 231, 248, 242, 230, 153, 219, 205, 236, 199, 194, 216,
  225, 220, 154, 192, 146, 197, 199, 217, 239, 211, 242, 146, 192, 155, 224, 155,
  222, 210, 200, 204, 206, 221, 155, 223,
]

function deobfuscate(bytes: number[]): string {
  return Buffer.from(bytes.map(b => b ^ XOR_KEY)).toString('hex')
}

/**
 * Exported for tests — resolves the baked-in MDBList client ID.
 * Trakt's deobfuscate returns a hex string (Trakt keys are hex); MDBList
 * client IDs are alphanumeric, so decode the hex back to ASCII here.
 */
export function getBakedInClientId(): string {
  return Buffer.from(deobfuscate(OBFUSCATED_CLIENT_ID), 'hex').toString('utf-8')
}

let clientId = ''
let accessToken: string | null = null
let refreshToken: string | null = null
let refreshLock: Promise<void> | null = null

export function loadCredentials() {
  const override = CacheService.getSetting<string>('mdblistClientId')
  clientId = override || getBakedInClientId()
  accessToken = CacheService.getSetting<string>('mdblistAccessToken') || null
  refreshToken = CacheService.getSetting<string>('mdblistRefreshToken') || null
}

export function setTokens(access: string | null, refresh: string | null) {
  accessToken = access
  refreshToken = refresh
  if (access) CacheService.setSetting('mdblistAccessToken', access)
  else CacheService.setSetting('mdblistAccessToken', null)
  if (refresh) CacheService.setSetting('mdblistRefreshToken', refresh)
  else CacheService.setSetting('mdblistRefreshToken', null)
}

export function getTokens() {
  return { accessToken, refreshToken }
}

export function clearCache() {
  CacheService.clearMdblistCache()
}

export function isAuthenticated(): boolean {
  return !!accessToken
}

export function buildDeviceAuthBody(clientId: string): string {
  return `client_id=${encodeURIComponent(clientId)}&scope=write`
}

export function buildTokenBody(deviceCode: string, clientId: string): string {
  return `grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code=${encodeURIComponent(deviceCode)}&client_id=${encodeURIComponent(clientId)}`
}

export function buildRefreshBody(refreshToken: string, clientId: string): string {
  return `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}&client_id=${encodeURIComponent(clientId)}`
}

async function postForm(path: string, body: string): Promise<Response> {
  return fetch(`${MDBLIST_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://mdblist.com',
      'Referer': 'https://mdblist.com/',
    },
    body,
  })
}

export async function getDeviceCode() {
  const res = await postForm('/oauth/device-authorization/', buildDeviceAuthBody(clientId))
  if (!res.ok) throw new Error(`MDBList device code error: ${res.status}`)
  return res.json()
}

export async function pollForToken(deviceCode: string) {
  const res = await postForm('/oauth/token/', buildTokenBody(deviceCode, clientId))
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error) {
    // Pending/error responses come back as 200 with { error: 'authorization_pending' | 'slow_down' | 'access_denied' | 'expired_token' }
    return data
  }
  accessToken = data.access_token
  refreshToken = data.refresh_token
  setTokens(data.access_token, data.refresh_token)
  return data
}

async function fetchMdbList(path: string, options: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://mdblist.com',
    'Referer': 'https://mdblist.com/',
    ...(options.headers as Record<string, string> || {}),
  }
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }
  const res = await fetch(`${MDBLIST_BASE}${path}`, { ...options, headers })

  if (res.status === 401 && refreshToken) {
    // If another concurrent request is already refreshing, wait for it
    if (refreshLock) {
      await refreshLock
      headers['Authorization'] = `Bearer ${accessToken}`
      const retryRes = await fetch(`${MDBLIST_BASE}${path}`, { ...options, headers })
      if (retryRes.ok) return retryRes.json()
      const body = await retryRes.text().catch(() => '(could not read body)')
      throw new Error(`MDBList error: ${retryRes.status} - ${body.slice(0, 500)}`)
    }

    console.log(`[MDBList] 401 on ${path}, attempting token refresh... refreshToken=${!!refreshToken} clientId=${!!clientId}`)
    let resolveLock: () => void
    refreshLock = new Promise<void>(r => { resolveLock = r })
    try {
      const refreshRes = await postForm('/oauth/token/', buildRefreshBody(refreshToken, clientId))
      if (refreshRes.ok) {
        const data = await refreshRes.json()
        accessToken = data.access_token
        refreshToken = data.refresh_token
        setTokens(data.access_token, data.refresh_token)
        headers['Authorization'] = `Bearer ${accessToken}`
        console.log('[MDBList] Token refreshed successfully, retrying request')
        const retryRes = await fetch(`${MDBLIST_BASE}${path}`, { ...options, headers })
        if (retryRes.ok) return retryRes.json()
        const body = await retryRes.text().catch(() => '(could not read body)')
        throw new Error(`MDBList error: ${retryRes.status} - ${body.slice(0, 500)}`)
      } else {
        const errBody = await refreshRes.text().catch(() => 'unknown')
        console.warn(`[MDBList] Token refresh failed (${refreshRes.status}): ${errBody.slice(0, 300)}, clearing auth`)
        setTokens(null, null)
      }
    } finally {
      refreshLock = null
      resolveLock!()
    }
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '(could not read body)')
    throw new Error(`MDBList error: ${res.status} - ${body.slice(0, 500)}`)
  }
  return res.json()
}

// ── Payload converters (Trakt-shaped consumer payloads → MDBList API) ──

export function convertScrobblePayload(media: any): any {
  if (media && media.show && media.episode) {
    const { episode, show, ...rest } = media
    return {
      ...rest,
      show,
      season: { number: episode.season, episode: { number: episode.number } },
    }
  }
  return media
}

export function convertHistoryPayload(media: any): any {
  if (!media) return media
  const out: any = { ...media }
  if (Array.isArray(out.shows)) {
    out.shows = out.shows.map((s: any) => {
      if (!s || !Array.isArray(s.seasons)) return s
      return {
        ...s,
        seasons: s.seasons.map((season: any) => {
          const { season: seasonNum, ...rest } = season
          return seasonNum !== undefined ? { ...rest, number: seasonNum } : season
        }),
      }
    })
  }
  return out
}

export function unwrapWatched(data: any): any[] {
  if (!data) return []
  return [...(data.movies || []), ...(data.shows || [])]
}

// ── Data functions (mirror trakt.service.ts surface) ──

export async function getWatchedMovies() {
  return withCache('mdblist:v2:watched-movies', TTL.TRAKT_PROGRESS, async () => {
    const data = await fetchMdbList('/sync/watched?mediatype=movie&limit=1000')
    return unwrapWatched(data)
  })
}

export async function getWatchedShows() {
  return withCache('mdblist:v2:watched-shows', TTL.TRAKT_PROGRESS, async () => {
    // Fetch unfiltered so we also get the top-level `seasons`/`episodes`
    // arrays, which carry the episode-level watched detail that the show
    // items themselves lack. Real shape:
    //   { movies: [...], shows: [...],
    //     seasons: [{last_watched_at, season: {number, ids, show: {ids: {tmdb}}}}],
    //     episodes: [{last_watched_at, episode: {season, number, show: {ids: {tmdb}}}}] }
    const data = await fetchMdbList('/sync/watched?limit=1000')
    const shows = data?.shows || []

    // Build showTmdb -> season -> Set(episode numbers) from the flat arrays
    const epMap = new Map<number, Map<number, Set<number>>>()
    for (const e of data?.episodes || []) {
      const showId = e?.episode?.show?.ids?.tmdb
      const season = e?.episode?.season
      const num = e?.episode?.number
      if (showId == null || season == null || num == null) continue
      if (!epMap.has(showId)) epMap.set(showId, new Map())
      const seasons = epMap.get(showId)!
      if (!seasons.has(season)) seasons.set(season, new Set())
      seasons.get(season)!.add(num)
    }

    const enriched = shows.map((s: any) => {
      const tmdbId = s?.show?.ids?.tmdb
      const seasons = tmdbId != null ? epMap.get(tmdbId) : undefined
      if (!seasons || seasons.size === 0) return s
      return {
        ...s,
        seasons: [...seasons.entries()].map(([number, eps]) => ({
          number,
          episodes: [...eps].map(n => ({ number: n })),
        })),
      }
    })

    // MDBList returns imdb/tvdb/trakt/mdblist ids for shows (tmdb only present
    // in some payloads). The renderer keys watched state off tmdb, so resolve
    // via TMDB find for any show still missing a tmdb id.
    const resolved = await Promise.all(enriched.map(async (s: any) => {
      if (!s?.show?.ids?.tmdb && s?.show?.ids?.imdb) {
        try {
          const found = await findByImdb(s.show.ids.imdb)
          if (found) {
            return {
              ...s,
              show: { ...s.show, ids: { ...s.show.ids, tmdb: found.tmdbId } },
            }
          }
        } catch { /* keep as-is */ }
      }
      return s
    }))
    return resolved
  })
}

export async function scrobble(action: 'start' | 'pause' | 'stop', media: object) {
  console.log(`[MDBList] scrobble ${action} — authenticated=${!!accessToken} clientId=${clientId ? 'set' : 'MISSING!'}`)
  return fetchMdbList(`/scrobble/${action}`, {
    method: 'POST',
    body: JSON.stringify(convertScrobblePayload(media)),
  })
}

export async function markWatched(media: object) {
  return fetchMdbList('/sync/watched', {
    method: 'POST',
    body: JSON.stringify(convertHistoryPayload(media)),
  })
}

export async function markUnwatched(media: object) {
  return fetchMdbList('/sync/watched/remove', {
    method: 'POST',
    body: JSON.stringify(convertHistoryPayload(media)),
  })
}

export async function getSettings() {
  return fetchMdbList('/user')
}

export async function getPlayback() {
  return withCache('mdblist:v2:playback', TTL.TRAKT_PROGRESS, () =>
    fetchMdbList('/sync/playback'))
}

export async function getPlaybackMovies() {
  const all = await getPlayback()
  return (Array.isArray(all) ? all : []).filter((p: any) => p.media_type === 'movie' || p.mediatype === 'movie')
}

export async function getPlaybackEpisodes() {
  const all = await getPlayback()
  return (Array.isArray(all) ? all : []).filter((p: any) => p.media_type === 'episode' || p.mediatype === 'episode')
}

// ── Watched progress via /upnext (single call, mirrors Trakt's per-show progress) ──

export function mapUpnext(data: any): any[] {
  if (!data || !Array.isArray(data.items)) return []
  const results: any[] = []
  for (const item of data.items) {
    if (!item || !item.show) continue
    const show = item.show
    const ne = item.next_episode
    if (!ne) continue
    // Real /upnext item shape:
    //   show: {ids: {tmdb,...}, title, year, poster}
    //   next_episode: {ids: {tmdb}, season, episode, title, air_date, runtime, still}
    //   progress: {watched_episode_count, total_episode_count}
    //   last_watched_at, is_newly_aired
    const watched = item.progress?.watched_episode_count ?? 0
    const total = item.progress?.total_episode_count ?? 0
    results.push({
      show: {
        title: show.title,
        year: show.year,
        ids: show.ids || {},
      },
      next_episode: {
        season: ne.season,
        number: ne.episode,
        title: ne.title,
        first_aired: ne.air_date,
      },
      completion: total > 0 ? watched / total : 0,
      aired: total,
      completed: watched,
      last_watched_at: item.last_watched_at || null,
    })
  }
  results.sort((a, b) => {
    const aWatched = new Date(a.last_watched_at || 0).getTime()
    const bWatched = new Date(b.last_watched_at || 0).getTime()
    return bWatched - aWatched
  })
  return results
}

export async function getWatchedShowsWithProgress() {
  const data = await withCache('mdblist:v2:watched-progress', TTL.TRAKT_PROGRESS, () =>
    fetchMdbList('/upnext?hide_unreleased=true'))
  return mapUpnext(data)
}
