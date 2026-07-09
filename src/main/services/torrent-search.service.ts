import * as CacheService from './cache.service'
import { withCache, TTL } from './cache-helpers.service'

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

const SIZE_UNITS: Record<string, number> = {
  B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4,
  KIB: 1024, MIB: 1024 ** 2, GIB: 1024 ** 3, TIB: 1024 ** 4,
}

function normalizeUnit(u: string): string {
  return u.toUpperCase().replace('ГБ', 'GB').replace('МБ', 'MB').replace('ТБ', 'TB')
}

function parseSize(sizeStr: string): number {
  const cleaned = sizeStr.trim().replace(/&nbsp;/g, ' ')
  const match = cleaned.match(/^(\d[\d.,]*)\s*(B|KB|MB|GB|TB|KIB|MIB|GIB|TIB|ГБ|МБ|ТБ)$/i)
  if (!match) return 0
  return parseFloat(match[1].replace(',', '.')) * (SIZE_UNITS[normalizeUnit(match[2])] || 1)
}

function extractNum(html: string, patterns: RegExp[]): number {
  for (const p of patterns) {
    const m = p.exec(html)
    if (m) {
      const cleaned = m[1].replace(/<[^>]+>/g, '').trim()
      const n = parseInt(cleaned.replace(/,/g, ''))
      if (!isNaN(n)) return n
    }
  }
  return 0
}

function extractSeeders(html: string): number {
  return extractNum(html, [
    /<t[dh][^>]*class="[^"]*(?:seed|peers|up)[^"]*"[^>]*>([\s\S]*?)<\//i,
    /class="[^"]*seed[^"]*"[^>]*>\s*(\d[\d,]*)/i,
    /<span[^>]*class="[^"]*green[^"]*"[^>]*>(?:<b>)?\s*(\d[\d,]*)/i,
    /<span[^>]*class="[^"]*green[^"]*"[^>]*>[\s\S]*?(\d+)[\s\S]*?<\/span>/i,
    /[Ss]\s*(\d{1,6})\s*[Ll]/,
    /👤\s*(\d+)/,
    /💾\s*(\d+)/,
    /<span[^>]*>(\d+)<\/span>/i,
    /<t[dh][^>]*>(\d+)<\//i,
  ])
}

function extractLeechers(html: string): number {
  return extractNum(html, [
    /<t[dh][^>]*class="[^"]*(?:leech|down)[^"]*"[^>]*>([\s\S]*?)<\//i,
    /class="[^"]*leech[^"]*"[^>]*>\s*(\d[\d,]*)/i,
    /<span[^>]*class="[^"]*red[^"]*"[^>]*>(?:<b>)?\s*(\d[\d,]*)/i,
    /<span[^>]*class="[^"]*red[^"]*"[^>]*>[\s\S]*?(\d+)[\s\S]*?<\/span>/i,
    /✗\s*(\d+)/,
    /<span[^>]*>(\d+)<\/span>/i,
    /<t[dh][^>]*>(\d+)<\//i,
  ])
}

function extractSize(html: string): number {
  const patterns = [
    /([\d.,]+)(?:\s|&nbsp;)*(?:GB|MB|TB|ГБ|МБ|ТБ|gib|mib|tib)/i,
    /<t[dh][^>]*class="[^"]*size[^"]*"[^>]*>([\s\S]*?)<\//i,
    /<t[dh][^>]*>([\s\S]*?[\d.,]+(?:\s|&nbsp;)*(?:GB|MB|TB|ГБ|МБ|ТБ)[\s\S]*?)<\//i,
  ]
  for (const p of patterns) {
    const m = p.exec(html)
    if (m) {
      const raw = m[0].replace(/<[^>]+>/g, '').trim()
      const sizeMatch = raw.match(/([\d.,]+)(?:\s|&nbsp;)*(GB|MB|TB|ГБ|МБ|ТБ)/i)
      if (sizeMatch) return parseSize(sizeMatch[0])
    }
  }
  return 0
}

