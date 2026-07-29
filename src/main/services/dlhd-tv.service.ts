/**
 * DLHD TV Provider
 *
 * Channels are listed at https://dlhd.st/24-7-channels.php
 * Each channel has an ID. To play: https://dlhd.st/{type}/stream-{id}.php
 * where type can be: stream, cast, watch, plus, casting, player
 */

import type { LiveTVProvider, LiveTVChannel, LiveTVStreamResult } from './livetv-provider.types'

const DLHD_BASE = 'https://dlhd.st'

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

/**
 * Parse the dlhd.st/24-7-channels.php HTML to extract channel list.
 * The page contains rows with channel names and IDs.
 */
function parseChannelsHtml(html: string): { name: string; id: string }[] {
  const channels: { name: string; id: string }[] = []

  // Match: <div class="card__title">BBC One UK</div> followed by <div class="">ID: 356</div>
  const cardPattern = /<div\s+class="card__title"[^>]*>([^<]+)<\/div>\s*<div\s+class=""[^>]*>ID:\s*(\d+)/gi
  for (const match of html.matchAll(cardPattern)) {
    const name = match[1].trim()
    const id = match[2].trim()
    if (id && name && !channels.find(c => c.id === id)) {
      channels.push({ name, id })
    }
  }

  // Fallback: also check for any link to stream-NNN.php
  if (channels.length === 0) {
    const streamLinks = html.matchAll(/href="[^"]*?(?:stream|cast|watch|plus|casting|player)[^\d"]*?(\d+)\.php[^"]*"[^>]*>([^<]+)</gi)
    for (const match of streamLinks) {
      const id = match[1]
      const name = match[2].trim().replace(/\s*\(ID \d+\)\s*/g, '').trim()
      if (id && name && !channels.find(c => c.id === id)) {
        channels.push({ name, id })
      }
    }
  }

  return channels
}

/** Internal cache for DLHD channel list */
let dlhdChannels: { id: string; name: string }[] | null = null

export const dlhdProvider: LiveTVProvider = {
  id: 'dlhd',
  label: 'DLHD',

  async getChannels(): Promise<LiveTVChannel[]> {
    try {
      const res = await fetch(`${DLHD_BASE}/24-7-channels.php`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) throw new Error(`DLHD channels HTTP ${res.status}`)
      const html = await res.text()
      const raw = parseChannelsHtml(html)
      dlhdChannels = raw // Cache for extractUrl

      return raw.map((item: { name: string; id: string }) => {
        const code = detectCountryCode(item.name)
        return {
          id: item.id,
          name: item.name,
          image: '',
          logoImage: '',
          countryCode: code,
          countryName: code.toUpperCase(),
          countryFlag: countryFlag(code),
          playerUrl: `${DLHD_BASE}/watch.php?id=${item.id}`,
          source: 'DLHD',
          status: 'active',
          provider: 'dlhd' as const,
        }
      }).filter((ch: LiveTVChannel) => ch.name)
    } catch (err: any) {
      console.warn('[DLHD] getChannels failed:', err?.message)
      return []
    }
  },

  async extractUrl(ch: { id: string; name: string; countryCode: string; playerUrl?: string }): Promise<LiveTVStreamResult> {
    // Look up channel by name from DLHD's own channel list (with normalization)
    if (!dlhdChannels) {
      try { await this.getChannels() } catch {}
    }

    // Normalize for fuzzy matching: strip prefixes, normalize numbers
    const normalize = (name: string): string => {
      return name.toLowerCase()
        .replace(/^[a-z]{1,3}-?hd:\s*/i, '')
        .replace(/^[a-z]{1,3}:\s*/i, '')
        .replace(/\s*(?:hd|fhd|uhd|sd)\s*$/i, '')
        .replace(/\.\s*$/, '')
        .replace(/\(.*?\)/g, '')
        .replace(/\s+uk\s*/gi, '')
        .replace(/\bone\b/gi, '1')
        .replace(/\btwo\b/gi, '2')
        .replace(/\bthree\b/gi, '3')
        .trim()
    }

    const normalizedQuery = normalize(ch.name)
    let dlhdMatch = dlhdChannels?.find(d => normalize(d.name) === normalizedQuery)
    if (!dlhdMatch) dlhdMatch = dlhdChannels?.find(d => normalize(d.name).includes(normalizedQuery))
    if (!dlhdMatch) dlhdMatch = dlhdChannels?.find(d => d.name.toLowerCase().includes(ch.name.toLowerCase()))

    if (!dlhdMatch) {
      console.warn(`[DLHD] No matching channel found for "${ch.name}" in DLHD list`)
      return { error: `Channel "${ch.name}" not found on DLHD` }
    }

    console.log(`[DLHD] Matched "${ch.name}" → DLHD channel "${dlhdMatch.name}" (id: ${dlhdMatch.id})`)
    // Return the watch.php URL — the DLHD window will extract the embed iframe from it
    return { hlsUrl: `${DLHD_BASE}/watch.php?id=${dlhdMatch.id}` }
  },
}
