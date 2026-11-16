import { describe, it, expect } from 'vitest'
import { channelKey } from '@/renderer/utils/countryCode'

describe('channelKey', () => {
  it('merges dashed and spaced names (Nat-Geo == Nat Geo)', () => {
    expect(channelKey('Nat-Geo')).toBe(channelKey('Nat Geo'))
    expect(channelKey('UK: BBC One HD')).toBe(channelKey('BBC One'))
    expect(channelKey('AMC EAST')).toBe(channelKey('AMC'))
  })

  it('keeps digit-led hyphenated titles distinct (24/7 The X-Files)', () => {
    // Deliberate digit guard: titles keep their hyphens, so these stay
    // separate keys rather than corrupting the title.
    expect(channelKey('24/7 The X-Files')).not.toBe(channelKey('24/7 The X Files'))
  })
})

import { detectCountryCode } from '@/renderer/utils/countryCode'

describe('detectCountryCode', () => {
  it('keeps prefix detection for "UK: BBC ONE" style names', () => {
    expect(detectCountryCode('UK: BBC ONE')).toBe('gb')
    expect(detectCountryCode('US | CNN')).toBe('us')
  })
  it('validates unknown prefixes against the ISO alpha-2 table', () => {
    expect(detectCountryCode('DK: Canal 9')).toBe('dk')
    expect(detectCountryCode('DE - ZDF')).toBe('de')
  })
  it('falls back to a trailing alpha-2 suffix validated against ISO', () => {
    expect(detectCountryCode('Sky Sports F1 FHD UK')).toBe('gb')
    expect(detectCountryCode('Canal 9 HD DK')).toBe('dk')
  })
  it('returns empty when no country is detectable', () => {
    expect(detectCountryCode('BBC One HD')).toBe('')
    expect(detectCountryCode('')).toBe('')
  })
})