function extractTitle(html: string): string {
  const patterns = [
    /<a[^>]*class="[^"]*cellMainLink[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
    /<a[^>]*href="\/torrent\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
    /<a[^>]*href="\/view\/[^"]*"[^>]*title="([^"]*)"[^>]*>/i,
    /<a[^>]*title="([^"]*)"[^>]*>/i,
    /<a[^>]*href="magnet:\?[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
    /<b>([\s\S]*?)<\/b>/,
  ]
  for (const p of patterns) {
    const m = p.exec(html)
    if (m) {
      const t = m[1].replace(/<[^>]+>/g, '').trim()
      if (t && t.length > 3) return t
    }
  }
  return ''
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
  let filtered = results;
  if (resolutions && resolutions.length > 0) {
    filtered = filtered.filter(r => matchesQuality(r.title, resolutions));
  }
  if (languages && languages.length > 0) {
    filtered = filtered.filter(r => matchesLanguage(r.title, languages));
  }
  return filtered;
}

async function searchYts(query: TorrentQuery): Promise<TorrentResult[]> {
  try {
    const searchTerm = query.query || `${query.title || ''} ${query.year || ''}`.trim()
    if (!searchTerm) return []
    const res = await fetch(`https://yts.gg/api/v2/list_movies.json?query_term=${encodeURIComponent(searchTerm)}&limit=50&sort=seeds&order=desc`)
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
  console.log(`[TorrentSearch] TPB search called for query:`, JSON.stringify(query))
  try {
    let searchTerm = query.query;
    if (!searchTerm) {
      if (query.type === 'episode') {
        searchTerm = `${query.title || ''} S${String(query.season || '').padStart(2, '0')}E${String(query.episode || '').padStart(2, '0')}`.trim();
      } else {
        searchTerm = `${query.title || ''} ${query.year || ''}`.trim();
      }
    }
    if (!searchTerm) {
      console.log('[TorrentSearch] TPB no searchTerm, returning empty');
      return [];
    }

    const res = await fetch(`https://apibay.org/q.php?q=${encodeURIComponent(searchTerm)}`);
    if (!res.ok) {
      console.log('[TorrentSearch] TPB fetch failed:', res.status);
      return [];
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      console.log('[TorrentSearch] TPB data not array:', typeof data);
      return [];
    }

    console.log('[TorrentSearch] TPB raw data length:', data.length);

    const results: TorrentResult[] = [];
    for (const t of data) {
      if (t.id === '0' || t.id === 0) continue;
      if (t.name === 'No results returned') continue;

      results.push({
        title: t.name,
        seeders: parseInt(t.seeders) || 0,
        leechers: parseInt(t.leechers) || 0,
        size: parseInt(t.size) || 0,
        magnetUri: buildMagnetUri(t.info_hash, t.name),
        infoHash: t.info_hash,
        indexer: 'TPB',
        quality: qualityFromTitle(t.name),
      });
    }
    console.log('[TorrentSearch] TPB final results:', results.length);
    return results;
  } catch (err) {
    console.error('[TorrentSearch] TPB error:', err);
    return [];
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
      const seeders = extractSeeders(row) || parseInt(cells[5]?.[1]?.replace(/<[^>]+>/g, '').trim() || '0') || 0
      const leechers = extractLeechers(row) || parseInt(cells[6]?.[1]?.replace(/<[^>]+>/g, '').trim() || '0') || 0

      if (!title || !infoHash) continue

      results.push({
        title,
        seeders,
        leechers,
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
  console.log(`[TorrentSearch] 1337x search called for query:`, JSON.stringify(query))
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
      let title = linkMatch[2].replace(/<[^>]+>/g, '').trim()
      if (!title) title = extractTitle(row)
      if (!title) continue

      const sizeText = row.match(/<td[^>]*class="[^"]*size[^"]*"[^>]*>([\s\S]*?)<\/td>/i)?.[1]?.replace(/<[^>]+>/g, '').trim()
        || row.match(/<td[^>]*>([\d.]+\s*(?:GB|MB|TB))<\/td>/i)?.[1]?.trim()
        || ''
      const seeders = extractSeeders(row)
      const leechers = extractLeechers(row)

      rows.push({ title, detailUrl, seeders, leechers, size: parseSize(sizeText) })
    }

    const detailPromises = rows.slice(0, 30).map(async (row) => {
      try {
        const detailRes = await fetch(row.detailUrl)
        if (!detailRes.ok) return null
        const detailHtml = await detailRes.text()
        const magnetMatch = /<a[^>]*href="(magnet:\?[^"]*)"[^>]*>/i.exec(detailHtml)
        const magnetUri = magnetMatch ? magnetMatch[1] : ''
        const infoHashMatch = magnetUri.match(/urn:btih:([a-fA-F0-9]{40})/i)
        const infoHash = infoHashMatch?.[1] || ''
        if (!infoHash) return null
        return {
          title: row.title,
          seeders: row.seeders,
          leechers: row.leechers,
          size: row.size,
          magnetUri,
          infoHash,
          indexer: '1337x',
          quality: qualityFromTitle(row.title),
        } as TorrentResult
      } catch {
        return null
      }
    })
    const settled = await Promise.allSettled(detailPromises)
    const results: TorrentResult[] = []
    for (const s of settled) {
      if (s.status === 'fulfilled' && s.value) results.push(s.value)
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

// --- Torrentio (Stremio-based, uses IMDB ID) ---

async function searchTorrentio(query: TorrentQuery): Promise<TorrentResult[]> {
  try {
    if (!query.imdbId) return []
    const imdbId = query.imdbId.replace('tt', '')
    const searchPath = query.type === 'episode'
      ? `stream/series/tt${imdbId}:${String(query.season || 1).padStart(2, '0')}:${String(query.episode || 1).padStart(2, '0')}`
      : `stream/movie/tt${imdbId}`
    const res = await fetch(`https://torrentio.strem.fun/${searchPath}.json`)
    if (!res.ok) return []
    const data = await res.json()
    if (!data?.streams) return []

    const results: TorrentResult[] = []
    for (const s of data.streams) {
      const infoHash = s.infoHash || ''
      if (!infoHash) continue
      const titleParts = (s.title || '').split('\n')
      const title = titleParts[0] || s.name || ''
      const sizeMatch = titleParts[1]?.match(/([\d.]+)\s*(GB|MB|TB)/i)
      const size = sizeMatch ? parseSize(sizeMatch[0]) : 0
      const seedersMatch = titleParts[1]?.match(/👤\s*(\d+)/)
      const seeders = seedersMatch ? parseInt(seedersMatch[1]) : extractNum(titleParts[1] || '', [/(\d+)\s*seed/i])

      results.push({
        title,
        seeders,
        leechers: 0,
        size,
        magnetUri: buildMagnetUri(infoHash, title),
        infoHash,
        indexer: 'Torrentio',
        quality: qualityFromTitle(title),
      })
    }
    return results
  } catch {
    return []
  }
}

// --- MediaFusion (Stremio-based, uses IMDB ID) ---

async function searchMediafusion(query: TorrentQuery): Promise<TorrentResult[]> {
  try {
    if (!query.imdbId) return []
    const imdbId = query.imdbId.replace('tt', '')
    const searchPath = query.type === 'episode'
      ? `stream/series/tt${imdbId}:${String(query.season || 1).padStart(2, '0')}:${String(query.episode || 1).padStart(2, '0')}`
      : `stream/movie/tt${imdbId}`
    const config = 'D-VB6XV7ihJSEIwDttLGJEBwGOm5jk0SauzzN776n-vpQACSP9gqDv6r_EOlRRgXABiH52LcNFY3QdsRHHlqHId-ZwrsLx3RkuaW4fp3LzLP8'
    const res = await fetch(`https://mediafusion.stremio.ru/${config}/${searchPath}.json`)
    if (!res.ok) return []
    const data = await res.json()
    if (!data?.streams) return []

    const results: TorrentResult[] = []
    for (const s of data.streams) {
      const infoHash = s.infoHash || ''
      if (!infoHash) continue
      const desc = (s.description || '').replace('📂 - ', '').replace('📂 ', '')
      const title = (s.name || '').replace(/\[.*?\]\s*/g, '')
      const sizeMatch = desc.match(/([\d.]+)\s*(GB|MB|TB)/i)
      const size = sizeMatch ? parseSize(sizeMatch[0]) : 0
      const seeders = extractNum(desc, [/(\d+)\s*seed/i, /💾\s*(\d+)/])

      results.push({
        title,
        seeders,
        leechers: 0,
        size,
        magnetUri: buildMagnetUri(infoHash, title),
        infoHash,
        indexer: 'MediaFusion',
        quality: qualityFromTitle(title),
      })
    }
    return results
  } catch {
    return []
  }
}

// --- Kickass ---

async function searchKickass(query: TorrentQuery): Promise<TorrentResult[]> {
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

    const category = query.type === 'episode' ? 'tv' : 'movies'
    const domains = ['https://kickass.id', 'https://kickass.love', 'https://kickass.name', 'https://kickass.earth', 'https://thekat.app']
    const base = domains[0]

    const res = await fetch(`${base}/usearch/${encodeURIComponent(searchTerm)}%20category:${category}/`)
    if (!res.ok) return []
    const html = await res.text()

    const results: TorrentResult[] = []
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    let rowMatch: RegExpExecArray | null
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const row = rowMatch[1]
      const titleMatch = /<a[^>]*class="[^"]*cellMainLink[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(row)
      if (!titleMatch) continue
      const title = titleMatch[1].replace(/<[^>]+>/g, '').trim()
      const magnetMatch = /href="(magnet:\?[^"]*)"/i.exec(row)
      const magnetUri = magnetMatch ? magnetMatch[1] : ''
      const infoHashMatch = magnetUri.match(/urn:btih:([a-fA-F0-9]{32,40})/i)
      const infoHash = infoHashMatch?.[1] || ''
      if (!title || !infoHash) continue

      const sizeText = row.match(/<td[^>]*>([\d.]+\s*(?:GB|MB|TB))<\/td>/i)?.[1] || '0 MB'
      const seeders = extractSeeders(row)

      results.push({
        title,
        seeders,
        leechers: 0,
        size: parseSize(sizeText),
        magnetUri: magnetUri || buildMagnetUri(infoHash, title),
        infoHash,
        indexer: 'Kickass',
        quality: qualityFromTitle(title),
      })
    }
    return results
  } catch {
    return []
  }
}

