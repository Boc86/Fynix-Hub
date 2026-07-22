import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as TmdbService from '@/main/services/tmdb.service'

vi.mock('@/main/services/cache.service', () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}))

import * as CacheService from '@/main/services/cache.service'

describe('TMDB Service — Pure Functions', () => {
  describe('setApiKey / getApiKey', () => {
    beforeEach(() => {
      TmdbService.setApiKey('')
    })

    it('stores and retrieves API key', () => {
      TmdbService.setApiKey('test-key-123')
      expect(TmdbService.getApiKey()).toBe('test-key-123')
    })

    it('defaults to empty string', () => {
      expect(TmdbService.getApiKey()).toBe('')
    })
  })

  describe('loadApiKey', () => {
    it('loads from CacheService', () => {
      vi.mocked(CacheService.getSetting).mockReturnValue('loaded-key')
      TmdbService.loadApiKey()
      expect(TmdbService.getApiKey()).toBe('loaded-key')
    })

    it('falls back to empty string', () => {
      vi.mocked(CacheService.getSetting).mockReturnValue(null)
      TmdbService.setApiKey('old-key')
      TmdbService.loadApiKey()
      expect(TmdbService.getApiKey()).toBe('')
    })
  })

  describe('getImageUrl', () => {
    it('returns correct URL with default size', () => {
      expect(TmdbService.getImageUrl('/abc.jpg')).toBe('https://image.tmdb.org/t/p/original/abc.jpg')
    })

    it('returns correct URL with custom size', () => {
      expect(TmdbService.getImageUrl('/abc.jpg', 'w500')).toBe('https://image.tmdb.org/t/p/w500/abc.jpg')
    })
  })
})
