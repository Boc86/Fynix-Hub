import * as CacheService from './cache.service'

export interface TorrentQuery {
  imdbId?: string
  tmdbId?: number
  type?: 'movie' | 'episode'
  season?: number
  episode?: number
  query?: string
  title?: string
  year?: number
}

export interface TorrentResult {
  title: string
  seeders: number
  leechers: number
  size: number
  magnetUri: string
  infoHash: string
  indexer: string
  quality: string
}

export interface CustomIndexer {
  id: string
  name: string
  url: string
  apiKey: string
  enabled: boolean
}

interface BuiltInIndexer {
  id: string
  name: string
  type: 'movie' | 'tv' | 'general'
  search: (q: TorrentQuery) => Promise<TorrentResult[]>
}

const TRACKERS_URL = 'https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt'
const TRACKERS_REFRESH_MS = 24 * 60 * 60 * 1000 // 24 hours

const DEFAULT_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://tracker.moeking.me:6969/announce',
  'udp://explodie.org:6969/announce',
  'udp://p4p.arenabg.com:1337/announce',
  'udp://tracker.birkenwald.de:6969/announce',
  'udp://9.rarbg.to:2710/announce',
  'https://tracker.tamersunion.org:443/announce',
  'wss://tracker.openwebtorrent.com:443/announce',
  'wss://tracker.btorrent.xyz:443/announce',
  'wss://tracker.files.fm:7073/announce',
]

export function getTrackers(): string[] {
  const stored = CacheService.getSetting<string[]>('trackerList')
  if (stored && stored.length > 0) return stored
  return DEFAULT_TRACKERS
}

export async function refreshTrackers(): Promise<string[]> {
  try {
    const res = await fetch(TRACKERS_URL)
    if (!res.ok) throw new Error(`Tracker list fetch failed: ${res.status}`)
    const text = await res.text()
    const trackers = text.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'))
    if (trackers.length === 0) throw new Error('Tracker list empty')
    CacheService.setSetting('trackerList', trackers)
    CacheService.setSetting('trackerListLastUpdated', Date.now())
    console.log(`[TorrentSearch] Refreshed tracker list: ${trackers.length} trackers`)
    return trackers
  } catch (err: any) {
    console.error('[TorrentSearch] Failed to refresh tracker list:', err.message)
    throw err
  }
}

export function shouldRefreshTrackers(): boolean {
  const lastUpdated = CacheService.getSetting<number>('trackerListLastUpdated')
  if (!lastUpdated) return true
  return Date.now() - lastUpdated > TRACKERS_REFRESH_MS
}

function buildMagnetUri(infoHash: string, name: string): string {
  const trackers = getTrackers().map(t => `tr=${encodeURIComponent(t)}`).join('&')
  return `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}&${trackers}`
}

function parseSize(sizeStr: string): number {
  const units: Record<string, number> = {
    B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4,
    KIB: 1024, MIB: 1024 ** 2, GIB: 1024 ** 3, TIB: 1024 ** 4,
  }
  const match = sizeStr.trim().match(/^(\d[\d.]*)\s*(B|KB|MB|GB|TB|KIB|MIB|GIB|TIB)$/i)
  if (!match) return 0
  return parseFloat(match[1]) * (units[match[2].toUpperCase()] || 1)
}

export function qualityFromTitle(title: string): string {
  const lower = title.toLowerCase()
  if (lower.includes('2160p') || lower.includes('4k')) return '4K'
  if (lower.includes('1080p')) return '1080p'
  if (lower.includes('720p')) return '720p'
  if (lower.includes('480p')) return '480p'
  return 'Unknown'
}

function matchesQuality(title: string, resolutions: string[]): boolean {
  if (!resolutions || resolutions.length === 0) return true
  const q = qualityFromTitle(title)
  return resolutions.includes(q)
}

function matchesLanguage(title: string, languages: string[]): boolean {
  if (!languages || languages.length === 0) return true
  const lower = title.toLowerCase()
  return languages.some(lang => {
    const tags: Record<string, string[]> = {
      english: ['english', 'eng', 'en'],
      spanish: ['spanish', 'esp', 'es', 'castellano', 'latino'],
      french: ['french', 'fr', 'fra', 'vf', 'vostfr'],
      german: ['german', 'de', 'ger', 'deutsch'],
      italian: ['italian', 'it', 'ita'],
      portuguese: ['portuguese', 'pt', 'por', 'brazilian'],
      japanese: ['japanese', 'jp', 'jap', 'jpn'],
      korean: ['korean', 'kr', 'kor'],
      chinese: ['chinese', 'cn', 'chi', 'mandarin', 'cantonese'],
      russian: ['russian', 'ru', 'rus'],
      hindi: ['hindi', 'hi'],
      arabic: ['arabic', 'ar', 'ara'],
    }
    const key = lang.toLowerCase()
    const patterns = tags[key] || [key]
    return patterns.some(p => lower.includes(p))
  })
}

