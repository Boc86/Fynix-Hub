// Channel name normalization for live TV channel lists.
// Strips quality/format/region suffixes that aren't part of the real
// channel name (UHD, HD, FD 50fps, EAST, BACKUP, etc.) and detects
// category-header entries (===== SPORTS =====, - - - TURKIYE - - -)
// so they can be filtered out before they appear as fake channels.
//
// Pattern catalogue (real frequency across a 70k-channel M3U dump):
//   HD      6051   FHD   3227   SD    1271   4K    664   UHD    123
//   1080p    126   720p   10    50fps   5    25fps  ~3   FD-50fps  ~3
//   EAST    ~500   WEST  ~70    BACKUP  63   BACKUP-2/3  ~20
//   prefix-hd:  177  (e.g. "US-HD: A&E", "UK-HD: SKY NEWS")
//   pure-punctuation category headers: hundreds of `=== SPORT ===` lines
//
// ponytail: regex-stripping is intentionally aggressive. If a real channel
// name genuinely ends with "HD" (e.g. a network literally named "HD"), the
// upper limit is misclassification. Acceptable risk for a 70k-channel list
// where the noise dominates.

/**
 * Returns true if the name is a category/group header line, not a channel.
 * Patterns: `===== IT SPORTS =====`, `- - - - - TURKIYE SPOR - - - - -`,
 * `========= DAZN EVENT =========`, `*GALAVISION EAST` (the leading `*`
 * marker is used by some providers as a "premium" tag — keep visible).
 */
export function isCategoryHeader(name: string): boolean {
  if (!name) return false
  const t = name.trim()
  // Surrounded entirely by punctuation (===, ---, ***, ...)
  if (/^[-=_*\s]+$/.test(t)) return true
  // `- - - - - TURKIYE SPOR - - - - -` style
  if (/^[-\s=*_]+[a-z][a-z\s]+[-\s=*_]+$/i.test(t) && /[-\s]/.test(t.slice(1, -1))) return true
  // `========= ... =========` style
  if (/^={2,}\s*.+\s*={2,}$/.test(t)) return true
  // `=== IT SPORTS ===`, `=== IT CINEMA ===`
  if (/^={2,}\s*[A-Z][A-Z\s]+\s*={2,}$/.test(t)) return true
  return false
}

// Quality/format tokens that appear as suffixes (separated by space or at end).
// Order: longest tokens FIRST so "FD 50FPS" wins before "50FPS" or "FD" can
// partially match. The trailing space-and-optional-comma handles
// "BBC ONE HD" and "BBC ONE, HD" but never eats a real word.
const ALL_TOKENS = [
  'BACKUP 2', 'BACKUP 3',
  'FD 50FPS', 'FD 25FPS', 'FD-50FPS', 'FD-25FPS',
  '1080P', '720P', 'HEVC', 'H.265', 'H265', 'H.264', 'H264', 'AVC', 'X264', 'X265',
  '4K', 'UHD', 'FHD',
  'BACKUP', 'DASH', 'MULTI', 'DUP',
  '50FPS', '25FPS', '30FPS', '60FPS',
  'HD', 'SD',
  'EAST', 'WEST',
]

function stripTrailingToken(s: string, tokens: string[]): string {
  for (const tok of tokens) {
    const re = new RegExp(`[\\s,\\-]*\\b${tok.replace(/\./g, '\\.')}\\b\\s*$`, 'i')
    if (re.test(s)) {
      const stripped = s.replace(re, '').trim()
      if (stripped.length >= 2) return stripped
    }
  }
  return s
}

/**
 * Strip quality/format/region suffixes from a channel name.
 * Returns the cleaned display name (preserves case of the remainder).
 *
 * Examples:
 *   "US-HD: A&E TV WEST"          → "US-HD: A&E TV"
 *   "BBC ONE HD"                  → "BBC ONE"
 *   "BBC ONE FHD BACKUP"          → "BBC ONE"
 *   "FR | Ligue 1 -1 HD Backup"   → "FR | Ligue 1 -1"
 *   "5USA HD"                     → "5USA"
 *   "SKY SPORTS FD 50FPS"         → "SKY SPORTS"
 */
export function cleanChannelName(name: string): string {
  if (!name) return ''
  let s = name.trim()

  // Strip trailing tokens (longest first). Multi-pass handles
  // "HD Backup FHD" → "HD Backup" → "".
  for (let i = 0; i < 3; i++) {
    const before = s
    s = stripTrailingToken(s, ALL_TOKENS)
    if (s === before) break
  }

  // Catch "Backup" with a trailing lowercase letter some providers tack on
  // (e.g. "NHL Network Backup f").
  s = s.replace(/\s*backup\s*[a-z]?\s*$/i, '').trim()

  return s || name
}

/**
 * Determine if a name is a usable channel (not a category header).
 */
export function isRealChannel(name: string): boolean {
  return !!name && !isCategoryHeader(name)
}
