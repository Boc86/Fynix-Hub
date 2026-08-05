import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withCache, TTL } from '@/main/services/cache-helpers.service'

vi.mock('@/main/services/cache.service', () => ({
  getCache: vi.fn(),
  setCache: vi.fn(),
}))

import * as CacheService from '@/main/services/cache.service'

describe('withCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns cached value when available', async () => {
    vi.mocked(CacheService.getCache).mockReturnValue(JSON.stringify({ cached: true }))

    const fetcher = vi.fn().mockResolvedValue({ fresh: true })
    const result = await withCache('key', 60000, fetcher)

    expect(result).toEqual({ cached: true })
    expect(fetcher).not.toHaveBeenCalled()
    expect(CacheService.setCache).not.toHaveBeenCalled()
  })

  it('calls fetcher and caches result on cache miss', async () => {
    vi.mocked(CacheService.getCache).mockReturnValue(null)

    const fetcher = vi.fn().mockResolvedValue({ data: 'value' })
    const result = await withCache('key', 60000, fetcher)

    expect(result).toEqual({ data: 'value' })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(CacheService.setCache).toHaveBeenCalledWith('key', JSON.stringify({ data: 'value' }), 60000)
  })

  it('handles invalid JSON in cache by re-fetching', async () => {
    vi.mocked(CacheService.getCache).mockReturnValue('not-json{')
    vi.mocked(CacheService.setCache).mockReturnValue(undefined)

    const fetcher = vi.fn().mockResolvedValue({ recovered: true })
    const result = await withCache('key', 60000, fetcher)

    expect(result).toEqual({ recovered: true })
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('handles concurrent calls independently (no dedup)', async () => {
    vi.mocked(CacheService.getCache).mockReturnValue(null)
    vi.mocked(CacheService.setCache).mockReturnValue(undefined)
    let callCount = 0
    const fetcher = vi.fn().mockImplementation(() => {
      callCount++
      return Promise.resolve({ call: callCount })
    })

    const [r1, r2] = await Promise.all([
      withCache('key-a', 60000, fetcher),
      withCache('key-b', 60000, fetcher),
    ])

    // Different keys → two fetcher calls
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(CacheService.setCache).toHaveBeenCalledTimes(2)
  })

  it('uses correct TTL values', () => {
    expect(TTL.TMDB_DETAILS).toBe(3_600_000)
    expect(TTL.TORRENT_SEARCH).toBe(300_000)
    expect(TTL.DEBRID_CACHE).toBe(120_000)
    expect(TTL.MDBLIST_PROGRESS).toBe(300_000)
    expect(TTL.SPORTS_LIST).toBe(86_400_000)
  })
})
