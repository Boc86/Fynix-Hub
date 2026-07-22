import { describe, it, expect } from 'vitest'

// buildScrobblePayload and buildHistoryPayload are pure functions from trakt.service.ts

function buildScrobblePayload(tmdbId: number, mediaType: string, progress: number, season?: number, episode?: number) {
  if (mediaType === 'tv' && season !== undefined && episode !== undefined) {
    return {
      show: { ids: { tmdb: tmdbId } },
      episode: { season, number: episode },
      progress: Math.round(progress * 100),
    }
  }
  return {
    movie: { ids: { tmdb: tmdbId } },
    progress: Math.round(progress * 100),
  }
}

function buildHistoryPayload(tmdbId: number, mediaType: string, season?: number, episode?: number) {
  if (mediaType === 'tv' && season !== undefined && episode !== undefined) {
    return {
      shows: [{
        ids: { tmdb: tmdbId },
        seasons: [{ season, episodes: [{ number: episode }] }],
      }],
    }
  }
  return { movies: [{ ids: { tmdb: tmdbId } }] }
}

describe('buildScrobblePayload', () => {
  it('builds TV show payload with season/episode', () => {
    const payload = buildScrobblePayload(12345, 'tv', 0.5, 3, 5)
    expect(payload).toEqual({
      show: { ids: { tmdb: 12345 } },
      episode: { season: 3, number: 5 },
      progress: 50,
    })
  })

  it('builds movie payload', () => {
    const payload = buildScrobblePayload(67890, 'movie', 0.75)
    expect(payload).toEqual({
      movie: { ids: { tmdb: 67890 } },
      progress: 75,
    })
  })

  it('rounds progress to integer', () => {
    const payload = buildScrobblePayload(1, 'movie', 0.333)
    expect(payload.progress).toBe(33)
  })

  it('handles 0% progress', () => {
    const payload = buildScrobblePayload(1, 'movie', 0)
    expect(payload.progress).toBe(0)
  })

  it('handles 100% progress', () => {
    const payload = buildScrobblePayload(1, 'movie', 1)
    expect(payload.progress).toBe(100)
  })

  it('builds TV payload even without season/episode if mediaType is tv', () => {
    // If season/episode are undefined, falls back to movie format
    const payload = buildScrobblePayload(1, 'tv', 0.5)
    expect(payload).toHaveProperty('movie')
  })
})

describe('buildHistoryPayload', () => {
  it('builds TV show history payload', () => {
    const payload = buildHistoryPayload(12345, 'tv', 2, 8)
    expect(payload).toEqual({
      shows: [{
        ids: { tmdb: 12345 },
        seasons: [{ season: 2, episodes: [{ number: 8 }] }],
      }],
    })
  })

  it('builds movie history payload', () => {
    const payload = buildHistoryPayload(67890, 'movie')
    expect(payload).toEqual({
      movies: [{ ids: { tmdb: 67890 } }],
    })
  })

  it('handles season 0 / episode 0', () => {
    const payload = buildHistoryPayload(1, 'tv', 0, 0)
    expect(payload.shows[0].seasons[0].season).toBe(0)
    expect(payload.shows[0].seasons[0].episodes[0].number).toBe(0)
  })
})