export function filterResults(results: TorrentResult[], resolutions?: string[], languages?: string[]): TorrentResult[] {
  let filtered = results
  if (resolutions && resolutions.length > 0) {
    filtered = filtered.filter(r => matchesQuality(r.title, resolutions))
  }
  if (languages && languages.length > 0) {
    filtered = filtered.filter(r => matchesLanguage(r.title, languages))
  }
  return filtered
}

async function searchYts(query: TorrentQuery): Promise<TorrentResult[]> {
  try {
    const searchTerm = query.query || `${query.title || ''} ${query.year || ''}`.trim()
    if (!searchTerm) return []
    const res = await fetch(`https://yts.gg/api/v2/list_movies.json?query_term=${encodeURIComponent(searchTerm)}&limit=20&sort=seeds&order=desc`)
    if (!res.ok) return []
    const data = await res.json()
    if (!data?.data?.movies) return []

    const results: TorrentResult[] = []
    for (const movie of data.data.movies) {
      for (const t of (movie.torrents || [])) {
        results.push({
          title: `${movie.title} (${movie.year}) - ${t.quality}${t.type === '3D' ? ' 3D' : ''}`,
          seeders: t.seeds || 0,
          leechers: t.peers || 0,
          size: parseSize(t.size || '0 MB'),
          magnetUri: buildMagnetUri(t.hash, movie.title),
          infoHash: t.hash,
          indexer: 'YTS',
          quality: t.quality || 'Unknown',
        })
      }
    }
    return results
  } catch {
    return []
  }
}

async function searchEztv(query: TorrentQuery): Promise<TorrentResult[]> {
  try {
    if (!query.imdbId) return []
    const res = await fetch(`https://eztvx.to/api/get-torrents?imdb_id=${query.imdbId}&limit=30`)
    if (!res.ok) return []
    const data = await res.json()
    if (!data?.torrents) return []

    const results: TorrentResult[] = []
    for (const t of data.torrents) {
      if (query.season !== undefined && t.season !== query.season) continue
      if (query.episode !== undefined && t.episode !== query.episode) continue

      results.push({
        title: t.title || t.filename,
        seeders: t.seeds || 0,
        leechers: t.peers || 0,
        size: parseSize(t.size || '0 B'),
        magnetUri: t.magnet_url || '',
        infoHash: t.hash || '',
        indexer: 'EZTV',
        quality: qualityFromTitle(t.title || ''),
      })
    }
    return results
  } catch {
    return []
  }
}

async function searchThePirateBay(query: TorrentQuery): Promise<TorrentResult[]> {
  try {
    let searchTerm = query.query
    if (!searchTerm) {
      if (query.type === 'episode') {
        searchTerm = `${query.title || ''} S${String(query.season || '').padStart(2, '0')}E${String(query.episode || '').padStart(2, '0')}`.trim()
      } else {
        searchTerm = `${query.title || ''} ${query.year || ''}`.trim()
      }
    }
    if (!searchTerm) return []

    const res = await fetch(`https://apibay.org/q.php?q=${encodeURIComponent(searchTerm)}`)
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []

    const results: TorrentResult[] = []
    for (const t of data) {
      if (t.id === '0' || t.id === 0) continue
      if (t.name === 'No results returned') continue

      results.push({
        title: t.name,
        seeders: parseInt(t.seeders) || 0,
        leechers: parseInt(t.leechers) || 0,
        size: parseInt(t.size) || 0,
        magnetUri: buildMagnetUri(t.info_hash, t.name),
        infoHash: t.info_hash,
        indexer: 'TPB',
        quality: qualityFromTitle(t.name),
      })
    }
    return results
  } catch {
    return []
  }
}