// --- MagnetDL ---

async function searchMagnetdl(query: TorrentQuery): Promise<TorrentResult[]> {
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

    const firstLetter = searchTerm[0].toLowerCase()
    const slug = encodeURIComponent(searchTerm).replace(/%20/g, '-').replace(/\+/g, '-').toLowerCase()
    const res = await fetch(`https://torrentquest.com/${firstLetter}/${slug}/se/desc/1/`, {
      headers: { 'Accept': 'text/html' },
    })
    if (!res.ok) return []
    const html = await res.text()

    const results: TorrentResult[] = []
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    let rowMatch: RegExpExecArray | null
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const row = rowMatch[1]
      const magnetMatch = /href="(magnet:\?[^"]*)"/i.exec(row)
      if (!magnetMatch) continue
      const magnetUri = magnetMatch[1]
      const infoHashMatch = magnetUri.match(/urn:btih:([a-fA-F0-9]{32,40})/i)
      const infoHash = infoHashMatch?.[1] || ''
      if (!infoHash) continue

      const titleMatch = /<a[^>]*title="([^"]*)"[^>]*>/i.exec(row)
      const title = titleMatch ? titleMatch[1].trim() : extractTitle(row)
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      const sizeText = cells[1] ? cells[1][1].replace(/<[^>]+>/g, '').trim() : '0 MB'
      const seeders = extractSeeders(row) || parseInt(cells[3]?.[1]?.replace(/<[^>]+>/g, '').trim() || '0') || 0

      results.push({
        title,
        seeders,
        leechers: 0,
        size: parseSize(sizeText),
        magnetUri,
        infoHash,
        indexer: 'MagnetDL',
        quality: qualityFromTitle(title),
      })
    }
    return results
  } catch {
    return []
  }
}

