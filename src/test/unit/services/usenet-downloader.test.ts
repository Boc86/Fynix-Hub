import { describe, it, expect } from 'vitest'

// parseEpisodeToken, fuzzyMatch, and formatEta are private functions in
// usenet-downloader.service.ts. We replicate the exact logic to test the
// algorithms — same as usenet-search tests.

function parseEpisodeToken(name: string): { season: number; episode: number } | null {
  const patterns = [
    /[ ._\[]s(\d{1,2})[ ._]?e(\d{1,3})/i,
    /[ ._\[](\d{1,2})x(\d{1,3})[ ._]/i,
  ]
  for (const p of patterns) {
    const m = name.match(p)
    if (m) {
      const season = parseInt(m[1], 10)
      const episode = parseInt(m[2], 10)
      if (season >= 0 && season <= 99 && episode >= 0 && episode <= 999) return { season, episode }
    }
  }
  // 4-digit fallback, reject year-like values
  const m4 = name.match(/[ ._](\d{1,2})(\d{2})[ ._]/)
  if (m4) {
    const combined = parseInt(m4[1] + m4[2], 10)
    if (combined < 1900 || combined > 2099) {
      const season = parseInt(m4[1], 10)
      const episode = parseInt(m4[2], 10)
      if (season >= 0 && season <= 99 && episode >= 0 && episode <= 999) return { season, episode }
    }
  }
  return null
}

function fuzzyMatch(search: string, target: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[._\-\[\]() ]+/g, ' ').trim()
  const searchNorm = normalize(search)
  const targetNorm = normalize(target)
  if (targetNorm.includes(searchNorm)) return true

  const searchTokens = searchNorm.split(/\s+/).filter(Boolean)
  const targetTokens = new Set(targetNorm.split(/\s+/).filter(Boolean))
  if (searchTokens.length > 1) {
    const matchCount = searchTokens.filter(t => targetTokens.has(t)).length
    if (matchCount >= Math.min(searchTokens.length, 2)) return true
  }

  let si = 0
  let prevTi = -1
  for (let ti = 0; ti < targetNorm.length && si < searchNorm.length; ti++) {
    if (targetNorm[ti] === searchNorm[si]) {
      if (prevTi >= 0 && ti - prevTi > 5) break
      prevTi = ti
      si++
    }
  }
  return si >= searchNorm.length
}

function formatEta(seconds: number): string {
  if (seconds <= 0) return ''
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

describe('parseEpisodeToken', () => {
  it('parses S01E05 format', () => {
    expect(parseEpisodeToken('Show.S01E05.720p.BluRay')).toEqual({ season: 1, episode: 5 })
  })

  it('parses S3E12 format', () => {
    expect(parseEpisodeToken('Show.S3E12.WEB-DL')).toEqual({ season: 3, episode: 12 })
  })

  it('parses SxE format (1x05)', () => {
    expect(parseEpisodeToken('Show.3x05.720p')).toEqual({ season: 3, episode: 5 })
  })

  it('parses SxxExx with spaces', () => {
    expect(parseEpisodeToken('Show S02E10 720p')).toEqual({ season: 2, episode: 10 })
  })

  it('parses SxxExx with brackets', () => {
    expect(parseEpisodeToken('[Show] S01E01 1080p')).toEqual({ season: 1, episode: 1 })
  })

  it('parses 4-digit format (0102)', () => {
    expect(parseEpisodeToken('Show.0102.720p')).toEqual({ season: 1, episode: 2 })
  })

  it('rejects year "2024" that would match 4-digit pattern as S20E24', () => {
    expect(parseEpisodeToken('Movie.2024.1080p.BluRay')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseEpisodeToken('')).toBeNull()
  })

  it('handles double-digit seasons', () => {
    expect(parseEpisodeToken('Show.S12E01.720p')).toEqual({ season: 12, episode: 1 })
  })

  it('handles triple-digit episodes', () => {
    expect(parseEpisodeToken('Show.S01E001.720p')).toEqual({ season: 1, episode: 1 })
  })
})

describe('fuzzyMatch', () => {
  it('matches exact substring', () => {
    expect(fuzzyMatch('breaking bad', 'Breaking.Bad.S01E01.720p')).toBe(true)
  })

  it('matches with normalized separators', () => {
    expect(fuzzyMatch('breaking bad', 'breaking_bad_s01e01')).toBe(true)
  })

  it('matches token overlap (2+ tokens)', () => {
    expect(fuzzyMatch('breaking bad s01', 'Breaking.Bad.S01E01.720p')).toBe(true)
  })

  it('does not match short subsequence when chars too far apart', () => {
    expect(fuzzyMatch('bbr', 'Breaking.Bad')).toBe(false)
  })

  it('does not match when consecutive chars gap > 5', () => {
    // 'bb' subsequence: b(0), b(8) — gap 8 > 5 → false
    expect(fuzzyMatch('bb', 'Breaking.Bad')).toBe(false)
  })

  it('does not match unrelated strings', () => {
    expect(fuzzyMatch('inception', 'Breaking.Bad.S01E01')).toBe(false)
  })

  it('case-insensitive', () => {
    expect(fuzzyMatch('BREAKING', 'breaking.bad')).toBe(true)
  })
})

describe('formatEta', () => {
  it('formats seconds', () => {
    expect(formatEta(30)).toBe('30s')
  })

  it('formats minutes and seconds', () => {
    expect(formatEta(90)).toBe('1m 30s')
  })

  it('formats hours and minutes', () => {
    expect(formatEta(3660)).toBe('1h 1m')
  })

  it('returns empty for zero/negative', () => {
    expect(formatEta(0)).toBe('')
    expect(formatEta(-10)).toBe('')
  })

  it('formats exact minutes', () => {
    expect(formatEta(120)).toBe('2m 0s')
  })
})

describe('getStreamUrl dir name variants', () => {
  // Replicates the dirNameVariants logic from getStreamUrl: nzbget names the
  // completed dir from the NZB filename (underscores) while the renderer title
  // may use spaces — both variants (plus the raw NZB filename base) must be
  // generated so the completed dir is found after an app restart.
  function dirNameVariants(nzbName: string, nzbFilename: string | undefined): string[] {
    const nzbSafeName = nzbName.replace(/[<>:"/\\|?*]/g, '_')
    const nzbFileBase = nzbFilename ? nzbFilename.replace(/\.nzb$/i, '') : ''
    return [
      nzbSafeName,
      nzbSafeName.replace(/ /g, '_'),
      nzbSafeName.replace(/_/g, ' '),
      nzbFileBase,
    ].filter((v, i, a) => v && a.indexOf(v) === i)
  }

  it('includes the underscore variant of a space-separated title', () => {
    const variants = dirNameVariants('Disclosure Day-2026-1080p-WEBRip-x265-10bit-5.1-YTS.GG-YTS.BZ', undefined)
    expect(variants).toContain('Disclosure_Day-2026-1080p-WEBRip-x265-10bit-5.1-YTS.GG-YTS.BZ')
  })

  it('includes the space variant of an underscore title', () => {
    const variants = dirNameVariants('Disclosure_Day-2026', undefined)
    expect(variants).toContain('Disclosure Day-2026')
  })

  it('includes the raw NZB filename base (nzbget naming)', () => {
    const variants = dirNameVariants('Disclosure Day', 'Disclosure_Day-2026-1080p.nzb')
    expect(variants).toContain('Disclosure_Day-2026-1080p')
  })

  it('deduplicates identical variants', () => {
    const variants = dirNameVariants('Same_Name', 'Same_Name.nzb')
    const unique = new Set(variants)
    expect(variants).toHaveLength(unique.size)
  })
})

describe('pathMatchesTokens (bare-dir wrong-file guard)', () => {
  // Replicates the bare-customDir guard from getStreamUrl: an unfiltered
  // recursive scan of the download dir returns whichever video readdir lists
  // first (usually the LAST completed download) — the fix name-filters hits.
  function normalizeName(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '')
  }

  function nameWords(s: string): string[] {
    return s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3)
  }

  function pathMatchesTokens(filePath: string, tokens: string[]): boolean {
    const pathNorm = normalizeName(filePath)
    return tokens.some(t => {
      const words = [...new Set(nameWords(t))]
      if (words.length === 0) return false
      const needed = words.slice(0, Math.min(2, words.length))
      return needed.every(w => pathNorm.includes(w))
    })
  }

  const tokens = ['Disclosure Day-2026-1080p-WEBRip', 'Disclosure_Day-2026-1080p-WEBRip']

  it('rejects another download in the bare dir (the reported bug)', () => {
    const otherFile = '/downloads/completed/Some_Other_Movie.2025.1080p.mkv'
    expect(pathMatchesTokens(otherFile, tokens)).toBe(false)
  })

  it('accepts the selected item in the bare dir (flat DestDir layout)', () => {
    const ownFile = '/downloads/completed/Disclosure_Day-2026-1080p-WEBRip-x265.mkv'
    expect(pathMatchesTokens(ownFile, tokens)).toBe(true)
  })

  it('accepts the selected item nested in its own subdir', () => {
    const nested = '/downloads/completed/Disclosure_Day-2026-1080p/Disclosure.Day.2026.mkv'
    expect(pathMatchesTokens(nested, tokens)).toBe(true)
  })

  it('normalizes spaces vs underscores (both token forms match)', () => {
    expect(pathMatchesTokens('/dl/completed/Disclosure Day-2026 1080p.mkv', tokens)).toBe(true)
    expect(pathMatchesTokens('/dl/completed/Disclosure_Day-2026_1080p.mkv', tokens)).toBe(true)
  })

  it('returns false with no usable tokens (never plays wrong content)', () => {
    expect(pathMatchesTokens('/downloads/completed/Any.Movie.mkv', [])).toBe(false)
  })
})

describe('findMostSpecificDirMatch (delete target resolution)', () => {
  // Replicates the deleteUsenetByPath/removeDownload candidate matcher: the
  // entry whose FinalDir/DestDir contains the file's dir, preferring the
  // LONGEST base so a shared DestDir can't shadow the per-download folder.
  function findMostSpecificDirMatch(candidates: any[], dir: string): any | null {
    const dirClean = dir.replace(/\/+$/, '').replace(/\/+/g, '/')
    return candidates
      .map((c) => ({ c, base: (c.FinalDir || c.DestDir || '').replace(/\/+$/, '').replace(/\/+/g, '/') }))
      .filter(({ base }) => base && dirClean.startsWith(base))
      .sort((a, b) => b.base.length - a.base.length)[0]?.c ?? null
  }

  it('picks the per-download folder over the shared DestDir root', () => {
    const candidates = [
      { NZBID: 1, DestDir: '/downloads/completed', FinalDir: '/downloads/completed' },
      { NZBID: 2, DestDir: '/downloads/completed/Some_Movie.2025', FinalDir: '/downloads/completed/Some_Movie.2025' },
    ]
    const dir = '/downloads/completed/Some_Movie.2025'
    expect(findMostSpecificDirMatch(candidates, dir)?.NZBID).toBe(2)
  })

  it('falls back to the shared root when no per-download folder exists (flat layout)', () => {
    const candidates = [
      { NZBID: 1, DestDir: '/downloads/completed', FinalDir: '/downloads/completed' },
    ]
    const dir = '/downloads/completed'
    expect(findMostSpecificDirMatch(candidates, dir)?.NZBID).toBe(1)
  })

  it('returns null when nothing contains the dir', () => {
    const candidates = [
      { NZBID: 1, DestDir: '/other/downloads', FinalDir: '/other/downloads' },
    ]
    expect(findMostSpecificDirMatch(candidates, '/downloads/completed/Movie')).toBeNull()
  })

  it('normalizes trailing slashes and double slashes', () => {
    const candidates = [
      { NZBID: 5, FinalDir: '/downloads/completed/Movie.2026/' },
      { NZBID: 6, DestDir: '//downloads//completed//Movie.2026' },
    ]
    expect(findMostSpecificDirMatch(candidates, '/downloads/completed/Movie.2026/')?.NZBID).toBe(5)
  })
})
