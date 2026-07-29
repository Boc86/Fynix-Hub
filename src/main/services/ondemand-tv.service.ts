import type { LiveTVProvider, LiveTVChannel, LiveTVStreamResult } from './livetv-provider.types'

const API_BASE = 'https://ondemand.st/api'
// ponytail: exact endpoints TBD — probe https://ondemand.st/api-docs
// This adapter is a scaffold. Adjust endpoints/format after probing the actual API.

function detectCountryCode(name: string): string {
  const t = ' ' + name.toLowerCase() + ' '
  const CC_MAP: [string, string][] = [
    ['united states', 'us'], ['usa', 'us'], [' uk', 'gb'], ['britain', 'gb'],
    ['spain', 'es'], ['italy', 'it'], ['france', 'fr'], ['germany', 'de'],
    ['portugal', 'pt'], ['brazil', 'br'], ['india', 'in'], ['canada', 'ca'],
    ['australia', 'au'], ['turkey', 'tr'], ['poland', 'pl'],
  ]
  for (const [kw, code] of CC_MAP) {
    if (t.indexOf(kw) >= 0) return code
  }
  return 'intl'
}

function countryFlag(code: string): string {
  if (!code || code === 'intl') return '\uD83C\uDF0D'
  const c = code.toUpperCase()
  if (c.length !== 2) return '\uD83C\uDF0D'
  return String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65) + String.fromCodePoint(0x1F1E6 + c.charCodeAt(1) - 65)
}

export const ondemandProvider: LiveTVProvider = {
  id: 'ondemand',
  label: 'OnDemand',

  async getChannels(): Promise<LiveTVChannel[]> {
    try {
      const res = await fetch(`${API_BASE}/channels`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) throw new Error(`OnDemand channels HTTP ${res.status}`)
      const data = await res.json()
      const raw = Array.isArray(data) ? data : (data.channels || data.data || [])
      return raw.map((item: any) => {
        const name = item.name || item.title || ''
        const code = item.code || item.country || detectCountryCode(name)
        return {
          id: String(item.id || `${name}_${code}`),
          name,
          image: item.image || item.logo || '',
          logoImage: '',
          countryCode: code,
          countryName: code.toUpperCase(),
          countryFlag: countryFlag(code),
          playerUrl: item.url || item.playerUrl || '',
          source: item.source || item.category || '',
          status: item.status || '',
          provider: 'ondemand' as const,
        }
      }).filter((ch: LiveTVChannel) => ch.name)
    } catch (err: any) {
      console.warn('[OnDemand] getChannels failed:', err?.message)
      return []
    }
  },

  async extractUrl(ch: { id: string; name: string; countryCode: string; playerUrl?: string }): Promise<LiveTVStreamResult> {
    try {
      const pageUrl = ch.playerUrl || `${API_BASE}/player/${encodeURIComponent(ch.name)}`
      const res = await fetch(pageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000),
      })
      const html = await res.text()
      const m3u8Match = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/)
      if (m3u8Match) return { hlsUrl: m3u8Match[0] }
      return { error: 'No HLS URL found' }
    } catch (err: any) {
      return { error: err?.message || 'Extraction failed' }
    }
  },
}