// --- BitSearch ---

async function searchBitsearch(query: TorrentQuery): Promise<TorrentResult[]> {
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

    const res = await fetch(`https://bitsearch.to/search?q=${encodeURIComponent(searchTerm)}&sort=size&limit=100`)
    if (!res.ok) return []
    const html = await res.text()

    const results: TorrentResult[] = []
    const itemRegex = /<li[^>]*class="[^"]*search-result[^"]*"[^>]*>([\s\S]*?)<\/li>/gi
    let itemMatch: RegExpExecArray | null
    while ((itemMatch = itemRegex.exec(html)) !== null) {
      const item = itemMatch[1]
      const titleMatch = /<a[^>]*href="\/torrent\/\d+"[^>]*>([\s\S]*?)<\/a>/i.exec(item)
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : extractTitle(item)
      const magnetMatch = /href="(magnet:\?[^"]*)"/i.exec(item)
      const magnetUri = magnetMatch ? magnetMatch[1] : ''
      const infoHashMatch = magnetUri.match(/urn:btih:([a-fA-F0-9]{32,40})/i)
      const infoHash = infoHashMatch?.[1] || ''
      if (!title || !infoHash) continue

      const size = extractSize(item)
      const seeders = extractSeeders(item)

      results.push({
        title,
        seeders,
        leechers: 0,
        size,
        magnetUri: magnetUri || buildMagnetUri(infoHash, title),
        infoHash,
        indexer: 'MagnetDL',
        quality: qualityFromTitle(title),
      })
    }
    return results
  } catch {
    return []
  }
}

