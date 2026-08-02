// Channel logo fallback service.
// Looks up logos from the tv-logo/tv-logos GitHub repo when CDN/M3U logos
// are missing. Caches resolved URLs (and misses) to disk to avoid repeat
// HEAD requests across app restarts.

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'

const CACHE_PATH = () => path.join(app.getPath('userData'), 'channel-logo-cache.json')
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const HEAD_TIMEOUT_MS = 8000

interface CacheEntry {
  url: string
  ok: boolean
  ts: number
}

type Cache = Record<string, CacheEntry>

let cache: Cache | null = null

// Per-URL verification cache for the logo picker (avoids repeat HEAD checks).
const urlOkCache = new Map<string, boolean>()

function loadCache(): Cache {
  if (cache) return cache
  try {
    if (fs.existsSync(CACHE_PATH())) {
      cache = JSON.parse(fs.readFileSync(CACHE_PATH(), 'utf-8'))
    } else {
      cache = {}
    }
  } catch {
    cache = {}
  }
  return cache!
}

function saveCache(): void {
  try {
    fs.writeFileSync(CACHE_PATH(), JSON.stringify(cache, null, 2))
  } catch {
    /* ignore */
  }
}

function cacheKey(channelName: string, countryCode: string): string {
  return `${channelName.toLowerCase().trim()}|${countryCode.toLowerCase()}`
}

// Replicate the renderer slug logic so we can build URLs without IPC for the cache
const COUNTRY_SLUG: Record<string, string> = {
  gb: 'united-kingdom', uk: 'united-kingdom',
  us: 'united-states',
  ca: 'canada', au: 'australia', nz: 'new-zealand', ie: 'ireland',
  fr: 'france', de: 'germany', es: 'spain', it: 'italy', pt: 'portugal',
  nl: 'netherlands', be: 'belgium', se: 'sweden', no: 'norway',
  dk: 'denmark', fi: 'finland', pl: 'poland', gr: 'greece', tr: 'turkey',
  ru: 'russia', ua: 'ukraine', ro: 'romania', in: 'india', jp: 'japan',
  kr: 'south-korea', cn: 'china', hk: 'hong-kong', tw: 'taiwan',
  sg: 'singapore', my: 'malaysia', th: 'thailand', ph: 'philippines',
  id: 'indonesia', vn: 'vietnam', br: 'brazil', mx: 'mexico',
  ar: 'argentina', cl: 'chile', co: 'colombia', pe: 'peru',
  za: 'south-africa', ae: 'united-arab-emirates', il: 'israel',
  int: 'international',
}

const ALT_SLUGS: Record<string, string[]> = {
  kr: ['south-korea', 'korea'],
  eg: ['albania', 'international'],
  sa: ['albania', 'international'],
  ng: ['albania', 'international'],
  ke: ['albania', 'international'],
  pk: ['albania', 'international'],
  bd: ['albania', 'international'],
  lk: ['albania', 'international'],
  qa: ['albania', 'international'],
  kw: ['albania', 'international'],
}

// Repo files use the original 2-letter code as suffix (gb -> "uk"):
// united-kingdom/sky-news-uk.png, united-states/cnn-us.png
const COUNTRY_SUFFIX: Record<string, string> = {
  gb: 'uk', uk: 'uk', us: 'us', ca: 'ca', au: 'au', fr: 'fr', de: 'de',
  es: 'es', it: 'it', pt: 'pt', nl: 'nl', be: 'be', se: 'se', no: 'no',
  dk: 'dk', fi: 'fi', ie: 'ie', nz: 'nz', ru: 'ru', ua: 'ua', pl: 'pl',
  in: 'in', jp: 'jp', kr: 'kr', cn: 'cn', hk: 'hk', tw: 'tw', sg: 'sg',
  my: 'my', th: 'th', ph: 'ph', id: 'id', vn: 'vn', br: 'br', mx: 'mx',
  ar: 'ar', cl: 'cl', co: 'co', pe: 'pe', za: 'za', ae: 'ae', il: 'il',
}

function channelSlug(name: string): string {
  if (!name) return ''
  let s = name.trim().toLowerCase()
  s = s.replace(/^[a-z]{2,3}\s*[:|\-]\s*/, '')
  s = s.replace(/[^a-z0-9]+/g, '-')
  s = s.replace(/-+/g, '-')
  s = s.replace(/^-+|-+$/g, '')
  return s
}

