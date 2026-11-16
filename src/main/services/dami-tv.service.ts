import * as CacheService from './cache.service'
import { lookupLogo } from './tv-logo.service'
import { countryFlagEmoji, detectCountrySuffix, ISO_COUNTRY_NAMES } from '@/shared/iso-country-codes'
const API_BASE = 'https://api.cdnlivetv.is/api/v1'
const API_BASE_TV = 'https://cdnlivetv.tv/api/v1'
const CACHE_TTL = 60000
const CHANNELS_CACHE_TTL = 300000

function msUntilEndOfDay(): number {
  const now = Date.now()
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  return end.getTime() - now
}

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

// Names come from the shared static ISO 3166-1 alpha-2 table; 'intl'/'int' are
// non-ISO pseudo-codes used by this provider for international feeds.
const COUNTRY_NAMES: Record<string, string> = {
  intl: 'International', int: 'International',
  ...ISO_COUNTRY_NAMES,
}

function detectCountryCode(name: string): string {
  const t = ' ' + name.toLowerCase() + ' '
  for (const [kw, code] of CC_MAP) {
    // Check for keyword as a standalone word, colon-prefixed, or in parentheses
    if (t.indexOf(' ' + kw.toLowerCase() + ' ') >= 0 || 
        t.indexOf(kw.toLowerCase() + ':') >= 0 ||
        t.indexOf(kw.toLowerCase() + ' -') >= 0 ||
        t.indexOf('(' + kw.toLowerCase() + ')') >= 0 ||
        t.indexOf(' - ' + kw.toLowerCase()) >= 0) {
      return code
    }
  }
  // cdnlivetv channel names carry the country as a trailing alpha-2 suffix
  // ("Sky Sports F1 FHD UK", "Canal 9 HD DK") — the API's `code` field is
  // empty these days. Validate against the static ISO 3166-1 table.
  const suffix = detectCountrySuffix(name)
  if (suffix) return suffix
  return 'intl'
}

function countryFlag(code: string): string {
  return countryFlagEmoji(code)
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
  logoImage: string
  countryCode: string
  countryName: string
  countryFlag: string
  playerUrl: string
  source: string
  status: string
}

function parseChannel(item: any): DamiTVChannel {
  const name = item.name || item.title || ''
  const code = (typeof item.code === 'string' ? item.code.toLowerCase() : '') || (typeof item.country === 'string' ? item.country.toLowerCase() : '') || detectCountryCode(name)
  const id = String(item.id || item.channel_id || item.channel || `${name}_${code}`)
  let image = item.image || item.logo || item.icon || ''
  if (image) {
    if (!image.startsWith('http')) {
      image = `https://api.cdnlivetv.is${image.startsWith('/') ? '' : '/'}${image}`
    } else {
      image = image.replace('https://cdnlivetv.tv/', 'https://api.cdnlivetv.is/')
    }
  }
  return {
    id,
    name,
    image,
    logoImage: '',
    countryCode: code,
    countryName: COUNTRY_NAMES[code] || code.toUpperCase(),
    countryFlag: countryFlag(code),
    playerUrl: item.url || item.playerUrl || item.player_url || item.embed || '',
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

/** One attempt at the channels endpoint with a hard timeout. */
async function fetchChannelsFrom(base: string, user: string, plan: string, timeoutMs: number) {
  const url = `${base}/channels/?user=${encodeURIComponent(user)}&plan=${encodeURIComponent(plan)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`LiveTV channels HTTP ${res.status} from ${base}`)
  return res.json()
}

export async function getChannels(): Promise<DamiTVChannel[]> {
  const cached = CacheService.getCache('dami-tv:channels')
  if (cached) return JSON.parse(cached)

  const { user, plan } = getCredentials()
  console.log(`[LiveTV] Fetching channels (user=${user} plan=${plan})`)

  // The CDN occasionally hangs a connection instead of answering (seen as a
  // 15s abort in the app while the same URL answers in ~300ms from curl).
  // That is usually a stale keep-alive socket in undici's pool after a network
  // change — a retry opens a fresh connection and succeeds. Try the primary
  // API host twice, then the .tv vhost once, with short timeouts.
  const attempts: Array<{ base: string; tries: number }> = [
    { base: API_BASE, tries: 2 },
    { base: API_BASE_TV, tries: 1 },
  ]
  const errors: string[] = []
  for (const { base, tries } of attempts) {
    for (let attempt = 1; attempt <= tries; attempt++) {
      try {
        const data = await fetchChannelsFrom(base, user, plan, 6000)

        // handle both { channels: [...] } and raw array responses
        const rawChannels = Array.isArray(data) ? data : (data.channels || data.data || [])
        console.log(`[LiveTV] API returned ${rawChannels.length} raw items (${base}, attempt ${attempt})`)

        const channels: DamiTVChannel[] = rawChannels
          .map(parseChannel)
          .filter((c: DamiTVChannel) => c.name)
          .filter((c: DamiTVChannel, i: number, arr: DamiTVChannel[]) => arr.findIndex((x: DamiTVChannel) => x.id === c.id) === i)

        // Construct tv-logo URL (no API calls needed, synchronous)
        for (const ch of channels) {
          if (!ch.countryCode) continue
          const logoUrl = lookupLogo(ch.name, ch.countryCode)
          if (logoUrl) {
            ch.logoImage = logoUrl
          }
        }

        const dayMs = msUntilEndOfDay()
        CacheService.setCache('dami-tv:channels', JSON.stringify(channels), dayMs)
        CacheService.setCache('dami-tv:channels-stale', JSON.stringify(channels), dayMs + 86400000 * 6) // keep stale for 6 more days
        console.log(`[LiveTV] Loaded ${channels.length} channels from ${base}`)
        return channels
      } catch (err: any) {
        errors.push(`${base}#${attempt}: ${err?.message || err}`)
        if (attempt < tries) await new Promise((r) => setTimeout(r, 500)) // brief backoff before retry
      }
    }
  }

  console.warn(`[LiveTV] Failed to fetch channels: ${errors.join(' | ')}`)

  // fallback: check if we have stale cached data
  const stale = CacheService.getCache('dami-tv:channels-stale')
  if (stale) {
    console.log('[LiveTV] Using stale cached channels')
    return JSON.parse(stale)
  }
  // Fail soft with an empty list so callers (IPC handlers, provider fallback,
  // merge) don't hard-error or block startup; M3U sources still provide channels.
  return []
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