// --- RuTor ---

async function searchRutor(query: TorrentQuery): Promise<TorrentResult[]> {
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

    const res = await fetch(`https://rutor.info/search/0/0/000/2/${encodeURIComponent(searchTerm)}`)
    if (!res.ok) return []
    const html = await res.text()

    const results: TorrentResult[] = []
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    let rowMatch: RegExpExecArray | null
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const row = rowMatch[1]
      const magnetMatch = row.match(/(magnet:\?[^"&]*)(?:&dn=([^&"]*))?/)
      if (!magnetMatch) continue
      const magnetUri = magnetMatch[0]
      const infoHashMatch = magnetUri.match(/urn:btih:([a-fA-F0-9]{32,40})/i)
      const infoHash = infoHashMatch?.[1] || ''
      if (!infoHash) continue

      const title = extractTitle(row)
      if (!title) continue

      const size = extractSize(row)
      const seeders = extractSeeders(row)
      const leechers = extractLeechers(row)

      results.push({
        title,
        seeders,
        leechers,
        size,
        magnetUri: magnetUri.includes('&dn=') ? magnetUri : `${magnetUri}&dn=${encodeURIComponent(title)}`,
        infoHash,
        indexer: 'RuTor',
        quality: qualityFromTitle(title),
      })
    }
    return results
  } catch {
    return []
  }
}

// --- Torrentz2 ---

async function searchTorrentz2(query: TorrentQuery): Promise<TorrentResult[]> {
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

    const res = await fetch(`https://torrentz2.nz/search?q=${encodeURIComponent(searchTerm)}`)
    if (!res.ok) return []
    const html = await res.text()

    const results: TorrentResult[] = []
    const itemRegex = /<dl[^>]*>([\s\S]*?)<\/dl>/gi
    let itemMatch: RegExpExecArray | null
    while ((itemMatch = itemRegex.exec(html)) !== null) {
      const item = itemMatch[1]
      const titleMatch = /<a[^>]*>([\s\S]*?)<\/a>/i.exec(item)
      let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : ''
      if (!title) title = extractTitle(item)
      if (!title) continue

      const hashMatch = item.match(/([a-fA-F0-9]{40})/)
      const infoHash = hashMatch ? hashMatch[1] : ''
      if (!infoHash) continue

      const size = extractSize(item)
      const seeders = extractSeeders(item)
      const leechers = extractLeechers(item)

      results.push({
        title,
        seeders,
        leechers,
        size,
        magnetUri: buildMagnetUri(infoHash, title),
        infoHash,
        indexer: 'Torrentz2',
        quality: qualityFromTitle(title),
      })
    }
    return results
  } catch {
    return []
  }
}

