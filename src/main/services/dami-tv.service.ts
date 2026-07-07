import * as CacheService from './cache.service'

const API_BASE = 'https://dami-tv.pro/papi/api'
const CACHE_TTL = 60000
const CHANNELS_CACHE_TTL = 300000
const CHANNELS_URL = 'https://dami-tv.pro/data/dlhd-channels.json?v=7'

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
  brand: string
  qualities: { name: string; url: string }[]
  defaultUrl: string
  defaultQuality: string
}

function parseChannel(item: any): DamiTVChannel {
  const countryCode = (typeof item.country === 'string' ? item.country : item.country?.code) || detectCountryCode(item.name || '')
  return {
    id: item.id || '',
    name: item.name || '',
    image: item.image || item.logo || '',
    countryCode,
    countryName: (typeof item.country === 'string' ? '' : item.country?.name) || COUNTRY_NAMES[countryCode] || countryCode.toUpperCase(),
    countryFlag: item.country?.flag || countryFlag(countryCode),
    brand: item.brand?.name || '',
    qualities: (item.qualities || []).map((q: any) => ({
      name: q.name || '',
      url: q.url || '',
    })),
    defaultUrl: item.defaultUrl || '',
    defaultQuality: item.defaultQuality || 'SD',
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

  const res = await fetch(CHANNELS_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) throw new Error(`DAMI-TV channels HTTP ${res.status}`)
  const data = await res.json()

  const channels: DamiTVChannel[] = (data.channels || []).map(parseChannel)

  CacheService.setCache('dami-tv:channels', JSON.stringify(channels), CHANNELS_CACHE_TTL)
  return channels
}

export async function getChannelsByCountry(countryCode: string): Promise<DamiTVChannel[]> {
  const all = await getChannels()
  if (countryCode === 'all') return all
  return all.filter(c => c.countryCode === countryCode)
}

export async function extractChannelUrl(channelId: string): Promise<{ hlsUrl?: string; embedUrl?: string }> {
  try {
    const res = await fetch(`https://dami-tv.pro/papi/extract-url/${encodeURIComponent(channelId)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (!res.ok) return {}
    const data = await res.json()
    return { hlsUrl: data.hlsUrl, embedUrl: data.embedUrl }
  } catch {
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
