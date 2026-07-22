import { describe, it, expect } from 'vitest'
import { lookupLogo } from '@/main/services/tv-logo.service'

describe('tv-logo.service', () => {
  describe('lookupLogo', () => {
    it('returns correct US logo path', () => {
      const result = lookupLogo('CNN', 'us')
      expect(result).toBe('https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/cnn-us.png')
    })

    it('returns correct UK logo path', () => {
      const result = lookupLogo('BBC One', 'gb')
      expect(result).toBe('https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/bbc-one-uk.png')
    })

    it('normalizes special characters', () => {
      const result = lookupLogo("Nickelodeon Kids", 'us')
      expect(result).toContain('nickelodeon-kids-us.png')
    })

    it('handles ampersand in channel name', () => {
      const result = lookupLogo('AT&T', 'us')
      expect(result).toContain('atandt-us.png')
    })

    it('returns null for unknown country', () => {
      const result = lookupLogo('CNN', 'xx')
      expect(result).toBeNull()
    })

    it('returns null for empty channel name after normalization', () => {
      // '...' normalizes to empty string after regex cleanup
      const result = lookupLogo('...', 'us')
      expect(result).toBeNull()
    })

    it('handles Nordic countries sharing same directory', () => {
      const seResult = lookupLogo('TV4', 'se')
      const noResult = lookupLogo('TV4', 'no')
      expect(seResult).toContain('/nordic/')
      expect(noResult).toContain('/nordic/')
    })
  })
})
