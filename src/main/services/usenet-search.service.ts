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
  if (!indexer.enabled) {
    console.log('[UsenetSearch] Free indexer %s is disabled, skipping', indexer.id)
    return []
  }

  const searchUrl = `${indexer.url}/search?q=${encodeURIComponent(query)}`
  console.log('[UsenetSearch] Fetching free indexer %s: %s', indexer.id, searchUrl)

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const response = await fetch(searchUrl, {
      headers: { 'User-Agent': 'FynixHub/1.0' },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    console.log('[UsenetSearch] %s responded with status %d', indexer.id, response.status)
    if (!response.ok) {
      console.log('[UsenetSearch] %s returned non-OK status, skipping', indexer.id)
      return []
    }

    const html = await response.text()
    console.log('[UsenetSearch] %s returned %d bytes of HTML', indexer.id, html.length)

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

    console.log('[UsenetSearch] %s parsed %d results', indexer.id, results.length)
    return results
  } catch (err: any) {
    console.log('[UsenetSearch] %s fetch failed: %s', indexer.id, err?.message || err)
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
  if (!searchTerm) {
    console.log('[UsenetSearch] No search term provided (query=%s title=%s)', query.query, query.title)
    return []
  }

  console.log('[UsenetSearch] Searching for "%s" (type=%s year=%s)', searchTerm, query.type, query.year)

  const enabledFree = FREE_INDEXERS.filter(i => enabledIndexerIds.includes(i.id))
  const allCustom = customIndexers.filter(i => i.enabled && enabledIndexerIds.includes(i.id))

  if (enabledFree.length > 0) {
    console.log('[UsenetSearch] Enabled free indexers: %d (%s)', enabledFree.length, enabledFree.map(i => i.id).join(', '))
    console.log('[UsenetSearch] Built-in free indexers (BinSearch, NZBIndex, etc.) are Next.js apps that require JavaScript rendering. Skipping HTML scraping.')
  }
  console.log('[UsenetSearch] Enabled custom Newznab indexers: %d (%s)', allCustom.length, allCustom.length ? allCustom.map(i => i.id).join(', ') : 'NONE')
  if (allCustom.length === 0) {
    console.log('[UsenetSearch] No custom Newznab indexers configured — 0 results expected.')
    console.log('[UsenetSearch] To get Usenet search results, add a Newznab-compatible indexer (e.g. NZBHydra, NZBGeek) in Settings → Usenet → Custom Indexers.')
  }

  const promises = allCustom.map(idx => searchNewznabIndexer(idx, searchTerm))

  const resultsArrays = await Promise.all(promises)
  const allResults = resultsArrays.flat()

  console.log('[UsenetSearch] Total raw results: %d across %d Newznab indexer(s)', allResults.length, promises.length)

  for (const r of allResults) {
    onResult?.(r)
  }

  const ranked = rankAndFilter(allResults)
  console.log('[UsenetSearch] Returning %d ranked results', ranked.length)
  return ranked
}

async function searchNewznabIndexer(
  indexer: UsenetIndexerConfig,
  query: string
): Promise<UsenetResult[]> {
  if (!indexer.enabled) {
    console.log('[UsenetSearch] Newznab indexer %s is disabled, skipping', indexer.id)
    return []
  }
  if (!indexer.url || !indexer.apiKey) {
    console.log('[UsenetSearch] Newznab indexer %s missing url or apiKey, skipping', indexer.id)
    return []
  }

  const searchUrl = `${indexer.url.endsWith('/') ? indexer.url.slice(0, -1) : indexer.url}/api?t=search&q=${encodeURIComponent(query)}&apikey=${indexer.apiKey.slice(0, 8)}...&o=json`
  console.log('[UsenetSearch] Fetching Newznab indexer %s: %s', indexer.id, searchUrl)

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const response = await fetch(searchUrl, {
      headers: { 'User-Agent': 'FynixHub/1.0' },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    console.log('[UsenetSearch] %s responded with status %d', indexer.id, response.status)
    if (!response.ok) {
      console.log('[UsenetSearch] %s returned non-OK status, skipping', indexer.id)
      return []
    }

    const data = await response.json()
    if (!data?.channel?.item) {
      console.log('[UsenetSearch] %s returned 0 items (no channel.item in response)', indexer.id)
      return []
    }

    const items = Array.isArray(data.channel.item) ? data.channel.item : [data.channel.item]
    console.log('[UsenetSearch] %s returned %d items', indexer.id, items.length)

    return items.map((item: any) => {
      const title = item.title || ''
      const enclosure = item.enclosure || {}
      const attrMap: Record<string, string> = {}
      if (item['newznab:attr']) {
        const attrs = Array.isArray(item['newznab:attr']) ? item['newznab:attr'] : [item['newznab:attr']]
        for (const attr of attrs) {
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
  } catch (err: any) {
    console.log('[UsenetSearch] %s fetch failed: %s', indexer.id, err?.message || err)
    return []
  }
}