// --- ShowRSS (TV only, RSS-based) ---

async function searchShowrss(query: TorrentQuery): Promise<TorrentResult[]> {
  try {
    if (query.type !== 'episode') return []
    const showTitle = query.title || ''
    if (!showTitle) return []

    const listRes = await fetch('https://showrss.info/browse')
    if (!listRes.ok) return []
    const listHtml = await listRes.text()

    const optionRegex = /<option[^>]*value="(\d+)"[^>]*>(.*?)<\/option>/gi
    let optionMatch: RegExpExecArray | null
    let showId: string | null = null
    const cleanTitle = showTitle.toLowerCase().replace(/[^a-z0-9]/g, '')
    while ((optionMatch = optionRegex.exec(listHtml)) !== null) {
      const optionTitle = optionMatch[2].toLowerCase().replace(/[^a-z0-9]/g, '')
      if (optionTitle.startsWith(cleanTitle) || cleanTitle.startsWith(optionTitle)) {
        showId = optionMatch[1]
        break
      }
    }
    if (!showId) return []

    const feedRes = await fetch(`https://showrss.info/show/${showId}.rss`)
    if (!feedRes.ok) return []
    const feedHtml = await feedRes.text()

    const results: TorrentResult[] = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi
    let itemMatch: RegExpExecArray | null
    while ((itemMatch = itemRegex.exec(feedHtml)) !== null) {
      const item = itemMatch[1]
      const titleMatch = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i.exec(item)
      const title = titleMatch ? titleMatch[1].trim() : ''
      const magnetMatch = /"(magnet:\?[^"]*)"/i.exec(item)
      const magnetUri = magnetMatch ? magnetMatch[1] : ''
      const infoHashMatch = magnetUri.match(/urn:btih:([a-fA-F0-9]{32,40})/i)
      const infoHash = infoHashMatch?.[1] || ''
      if (!title || !infoHash) continue

      if (query.season !== undefined && query.episode !== undefined) {
        const sxxeyy = new RegExp(`S${String(query.season).padStart(2, '0')}E${String(query.episode).padStart(2, '0')}`, 'i')
        if (!sxxeyy.test(title)) continue
      }

      results.push({
        title,
        seeders: 0,
        leechers: 0,
        size: 0,
        magnetUri: magnetUri || buildMagnetUri(infoHash, title),
        infoHash,
        indexer: 'ShowRSS',
        quality: qualityFromTitle(title),
      })
    }
    return results
  } catch {
    return []
  }
}

const BUILT_IN_INDEXERS: BuiltInIndexer[] = [
  { id: 'yts', name: 'YTS', type: 'movie', search: searchYts },
  { id: 'eztv', name: 'EZTV', type: 'tv', search: searchEztv },
  { id: 'thepiratebay', name: 'TPB', type: 'general', search: searchThePirateBay },
  { id: 'nyaa', name: 'Nyaa', type: 'general', search: searchNyaa },
  { id: '1337x', name: '1337x', type: 'general', search: search1337x },
  { id: 'torrentio', name: 'Torrentio', type: 'general', search: searchTorrentio },
  { id: 'mediafusion', name: 'MediaFusion', type: 'general', search: searchMediafusion },
  { id: 'kickass', name: 'Kickass', type: 'general', search: searchKickass },
  { id: 'magnetdl', name: 'MagnetDL', type: 'general', search: searchMagnetdl },
  { id: 'bitsearch', name: 'BitSearch', type: 'general', search: searchBitsearch },
  { id: 'rutor', name: 'RuTor', type: 'general', search: searchRutor },
  { id: 'torrentz2', name: 'Torrentz2', type: 'general', search: searchTorrentz2 },
  { id: 'showrss', name: 'ShowRSS', type: 'tv', search: searchShowrss },
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

const INDEXER_TIMEOUT = 30000 // 30s timeout per indexer

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
  ])
}



