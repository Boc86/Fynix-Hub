import { describe, it, expect } from 'vitest'

// These are the pure functions from torrent-search.service.ts
// Replicated here for unit testing since they are not exported.

function normalizeUnit(u: string): string {
  return u.toUpperCase().replace('ГБ', 'GB').replace('МБ', 'MB').replace('ТБ', 'TB')
}

const SIZE_UNITS: Record<string, number> = {
  B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4,
  KIB: 1024, MIB: 1024 ** 2, GIB: 1024 ** 3, TIB: 1024 ** 4,
}

function parseSize(sizeStr: string): number {
  const cleaned = sizeStr.trim().replace(/&nbsp;/g, ' ')
  const match = cleaned.match(/^(\d[\d.,]*)\s*(B|KB|MB|GB|TB|KIB|MIB|GIB|TIB|ГБ|МБ|ТБ)$/i)
  if (!match) return 0
  return parseFloat(match[1].replace(',', '.')) * (SIZE_UNITS[normalizeUnit(match[2])] || 1)
}

function qualityFromTitle(title: string): string {
  const lower = title.toLowerCase()
  if (lower.includes('2160p') || lower.includes('4k')) return '4K'
  if (lower.includes('1080p')) return '1080p'
  if (lower.includes('720p')) return '720p'
  if (lower.includes('480p')) return '480p'
  return 'Unknown'
}

function matchesQuality(title: string, resolutions: string[]): boolean {
  if (!resolutions || resolutions.length === 0) return true
  const q = qualityFromTitle(title)
  return resolutions.includes(q)
}

function matchesLanguage(title: string, languages: string[]): boolean {
  if (!languages || languages.length === 0) return true
  const lower = title.toLowerCase()
  const tags: Record<string, string[]> = {
    english: ['english', 'eng', 'en'],
    spanish: ['spanish', 'esp', 'es', 'castellano', 'latino'],
    french: ['french', 'fr', 'fra', 'vf', 'vostfr'],
    german: ['german', 'de', 'ger', 'deutsch'],
    italian: ['italian', 'it', 'ita'],
    portuguese: ['portuguese', 'pt', 'por', 'brazilian'],
    japanese: ['japanese', 'jp', 'jap', 'jpn'],
    korean: ['korean', 'kr', 'kor'],
    chinese: ['chinese', 'cn', 'chi', 'mandarin', 'cantonese'],
    russian: ['russian', 'ru', 'rus'],
    hindi: ['hindi', 'hi'],
    arabic: ['arabic', 'ar', 'ara'],
  }
  const allKnownTags = Object.values(tags).flat()
  const hasLangTag = allKnownTags.some(t => lower.includes(t))
  if (!hasLangTag) return true
  return languages.some(lang => {
    const key = lang.toLowerCase()
    const patterns = tags[key] || [key]
    return patterns.some(p => lower.includes(p))
  })
}

function extractNum(html: string, patterns: RegExp[]): number {
  for (const p of patterns) {
    const m = p.exec(html)
    if (m) {
      const cleaned = m[1].replace(/<[^>]+>/g, '').trim()
      const n = parseInt(cleaned.replace(/,/g, ''))
      if (!isNaN(n)) return n
    }
  }
  return 0
}

function extractSeeders(html: string): number {
  return extractNum(html, [
    /<t[dh][^>]*class="[^"]*(?:seed|peers|up)[^"]*"[^>]*>([\s\S]*?)<\//i,
    /class="[^"]*seed[^"]*"[^>]*>\s*(\d[\d,]*)/i,
    /<span[^>]*class="[^"]*green[^"]*"[^>]*>(?:<b>)?\s*(\d[\d,]*)/i,
    /[Ss]\s*(\d{1,6})\s*[Ll]/,
    /👤\s*(\d+)/,
    /💾\s*(\d+)/,
    /<span[^>]*>(\d+)<\/span>/i,
    /<t[dh][^>]*>(\d+)<\//i,
  ])
}

function extractLeechers(html: string): number {
  return extractNum(html, [
    /<t[dh][^>]*class="[^"]*(?:leech|down)[^"]*"[^>]*>([\s\S]*?)<\//i,
    /class="[^"]*leech[^"]*"[^>]*>\s*(\d[\d,]*)/i,
    /<span[^>]*class="[^"]*red[^"]*"[^>]*>(?:<b>)?\s*(\d[\d,]*)/i,
    /✗\s*(\d+)/,
    /<span[^>]*>(\d+)<\/span>/i,
    /<t[dh][^>]*>(\d+)<\//i,
  ])
}

