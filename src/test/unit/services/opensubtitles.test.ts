import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as CacheService from '@/main/services/cache.service'

vi.mock('@/main/services/cache.service', () => ({
  getSetting: vi.fn(),
  getCache: vi.fn(),
  setCache: vi.fn(),
}))

const mockGetSetting = vi.mocked(CacheService.getSetting)
const mockGetCache = vi.mocked(CacheService.getCache)
const mockSetCache = vi.mocked(CacheService.setCache)

beforeEach(() => {
  vi.clearAllMocks()
})

// --- srtToVtt pure function tests (imported directly) ---
import { srtToVtt } from '@/main/services/opensubtitles.service'

describe('opensubtitles.service', () => {
  describe('srtToVtt', () => {
    it('converts basic SRT to VTT', () => {
      const srt = `1
00:00:01,000 --> 00:00:04,000
Hello World

2
00:00:05,000 --> 00:00:08,000
Second line`

      const vtt = srtToVtt(srt)
      expect(vtt).toMatch(/^WEBVTT\n\n/)
      expect(vtt).toContain('00:00:01.000 --> 00:00:04.000')
      expect(vtt).toContain('Hello World')
      expect(vtt).toContain('00:00:05.000 --> 00:00:08.000')
      expect(vtt).toContain('Second line')
    })

    it('converts comma separators to dots in timestamps', () => {
      const srt = `1
00:01:23,456 --> 00:01:24,789
Text`
      const vtt = srtToVtt(srt)
      expect(vtt).toContain('00:01:23.456 --> 00:01:24.789')
      expect(vtt).not.toContain(',')
    })

    it('strips cue number lines', () => {
      const srt = `1
00:00:01,000 --> 00:00:04,000
Text

2
00:00:05,000 --> 00:00:08,000
More`
      const vtt = srtToVtt(srt)
      // Should not contain standalone numbers as lines
      const lines = vtt.split('\n')
      const standaloneNumbers = lines.filter(l => /^\d+$/.test(l.trim()))
      expect(standaloneNumbers).toHaveLength(0)
    })

    it('handles multi-line subtitle text', () => {
      const srt = `1
00:00:01,000 --> 00:00:04,000
Line one
Line two`
      const vtt = srtToVtt(srt)
      expect(vtt).toContain('Line one\nLine two')
    })

    it('returns WEBVTT header for empty input', () => {
      const vtt = srtToVtt('')
      expect(vtt).toMatch(/^WEBVTT/)
    })
  })
})

// --- API tests with MSW ---
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { searchSubtitles, downloadSubtitle, setApiKey } from '@/main/services/opensubtitles.service'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('opensubtitles API', () => {
  beforeEach(() => {
    setApiKey('test-key')
    vi.clearAllMocks()
  })

  it('searchSubtitles returns empty without API key', async () => {
    setApiKey('')
    const results = await searchSubtitles({ tmdbId: 123, type: 'movie' })
    expect(results).toEqual([])
  })

  it('searchSubtitles returns parsed results', async () => {
    server.use(
      http.post('https://api.opensubtitles.com/api/v1/subtitles', () => {
        return HttpResponse.json({
          data: [{
            id: '1',
            attributes: {
              language: 'English',
              language_code: 'en',
              subtitle_id: 100,
              forced: false,
              hearing_impaired: false,
              download_count: 500,
              fps: 23.976,
              files: [{ file_id: 999, file_name: 'movie.srt' }],
            },
          }],
        })
      })
    )

    const results = await searchSubtitles({ tmdbId: 123, type: 'movie' })
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      fileId: 999,
      language: 'English',
      languageCode: 'en',
      subtitleId: 100,
      fileName: 'movie.srt',
      forced: false,
      hearingImpaired: false,
      downloadCount: 500,
      fps: 23.976,
    })
  })

  it('searchSubtitles sends season/episode for TV', async () => {
    let receivedBody: any = null
    server.use(
      http.post('https://api.opensubtitles.com/api/v1/subtitles', async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({ data: [] })
      })
    )

    await searchSubtitles({ tmdbId: 456, type: 'tv', season: 3, episode: 7 })
    expect(receivedBody).toMatchObject({
      tmdb_id: 456,
      type: 'episode',
      season_number: 3,
      episode_number: 7,
    })
  })

  it('searchSubtitles returns empty on HTTP error', async () => {
    server.use(
      http.post('https://api.opensubtitles.com/api/v1/subtitles', () => {
        return new HttpResponse(null, { status: 500 })
      })
    )

    const results = await searchSubtitles({ tmdbId: 1, type: 'movie' })
    expect(results).toEqual([])
  })

  it('searchSubtitles returns empty without data array', async () => {
    server.use(
      http.post('https://api.opensubtitles.com/api/v1/subtitles', () => {
        return HttpResponse.json({ data: null })
      })
    )

    const results = await searchSubtitles({ tmdbId: 1, type: 'movie' })
    expect(results).toEqual([])
  })

  it('downloadSubtitle returns null without API key', async () => {
    setApiKey('')
    const result = await downloadSubtitle(123)
    expect(result).toBeNull()
  })

  it('downloadSubtitle fetches and returns content', async () => {
    let loginCalled = false
    server.use(
      http.post('https://api.opensubtitles.com/api/v1/login', () => {
        loginCalled = true
        return HttpResponse.json({ token: 'auth-token-123' })
      }),
      http.post('https://api.opensubtitles.com/api/v1/download', () => {
        return HttpResponse.json({ link: 'https://example.com/sub.vtt' })
      }),
      http.get('https://example.com/sub.vtt', () => {
        return HttpResponse.text('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nSub')
      })
    )

    const result = await downloadSubtitle(999)
    expect(loginCalled).toBe(true)
    expect(result).toBe('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nSub')
  })

  it('downloadSubtitle returns null on HTTP error', async () => {
    server.use(
      http.post('https://api.opensubtitles.com/api/v1/download', () => {
        return new HttpResponse(null, { status: 401 })
      })
    )

    const result = await downloadSubtitle(999)
    expect(result).toBeNull()
  })

  it('downloadSubtitle returns null when no link in response', async () => {
    server.use(
      http.post('https://api.opensubtitles.com/api/v1/login', () => {
        return HttpResponse.json({ token: 'tok' })
      }),
      http.post('https://api.opensubtitles.com/api/v1/download', () => {
        return HttpResponse.json({ link: null })
      })
    )

    const result = await downloadSubtitle(999)
    expect(result).toBeNull()
  })

  it('searchSubtitles sends forced param when forcedOnly is true', async () => {
    let receivedBody: any = null
    server.use(
      http.post('https://api.opensubtitles.com/api/v1/subtitles', async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({ data: [] })
      })
    )

    await searchSubtitles({ tmdbId: 1, type: 'movie', forcedOnly: true })
    expect(receivedBody).toMatchObject({ forced: 'include' })
  })

  it('searchSubtitles defaults language to en', async () => {
    let receivedBody: any = null
    server.use(
      http.post('https://api.opensubtitles.com/api/v1/subtitles', async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({ data: [] })
      })
    )

    await searchSubtitles({ tmdbId: 1, type: 'movie' })
    expect(receivedBody).toMatchObject({ languages: 'en' })
  })

  it('searchSubtitles uses custom language', async () => {
    let receivedBody: any = null
    server.use(
      http.post('https://api.opensubtitles.com/api/v1/subtitles', async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({ data: [] })
      })
    )

    await searchSubtitles({ tmdbId: 1, type: 'movie', language: 'fr' })
    expect(receivedBody).toMatchObject({ languages: 'fr' })
  })
})