export async function searchTorrents(
  query: TorrentQuery,
  enabledIndexerIds?: string[],
  customIndexers?: CustomIndexer[],
  onResult?: (result: TorrentResult) => void
): Promise<TorrentResult[]> {
  const searchTerm = query.query || `${query.title || ''} ${query.year || ''}`.trim()
  const cacheKey = `torrent:search:v2:${JSON.stringify({ q: query, e: enabledIndexerIds, c: (customIndexers || []).map(x => x.id).sort() })}`

  return withCache(cacheKey, TTL.TORRENT_SEARCH, async () => {
    const results: TorrentResult[] = []
    const enabled = new Set(enabledIndexerIds && enabledIndexerIds.length > 0 ? enabledIndexerIds : getDefaultEnabledIndexers())
    const customs = (customIndexers || []).filter(c => c.enabled)

    const promises: Promise<TorrentResult[]>[] = []

    for (const indexer of BUILT_IN_INDEXERS) {
      if (!enabled.has(indexer.id)) continue
      if (!isIndexerApplicable(indexer, query)) continue
      promises.push(withTimeout(indexer.search(query), INDEXER_TIMEOUT))
    }

    for (const indexer of customs) {
      if (!searchTerm) continue
      promises.push(withTimeout(searchTorznab(indexer, searchTerm), INDEXER_TIMEOUT))
    }

    console.log(`[TorrentSearch] Searching with ${promises.length} indexers, enabled: ${[...enabled].join(',')}`)

    const settled = await Promise.allSettled(promises)
    let fulfilledCount = 0
    let rejectedCount = 0
    for (const s of settled) {
      if (s.status === 'fulfilled') {
        fulfilledCount++
        if (s.value.length > 0) {
          console.log(`[TorrentSearch] Got ${s.value.length} results (indexer: ${s.value[0].indexer})`)
        }
        if (onResult) {
          for (const r of s.value) onResult(r)
        }
        results.push(...s.value)
      } else {
        rejectedCount++
      }
    }
    if (rejectedCount > 0) console.log(`[TorrentSearch] ${rejectedCount}/${promises.length} indexers timed out or failed`)

    // Post-query filtering: remove results clearly irrelevant to the search
    let filtered = results
    if (query.type === 'movie') {
      // For movie searches, drop TV episodes (SxxExx patterns)
      const episodeRe = /\bS\d{1,3}E\d{1,4}\b/i
      filtered = filtered.filter(r => !episodeRe.test(r.title))
      // If we have a year, require it in the title
      if (query.year) {
        const yearStr = String(query.year)
        const yearFiltered = filtered.filter(r => r.title.includes(yearStr))
        if (yearFiltered.length > 0) filtered = yearFiltered
        // else fall through — no year-matched results at all, keep everything
      }
    } else if (query.type === 'episode' && query.season !== undefined && query.episode !== undefined) {
      // For episode searches, only keep results matching the specific episode
      const epStr = `S${String(query.season).padStart(2, '0')}E${String(query.episode).padStart(2, '0')}`
      const episodeRe = new RegExp(epStr, 'i')
      const epFiltered = filtered.filter(r => episodeRe.test(r.title))
      if (epFiltered.length > 0) filtered = epFiltered
    }

    // Deduplicate by infoHash
    const seen = new Set<string>()
    const deduped = filtered.filter((r) => {
      if (!r.infoHash || seen.has(r.infoHash)) return false
      seen.add(r.infoHash)
      return true
    })

    const filteredOut = results.length - filtered.length
    console.log(`[TorrentSearch] ${deduped.length} unique results for "${searchTerm}" (${results.length} raw, ${filteredOut} filtered out)`)
    if (filteredOut > 0) {
      console.log(`[TorrentSearch] Filtered out ${filteredOut} results (type=${query.type}, year=${query.year})`)
    }
    const qualityOrder: Record<string, number> = { '4K': 0, '1080p': 1, '720p': 2, '480p': 3 }
    deduped.sort((a, b) => {
      const aQ = qualityOrder[a.quality] ?? 99
      const bQ = qualityOrder[b.quality] ?? 99
      if (aQ !== bQ) return aQ - bQ
      return b.seeders - a.seeders
    })

    return deduped
  })
}
