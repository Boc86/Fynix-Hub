import * as CacheService from './cache.service'

const API_BASE = 'https://api.cdnlivetv.is/api/v1'
const CACHE_TTL = 60000
const CHANNELS_CACHE_TTL = 300000

const CC_MAP: [string, string][] = [
  ['united states', 'us'], ['usa', 'us'], ['u.s', 'us'],
  [' uk', 'gb'], ['u.k', 'gb'], ['britain', 'gb'], ['england', 'gb'],
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
  const code = (typeof item.country === 'string' ? item.country.toLowerCase() : '') || detectCountryCode(item.name || '')
  let image = item.image || item.logo || item.icon || ''
  // strip full cdnlivetv URLs to relative path so proxy adds auth query params
  if (image.startsWith('https://cdnlivetv.tv/')) {
    image = image.slice('https://cdnlivetv.tv'.length)
  }
  return {
    id: String(item.id || item.channel_id || item.channel || ''),
    name: item.name || item.title || '',
    image,
    countryCode: code,
    countryName: COUNTRY_NAMES[code] || code.toUpperCase(),
    countryFlag: countryFlag(code),
    playerUrl: item.playerUrl || item.player_url || item.embed || `https://embed.cdnlivetv.is/player.php?channel=${item.id || item.channel_id || ''}`,
    source: item.source || item.group || item.category || '',
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
  return []
}

export async function getStreamsByCategory(category: string): Promise<DamiTVStream[]> {
  return []
}

export function clearChannelsCache() {
  CacheService.setCache('dami-tv:channels', '', 0)
  console.log('[LiveTV] Channels cache cleared')
}

function getCredentials(): { user: string; plan: string } {
  const user = CacheService.getSetting<string>('liveTvUser') || 'cdnlivetv'
  const plan = CacheService.getSetting<string>('liveTvPlan') || 'free'
  return { user, plan }
}

export async function getChannels(): Promise<DamiTVChannel[]> {
  const cached = CacheService.getCache('dami-tv:channels')
  if (cached) return JSON.parse(cached)

  const { user, plan } = getCredentials()
  const url = `${API_BASE}/channels/?user=${encodeURIComponent(user)}&plan=${encodeURIComponent(plan)}`

  console.log(`[LiveTV] Fetching channels: ${url}`)
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) {
      console.log(`[LiveTV] HTTP ${res.status} for channels`)
      throw new Error(`LiveTV channels HTTP ${res.status}`)
    }
    const data = await res.json()

    // handle both { channels: [...] } and raw array responses
    const rawChannels = Array.isArray(data) ? data : (data.channels || data.data || [])
    console.log(`[LiveTV] API returned ${rawChannels.length} raw items`)

    const channels: DamiTVChannel[] = rawChannels.map(parseChannel).filter((c: DamiTVChannel) => c.name)

    CacheService.setCache('dami-tv:channels', JSON.stringify(channels), CHANNELS_CACHE_TTL)
    CacheService.setCache('dami-tv:channels-stale', JSON.stringify(channels), 86400000 * 7) // keep stale for 7 days
    console.log(`[LiveTV] Loaded ${channels.length} channels from cdnlivetv.is`)
    return channels
  } catch (err: any) {
    console.warn(`[LiveTV] Failed to fetch channels: ${err?.message || err}`)

    // fallback: check if we have stale cached data
    const stale = CacheService.getCache('dami-tv:channels-stale')
    if (stale) {
      console.log('[LiveTV] Using stale cached channels')
      return JSON.parse(stale)
    }
    throw err
  }
}

export async function getChannelsByCountry(countryCode: string): Promise<DamiTVChannel[]> {
  const all = await getChannels()
  if (countryCode === 'all') return all
  return all.filter(c => c.countryCode === countryCode)
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

export async function extractChannelUrl(channelId: string): Promise<{ hlsUrl?: string; embedUrl?: string }> {
  try {
    const channels = await getChannels()
    const ch = channels.find(c => c.id === channelId)
    if (!ch || !ch.playerUrl) {
      console.warn(`[LiveTV] No playerUrl for channel ${channelId}`)
      return {}
    }

    const urlController = new AbortController()
    const urlTimeout = setTimeout(() => urlController.abort(), 10000)
    const res = await fetch(ch.playerUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://cdnlivetv.is/',
      },
      signal: urlController.signal,
    })
    clearTimeout(urlTimeout)
    if (!res.ok) {
      console.warn(`[LiveTV] player page HTTP ${res.status} for ${channelId}`)
      return {}
    }
    const html = await res.text()

    // try common HLS patterns
    const hlsUrl = extractHlsUrl(html)
    if (hlsUrl) {
      console.log(`[LiveTV] Resolved HLS URL for channel ${channelId}`)
      return { hlsUrl }
    }

    // try to find an iframe with a stream URL
    const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i)
    if (iframeMatch) {
      console.log(`[LiveTV] Found iframe for channel ${channelId}: ${iframeMatch[1]}`)
      return { embedUrl: iframeMatch[1] }
    }

    console.warn(`[LiveTV] Could not extract URL from player page for ${channelId}`)
    return {}
  } catch (err) {
    console.warn(`[LiveTV] extractChannelUrl failed for ${channelId}:`, err)
    return {}
  }
}

function extractHlsUrl(html: string): string | null {
  // direct .m3u8 URLs
  const m3u8Re = /https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/g
  let m = m3u8Re.exec(html)
  if (m) return m[0]

  // base64-encoded m3u8 URLs
  const b64Re = /['"]([A-Za-z0-9+/=]{40,})['"]/g
  while ((m = b64Re.exec(html)) !== null) {
    try {
      const decoded = Buffer.from(m[1], 'base64').toString('utf-8')
      if (decoded.includes('.m3u8') || decoded.includes('cdnlivetv')) return decoded
    } catch {}
  }

  // JavaScript variables with m3u8
  const varRe = /['"]([^"']*\.m3u8[^"']*)['"]/g
  while ((m = varRe.exec(html)) !== null) {
    if (m[1].startsWith('http')) return m[1]
  }

  return null
}


