const TRAKT_BASE = 'https://api.trakt.tv'
const TRAKT_AUTH_BASE = 'https://api.trakt.tv/oauth'

let clientId = ''
let clientSecret = ''
let accessToken: string | null = null
let refreshToken: string | null = null

export function setCredentials(id: string, secret: string) {
  clientId = id
  clientSecret = secret
}

export function setTokens(access: string | null, refresh: string | null) {
  accessToken = access
  refreshToken = refresh
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
    'trakt-api-version': '2',
    'trakt-api-key': clientId,
    ...(options.headers as Record<string, string> || {}),
  }
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }
  const res = await fetch(`${TRAKT_BASE}${path}`, { ...options, headers })
  if (!res.ok) throw new Error(`Trakt error: ${res.status}`)
  return res.json()
}

export async function getDeviceCode() {
  const res = await fetch(`${TRAKT_AUTH_BASE}/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId }),
  })
  return res.json()
}

export async function pollForToken(deviceCode: string) {
  const res = await fetch(`${TRAKT_AUTH_BASE}/device/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: deviceCode,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  if (res.status === 400) return { error: 'pending' }
  if (!res.ok) throw new Error(`Trakt auth error: ${res.status}`)
  const data = await res.json()
  accessToken = data.access_token
  refreshToken = data.refresh_token
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
