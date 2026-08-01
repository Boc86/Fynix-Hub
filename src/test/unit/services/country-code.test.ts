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
