import { describe, it, expect } from 'vitest'
import {
  buildDeviceAuthBody,
  buildTokenBody,
  buildRefreshBody,
  convertScrobblePayload,
  convertHistoryPayload,
  unwrapWatched,
  mapUpnext,
  getBakedInClientId,
} from '@/main/services/mdblist.service'

// Baked-in client ID (obfuscated in the service with the same XOR scheme
// Trakt uses). This test pins it so a bad obfuscation is caught immediately.
const EXPECTED_CLIENT_ID = 'L42GkLSYM2pfGlisJw1k9nlrDxY9k0K0uycgev0t'

describe('mdblist baked-in client id', () => {
  it('deobfuscates to the registered client id', () => {
    expect(getBakedInClientId()).toBe(EXPECTED_CLIENT_ID)
  })
})

describe('mdblist auth payloads', () => {
  it('builds device-authorization body (form-encoded)', () => {
    expect(buildDeviceAuthBody('client123')).toBe('client_id=client123&scope=write')
  })

  it('builds device-code token body', () => {
    const body = buildTokenBody('device_abc', 'client123')
    expect(body).toContain('grant_type=urn:ietf:params:oauth:grant-type:device_code')
    expect(body).toContain('device_code=device_abc')
    expect(body).toContain('client_id=client123')
  })

  it('builds refresh-token body', () => {
    expect(buildRefreshBody('refresh_xyz', 'client123'))
      .toBe('grant_type=refresh_token&refresh_token=refresh_xyz&client_id=client123')
  })
})

describe('mdblist payload converters', () => {
  it('converts Trakt-style movie scrobble unchanged', () => {
    const p = convertScrobblePayload({ movie: { ids: { tmdb: 278 } }, progress: 50 })
    expect(p).toEqual({ movie: { ids: { tmdb: 278 } }, progress: 50 })
  })

  it('converts Trakt-style episode scrobble to MDBList nested format', () => {
    const p = convertScrobblePayload({
      show: { ids: { tmdb: 1396 } },
      episode: { season: 1, number: 2 },
      progress: 10,
    })
    expect(p).toEqual({
      show: { ids: { tmdb: 1396 } },
      season: { number: 1, episode: { number: 2 } },
      progress: 10,
    })
  })

  it('converts Trakt-style mark-watched history payload', () => {
    const p = convertHistoryPayload({
      movies: [{ ids: { tmdb: 278 } }],
      shows: [{
        ids: { tmdb: 1396 },
        seasons: [{ season: 1, episodes: [{ number: 2 }] }],
      }],
    })
    expect(p).toEqual({
      movies: [{ ids: { tmdb: 278 } }],
      shows: [{
        ids: { tmdb: 1396 },
        seasons: [{ number: 1, episodes: [{ number: 2 }] }],
      }],
    })
  })

  it('unwraps MDBList watched envelope into Trakt-style array', () => {
    const env = {
      movies: [{ watched_at: 'x', movie: { ids: { tmdb: 278 } } }],
      shows: [{ watched_at: 'y', show: { ids: { tmdb: 1396 } } }],
    }
    expect(unwrapWatched(env)).toEqual([
      { watched_at: 'x', movie: { ids: { tmdb: 278 } } },
      { watched_at: 'y', show: { ids: { tmdb: 1396 } } },
    ])
  })

  it('handles empty watched envelope', () => {
    expect(unwrapWatched(null)).toEqual([])
    expect(unwrapWatched({})).toEqual([])
  })
})

describe('mdblist upnext mapper', () => {
  it('maps real upnext items to Trakt watched-progress shape', () => {
    const upnext = {
      items: [{
        show: { title: 'Attack on Titan', year: 2013, ids: { tmdb: 1429, imdb: 'tt2560140' }, poster: '/x.jpg' },
        next_episode: { ids: { tmdb: 6912163 }, season: 3, episode: 2, title: 'Two Brothers', air_date: '2026-08-01', runtime: 24, still: '/y.jpg' },
        progress: { watched_episode_count: 14, total_episode_count: 62 },
        last_watched_at: '2026-07-30T11:45:00.000Z',
        is_newly_aired: true,
      }],
      limit: 20,
      has_more: false,
    }
    const out = mapUpnext(upnext)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      show: { title: 'Attack on Titan', year: 2013, ids: { tmdb: 1429, imdb: 'tt2560140' } },
      next_episode: { season: 3, number: 2, title: 'Two Brothers', first_aired: '2026-08-01' },
      aired: 62,
      completed: 14,
      last_watched_at: '2026-07-30T11:45:00.000Z',
    })
    expect(out[0].completion).toBeCloseTo(14 / 62, 5)
  })

  it('skips items without next episode and handles empty', () => {
    expect(mapUpnext(null)).toEqual([])
    expect(mapUpnext({ items: [{ show: { ids: { tmdb: 1 } } }] })).toEqual([])
    expect(mapUpnext({ items: [] })).toEqual([])
  })

  it('sorts by last_watched_at descending', () => {
    const data = {
      items: [
        {
          show: { title: 'Old', ids: { tmdb: 1 } },
          next_episode: { season: 1, episode: 1 },
          progress: { watched_episode_count: 1, total_episode_count: 10 },
          last_watched_at: '2026-01-01T00:00:00Z',
        },
        {
          show: { title: 'New', ids: { tmdb: 2 } },
          next_episode: { season: 1, episode: 1 },
          progress: { watched_episode_count: 1, total_episode_count: 10 },
          last_watched_at: '2026-06-01T00:00:00Z',
        },
      ],
    }
    const out = mapUpnext(data)
    expect(out[0].show.title).toBe('New')
    expect(out[1].show.title).toBe('Old')
  })
})
