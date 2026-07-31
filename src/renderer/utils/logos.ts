// Builds candidate logo URLs from the tv-logo/tv-logos GitHub repo.
// Repo: https://github.com/tv-logo/tv-logos/tree/main/countries
// Channel files live under: countries/<country-slug>/<channel-slug>-<country>.png

const COUNTRY_SLUG: Record<string, string> = {
  gb: 'united-kingdom', uk: 'united-kingdom',
  us: 'united-states',
  ca: 'canada',
  au: 'australia',
  nz: 'new-zealand',
  ie: 'ireland',
  fr: 'france',
  de: 'germany',
  es: 'spain',
  it: 'italy',
  pt: 'portugal',
  nl: 'netherlands',
  be: 'belgium',
  se: 'sweden',
  no: 'norway',
  dk: 'denmark',
  fi: 'finland',
  pl: 'poland',
  gr: 'greece',
  tr: 'turkey',
  ru: 'russia',
  ua: 'ukraine',
  ro: 'romania',
  in: 'india',
  jp: 'japan',
  kr: 'south-korea', // try "south-korea" first, fallback below
  cn: 'china',
  hk: 'hong-kong',
  tw: 'taiwan',
  sg: 'singapore',
  my: 'malaysia',
  th: 'thailand',
  ph: 'philippines',
  id: 'indonesia',
  vn: 'vietnam',
  br: 'brazil',
  mx: 'mexico',
  ar: 'argentina',
  cl: 'chile',
  co: 'colombia',
  pe: 'peru',
  za: 'south-africa',
  eg: 'albania', // fall-through, epg.pw doesn't ship EG folder in tv-logos
  ng: 'albania',
  ke: 'albania',
  ae: 'united-arab-emirates',
  sa: 'albania', // no sa folder
  il: 'israel',
  pk: 'albania',
  bd: 'albania',
  lk: 'albania',
  qa: 'albania',
  kw: 'albania',
  int: 'international',
}

const COUNTRY_SLUG_ALT: Record<string, string[]> = {
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

/**
 * Convert a channel display name into a file slug.
 * - Lowercase
 * - Strip country prefix like "UK: " or "US | "
 * - Replace non-alphanumeric runs with a single hyphen
 * - Trim leading/trailing hyphens
 *
 * Examples:
 *   "UK: SKY NEWS"          -> "sky-news"
 *   "US | CNN"              -> "cnn"
 *   "BBC One"               -> "bbc-one"
 *   "Sky Cinema 5*Star"     -> "sky-cinema-5-star"
 */
export function channelSlug(name: string): string {
  if (!name) return ''
  let s = name.trim().toLowerCase()
  // Strip country prefix "UK: " / "US|" / "DE -" etc.
  s = s.replace(/^[a-z]{2,3}\s*[:|\-]\s*/, '')
  // Replace non-alphanumeric with hyphen
  s = s.replace(/[^a-z0-9]+/g, '-')
  // Collapse multiple hyphens
  s = s.replace(/-+/g, '-')
  // Trim hyphens
  s = s.replace(/^-+|-+$/g, '')
  return s
}

/**
 * Try to extract the original 2-letter country code from a channel name prefix.
 * "UK: SKY NEWS" -> "uk"
 * "US | CNN"     -> "us"
 * Returns empty string if no prefix detected.
 */
export function detectChannelPrefix(name: string): string {
  if (!name) return ''
  const m = name.trim().toLowerCase().match(/^([a-z]{2,3})\s*[:|\-]/)
  return m ? m[1] : ''
}

const BASE_URL = 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries'

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

/**
 * Return all candidate logo URLs for a channel, in priority order.
 * The first resolvable URL is what gets used.
 */
export function candidateLogoUrls(channelName: string, countryCode: string): string[] {
  const slug = channelSlug(channelName)
  if (!slug) return []

  const slugs = COUNTRY_SLUG_ALT[countryCode] ?? []
  const primary = COUNTRY_SLUG[countryCode] || slugs[0] || 'international'
  const folderCandidates = Array.from(new Set([primary, ...slugs].filter(Boolean)))

  // Suffix candidates — the repo uses the original 2-letter code from the
  // channel name (or the country's conventional suffix), not the ISO code.
  const prefixSuffix = detectChannelPrefix(channelName)
  const suffix = COUNTRY_SUFFIX[countryCode] || countryCode
  const suffixCandidates = Array.from(new Set([suffix, countryCode, prefixSuffix].filter(Boolean)))

  const urls: string[] = []
  for (const folder of folderCandidates) {
    for (const suffix of suffixCandidates) {
      // Most common pattern: <channel-slug>-<country-code>.png
      urls.push(`${BASE_URL}/${folder}/${slug}-${suffix}.png`)
    }
    // Without suffix as final fallback per folder
    urls.push(`${BASE_URL}/${folder}/${slug}.png`)
    // Folder-prefix variant: <country>-<channel-slug>.png
    for (const suffix of suffixCandidates) {
      urls.push(`${BASE_URL}/${folder}/${suffix}-${slug}.png`)
    }
  }
  return urls
}

/**
 * Get a single best-guess logo URL (first candidate).
 * Use candidateLogoUrls + a HEAD check for reliability.
 */
export function bestLogoUrl(channelName: string, countryCode: string): string {
  return candidateLogoUrls(channelName, countryCode)[0] || ''
}

/**
 * Convert a pasted GitHub URL into a directly-loadable image URL.
 *
 * Handles:
 *   https://github.com/owner/repo/blob/main/countries/x.png
 *     -> https://raw.githubusercontent.com/owner/repo/main/countries/x.png
 *   https://github.com/owner/repo/raw/main/countries/x.png
 *     -> https://raw.githubusercontent.com/owner/repo/main/countries/x.png
 *   https://raw.githubusercontent.com/...          (unchanged)
 *   anything else                                  (unchanged)
 *
 * GitHub blob pages render HTML, not the image — <img> tags can't load them,
 * so this rewrite makes pasted GitHub logo links work in the custom logo box.
 */
export function normalizeLogoUrl(url: string): string {
  if (!url) return ''
  const trimmed = url.trim()
  const m = trimmed.match(
    /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/(blob|raw)\/(.+)$/i,
  )
  if (m) {
    const [, owner, repo, kind, path] = m
    if (kind.toLowerCase() === 'blob' || kind.toLowerCase() === 'raw') {
      return `https://raw.githubusercontent.com/${owner}/${repo}/${path}`
    }
  }
  return trimmed
}

export { COUNTRY_SLUG, BASE_URL as LOGO_BASE_URL }
