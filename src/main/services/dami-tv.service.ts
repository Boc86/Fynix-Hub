import * as CacheService from './cache.service'

const API_BASE = 'https://dami-tv.pro/papi/api'
const CACHE_TTL = 60000
const CHANNELS_CACHE_TTL = 300000
const CHANNELS_URL = 'https://dami-tv.pro/data/tv-channels.json?v=516'
const CHANNELS_FALLBACK_URLS = [
  'https://dami-tv.pro/data/tv-channels.json',
  'https://dami-tv.pro/channels.json',
  'https://dami-tv.pro/data/channels.json',
  'https://dami-tv.pro/api/channels',
  'https://dami-tv.pro/papi/api/channels',
]

const CC_MAP: [string, string][] = [
  ['united states', 'us'], ['usa', 'us'], ['u.s', 'us'],
  [' uk', 'uk'], ['u.k', 'uk'], ['britain', 'uk'], ['england', 'uk'],
  ['spain', 'es'], ['espa', 'es'],
  ['italy', 'it'], ['italia', 'it'],
  ['france', 'fr'], ['french', 'fr'],
  ['germany', 'de'], ['deutsch', 'de'],
  ['portugal', 'pt'],
  ['arabic', 'ar'], ['arab', 'ar'],
  ['india', 'in'], ['hindi', 'in'],
  ['canada', 'ca'],
  ['australia', 'au'],
  ['netherlands', 'nl'],
  ['turkey', 'tr'], ['turk', 'tr'],
  ['poland', 'pl'], ['polsk', 'pl'],
  ['brazil', 'br'], ['brasil', 'br'],
  ['mexico', 'mx'],
  ['greece', 'gr'], ['greek', 'gr'],
  ['romania', 'ro'],
  ['russia', 'ru'],
  ['malaysia', 'my'], ['astro', 'my'],
  ['indonesia', 'id'],
  ['ireland', 'ie'],
  ['belgium', 'be'],
  ['sweden', 'se'],
  ['norway', 'no'],
  ['denmark', 'dk'],
]

const COUNTRY_NAMES: Record<string, string> = {
  us: "United States", gb: "United Kingdom", es: "Spain", fr: "France", de: "Germany",
  it: "Italy", pl: "Poland", au: "Australia", pt: "Portugal", ca: "Canada", br: "Brazil",
  mx: "Mexico", ar: "Argentina", in: "India", hk: "Hong Kong", my: "Malaysia", intl: "International",
  ae: "UAE", se: "Sweden", no: "Norway", dk: "Denmark", hr: "Croatia", rs: "Serbia",
  il: "Israel", hu: "Hungary", cz: "Czech Republic", ro: "Romania", bg: "Bulgaria",
  gr: "Greece", tr: "Turkey", za: "South Africa", cy: "Cyprus", si: "Slovenia",
  ie: "Ireland", nz: "New Zealand", pe: "Peru", dz: "Algeria", ru: "Russia",
  az: "Azerbaijan", id: "Indonesia", nl: "Netherlands", int: "International",
  at: "Austria", sa: "Saudi Arabia", be: "Belgium", cl: "Chile", uy: "Uruguay",
  co: "Colombia", eg: "Egypt", ua: "Ukraine", jp: "Japan", kr: "South Korea",
  th: "Thailand", ph: "Philippines", sg: "Singapore", pk: "Pakistan", bd: "Bangladesh",
  qa: "Qatar", kw: "Kuwait", bh: "Bahrain", om: "Oman", jo: "Jordan",
}

function detectCountryCode(name: string): string {
  const t = ' ' + name.toLowerCase() + ' '
  for (const [kw, code] of CC_MAP) {
    if (t.indexOf(kw) >= 0) return code
  }
  return 'intl'
}

function countryFlag(code: string): string {
  if (!code || code === 'intl' || code === 'int') return '\uD83C\uDF0D'
  const c = code.toUpperCase()
  if (c.length !== 2) return '\uD83C\uDF0D'
  return String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65) + String.fromCodePoint(0x1F1E6 + c.charCodeAt(1) - 65)
}

