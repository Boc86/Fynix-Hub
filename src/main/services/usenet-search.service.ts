import * as CacheService from './cache.service'

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
}

export interface UsenetIndexerConfig {
  id: string
  name: string
  url: string
  apiKey: string
  enabled: boolean
  builtIn: boolean
}

const FREE_INDEXERS: UsenetIndexerConfig[] = [
  { id: 'binsearch', name: 'BinSearch', url: 'https://www.binsearch.info', apiKey: '', enabled: true, builtIn: true },
  { id: 'binzb', name: 'BiNZB', url: 'https://www.binzb.com', apiKey: '', enabled: true, builtIn: true },
  { id: 'clubnzb', name: 'ClubNZB', url: 'https://clubnzb.com', apiKey: '', enabled: true, builtIn: true },
  { id: 'findnzb', name: 'Findnzb', url: 'https://www.findnzb.com', apiKey: '', enabled: true, builtIn: true },
  { id: 'nzbfriends', name: 'NZBFriends', url: 'https://www.nzbfriends.com', apiKey: '', enabled: true, builtIn: true },
  { id: 'nzbindex', name: 'NZBIndex', url: 'https://www.nzbindex.com', apiKey: '', enabled: true, builtIn: true },
  { id: 'nzbindexnl', name: 'NZBIndexNL', url: 'https://www.nzbindex.nl', apiKey: '', enabled: true, builtIn: true },
  { id: 'nzbstars', name: 'NZBStars.com', url: 'https://www.nzbstars.com', apiKey: '', enabled: true, builtIn: true },
]

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
      return b.poster - a.poster
    })
    .slice(0, limit)
}

async function searchFreeIndexer(
  indexer: UsenetIndexerConfig,
  query: string
): Promise<UsenetResult[]> {
  if (!indexer.enabled) return []

  try {
    const searchUrl = `${indexer.url}/search?q=${encodeURIComponent(query)}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const response = await fetch(searchUrl, {
      headers: { 'User-Agent': 'FynixHub/1.0' },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!response.ok) return []

    const html = await response.text()
    const results: UsenetResult[] = []
    const lines = html.split('\n')
    let inResults = false

    for (const line of lines) {
      if (line.includes('class=\"r\"') || line.includes('class=\"result\"') || line.toLowerCase().includes('<item>')) {
        inResults = true
        continue
      }
      if (inResults) {
        const titleMatch = line.match(/<a[^>]*>([^<]+)<\/a>/i)
        if (titleMatch) {
          results.push({
            title: titleMatch[1].trim(),
            size: 0,
            indexer: indexer.name,
            quality: qualityFromTitle(titleMatch[1].trim()),
            nzbUrl: '',
            infoHash: '',
            group: '',
            poster: 1,
            date: '',
          })
        }
      }
    }

    return results
  } catch {
    return []
  }
}

export function getFreeIndexers(): UsenetIndexerConfig[] {
  return FREE_INDEXERS
}

export function getDefaultEnabledIndexerIds(): string[] {
  return FREE_INDEXERS.map(i => i.id)
}

export async function searchUsenet(
  query: UsenetQuery,
  enabledIndexerIds: string[],
  customIndexers: UsenetIndexerConfig[],
  onResult?: (result: UsenetResult) => void
): Promise<UsenetResult[]> {
  const searchTerm = query.query || query.title || ''
  if (!searchTerm) return []

  const allIndexers = FREE_INDEXERS.filter(i => enabledIndexerIds.includes(i.id))
  const allCustom = customIndexers.filter(i => i.enabled && enabledIndexerIds.includes(i.id))

  const promises = allIndexers.map(idx => searchFreeIndexer(idx, searchTerm))

  // Support for NZBHydra / NewzNab compatible indexers
  for (const idx of allCustom) {
    promises.push(searchNewznabIndexer(idx, searchTerm))
  }

  const resultsArrays = await Promise.all(promises)
  const allResults = resultsArrays.flat()

  for (const r of allResults) {
    onResult?.(r)
  }

  return rankAndFilter(allResults)
}

async function searchNewznabIndexer(
  indexer: UsenetIndexerConfig,
  query: string
): Promise<UsenetResult[]> {
  if (!indexer.enabled || !indexer.url || !indexer.apiKey) return []

  try {
    const searchUrl = `${indexer.url.endsWith('/') ? indexer.url.slice(0, -1) : indexer.url}/api?t=search&q=${encodeURIComponent(query)}&apikey=${indexer.apiKey}&o=json`
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

    return (data.channel.item as any[]).map(item => {
      const title = item.title || ''
      const enclosure = item.enclosure || {}
      const attrMap: Record<string, string> = {}
      if (item['newznab:attr']) {
        for (const attr of item['newznab:attr']) {
          if (attr?.name) attrMap[attr.name] = attr.value
        }
      }

      return {
        title,
        size: parseInt(enclosure.length || '0', 10),
        indexer: indexer.name,
        quality: qualityFromTitle(title),
        nzbUrl: enclosure.url || '',
        infoHash: attrMap['infoHash'] || '',
        group: attrMap['group'] || '',
        poster: parseInt(attrMap['poster'] || '1', 10),
        date: attrMap['date'] || '',
      }
    })
  } catch {
    return []
  }
}
