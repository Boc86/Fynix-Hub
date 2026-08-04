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
  const append = type === 'movie'
    ? 'credits,videos,images,release_dates'
    : 'credits,videos,images,content_ratings'
  const data = await fetchTmdb(`/${type}/${id}`, { append_to_response: append })
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

export async function discoverFiltered(
  type: 'movie' | 'tv',
  opts: { sortBy?: string; genreId?: number; providerId?: number } = {},
  page: number = 1
) {
  const params: Record<string, string> = { page: String(page), sort_by: opts.sortBy || 'popularity.desc' }
  if (opts.genreId) params.with_genres = String(opts.genreId)
  if (opts.providerId) {
    params.with_watch_providers = String(opts.providerId)
    params.watch_region = getWatchRegion()
  }
  // Curated "top rated" rows need a vote floor or obscure 1-vote titles leak in
  if (params.sort_by === 'vote_average.desc') params['vote_count.gte'] = '100'
  const data = await fetchTmdb(`/discover/${type}`, params)
  return mapMediaResults(data, type)
}

export async function discoverByGenre(type: 'movie' | 'tv', genreId: number, page: number = 1) {
  return discoverFiltered(type, { genreId }, page)
}

export async function getWatchProviders(type: 'movie' | 'tv') {
  const data = await fetchTmdb(`/watch/providers/${type}`)
  return mapKeys(data)
}

export async function discoverByProvider(type: 'movie' | 'tv', providerId: number, page: number = 1) {
  return discoverFiltered(type, { providerId }, page)
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

export async function getExternalIds(type: 'movie' | 'tv', id: number): Promise<{ imdbId?: string }> {
  const data = await fetchTmdb(`/${type}/${id}/external_ids`)
  const imdbId = data?.imdb_id
  return imdbId ? { imdbId } : {}
}

/**
 * Resolve an IMDb ID (tt...) to a TMDB ID via TMDB's find endpoint.
 * Returns { tmdbId, mediaType } or null when unresolved.
 * Used to map MDBList watched shows (which expose imdb but not tmdb ids).
 */
export async function findByImdb(imdbId: string): Promise<{ tmdbId: number; mediaType: 'movie' | 'tv' } | null> {
  if (!imdbId || !/^tt\d+$/.test(imdbId)) return null
  const data = await fetchTmdb(`/find/${imdbId}`, { external_source: 'imdb_id' })
  const movie = data?.movie_results?.[0]
  if (movie?.id) return { tmdbId: movie.id, mediaType: 'movie' }
  const tv = data?.tv_results?.[0]
  if (tv?.id) return { tmdbId: tv.id, mediaType: 'tv' }
  return null
}

export async function getMoviesByCategory(genreId: number, page: number = 1) {
  return discoverByGenre('movie', genreId, page)
}

export async function getTvShowsByCategory(genreId: number, page: number = 1) {
  return discoverByGenre('tv', genreId, page)
}

export async function getTvShowsGenres() {
  return getTvGenres()
}

export function getWatchRegion() {
  return CacheService.getSetting<string>('tmdbWatchRegion') || 'US'
}
