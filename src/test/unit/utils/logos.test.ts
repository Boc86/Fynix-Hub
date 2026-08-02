import { describe, it, expect } from 'vitest'
import { channelSlug, channelSlugVariants, candidateLogoUrls } from '@/renderer/utils/logos'

describe('channelSlug', () => {
  it('converts a channel name to a repo-style slug', () => {
    expect(channelSlug('E4 Extra')).toBe('e4-extra')
    expect(channelSlug('Sky Sports F1')).toBe('sky-sports-f1')
    expect(channelSlug('UK: BBC One')).toBe('bbc-one')
    expect(channelSlug('  CNN  ')).toBe('cnn')
  })
})

describe('channelSlugVariants', () => {
  it('emits both the joined and letter-digit-split forms', () => {
    // tv-logos repo stores "E4 Extra" as e-4-extra-uk.png (letter-digit split)
    const variants = channelSlugVariants('E4 Extra')
    expect(variants).toContain('e4-extra')
    expect(variants).toContain('e-4-extra')
  })

  it('splits glued letter-digit runs (E4EXTRA -> e-4-extra)', () => {
    const variants = channelSlugVariants('E4EXTRA')
    expect(variants).toContain('e4extra')
    expect(variants).toContain('e-4-extra')
  })

  it('handles names already split (Sky Sports F1)', () => {
    const variants = channelSlugVariants('Sky Sports F1')
    expect(variants).toContain('sky-sports-f1')
    expect(variants).toContain('sky-sports-f-1')
  })

  it('returns empty for empty input', () => {
    expect(channelSlugVariants('')).toEqual([])
  })
})

describe('candidateLogoUrls', () => {
  it('includes the letter-digit-split candidate for GB (e-4-extra-uk.png)', () => {
    const urls = candidateLogoUrls('E4 Extra', 'gb')
    expect(urls).toContain('https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/e-4-extra-uk.png')
    // the joined form is still emitted too
    expect(urls).toContain('https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/e4-extra-uk.png')
  })
})