export interface DamiTVStream {
  id: string
  name: string
  poster: string
  startsAt: number
  endsAt: number
  status: 'live' | 'upcoming' | 'finished'
  league: string
  categoryName: string
  viewers: number
  homeTeam: string
  awayTeam: string
  homeBadge: string
  awayBadge: string
  embedUrl: string
  sources: { name: string; embed: string }[]
}

export interface DamiTVCategory {
  name: string
  streams: DamiTVStream[]
}

export interface DamiTVChannel {
  id: string
  name: string
  image: string
  countryCode: string
  countryName: string
  countryFlag: string
  playerUrl: string
  source: string
  status: string
}

function parseChannel(item: any): DamiTVChannel {
  const code = (typeof item.country === 'string' ? item.country : '') || detectCountryCode(item.name || '')
  return {
    id: String(item.id || ''),
    name: item.name || '',
    image: item.image || '',
    countryCode: code,
    countryName: COUNTRY_NAMES[code] || code.toUpperCase(),
    countryFlag: countryFlag(code),
    playerUrl: item.playerUrl || '',
    source: item.source || '',
    status: item.status || '',
  }
}

function parseStream(item: any): DamiTVStream {
  return {
    id: item.id || '',
    name: item.name || '',
    poster: item.poster || '',
    startsAt: item.starts_at || 0,
    endsAt: item.ends_at || 0,
    status: item.status || 'upcoming',
    league: item.league || '',
    categoryName: item.category_name || '',
    viewers: item.viewers || 0,
    homeTeam: item.teams?.home?.name || '',
    awayTeam: item.teams?.away?.name || '',
    homeBadge: item.teams?.home?.badge || '',
    awayBadge: item.teams?.away?.badge || '',
    embedUrl: item.embed || item.iframe || '',
    sources: (item.sources || []).map((s: any) => ({
      name: s.name || s.source || '',
      embed: s.embed || '',
    })),
  }
}

export async function getStreams(): Promise<DamiTVCategory[]> {
  const cached = CacheService.getCache('dami-tv:streams')
  if (cached) return JSON.parse(cached)

  const res = await fetch(`${API_BASE}/streams`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) throw new Error(`DAMI-TV HTTP ${res.status}`)
  const data = await res.json()

  const categories: DamiTVCategory[] = (data.streams || []).map((cat: any) => ({
    name: cat.category || cat.category_name || '',
    streams: (cat.streams || []).map(parseStream),
  }))

  CacheService.setCache('dami-tv:streams', JSON.stringify(categories), CACHE_TTL)
  return categories
}

export async function getStreamsByCategory(category: string): Promise<DamiTVStream[]> {
  const all = await getStreams()
  return all.find(c => c.name === category)?.streams || []
}

export async function getChannels(): Promise<DamiTVChannel[]> {
  const cached = CacheService.getCache('dami-tv:channels')
  if (cached) return JSON.parse(cached)

  const urlsToTry = [CHANNELS_URL, ...CHANNELS_FALLBACK_URLS]
  let lastErr: Error | null = null

  for (const url of urlsToTry) {
    console.log(`[DamiTV] Trying channels URL: ${url}`)
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      if (!res.ok) {
        console.log(`[DamiTV] HTTP ${res.status} for ${url}`)
        if (res.status === 404) continue
        throw new Error(`DAMI-TV channels HTTP ${res.status}`)
      }
      const data = await res.json()

      // save the working URL for next time
      CacheService.setSetting('damiTvChannelsUrl', url)

      const channels: DamiTVChannel[] = (data.channels || []).map(parseChannel)

      CacheService.setCache('dami-tv:channels', JSON.stringify(channels), CHANNELS_CACHE_TTL)
      console.log(`[DamiTV] Loaded ${channels.length} channels from ${url}`)
      return channels
    } catch (err: any) {
      console.log(`[DamiTV] Failed for ${url}: ${err?.message || err}`)
      lastErr = err
    }
  }

  // try stored URL from a previous successful run
  const storedUrl = CacheService.getSetting<string>('damiTvChannelsUrl')
  if (storedUrl && !urlsToTry.includes(storedUrl)) {
    console.log(`[DamiTV] Trying stored URL: ${storedUrl}`)
    try {
      const res = await fetch(storedUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (res.ok) {
        const data = await res.json()
        const channels: DamiTVChannel[] = (data.channels || []).map(parseChannel)
        CacheService.setCache('dami-tv:channels', JSON.stringify(channels), CHANNELS_CACHE_TTL)
        console.log(`[DamiTV] Loaded ${channels.length} channels from stored URL`)
        return channels
      }
    } catch {}
  }

  if (lastErr) throw lastErr
  throw new Error('DAMI-TV channels all URLs returned 404')
}