function detectPrefix(name: string): string {
  if (!name) return ''
  const m = name.trim().toLowerCase().match(/^([a-z]{2,3})\s*[:|\-]/)
  return m ? m[1] : ''
}

function buildCandidates(channelName: string, countryCode: string): string[] {
  const slug = channelSlug(channelName)
  if (!slug) return []
  const c = loadCache() // unused, but ensures cache is loaded

  const alts = ALT_SLUGS[countryCode] ?? []
  const primary = COUNTRY_SLUG[countryCode] || alts[0] || 'international'
  const folders = Array.from(new Set([primary, ...alts].filter(Boolean)))
  const prefix = detectPrefix(channelName)
  const suffix = COUNTRY_SUFFIX[countryCode] || countryCode
  const suffixes = Array.from(new Set([suffix, countryCode, prefix].filter(Boolean)))

  const urls: string[] = []
  for (const folder of folders) {
    for (const suffix of suffixes) {
      urls.push(`https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/${folder}/${slug}-${suffix}.png`)
    }
    urls.push(`https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/${folder}/${slug}.png`)
    for (const suffix of suffixes) {
      urls.push(`https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/${folder}/${suffix}-${slug}.png`)
    }
  }
  return urls
}

/**
 * HEAD-check a URL by following redirects up to 5 hops.
 * Returns true if the final response is 200.
 */
function headOk(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    let hops = 0
    const tryUrl = (u: string) => {
      const req = https.request(
        u,
        { method: 'HEAD', timeout: HEAD_TIMEOUT_MS, headers: { 'User-Agent': 'Fynix-Media-Hub/2.0' } },
        (res) => {
          if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hops < 5) {
            hops++
            tryUrl(res.headers.location)
            return
          }
          resolve(res.statusCode === 200)
        }
      )
      req.on('error', () => resolve(false))
      req.on('timeout', () => { req.destroy(); resolve(false) })
      req.end()
    }
    tryUrl(url)
  })
}

/**
 * Resolve a logo URL for a channel. Returns the first working URL, or ''.
 * Caches the result so subsequent calls are fast.
 */
export async function resolveChannelLogo(channelName: string, countryCode: string): Promise<string> {
  if (!channelName || !countryCode) return ''
  const c = loadCache()
  const key = cacheKey(channelName, countryCode)
  const entry = c[key]
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) {
    return entry.ok ? entry.url : ''
  }

  const candidates = buildCandidates(channelName, countryCode)
  let resolved = ''
  for (const url of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      if (await headOk(url)) {
        resolved = url
        break
      }
    } catch {
      /* continue */
    }
  }
  c[key] = { url: resolved, ok: !!resolved, ts: Date.now() }
  saveCache()
  return resolved
}

/**
 * Verify which of the given logo URLs actually exist (HEAD check), returning
 * only the working ones. Uses a per-URL cache so repeat lookups are instant.
 * Used by the logo picker so fuzzy-matched candidates only show real logos.
 */
export async function verifyLogoUrls(urls: string[]): Promise<string[]> {
  const ok: string[] = []
  for (const url of urls) {
    if (!url) continue
    let good = urlOkCache.get(url)
    if (good === undefined) {
      try {
        // eslint-disable-next-line no-await-in-loop
        good = await headOk(url)
      } catch {
        good = false
      }
      urlOkCache.set(url, good)
    }
    if (good) ok.push(url)
  }
  return ok
}

/**
 * Pre-warm the cache for a batch of channels. Used after Settings change or app start.
 */
export async function prewarmChannelLogos(channels: { name: string; countryCode: string }[]): Promise<void> {
  for (const ch of channels) {
    if (!ch.name || !ch.countryCode) continue
    try {
      // eslint-disable-next-line no-await-in-loop
      await resolveChannelLogo(ch.name, ch.countryCode)
    } catch {
      /* ignore */
    }
  }
}

/**
 * Clear the cache (debug / "force refresh" use case).
 */
export function clearChannelLogoCache(): void {
  cache = {}
  try {
    if (fs.existsSync(CACHE_PATH())) fs.unlinkSync(CACHE_PATH())
  } catch {
    /* ignore */
  }
}
