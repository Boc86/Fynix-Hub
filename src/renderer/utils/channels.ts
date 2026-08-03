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
  /** tvg-logo URL from the M3U playlist (optional; lower priority than CDN logo) */
  m3uLogo?: string
  /** EPG guide icon (matched by main's channel map) — shown when no CDN/M3U logo */
  epgIcon?: string
  countryCode: string
  countryName: string
  sources: string[]
}

// Session-level cache: the underlying CDN/M3U channel lists are disk-cached in
// main and only change via the daily portal scrape, so re-fetching + re-merging
// (cleanChannelName + country detection over thousands of rows) on every screen
// mount is pure waste. First caller does the work; everyone else gets the
// cached list instantly.
let mergedCache: MergedChannel[] | null = null
let mergedInflight: Promise<MergedChannel[]> | null = null

/** Invalidate the cached merged list (e.g. after a channel-source refresh). */
export function invalidateMergedChannels(): void {
  mergedCache = null
}

/**
 * Load all channels (CDN + M3U), merge by normalized name, and return
 * a deduplicated list with country codes inferred from CDN data or
 * detected from channel name prefixes (e.g. "UK: SKY NEWS" → "gb").
 *
 * The country prefix is stripped from the displayed name BEFORE
 * deduplication so that "UK: BBC ONE" and "BBC ONE" merge.
 *
 * Result is cached for the session; on fetch failure the stale cache is
 * returned if one exists.
 */
export async function loadMergedChannels(): Promise<MergedChannel[]> {
  if (mergedCache) return mergedCache
  if (!mergedInflight) {
    mergedInflight = doLoadMergedChannels()
      .then((data) => {
        mergedCache = data
        return data
      })
      .catch((err) => {
        // Stale-while-revalidate: fall back to whatever we had
        if (mergedCache) return mergedCache
        throw err
      })
      .finally(() => {
        mergedInflight = null
      })
  }
  return mergedInflight
}

async function doLoadMergedChannels(): Promise<MergedChannel[]> {
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
    const m3uLogo = (ch as any).logo || ''
    const existing = map.get(key)
    if (existing) {
      if (!existing.sources.includes('m3u')) existing.sources.push('m3u')
      if (!existing.countryCode && cc) {
        existing.countryCode = cc
        existing.countryName = COUNTRY_NAMES[cc] || cc.toUpperCase()
      }
      // M3U tvg-logo — kept as a lower-priority tier behind the CDN logo
      if (m3uLogo) existing.m3uLogo = m3uLogo
      // If CDN had no logo, M3U could provide one if the channel object has it
      if (!existing.logo && m3uLogo) {
        existing.logo = m3uLogo
      }
    } else {
      map.set(key, {
        id: ch.id || key,
        name: cleanChannelName(displayName(ch.name)),
        logo: m3uLogo || (ch as any).image || '',
        logoImage: m3uLogo,
        m3uLogo,
        countryCode: cc,
        countryName: COUNTRY_NAMES[cc] || (cc ? cc.toUpperCase() : ''),
        sources: ['m3u'],
      })
    }
  }

  const merged = Array.from(map.values())

  // Attach EPG guide icons so LiveTV and EPG resolve logos with the SAME
  // chain (CDN/M3U → EPG icon → verified GitHub fallback). Main's channel
  // map is authoritative for the name↔EPG-id match; icons key by channel id.
  try {
    const mapped = (await window.api.epg.getChannels(
      merged.map(ch => ({ id: ch.id, name: ch.name, image: ch.logo, logoImage: ch.logoImage, countryCode: ch.countryCode, playerUrl: '' })),
    )) as any[]
    const iconById = new Map(mapped.map(m => [m.liveTvChannelId, m.icon || '']))
    for (const ch of merged) {
      const icon = iconById.get(ch.id)
      if (icon) ch.epgIcon = icon
    }
  } catch {
    /* icons are a progressive enhancement — EPG data may not be loaded yet */
  }

  return merged
}
