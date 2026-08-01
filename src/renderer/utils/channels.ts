// Shared channel loading logic for Settings, LiveTV, and EPG.
// Loads CDN channels and M3U channels and merges them by name,
// applying country code detection for M3U-only channels.

import { detectCountryCode, COUNTRY_NAMES, channelKey, displayName } from './countryCode'
import { cleanChannelName } from '@/shared/cleanChannelName'

export interface MergedChannel {
  id: string
  name: string
  /** Logo URL provided by CDN (best quality) */
  logo: string
  /** tv-logo fallback URL computed in main process */
  logoImage: string
  countryCode: string
  countryName: string
  sources: string[]
}

/**
 * Load all channels (CDN + M3U), merge by normalized name, and return
 * a deduplicated list with country codes inferred from CDN data or
 * detected from channel name prefixes (e.g. "UK: SKY NEWS" → "gb").
 *
 * The country prefix is stripped from the displayed name BEFORE
 * deduplication so that "UK: BBC ONE" and "BBC ONE" merge.
 */
export async function loadMergedChannels(): Promise<MergedChannel[]> {
  const [cdnChs, m3uChs] = await Promise.all([
    window.api.damiTv.getChannels('cdnlive').catch(() => []),
    window.api.iptvM3u.getAllChannels().catch(() => []),
  ])

  const map = new Map<string, MergedChannel>()

  // CDN first — provides logos and authoritative country codes
  for (const ch of (cdnChs || []) as any[]) {
    if (!ch || !ch.name) continue
    const key = channelKey(ch.name)
    map.set(key, {
      id: ch.id || key,
      name: cleanChannelName(displayName(ch.name)),
      // Real CDN logo only — logoImage is an unverified tv-logos guess
      // from the main process and should NOT be treated as the primary
      logo: ch.image || '',
      logoImage: ch.logoImage || '',
      countryCode: ch.countryCode || '',
      countryName: ch.countryName || (ch.countryCode ? (COUNTRY_NAMES[ch.countryCode] || ch.countryCode.toUpperCase()) : ''),
      sources: ['cdnlive'],
    })
  }

  // M3U — fill in missing channels and merge sources
  for (const ch of (m3uChs || []) as any[]) {
    if (!ch || !ch.name) continue
    const key = channelKey(ch.name)
    const cc = detectCountryCode(ch.name) || ''
    const existing = map.get(key)
    if (existing) {
      if (!existing.sources.includes('m3u')) existing.sources.push('m3u')
      if (!existing.countryCode && cc) {
        existing.countryCode = cc
        existing.countryName = COUNTRY_NAMES[cc] || cc.toUpperCase()
      }
      // If CDN had no logo, M3U could provide one if the channel object has it
      if (!existing.logo && (ch as any).logo) {
        existing.logo = (ch as any).logo
      }
    } else {
      map.set(key, {
        id: ch.id || key,
        name: cleanChannelName(displayName(ch.name)),
        logo: (ch as any).logo || (ch as any).image || '',
        logoImage: '',
        countryCode: cc,
        countryName: COUNTRY_NAMES[cc] || (cc ? cc.toUpperCase() : ''),
        sources: ['m3u'],
      })
    }
  }

  return Array.from(map.values())
}
