import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the settings store before importing the service
const getSettingMock = vi.fn((key: string) => (key === 'introDbApiKey' ? 'test-key' : null))
vi.mock('@/main/services/cache.service', () => ({
  getSetting: (key: string) => getSettingMock(key),
}))

// Mock the theintrodb npm package (v4) — getMedia returns a discriminated union
const getMediaMock = vi.fn()
vi.mock('theintrodb', () => ({
  getMedia: (...args: any[]) => getMediaMock(...args),
}))

import { getSegments } from '@/main/services/introdb.service'

describe('introdb.service (theintrodb v4 / API v4)', () => {
  beforeEach(() => {
    getMediaMock.mockReset()
    getSettingMock.mockClear()
  })

  it('returns [] without a tmdbId and never calls the API', async () => {
    expect(await getSegments({})).toEqual([])
    expect(getMediaMock).not.toHaveBeenCalled()
  })

  it('maps kind:"media" segments (intro/recap/credits) to SegmentResult[]', async () => {
    getMediaMock.mockResolvedValue({
      kind: 'media',
      tvdbId: 71663,
      type: 'series',
      season: 1,
      episode: 2,
      groupDurationMs: 1320000,
      intro: [{ startMs: 0, endMs: 85000, durationMs: 85000, startsAtBeginning: true, endsAtMediaEnd: false }],
      recap: [],
      credits: [{ startMs: 1250000, endMs: null, durationMs: null, startsAtBeginning: false, endsAtMediaEnd: true }],
      preview: [],
    })
    const res = await getSegments({ tmdbId: 1396, season: 1, episode: 2 })
    expect(res).toEqual([
      { type: 'intro', startMs: 0, endMs: 85000, durationMs: 85000, startsAtBeginning: true, endsAtMediaEnd: false },
      { type: 'credits', startMs: 1250000, endMs: null, durationMs: null, startsAtBeginning: false, endsAtMediaEnd: true },
    ])
    // tmdbId addressing + apiKey in transport options (not in params)
    expect(getMediaMock).toHaveBeenCalledWith(
      { tmdbId: 1396, imdbId: undefined, season: 1, episode: 2 },
      { apiKey: 'test-key' },
    )
  })

  it('returns [] for non-media union members (versions / episodes)', async () => {
    getMediaMock.mockResolvedValue({ kind: 'versions', tvdbId: 169, versions: [] })
    expect(await getSegments({ tmdbId: 12345 })).toEqual([])
    getMediaMock.mockResolvedValue({ kind: 'episodes', tvdbId: 169, episodes: [] })
    expect(await getSegments({ tmdbId: 12345 })).toEqual([])
  })

  it('returns [] when the API call throws (e.g. v4 retired-endpoint 404)', async () => {
    getMediaMock.mockRejectedValue(new Error('404 Not Found'))
    expect(await getSegments({ tmdbId: 1 })).toEqual([])
  })

  it('omits the apiKey transport option when no key is configured', async () => {
    getSettingMock.mockImplementation(() => null)
    getMediaMock.mockResolvedValue({ kind: 'media', tvdbId: 1, intro: [], recap: [], credits: [], preview: [] })
    await getSegments({ tmdbId: 1 })
    expect(getMediaMock).toHaveBeenCalledWith(
      { tmdbId: 1, imdbId: undefined, season: undefined, episode: undefined },
    )
  })
})