async function searchNyaa(query: TorrentQuery): Promise<TorrentResult[]> {
  try {
    let searchTerm = query.query
    if (!searchTerm) {
      if (query.type === 'episode') {
        searchTerm = `${query.title || ''} S${String(query.season || '').padStart(2, '0')}E${String(query.episode || '').padStart(2, '0')}`.trim()
      } else {
        searchTerm = `${query.title || ''} ${query.year || ''}`.trim()
      }
    }
    if (!searchTerm) return []

    const res = await fetch(`https://nyaa.si/?f=0&c=0_0&q=${encodeURIComponent(searchTerm)}&s=seeders&o=desc`)
    if (!res.ok) return []
    const html = await res.text()

    const results: TorrentResult[] = []
    const rowRegex = /<tr[^>]*class="[^"]*(?:success|danger|default)[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi
    let rowMatch: RegExpExecArray | null
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const row = rowMatch[1]
      const titleMatch = /<a[^>]*href="\/view\/[^"]*"[^>]*title="([^"]*)"[^>]*>/i.exec(row)
      const title = titleMatch ? titleMatch[1].trim() : ''
      const magnetMatch = /<a[^>]*href="(magnet:\?[^"]*)"[^>]*>/i.exec(row)
      const magnetUri = magnetMatch ? magnetMatch[1] : ''
      const infoHashMatch = magnetUri.match(/urn:btih:([a-fA-F0-9]{40})/i)
      const infoHash = infoHashMatch?.[1] || ''

      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      const sizeText = cells[3] ? cells[3][1].replace(/<[^>]+>/g, '').trim() : ''
      const seedersText = cells[5] ? cells[5][1].replace(/<[^>]+>/g, '').trim() : '0'
      const leechersText = cells[6] ? cells[6][1].replace(/<[^>]+>/g, '').trim() : '0'

      if (!title || !infoHash) continue

      results.push({
        title,
        seeders: parseInt(seedersText) || 0,
        leechers: parseInt(leechersText) || 0,
        size: parseSize(sizeText),
        magnetUri,
        infoHash,
        indexer: 'Nyaa',
        quality: qualityFromTitle(title),
      })
    }
    return results
  } catch {
    return []
  }
}

async function search1337x(query: TorrentQuery): Promise<TorrentResult[]> {
  try {
    let searchTerm = query.query
    if (!searchTerm) {
      if (query.type === 'episode') {
        searchTerm = `${query.title || ''} S${String(query.season || '').padStart(2, '0')}E${String(query.episode || '').padStart(2, '0')}`.trim()
      } else {
        searchTerm = `${query.title || ''} ${query.year || ''}`.trim()
      }
    }
    if (!searchTerm) return []

    const res = await fetch(`https://1337x.to/search/${encodeURIComponent(searchTerm)}/1/`)
    if (!res.ok) return []
    const html = await res.text()

    const rows: Array<{ title: string; detailUrl: string; seeders: number; leechers: number; size: number }> = []
    const rowRegex = /<tr>[\s\S]*?<\/tr>/gi
    let rowMatch: RegExpExecArray | null
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const row = rowMatch[0]
      if (row.includes('<th')) continue
      const linkMatch = /<a[^>]*href="(\/torrent\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(row)
      if (!linkMatch) continue
      const detailUrl = 'https://1337x.to' + linkMatch[1]
      const title = linkMatch[2].replace(/<[^>]+>/g, '').trim()

      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      if (cells.length < 5) continue
      const seeders = parseInt(cells[1][1].replace(/<[^>]+>/g, '').trim()) || 0
      const leechers = parseInt(cells[2][1].replace(/<[^>]+>/g, '').trim()) || 0
      const sizeText = cells[4][1].replace(/<[^>]+>/g, '').trim()

      rows.push({ title, detailUrl, seeders, leechers, size: parseSize(sizeText) })
    }

    const results: TorrentResult[] = []
    for (const row of rows.slice(0, 10)) {
      try {
        const detailRes = await fetch(row.detailUrl)
        if (!detailRes.ok) continue
        const detailHtml = await detailRes.text()
        const magnetMatch = /<a[^>]*href="(magnet:\?[^"]*)"[^>]*>/i.exec(detailHtml)
        const magnetUri = magnetMatch ? magnetMatch[1] : ''
        const infoHashMatch = magnetUri.match(/urn:btih:([a-fA-F0-9]{40})/i)
        const infoHash = infoHashMatch?.[1] || ''
        if (!infoHash) continue
        results.push({
          title: row.title,
          seeders: row.seeders,
          leechers: row.leechers,
          size: row.size,
          magnetUri,
          infoHash,
          indexer: '1337x',
          quality: qualityFromTitle(row.title),
        })
      } catch {
        continue
      }
    }
    return results
  } catch {
    return []
  }
}

