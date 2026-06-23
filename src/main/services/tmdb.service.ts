import * as CacheService from './cache.service'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const IMAGE_BASE = 'https://image.tmdb.org/t/p'

let apiKey = ''

export function setApiKey(key: string) {
  apiKey = key
}

export function getApiKey(): string {
  return apiKey
}

export function loadApiKey() {
  apiKey = CacheService.getSetting<string>('tmdbApiKey') || ''
}

function toCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function mapKeys(obj: any): any {
  if (Array.isArray(obj)) return obj.map(mapKeys)
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, any> = {}
    for (const [k, v] of Object.entries(obj)) {
      result[toCamel(k)] = mapKeys(v)
    }
    return result
  }
  return obj
}

function mapMediaResults(data: any, defaultType?: 'movie' | 'tv'): any {
  if (!data) return data
  const mapped = mapKeys(data)
  if (mapped.results) {
    mapped.results = mapped.results.map((r: any) => ({
      ...r,
      title: r.title || r.name || '',
      releaseDate: r.releaseDate || r.firstAirDate || '',
      mediaType: r.mediaType || defaultType || 'movie',
    }))
  }
  return mapped
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
  const data = await fetchTmdb(`/trending/${type}/${timeWindow}`)
  return mapMediaResults(data, type === 'all' ? undefined : type)
}

export async function getPopular(type: 'movie' | 'tv', page: number = 1) {
  const data = await fetchTmdb(`/${type}/popular`, { page: String(page) })
  return mapMediaResults(data, type)
}

export async function getTopRated(type: 'movie' | 'tv', page: number = 1) {
  const data = await fetchTmdb(`/${type}/top_rated`, { page: String(page) })
  return mapMediaResults(data, type)
}

export async function getDetails(type: 'movie' | 'tv', id: number) {
  const data = await fetchTmdb(`/${type}/${id}`, { append_to_response: 'credits,videos,images' })
  const mapped = mapKeys(data)
  mapped.title = mapped.title || mapped.name || ''
  mapped.releaseDate = mapped.releaseDate || mapped.firstAirDate || ''
  mapped.mediaType = type
  return mapped
}

export async function search(query: string, type: 'movie' | 'tv' = 'movie', page: number = 1) {
  const data = await fetchTmdb(`/search/${type}`, { query, page: String(page) })
  return mapMediaResults(data, type)
}

export async function getMovieGenres() {
  const data = await fetchTmdb('/genre/movie/list')
  return mapKeys(data)
}

export async function getTvGenres() {
  const data = await fetchTmdb('/genre/tv/list')
  return mapKeys(data)
}

export async function discoverByGenre(type: 'movie' | 'tv', genreId: number, page: number = 1) {
  const data = await fetchTmdb(`/discover/${type}`, {
    with_genres: String(genreId),
    page: String(page),
    sort_by: 'popularity.desc',
  })
  return mapMediaResults(data, type)
}

export async function getSimilar(type: 'movie' | 'tv', id: number, page: number = 1) {
  const data = await fetchTmdb(`/${type}/${id}/similar`, { page: String(page) })
  return mapMediaResults(data, type)
}

export async function getRecommendations(type: 'movie' | 'tv', id: number, page: number = 1) {
  const data = await fetchTmdb(`/${type}/${id}/recommendations`, { page: String(page) })
  return mapMediaResults(data, type)
}

export async function getSeason(tvId: number, seasonNumber: number) {
  const data = await fetchTmdb(`/tv/${tvId}/season/${seasonNumber}`)
  return mapKeys(data)
}

export async function getEpisode(tvId: number, seasonNumber: number, episodeNumber: number) {
  const data = await fetchTmdb(`/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}`)
  return mapKeys(data)
}
