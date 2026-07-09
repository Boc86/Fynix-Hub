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
  if (!searchTerm) {
    console.log('[UsenetSearch] No search term provided (query=%s title=%s)', query.query, query.title)
    return []
  }

  console.log('[UsenetSearch] Searching for "%s" (type=%s year=%s)', searchTerm, query.type, query.year)

  const allCustom = customIndexers.filter(i => i.enabled && enabledIndexerIds.includes(i.id))
  const builtInPromise: Promise<UsenetResult[]>[] = []

  console.log('[UsenetSearch] Enabled custom Newznab indexers: %d (%s)', allCustom.length, allCustom.length ? allCustom.map(i => i.id).join(', ') : 'NONE')
  if (builtInPromise.length === 0 && allCustom.length === 0) {
    console.log('[UsenetSearch] No Newznab indexers configured — 0 results expected.')
    console.log('[UsenetSearch] To get Usenet search results, add a Newznab-compatible custom indexer in Settings → Usenet.')
  }

  const promises = [...builtInPromise, ...allCustom.map(idx => searchNewznabIndexer(idx, searchTerm))]

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

  const base = indexer.url.replace(/\/+$/, '')
  const apiBase = base.endsWith('/api') ? base : `${base}/api`
  const searchUrl = `${apiBase}?t=search&q=${encodeURIComponent(query)}&limit=100&apikey=${indexer.apiKey}&o=json`
  const logUrl = `${apiBase}?t=search&q=${encodeURIComponent(query)}&limit=100&apikey=${indexer.apiKey.slice(0, 8)}...&o=json`
  console.log('[UsenetSearch] Fetching Newznab indexer %s: %s', indexer.id, logUrl)

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

    if (items.length > 0) {
      const sample = items[0]
      console.log('[UsenetSearch] First item keys: %s', Object.keys(sample).join(', '))
      console.log('[UsenetSearch] First item enclosure: %s, link: %s, guid: %s',
        JSON.stringify(sample.enclosure).slice(0, 200),
        (sample.link || '').slice(0, 80),
        (sample.guid || '').slice(0, 80))
    }

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
        size: parseInt(enclosure.length || item.attr_size || '0', 10),
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
    console.log('[UsenetSearch] %s fetch failed: %s', indexer.id, err?.message || err)
    return []
  }
}
