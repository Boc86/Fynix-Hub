// Main-side merged channel list (CDN + M3U).
//
// The raw M3U payload is ~728k rows / 475k unique channels. The renderer used
// to receive all of it over IPC and merge on the UI thread — every
// LiveTV/EPG/Settings entry froze the window for seconds. Now:
//  1. The merge runs HERE, chunked with setImmediate yields so the main
//     process never blocks (warmed in the background at app startup).
//  2. The renderer receives a bounded slice (CDN channels first, then M3U by
//     country+name, plus any curated ids) — enough to browse instantly.
//  3. Search runs against the FULL list here (`searchMergedChannels`) so
//     Settings can still find and curate any of the 475k channels.
import { getProvider } from './livetv-providers'
import { getAllM3UChannels } from './iptv-m3u.service'
import { cleanChannelName } from '@/shared/cleanChannelName'
import {
  detectCountryCode,
  COUNTRY_NAMES,
  channelKey,
  displayName,
} from '../../renderer/utils/countryCode'
import * as EpgService from './epg.service'

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

/** How many channels the renderer receives in one go (CDN + top M3U by country/name). */
const RENDERER_CAP = 15000

let mergedCache: MergedChannel[] | null = null
let mergedInflight: Promise<MergedChannel[]> | null = null
let warmStarted = false

/** Yield to the event loop every `chunk` items so 475k-channel loops never freeze main. */
async function forEachChunked<T>(arr: T[], chunk: number, fn: (item: T) => void): Promise<void> {
  for (let i = 0; i < arr.length; i += chunk) {
    const end = Math.min(i + chunk, arr.length)
    for (let j = i; j < end; j++) fn(arr[j])
    if (end < arr.length) await new Promise((r) => setImmediate(r))
  }
}

/** Kick off the merged-channel pipeline at startup, in the background. */
export function warmMergedChannels(): void {
  if (warmStarted) return
  warmStarted = true
  getMergedChannels().catch((err: any) => {
    console.log('[Channels] warm merge failed:', err?.message || err)
    warmStarted = false // allow retry on next request
  })
}

export function invalidateMergedChannels(): void {
  mergedCache = null
}

/** Full merged list (cached for the session, built chunked + async). */
export async function getMergedChannels(): Promise<MergedChannel[]> {
  if (mergedCache) return mergedCache
  if (!mergedInflight) {
    mergedInflight = doMerge()
      .then((d) => {
        mergedCache = d
        return d
      })
      .catch((err) => {
        if (mergedCache) return mergedCache
        throw err
      })
      .finally(() => {
        mergedInflight = null
      })
  }
  return mergedInflight
}

/** Bounded list for the renderer: CDN first, then M3U by country+name, plus curated ids. */
export async function getMergedChannelsForRenderer(includeIds: string[] = []): Promise<{
  channels: MergedChannel[]
  total: number
  truncated: boolean
}> {
  const all = await getMergedChannels()
  const capped = cappedSlice(all, includeIds || [])
  return { channels: capped, total: all.length, truncated: capped.length < all.length }
}

/** CDN first, then M3U by country+name, plus curated ids — capped at RENDERER_CAP. */
function cappedSlice(all: MergedChannel[], includeIds: string[]): MergedChannel[] {
  const extra = new Set(includeIds)
  const capped: MergedChannel[] = []
  for (const ch of all) {
    if (ch.sources.includes('cdnlive') || extra.has(ch.id)) capped.push(ch)
    if (capped.length >= RENDERER_CAP) break
  }
  if (capped.length < RENDERER_CAP) {
    for (const ch of all) {
      if (capped.length >= RENDERER_CAP) break
      if (!ch.sources.includes('cdnlive') && !extra.has(ch.id)) capped.push(ch)
    }
  }
  return capped
}

/** Full-list name search (Settings can find any of the 475k channels). */
export async function searchMergedChannels(query: string, limit = 300): Promise<MergedChannel[]> {
  const all = await getMergedChannels()
  const q = (query || '').toLowerCase().trim()
  if (!q) return []
  const out: MergedChannel[] = []
  for (const ch of all) {
    if (ch.name.toLowerCase().includes(q)) {
      out.push(ch)
      if (out.length >= limit) break
    }
  }
  return out
}

