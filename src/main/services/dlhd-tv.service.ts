import type { LiveTVProvider, LiveTVChannel, LiveTVStreamResult } from './livetv-provider.types'

const API_BASE = 'https://dlhd.st/api'
// ponytail: exact endpoints TBD — probe https://dlhd.st/api.php

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

export const dlhdProvider: LiveTVProvider = {
  id: 'dlhd',
  label: 'DLHD',

  async getChannels(): Promise<LiveTVChannel[]> {
    try {
      const res = await fetch(`${API_BASE}.php?action=channels`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) throw new Error(`DLHD channels HTTP ${res.status}`)
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
          playerUrl: item.url || item.playerUrl || item.embed || '',
          source: item.source || item.category || '',
          status: item.status || '',
          provider: 'dlhd' as const,
        }
      }).filter((ch: LiveTVChannel) => ch.name)
    } catch (err: any) {
      console.warn('[DLHD] getChannels failed:', err?.message)
      return []
    }
  },

  async extractUrl(ch: { id: string; name: string; countryCode: string; playerUrl?: string }): Promise<LiveTVStreamResult> {
    try {
      const pageUrl = ch.playerUrl || `${API_BASE}.php?action=stream&id=${encodeURIComponent(ch.id)}`
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
