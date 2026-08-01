/**
 * Channel-name cleanup shared by main (M3U dedup/normalize) and renderer
 * (display names in LiveTV/EPG merged lists).
 *
 * Rules:
 *  - Strip trailing quality/feed tokens (HD, FHD, SD, UHD, 4K, EAST, ...)
 *    longest-first, multi-pass, case-insensitive. A single-character result
 *    is still valid ("A -UHD" -> "A").
 *  - Convert word-joining dashes to spaces ("Nat-Geo" -> "Nat Geo") so
 *    "Nat-Geo" and "Nat Geo" merge. Names starting with a digit are left
 *    alone so titles like "24/7 The X-Files" keep their hyphens.
 *
 * ponytail: aggressive stripping. Trade-off: a real channel literally named
 * "HD" gets misclassified as the quality token. Acceptable risk vs the
 * 70k-channel dumps where noise dominates. If this ever needs to live in
 * exactly one import graph, move it to a proper shared package.
 */

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
      // Don't strip if result would be empty/whitespace, but allow 1 char so
      // single-letter channel names ("A", "X") still get suffixes removed.
      if (stripped.length >= 1) return stripped
    }
  }
  return s
}

export function cleanChannelName(name: string): string {
  if (!name) return ''
  let s = name.trim()
  for (let i = 0; i < 3; i++) {
    const before = s
    s = stripTrailingToken(s, ALL_TOKENS)
    if (s === before) break
  }
  s = s.replace(/\s*backup\s*[a-z]?\s*$/i, '').trim()
  if (!/^\d/.test(s)) {
    s = s.replace(/(?<=[A-Za-z])-(?=[A-Za-z])/g, ' ')
  }
  s = s.replace(/\s+/g, ' ').trim()
  return s || name
}

/** Normalize a name for dedup keys: clean + lowercase + collapse spaces. */
export function channelKey(name: string): string {
  return cleanChannelName(name).toLowerCase()
}