export async function getChannelsByCountry(countryCode: string): Promise<DamiTVChannel[]> {
  const all = await getChannels()
  if (countryCode === 'all') return all
  return all.filter(c => c.countryCode === countryCode)
}

function b64decode(s: string): string {
  let padded = s
  while (padded.length % 4) padded += '='
  return Buffer.from(padded, 'base64').toString('utf-8')
}

function extractHlsUrlFromPlayerPage(html: string): string | null {
  const fnRe = /function\s+(\w+)\s*\(\s*s\s*\)\s*\{[^}]*replace\s*\(\s*\/-\/g\s*,\s*['"]\+['"]\s*\)/
  const fnMatch = html.match(fnRe)
  if (!fnMatch) return null
  const decodeFn = fnMatch[1]

  const vars: Record<string, string> = {}
  const varRe = new RegExp(`var\\s+(\\w+)\\s*=\\s*['"]([A-Za-z0-9+/=]+)['"]`, 'g')
  let m
  while ((m = varRe.exec(html)) !== null) {
    vars[m[1]] = m[2]
  }

  const escapedFn = decodeFn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const partPat = `${escapedFn}\\((\\w+)\\)`
  const chainPat = `(?:${partPat}\\+)+${partPat}`
  const chainRe = new RegExp(chainPat, 'g')

  while ((m = chainRe.exec(html)) !== null) {
    const allVars: string[] = []
    const innerRe = new RegExp(`${escapedFn}\\((\\w+)\\)`, 'g')
    let im
    while ((im = innerRe.exec(m[0])) !== null) {
      allVars.push(im[1])
    }

    if (allVars.length >= 3) {
      let url = ''
      let valid = true
      for (const v of allVars) {
        const b64 = vars[v]
        if (!b64) { valid = false; break }
        try { url += b64decode(b64) } catch { valid = false; break }
      }
      if (valid && (url.includes('.m3u8') || url.includes('playlist') || url.includes('cdnlivetv'))) {
        return url
      }
    }
  }

  return null
}

export async function extractChannelUrl(channelId: string): Promise<{ hlsUrl?: string; embedUrl?: string }> {
  try {
    const channels = await getChannels()
    const ch = channels.find(c => c.id === channelId)
    if (!ch || !ch.playerUrl) {
      console.warn(`[DamiTV] No playerUrl for channel ${channelId}`)
      return {}
    }

    const res = await fetch(ch.playerUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://dami-tv.pro/',
      },
    })
    if (!res.ok) {
      console.warn(`[DamiTV] player page HTTP ${res.status} for ${channelId}`)
      return {}
    }
    const html = await res.text()

    const hlsUrl = extractHlsUrlFromPlayerPage(html)
    if (hlsUrl) {
      console.log(`[DamiTV] Resolved HLS URL for channel ${channelId}`)
      return { hlsUrl }
    }

    console.warn(`[DamiTV] Could not extract HLS URL from player page for ${channelId}`)
    return {}
  } catch (err) {
    console.warn(`[DamiTV] extractChannelUrl failed for ${channelId}:`, err)
    return {}
  }
}

export async function getAvailableCountries(): Promise<{ code: string; name: string; flag: string; count: number }[]> {
  const channels = await getChannels()
  const map = new Map<string, number>()
  for (const ch of channels) {
    map.set(ch.countryCode, (map.get(ch.countryCode) || 0) + 1)
  }
  return Array.from(map.entries())
    .map(([code, count]) => ({
      code,
      name: COUNTRY_NAMES[code] || code.toUpperCase(),
      flag: countryFlag(code),
      count,
    }))
    .sort((a, b) => b.count - a.count)
}
