import { describe, it, expect } from 'vitest'
import {
  ISO_COUNTRY_NAMES,
  isIsoAlpha2,
  countryFlagEmoji,
  countCountriesByCode,
} from '@/shared/iso-country-codes'

describe('iso-country-codes static table', () => {
  it('contains the reftables.net ISO 3166-1 alpha-2 entries', () => {
    // Spot-check entries from https://reftables.net/iso-country-codes.html
    expect(ISO_COUNTRY_NAMES.af).toBe('Afghanistan')
    expect(ISO_COUNTRY_NAMES.ar).toBe('Argentina')
    expect(ISO_COUNTRY_NAMES.au).toBe('Australia')
    expect(ISO_COUNTRY_NAMES.br).toBe('Brazil')
    expect(ISO_COUNTRY_NAMES.ca).toBe('Canada')
    expect(ISO_COUNTRY_NAMES.cn).toBe('China')
    expect(ISO_COUNTRY_NAMES.de).toBe('Germany')
    expect(ISO_COUNTRY_NAMES.fr).toBe('France')
    expect(ISO_COUNTRY_NAMES.gb).toBe('United Kingdom')
    expect(ISO_COUNTRY_NAMES.in).toBe('India')
    expect(ISO_COUNTRY_NAMES.jp).toBe('Japan')
    expect(ISO_COUNTRY_NAMES.mx).toBe('Mexico')
    expect(ISO_COUNTRY_NAMES.us).toBe('United States')
    expect(ISO_COUNTRY_NAMES.za).toBe('South Africa')
    expect(ISO_COUNTRY_NAMES.kr).toBe('South Korea')
  })

  it('has only lowercase 2-letter keys', () => {
    for (const code of Object.keys(ISO_COUNTRY_NAMES)) {
      expect(code).toMatch(/^[a-z]{2}$/)
    }
  })

  it('isIsoAlpha2 accepts valid codes case-insensitively, rejects junk', () => {
    expect(isIsoAlpha2('US')).toBe(true)
    expect(isIsoAlpha2('gb')).toBe(true)
    expect(isIsoAlpha2('xx')).toBe(false)
    expect(isIsoAlpha2('usa')).toBe(false)
    expect(isIsoAlpha2('')).toBe(false)
  })

  it('countryFlagEmoji renders regional indicators, globe for unknown', () => {
    expect(countryFlagEmoji('us')).toBe('\u{1F1FA}\u{1F1F8}')
    expect(countryFlagEmoji('GB')).toBe('\u{1F1EC}\u{1F1E7}')
    expect(countryFlagEmoji('xx')).toBe('\u{1F30D}')
    expect(countryFlagEmoji('')).toBe('\u{1F30D}')
    expect(countryFlagEmoji('intl')).toBe('\u{1F30D}')
  })
})

describe('countCountriesByCode', () => {
  it('counts channels per country, names from ISO table, sorted by count desc', () => {
    const out = countCountriesByCode([
      { countryCode: 'US' },
      { countryCode: 'us' },
      { countryCode: 'gb' },
      { countryCode: 'de' },
      { countryCode: 'de' },
      { countryCode: 'de' },
      { countryCode: '' },
      {},
    ])
    expect(out).toEqual([
      { code: 'de', name: 'Germany', flag: '\u{1F1E9}\u{1F1EA}', count: 3 },
      { code: 'us', name: 'United States', flag: '\u{1F1FA}\u{1F1F8}', count: 2 },
      { code: 'gb', name: 'United Kingdom', flag: '\u{1F1EC}\u{1F1E7}', count: 1 },
    ])
  })

  it('keeps unknown codes (named by uppercase code, globe flag) so playlists stay filterable', () => {
    const out = countCountriesByCode([{ countryCode: 'zz' }, { countryCode: 'INTL' }])
    expect(out).toContainEqual({ code: 'zz', name: 'ZZ', flag: '\u{1F30D}', count: 1 })
    expect(out).toContainEqual({ code: 'intl', name: 'INTL', flag: '\u{1F30D}', count: 1 })
  })

  it('returns empty list for no channels', () => {
    expect(countCountriesByCode([])).toEqual([])
  })
})
