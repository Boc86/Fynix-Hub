import * as TmdbService from './tmdb.service'

export interface UsenetQuery {
  query?: string
  title?: string
  year?: number
  type?: 'movie' | 'tv'
  season?: number
  episode?: number
  imdbId?: string
  tmdbId?: number
}

export interface UsenetResult {
  title: string
  size: number
  indexer: string
  quality: string
  nzbUrl: string
  infoHash: string
  group: string
  poster: number
  date: string
  streamUrl?: string
}

export interface UsenetIndexerConfig {
  id: string
  name: string
  url: string
  apiKey: string
  enabled: boolean
  builtIn: boolean
}

const BUILT_IN_INDEXERS: UsenetIndexerConfig[] = []

function qualityFromTitle(title: string): string {
  const lower = title.toLowerCase()
  if (lower.includes('2160p') || lower.includes('4k')) return '4K'
  if (lower.includes('1080p')) return '1080p'
  if (lower.includes('720p')) return '720p'
  if (lower.includes('480p')) return '480p'
  return 'Unknown'
}

function rankAndFilter(results: UsenetResult[], limit: number = 200): UsenetResult[] {
  return [...results]
    .sort((a, b) => {
      const qScore = (q: string) => ({ '4K': 3, '1080p': 2, '720p': 1 })[q] || 0
      const aScore = qScore(a.quality)
      const bScore = qScore(b.quality)
      if (aScore !== bScore) return bScore - aScore
      if (a.size && b.size) {
        const sizeDiff = Math.abs(a.size - b.size)
        if (sizeDiff > 1073741824) return a.size - b.size
      }
      return b.poster - a.poster
    })
    .slice(0, limit)
}

export function getFreeIndexers(): UsenetIndexerConfig[] {
  return BUILT_IN_INDEXERS
}

export function getDefaultEnabledIndexerIds(): string[] {
  return BUILT_IN_INDEXERS.map(i => i.id)
}

export async function searchUsenet(
  query: UsenetQuery,
  enabledIndexerIds: string[],
  customIndexers: UsenetIndexerConfig[],
  onResult?: (result: UsenetResult) => void
): Promise<UsenetResult[]> {
  const searchTerm = query.query || query.title || ''
  if (!searchTerm) return []

  // Resolve an IMDb id so we can use the precise movie/tvsearch APIs instead of
  // a loose title query (which returns lots of unrelated results).
  if (!query.imdbId && query.tmdbId) {
    try {
      const ext = await TmdbService.getExternalIds(query.type === 'tv' ? 'tv' : 'movie', query.tmdbId)
      if (ext.imdbId) query = { ...query, imdbId: ext.imdbId }
    } catch {
      // ignore — fall back to title-based search
    }
  }

  const allCustom = customIndexers.filter(i => i.enabled && enabledIndexerIds.includes(i.id))

  const promises = allCustom.map(idx => searchNewznabIndexer(idx, query))

  const resultsArrays = await Promise.all(promises)
  const allResults = resultsArrays.flat()

  for (const r of allResults) {
    onResult?.(r)
  }

  return rankAndFilter(allResults)
}

async function searchNewznabIndexer(
  indexer: UsenetIndexerConfig,
  query: UsenetQuery
): Promise<UsenetResult[]> {
  if (!indexer.enabled || !indexer.url || !indexer.apiKey) return []

  const searchTerm = query.query || query.title || ''
  const base = indexer.url.replace(/\/+$/, '')
  const apiBase = base.endsWith('/api') ? base : `${base}/api`

  let searchUrl: string
  if (query.type === 'tv') {
    const params = new URLSearchParams({ t: 'tvsearch', apikey: indexer.apiKey, o: 'json', extended: '1', limit: '100' })
    // Prefer an IMDb id for precise matching; fall back to title only if absent.
    if (query.imdbId) params.set('imdbid', query.imdbId.replace(/^tt/, ''))
    else if (searchTerm) params.set('q', searchTerm)
    if (query.season !== undefined) params.set('season', String(query.season))
    if (query.episode !== undefined) params.set('ep', String(query.episode))
    searchUrl = `${apiBase}?${params.toString()}`
  } else if (query.imdbId) {
    searchUrl = `${apiBase}?t=movie&imdbid=${query.imdbId.replace(/^tt/, '')}&extended=1&apikey=${indexer.apiKey}&o=json`
  } else if (query.type === 'movie') {
    // No IMDb id (e.g. Search All): keep the general movie search rather than
    // the broad t=search so results stay movie-scoped.
    searchUrl = `${apiBase}?t=movie&q=${encodeURIComponent(searchTerm)}&extended=1&limit=100&apikey=${indexer.apiKey}&o=json`
  } else {
    // General search — only used by the Search All modal (no type/imdbid).
    searchUrl = `${apiBase}?t=search&q=${encodeURIComponent(searchTerm)}&limit=100&apikey=${indexer.apiKey}&o=json`
  }
  console.log(`[Usenet] search ${indexer.name}: ${searchUrl.replace(indexer.apiKey, '***')}`)

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const response = await fetch(searchUrl, {
      headers: { 'User-Agent': 'FynixHub/1.0' },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!response.ok) return []

    const data = await response.json()
    if (!data?.channel?.item) return []

    const items = Array.isArray(data.channel.item) ? data.channel.item : [data.channel.item]

    return items.map((item: any) => {
      const title = item.title || ''
      const enclosure = (Array.isArray(item.enclosure) ? item.enclosure[0] : item.enclosure) || {}
      const enclosureUrl = enclosure.url || enclosure['@attributes']?.url || ''
      const attrMap: Record<string, string> = {}
      const attrsRaw = item['newznab:attr'] || item.attr
      if (attrsRaw) {
        const attrs = Array.isArray(attrsRaw) ? attrsRaw : [attrsRaw]
        for (const attr of attrs) {
          if (attr?.name) attrMap[attr.name] = attr.value
        }
      }

      const nzbUrl = enclosureUrl || item.link || item.guid || ''

      return {
        title,
        size: parseInt(enclosure['@attributes']?.length || enclosure.length || attrMap['size'] || '0', 10),
        indexer: indexer.name,
        quality: qualityFromTitle(title),
        nzbUrl,
        infoHash: attrMap['infoHash'] || '',
        group: attrMap['group'] || '',
        poster: parseInt(attrMap['poster'] || '1', 10),
        date: attrMap['date'] || '',
      }
    })
  } catch (err: any) {
    return []
  }
}
