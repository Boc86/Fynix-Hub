// Country code detection for IPTV channel names
// Used by Settings ChannelSelector, LiveTV, and EPG to identify channels
// that have prefix format like "UK: SKY NEWS" or "US | CNN".

import { cleanChannelName } from '@/shared/cleanChannelName'

const CC_MAP: Record<string, string> = {
  'uk': 'gb', 'gb': 'gb', 'us': 'us', 'ca': 'ca', 'au': 'au', 'nz': 'nz',
  'ie': 'ie', 'fr': 'fr', 'de': 'de', 'es': 'es', 'it': 'it', 'pt': 'pt',
  'nl': 'nl', 'be': 'be', 'se': 'se', 'no': 'no', 'dk': 'dk', 'fi': 'fi',
  'pl': 'pl', 'gr': 'gr', 'tr': 'tr', 'ru': 'ru', 'ua': 'ua', 'ro': 'ro',
  'in': 'in', 'jp': 'jp', 'kr': 'kr', 'cn': 'cn', 'hk': 'hk', 'tw': 'tw',
  'sg': 'sg', 'my': 'my', 'th': 'th', 'ph': 'ph', 'id': 'id', 'vn': 'vn',
  'br': 'br', 'mx': 'mx', 'ar': 'ar', 'cl': 'cl', 'co': 'co', 'pe': 'pe',
  'za': 'za', 'eg': 'eg', 'ng': 'ng', 'ke': 'ke', 'ae': 'ae', 'sa': 'sa',
  'il': 'il', 'pk': 'pk', 'bd': 'bd', 'lk': 'lk', 'qa': 'qa', 'kw': 'kw',
}

export const COUNTRY_NAMES: Record<string, string> = {
  gb: 'UK', us: 'US', ca: 'Canada', au: 'Australia', nz: 'New Zealand',
  ie: 'Ireland', fr: 'France', de: 'Germany', es: 'Spain', it: 'Italy',
  pt: 'Portugal', nl: 'Netherlands', be: 'Belgium', se: 'Sweden', no: 'Norway',
  dk: 'Denmark', fi: 'Finland', pl: 'Poland', gr: 'Greece', tr: 'Turkey',
  ru: 'Russia', ua: 'Ukraine', ro: 'Romania', in: 'India', jp: 'Japan',
  kr: 'South Korea', cn: 'China', hk: 'Hong Kong', tw: 'Taiwan', sg: 'Singapore',
  my: 'Malaysia', th: 'Thailand', ph: 'Philippines', id: 'Indonesia', vn: 'Vietnam',
  br: 'Brazil', mx: 'Mexico', ar: 'Argentina', cl: 'Chile', co: 'Colombia',
  pe: 'Peru', za: 'South Africa', eg: 'Egypt', ng: 'Nigeria', ke: 'Kenya',
  ae: 'UAE', sa: 'Saudi Arabia', il: 'Israel', pk: 'Pakistan', bd: 'Bangladesh',
  lk: 'Sri Lanka', qa: 'Qatar', kw: 'Kuwait',
}

/**
 * Detect ISO country code from a channel name prefix.
 * Handles formats like "UK: SKY NEWS", "US | CNN", "DE - ZDF".
 * Returns empty string if no country code is detected.
 */
export function detectCountryCode(name: string): string {
  if (!name) return ''
  const cleaned = name.trim().toUpperCase()
  const prefixMatch = cleaned.match(/^([A-Z]{2,3})[\s:\|]+/)
  if (prefixMatch) {
    const code = prefixMatch[1].toLowerCase()
    if (CC_MAP[code]) return CC_MAP[code]
  }
  return ''
}

/**
 * Extract the raw 2-letter prefix from a channel name (e.g. "UK" from "UK: BBC ONE")
 * without normalizing to ISO code. Returns empty string if no prefix detected.
 */
export function detectPrefixCode(name: string): string {
  if (!name) return ''
  const m = name.trim().toUpperCase().match(/^([A-Z]{2,3})[\s:\|]+/)
  return m ? m[1].toLowerCase() : ''
}

/**
 * Strip the country code prefix from a channel name.
 * "UK: BBC ONE" -> "BBC ONE"
 * "US | CNN" -> "CNN"
 * "DE - ZDF" -> "ZDF"
 * "BBC One" -> "BBC One" (unchanged when no prefix)
 *
 * ':' / '|' separators may be glued or spaced. A dash separator only counts
 * with whitespace after it ("DE - ZDF"); a glued dash ("Nat-Geo",
 * "24/7 Spider-Man") is part of the channel name, not a prefix.
 */
export function stripCountryPrefix(name: string): string {
  if (!name) return ''
  const stripped = name
    .replace(/^[A-Za-z]{2,3}\s*[:|]\s*/, '')
    .replace(/^[A-Za-z]{2,3}\s*-\s+/, '')
    .trim()
  return stripped || name
}

/**
 * Build a normalized channel key for deduplication.
 * Strips country prefix first so "UK: BBC ONE" and "BBC ONE" merge, then
 * runs the shared cleaner so "Nat-Geo" and "Nat Geo" (and "BBC One HD" vs
 * "BBC One") collapse to the same key.
 */
export function channelKey(name: string): string {
  return cleanChannelName(stripCountryPrefix(name)).toLowerCase()
}

/**
 * Build a display name without the country prefix.
 * Always strips the prefix even when no country code matches, because channels
 * with a malformed prefix ("FR : TF1") should still display as "TF1".
 */
export function displayName(name: string): string {
  return stripCountryPrefix(name)
}