describe('Torrent Search — parseSize', () => {
  it('parses GB', () => {
    expect(parseSize('1.5 GB')).toBe(1.5 * 1024 ** 3)
  })

  it('parses MB', () => {
    expect(parseSize('500 MB')).toBe(500 * 1024 ** 2)
  })

  it('parses TB', () => {
    expect(parseSize('2 TB')).toBe(2 * 1024 ** 4)
  })

  it('parses KB', () => {
    expect(parseSize('1024 KB')).toBe(1024 * 1024)
  })

  it('parses B', () => {
    expect(parseSize('1024 B')).toBe(1024)
  })

  it('handles comma decimal', () => {
    expect(parseSize('1,5 GB')).toBeCloseTo(1.5 * 1024 ** 3)
  })

  it('handles &nbsp;', () => {
    expect(parseSize('1.5&nbsp;GB')).toBeCloseTo(1.5 * 1024 ** 3)
  })

  it('handles Cyrillic units', () => {
    expect(parseSize('1.5 ГБ')).toBeCloseTo(1.5 * 1024 ** 3)
    expect(parseSize('500 МБ')).toBeCloseTo(500 * 1024 ** 2)
    expect(parseSize('2 ТБ')).toBeCloseTo(2 * 1024 ** 4)
  })

  it('returns 0 for invalid input', () => {
    expect(parseSize('')).toBe(0)
    expect(parseSize('abc')).toBe(0)
    expect(parseSize('1.5')).toBe(0)
  })

  it('handles case-insensitive units', () => {
    expect(parseSize('1.5 gb')).toBeCloseTo(1.5 * 1024 ** 3)
    expect(parseSize('500 mb')).toBeCloseTo(500 * 1024 ** 2)
  })
})

describe('Torrent Search — qualityFromTitle', () => {
  it('detects 4K from 2160p', () => {
    expect(qualityFromTitle('Movie.2160p.BluRay.x265')).toBe('4K')
  })

  it('detects 4K from 4K keyword', () => {
    expect(qualityFromTitle('Movie.4K.HDR')).toBe('4K')
  })

  it('detects 1080p', () => {
    expect(qualityFromTitle('Movie.1080p.BluRay')).toBe('1080p')
  })

  it('detects 720p', () => {
    expect(qualityFromTitle('Movie.720p.WEB-DL')).toBe('720p')
  })

  it('detects 480p', () => {
    expect(qualityFromTitle('Movie.480p.DVD')).toBe('480p')
  })

  it('returns Unknown', () => {
    expect(qualityFromTitle('Movie.BluRay.x265')).toBe('Unknown')
  })
})

describe('Torrent Search — matchesQuality', () => {
  it('returns true for empty resolutions', () => {
    expect(matchesQuality('Movie.1080p', [])).toBe(true)
  })

  it('returns true when resolution matches', () => {
    expect(matchesQuality('Movie.1080p', ['1080p', '720p'])).toBe(true)
  })

  it('returns false when resolution does not match', () => {
    expect(matchesQuality('Movie.720p', ['1080p', '4K'])).toBe(false)
  })
})

describe('Torrent Search — matchesLanguage', () => {
  it('returns true for empty languages', () => {
    expect(matchesLanguage('Movie.1080p', [])).toBe(true)
  })

  it('matches English tag', () => {
    expect(matchesLanguage('Movie.Eng.1080p', ['english'])).toBe(true)
  })

  it('matches Spanish tag (castellano)', () => {
    expect(matchesLanguage('Movie.Castellano.1080p', ['spanish'])).toBe(true)
  })

  it('matches French tag (vostfr)', () => {
    expect(matchesLanguage('Movie.VOSTFR.1080p', ['french'])).toBe(true)
  })

  it('matches German tag', () => {
    expect(matchesLanguage('Movie.German.1080p', ['german'])).toBe(true)
  })

  it('does not match unrelated language', () => {
    expect(matchesLanguage('Movie.Eng.1080p', ['japanese'])).toBe(false)
  })

  it('untagged titles pass through (no language info = could be any language)', () => {
    expect(matchesLanguage('Movie.1080p.BluRay', ['english'])).toBe(true)
  })
})

describe('Torrent Search — extractSeeders / extractLeechers', () => {
  it('extracts seeders from class', () => {
    const html = '<td class="seed">1,234</td>'
    expect(extractSeeders(html)).toBe(1234)
  })

  it('extracts seeders from green span', () => {
    const html = '<span class="green"><b>567</b></span>'
    expect(extractSeeders(html)).toBe(567)
  })

  it('extracts seeders from emoji', () => {
    expect(extractSeeders('👤 890')).toBe(890)
    expect(extractSeeders('💾 456')).toBe(456)
  })

  it('extracts leechers from class', () => {
    const html = '<td class="leech">42</td>'
    expect(extractLeechers(html)).toBe(42)
  })

  it('extracts leechers from red span', () => {
    const html = '<span class="red"><b>99</b></span>'
    expect(extractLeechers(html)).toBe(99)
  })

  it('extracts leechers from cross emoji', () => {
    expect(extractLeechers('✗ 15')).toBe(15)
  })

  it('returns 0 when no pattern matches', () => {
    expect(extractSeeders('<td>nothing</td>')).toBe(0)
    expect(extractLeechers('<td>nothing</td>')).toBe(0)
  })
})