async function doMerge(): Promise<MergedChannel[]> {
  const [cdnChs, m3uChs] = await Promise.all([
    getProvider('cdnlive').getChannels().catch(() => [] as any[]),
    getAllM3UChannels().catch(() => [] as any[]),
  ])

  const map = new Map<string, MergedChannel>()

  // CDN (MAD TITAN) channels first — small, high-quality, keep everything.
  for (const ch of (cdnChs || []) as any[]) {
    if (!ch || !ch.name) continue
    const key = channelKey(ch.name)
    map.set(key, {
      id: ch.id || key,
      name: cleanChannelName(displayName(ch.name)),
      logo: ch.image || '',
      logoImage: ch.logoImage || '',
      countryCode: ch.countryCode || '',
      countryName: ch.countryName || (ch.countryCode ? COUNTRY_NAMES[ch.countryCode] || ch.countryCode.toUpperCase() : ''),
      sources: ['cdnlive'],
    })
  }

  // M3U portals (Reddit-scraped Xtream) — chunked so main stays responsive.
  await forEachChunked(m3uChs || [], 3000, (ch: any) => {
    if (!ch || !ch.name) return
    const key = channelKey(ch.name)
    const cc = detectCountryCode(ch.name) || ''
    const m3uLogo = ch.logo || ''
    const existing = map.get(key)
    if (existing) {
      if (!existing.sources.includes('m3u')) existing.sources.push('m3u')
      if (!existing.countryCode && cc) {
        existing.countryCode = cc
        existing.countryName = COUNTRY_NAMES[cc] || cc.toUpperCase()
      }
      if (m3uLogo) existing.m3uLogo = m3uLogo
      if (!existing.logo && m3uLogo) existing.logo = m3uLogo
    } else {
      map.set(key, {
        id: ch.id || key,
        name: cleanChannelName(displayName(ch.name)),
        logo: m3uLogo || ch.image || '',
        logoImage: m3uLogo,
        m3uLogo,
        countryCode: cc,
        countryName: COUNTRY_NAMES[cc] || (cc ? cc.toUpperCase() : ''),
        sources: ['m3u'],
      })
    }
  })

  const merged = Array.from(map.values())

  // Sort: CDN first, then by country + name (the renderer cap takes the head).
  merged.sort((a, b) => {
    const aCdn = a.sources.includes('cdnlive') ? 0 : 1
    const bCdn = b.sources.includes('cdnlive') ? 0 : 1
    if (aCdn !== bCdn) return aCdn - bCdn
    if (a.countryCode !== b.countryCode) return a.countryCode.localeCompare(b.countryCode)
    return a.name.localeCompare(b.name)
  })

  // Channel map (EPG icons + EPG grid) — built over the BOUNDED slice the
  // renderer actually receives. Matching all 475k channels against the EPG DB
  // is ~1.4B iterations (minutes of churn) even chunked; the renderer slice
  // covers every channel any screen can display. Chunked + fingerprint-set so
  // later EPG opens skip the rebuild.
  try {
    const capped = cappedSlice(merged, [])
    await EpgService.buildChannelMapAsync(
      capped.map((ch) => ({ id: ch.id, name: ch.name, countryCode: ch.countryCode }))
    )
    const mapped = EpgService.getMappedChannels(
      capped.map((ch) => ({
        id: ch.id,
        name: ch.name,
        image: ch.logo,
        logoImage: ch.logoImage,
        countryCode: ch.countryCode,
        playerUrl: '',
      }))
    )
    const iconById = new Map(mapped.map((m) => [m.liveTvChannelId, m.icon || '']))
    for (const ch of capped) {
      const icon = iconById.get(ch.id)
      if (icon) ch.epgIcon = icon
    }
  } catch (err: any) {
    console.log('[Channels] EPG icon mapping skipped:', err?.message || err)
  }

  console.log(`[Channels] Merged ${merged.length} channels (${cdnChs?.length || 0} CDN)`)
  return merged
}
