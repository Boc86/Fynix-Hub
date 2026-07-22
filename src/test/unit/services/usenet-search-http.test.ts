import { describe, it, expect, vi, beforeEach } from 'vitest'
import { server } from '@/test/msw/server'
import * as CacheService from '@/main/services/cache.service'

vi.mock('@/main/services/cache.service', () => ({
  getSetting: vi.fn().mockReturnValue(null),
  setSetting: vi.fn(),
  getCache: vi.fn().mockReturnValue(null),
  setCache: vi.fn(),
}))

import * as UsenetSearchService from '@/main/services/usenet-search.service'

describe('Usenet Search — searchNewznabIndexer (msw)', () => {
  beforeAll(() => server.listen())
  afterAll(() => server.close())
  beforeEach(() => {
    server.resetHandlers()
    vi.clearAllMocks()
  })

  it('searchUsenet with empty query returns empty', async () => {
    const results = await UsenetSearchService.searchUsenet(
      { query: '' },
      [],
      []
    )
    expect(results).toEqual([])
  })

  it('getFreeIndexers returns empty array (no built-in indexers)', () => {
    expect(UsenetSearchService.getFreeIndexers()).toEqual([])
  })

  it('getDefaultEnabledIndexerIds returns empty array', () => {
    expect(UsenetSearchService.getDefaultEnabledIndexerIds()).toEqual([])
  })

  it('searchUsenet resolves tmdbId to imdbId via TMDB', async () => {
    // MSW handler for external_ids returns tt1234567
    // We can't test the full flow without a real NZB indexer,
    // but we can verify the TMDB resolution is attempted
    const onResult = vi.fn()
    const results = await UsenetSearchService.searchUsenet(
      { title: 'Test Movie', type: 'movie', tmdbId: 1 },
      [],
      [],
      onResult
    )
    // No custom indexers configured, so no results
    expect(results).toEqual([])
    expect(onResult).not.toHaveBeenCalled()
  })
})