function decodeObfuscatedBase64(s: string): string {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  try { return decodeURIComponent(escape(atob(s))) } catch { return atob(s) }
}

async function extractHlsUrlFromPlayerPage(playerUrl: string): Promise<string | null> {
  const headers = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 'Referer': 'https://cdnlivetv.is/' }
  // The CDN sometimes hangs a connection (stale keep-alive socket); a hard
  // timeout + one retry with a fresh connection fixes that. Without this the
  // fetch can hang forever and playback never starts.
  let html = ''
  let lastErr: any = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(playerUrl, { headers, signal: AbortSignal.timeout(10000) })
      if (!res.ok) throw new Error(`player page HTTP ${res.status}`)
      html = await res.text()
      lastErr = null
      break
    } catch (err) {
      lastErr = err
      if (attempt === 1) await new Promise((r) => setTimeout(r, 500))
    }
  }
  if (lastErr) throw lastErr

  // ponytail: regex fallback for direct .m3u8 URLs before trying JS obfuscation
  const m3u8Match = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/)
  if (m3u8Match) return m3u8Match[0]

  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)
  if (!scriptMatch) return null

  const script = scriptMatch[1]
  const fnName = script.match(/function\s+(\w+)\s*\(s\)/)?.[1]
  if (!fnName) return null

  const vars: Record<string, string> = {}
  for (const m of script.matchAll(/var\s+(\w+)\s*=\s*'([^']*)'\s*;/g)) {
    vars[m[1]] = m[2]
  }

  const lines = script.split(';')
  let best = '', bestCount = 0
  const fnEscaped = fnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (const line of lines) {
    const cnt = (line.match(new RegExp(fnEscaped + '\\(', 'g')) || []).length
    if (cnt > bestCount) { bestCount = cnt; best = line }
  }

  const refs: string[] = []
  const refRe = new RegExp(fnEscaped + '\\((\\w+)\\)', 'g')
  let r: RegExpExecArray | null
  while ((r = refRe.exec(best)) !== null) refs.push(r[1])

  return refs.map(r => decodeObfuscatedBase64(vars[r])).join('')
}

export async function extractChannelUrl(ch: { id: string; name: string; countryCode: string; playerUrl?: string }): Promise<{ hlsUrl?: string }> {
  try {
    const { name: channelName, countryCode, playerUrl } = ch
    if (!channelName) {
      console.warn(`[LiveTV] No channel name`)
      return {}
    }

    let pageUrl = playerUrl
    if (!pageUrl) {
      const { user, plan } = getCredentials()
      pageUrl = `${API_BASE}/channels/player/?name=${encodeURIComponent(channelName)}&code=${encodeURIComponent(countryCode)}&user=${encodeURIComponent(user)}&plan=${encodeURIComponent(plan)}`
    }

    console.log(`[LiveTV] Fetching player page for ${channelName}: ${pageUrl}`)
    const hlsUrl = await extractHlsUrlFromPlayerPage(pageUrl)
    if (hlsUrl) {
      console.log(`[LiveTV] Extracted HLS URL for ${channelName}: ${hlsUrl}`)
      return { hlsUrl }
    }

    console.warn(`[LiveTV] Could not extract HLS URL for ${channelName}`)
    return {}
  } catch (err) {
    console.warn(`[LiveTV] extractChannelUrl failed for ${ch.id || ch.name}:`, err)
    return {}
  }
}

import type { LiveTVProvider, LiveTVChannel as BaseLiveTVChannel, LiveTVStreamResult } from './livetv-provider.types'

export const cdnliveProvider: LiveTVProvider = {
  id: 'cdnlive',
  label: 'CDNLive',

  async getChannels(): Promise<BaseLiveTVChannel[]> {
    const channels = await getChannels()
    return channels.map(ch => ({ ...ch, provider: 'cdnlive' as const }))
  },

  async extractUrl(ch: { id: string; name: string; countryCode: string; playerUrl?: string }): Promise<LiveTVStreamResult> {
    const result = await extractChannelUrl(ch)
    return { hlsUrl: result.hlsUrl, error: result.hlsUrl ? undefined : 'No playable source found' }
  },
}