async function searchTorznab(indexer: CustomIndexer, searchTerm: string): Promise<TorrentResult[]> {
  try {
    const searchParams = new URLSearchParams({
      t: 'search',
      apikey: indexer.apiKey,
      cat: '2000,2010,2020,2030,2040,2050,2060',
      q: searchTerm,
    })
    const res = await fetch(`${indexer.url.replace(/\/$/, '')}/api?${searchParams}`)
    if (!res.ok) return []
    const text = await res.text()

    const results: TorrentResult[] = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi
    let match: RegExpExecArray | null
    while ((match = itemRegex.exec(text)) !== null) {
      const item = match[1]
      const title = extractXml(item, 'title')
      const link = extractXml(item, 'link')
      const infoHashMatch = link?.match(/urn:btih:([a-fA-F0-9]{40})/i)
      const infoHash = infoHashMatch?.[1] || ''
      const sizeStr = extractAttr(item, 'size')
      const seeders = parseInt(extractAttr(item, 'seeders')) || 0
      const leechers = parseInt(extractAttr(item, 'peers')) || 0
      if (!title || !infoHash) continue

      results.push({
        title,
        seeders,
        leechers,
        size: parseInt(sizeStr) || 0,
        magnetUri: link || buildMagnetUri(infoHash, title),
        infoHash,
        indexer: indexer.name,
        quality: qualityFromTitle(title),
      })
    }
    return results
  } catch {
    return []
  }
}

function extractXml(xml: string, tag: string): string {
  const m = new RegExp(`<${tag}[^>]*>([\s\S]*?)<\/${tag}>`, 'i').exec(xml)
  return m ? m[1].trim() : ''
}

function extractAttr(xml: string, name: string): string {
  const m = new RegExp(`<attr\\s+name="${name}"\\s+value="([^"]*)"`, 'i').exec(xml)
  return m ? m[1] : ''
}

const BUILT_IN_INDEXERS: BuiltInIndexer[] = [
  { id: 'yts', name: 'YTS', type: 'movie', search: searchYts },
  { id: 'eztv', name: 'EZTV', type: 'tv', search: searchEztv },
  { id: 'thepiratebay', name: 'TPB', type: 'general', search: searchThePirateBay },
  { id: 'nyaa', name: 'Nyaa', type: 'general', search: searchNyaa },
  { id: '1337x', name: '1337x', type: 'general', search: search1337x },
]

export function getBuiltInIndexerDefinitions(): BuiltInIndexer[] {
  return [...BUILT_IN_INDEXERS]
}

export function getDefaultEnabledIndexers(): string[] {
  return BUILT_IN_INDEXERS.map(i => i.id)
}


function isIndexerApplicable(indexer: BuiltInIndexer, query: TorrentQuery): boolean {
  if (indexer.type === 'general') return true
  if (query.type === 'movie') return indexer.type === 'movie'
  if (query.type === 'episode') return indexer.type === 'tv'
  return true
}

export async function searchTorrents(
  query: TorrentQuery,
  enabledIndexerIds?: string[],
  customIndexers?: CustomIndexer[]
): Promise<TorrentResult[]> {
  const results: TorrentResult[] = []
  const searchTerm = query.query || `${query.title || ''} ${query.year || ''}`.trim()

  const enabled = new Set(enabledIndexerIds && enabledIndexerIds.length > 0 ? enabledIndexerIds : getDefaultEnabledIndexers())
  const customs = (customIndexers || []).filter(c => c.enabled)

  const promises: Promise<TorrentResult[]>[] = []

  for (const indexer of BUILT_IN_INDEXERS) {
    if (!enabled.has(indexer.id)) continue
    if (!isIndexerApplicable(indexer, query)) continue
    promises.push(indexer.search(query))
  }

  for (const indexer of customs) {
    if (!searchTerm) continue
    promises.push(searchTorznab(indexer, searchTerm))
  }

  const settled = await Promise.allSettled(promises)
  for (const s of settled) {
    if (s.status === 'fulfilled') {
      if (s.value.length > 0) {
        console.log(`[TorrentSearch] Got ${s.value.length} results (indexer: ${s.value[0].indexer})`)
      }
      results.push(...s.value)
    }
  }

  console.log(`[TorrentSearch] Total ${results.length} results for "${searchTerm}"`)
  const qualityOrder: Record<string, number> = { '4K': 0, '1080p': 1, '720p': 2, '480p': 3 }
  results.sort((a, b) => {
    const aQ = qualityOrder[a.quality] ?? 99
    const bQ = qualityOrder[b.quality] ?? 99
    if (aQ !== bQ) return aQ - bQ
    return b.seeders - a.seeders
  })
  return results
}
