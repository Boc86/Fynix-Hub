interface TorrentQuery {
  imdbId?: string
  tmdbId?: number
  type?: 'movie' | 'episode'
  season?: number
  episode?: number
  query?: string
}

interface TorrentResult {
  title: string
  seeders: number
  leechers: number
  size: number
  magnetUri: string
  infoHash: string
  indexer: string
  quality: string
}

const PUBLIC_INDEXERS = [
  { name: '1337x', url: 'https://1337x.to' },
  { name: 'TorrentGalaxy', url: 'https://torrentgalaxy.to' },
  { name: 'YTS', url: 'https://yts.mx' },
  { name: 'EZTV', url: 'https://eztvx.to' },
]

export async function searchTorrents(query: TorrentQuery): Promise<TorrentResult[]> {
  const results: TorrentResult[] = []

  const searchQuery = query.query || `${query.imdbId || query.tmdbId}`
  if (!searchQuery) return results

  // Will be implemented with actual scraper logic in Phase 4
  // For now, returns empty results
  return results
}

export async function searchTorznab(indexerUrl: string, apiKey: string, params: Record<string, string>) {
  const searchParams = new URLSearchParams({
    t: 'search',
    apikey: apiKey,
    ...params,
  })
  const res = await fetch(`${indexerUrl}/api?${searchParams}`)
  if (!res.ok) throw new Error(`Torznab error: ${res.status}`)
  const text = await res.text()
  return text
}
