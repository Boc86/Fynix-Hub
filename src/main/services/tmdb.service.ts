const TMDB_BASE = 'https://api.themoviedb.org/3'
const IMAGE_BASE = 'https://image.tmdb.org/t/p'

let apiKey = ''

export function setApiKey(key: string) {
  apiKey = key
}

export function getApiKey(): string {
  return apiKey
}

async function fetchTmdb(path: string, params: Record<string, string> = {}) {
  const searchParams = new URLSearchParams({ api_key: apiKey, ...params })
  const res = await fetch(`${TMDB_BASE}${path}?${searchParams}`)
  if (!res.ok) throw new Error(`TMDB error: ${res.status}`)
  return res.json()
}

export function getImageUrl(path: string, size: string = 'original'): string {
  return `${IMAGE_BASE}/${size}${path}`
}

export async function getTrending(type: 'all' | 'movie' | 'tv' = 'all', timeWindow: 'day' | 'week' = 'week') {
  return fetchTmdb(`/trending/${type}/${timeWindow}`)
}

export async function getPopular(type: 'movie' | 'tv', page: number = 1) {
  return fetchTmdb(`/${type}/popular`, { page: String(page) })
}

export async function getTopRated(type: 'movie' | 'tv', page: number = 1) {
  return fetchTmdb(`/${type}/top_rated`, { page: String(page) })
}

export async function getDetails(type: 'movie' | 'tv', id: number) {
  return fetchTmdb(`/${type}/${id}`, { append_to_response: 'credits,videos,images' })
}

export async function search(query: string, type: 'movie' | 'tv' = 'movie', page: number = 1) {
  return fetchTmdb(`/search/${type}`, { query, page: String(page) })
}

export async function getSeason(tvId: number, seasonNumber: number) {
  return fetchTmdb(`/tv/${tvId}/season/${seasonNumber}`)
}

export async function getEpisode(tvId: number, seasonNumber: number, episodeNumber: number) {
  return fetchTmdb(`/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}`)
}
