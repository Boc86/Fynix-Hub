import { describe, it, expect } from 'vitest'

// Mirrors the sidecar subtitle matching logic in webtorrent.service.ts
function matchSidecarSubs(mediaFileName: string, files: { name: string }[]): string[] {
  const mediaName = mediaFileName.toLowerCase()
  const baseExt = mediaName.match(/(.+)(\.[^.]+)$/)
  const baseName = baseExt ? baseExt[1] : mediaName

  const subs: string[] = []
  for (const f of files) {
    const lower = f.name.toLowerCase()
    if (!/.*\.(srt|vtt)$/.test(lower)) continue
    const subBase = lower.replace(/\.(srt|vtt)$/, '')
    // Match same base name: movie.srt, movie.vtt (exact base name match)
    if (subBase === mediaName.replace(/\.[^.]+$/, '') || subBase === baseName) {
      subs.push(f.name)
    }
  }
  return subs
}

// Mirrors the OpenSubtitles search params built in VideoPlayer.tsx
function buildOpenSubtitlesParams(mediaInfo: {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  season?: number
  episode?: number
}, preferredLanguages: string[], forcedOnly: boolean) {
  const params: any = {
    tmdbId: mediaInfo.tmdbId,
    type: mediaInfo.mediaType,
    season: mediaInfo.season,
    episode: mediaInfo.episode,
    language: preferredLanguages[0]?.toLowerCase().slice(0, 2) || 'en',
  }
  if (forcedOnly) params.forcedOnly = true
  return params
}

describe('Subtitles', () => {
  describe('sidecar matching', () => {
    it('matches .srt/.vtt files with same base name', () => {
      const files = [
        { name: 'movie.mp4' },
        { name: 'movie.srt' },
        { name: 'other.srt' },
        { name: 'movie.vtt' },
      ]
      const subs = matchSidecarSubs('movie.mp4', files)
      expect(subs).toEqual(['movie.srt', 'movie.vtt'])
    })

    it('excludes the media file itself', () => {
      const files = [
        { name: 'movie.mp4' },
        { name: 'movie.srt' },
      ]
      const subs = matchSidecarSubs('movie.mp4', files)
      expect(subs).toEqual(['movie.srt'])
    })

    it('matches TV episode subtitles', () => {
      const files = [
        { name: 'Show.S01E01.720p.x264.mkv' },
        { name: 'Show.S01E01.720p.x264.srt' },
        { name: 'Show.S01E01.720p.x264.vtt' },
      ]
      const subs = matchSidecarSubs('Show.S01E01.720p.x264.mkv', files)
      expect(subs).toEqual(['Show.S01E01.720p.x264.srt', 'Show.S01E01.720p.x264.vtt'])
    })

    it('does not match non-subtitle files', () => {
      const files = [
        { name: 'movie.mp4' },
        { name: 'movie.txt' },
        { name: 'movie.sub' },
      ]
      const subs = matchSidecarSubs('movie.mp4', files)
      expect(subs).toEqual([])
    })
  })

  describe('OpenSubtitles params', () => {
    it('uses tmdbId (not tmdb_id) and includes type + language', () => {
      const params = buildOpenSubtitlesParams(
        { tmdbId: 603, mediaType: 'movie' },
        ['English'],
        true,
      )
      expect(params.tmdbId).toBe(603)
      expect(params.tmdb_id).toBeUndefined()
      expect(params.type).toBe('movie')
      expect(params.language).toBe('en')
      expect(params.forcedOnly).toBe(true)
    })

    it('includes season/episode for TV', () => {
      const params = buildOpenSubtitlesParams(
        { tmdbId: 1396, mediaType: 'tv', season: 1, episode: 1 },
        ['English'],
        true,
      )
      expect(params.type).toBe('tv')
      expect(params.season).toBe(1)
      expect(params.episode).toBe(1)
      expect(params.forcedOnly).toBe(true)
    })

    it('respects preferred language', () => {
      const params = buildOpenSubtitlesParams(
        { tmdbId: 603, mediaType: 'movie' },
        ['French', 'English'],
        false,
      )
      expect(params.language).toBe('fr')
      expect(params.forcedOnly).toBeUndefined()
    })

    it('defaults to English when no preferred languages', () => {
      const params = buildOpenSubtitlesParams(
        { tmdbId: 603, mediaType: 'movie' },
        [],
        true,
      )
      expect(params.language).toBe('en')
    })

    it('forcedOnly is omitted when disabled', () => {
      const params = buildOpenSubtitlesParams(
        { tmdbId: 603, mediaType: 'movie' },
        ['English'],
        false,
      )
      expect(params.forcedOnly).toBeUndefined()
    })
  })
})
