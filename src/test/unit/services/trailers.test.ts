import { describe, it, expect } from 'vitest'

// Mirrors the trailer filtering logic in DetailView.tsx
const videos = [
  { id: 'tt1', key: 'dQw4w9WgXcQ', name: 'Official Trailer', site: 'YouTube', type: 'Trailer' },
  { id: 'tt2', key: 'dQw4w9WgXcQ', name: 'Teaser', site: 'YouTube', type: 'Teaser' },
  { id: 'tt3', key: 'abc123', name: 'Some Vimeo Video', site: 'Vimeo', type: 'Trailer' },
  { id: 'tt4', key: 'xyz789', name: 'Short Clip', site: 'YouTube', type: 'Clip' },
]

function filterTrailers(videos: typeof videos) {
  return videos.filter(
    (v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')
  ).sort((a, b) => {
    if (a.type === 'Trailer' && b.type !== 'Trailer') return -1
    if (a.type !== 'Trailer' && b.type === 'Trailer') return 1
    return 0
  })
}

// Mirrors the embed URL construction in App.tsx
function buildTrailerEmbed(key: string) {
  const origin = 'https://vyla.cc'
  return `https://www.youtube.com/embed/${key}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&loop=1&playlist=${key}&playsinline=1&enablejsapi=1&origin=${origin}`
}

describe('Trailers', () => {
  it('filters YouTube trailers/teasers, excludes Vimeo and Clips', () => {
    const trailers = filterTrailers(videos)
    expect(trailers).toHaveLength(2)
    expect(trailers.every((t) => t.site === 'YouTube')).toBe(true)
    expect(trailers.every((t) => t.type === 'Trailer' || t.type === 'Teaser')).toBe(true)
  })

  it('prefer Trailer type over Teaser in sort order', () => {
    const trailers = filterTrailers(videos)
    expect(trailers[0].type).toBe('Trailer')
    expect(trailers[1].type).toBe('Teaser')
  })

  it('builds vyla-compatible embed URL without ytdl', () => {
    const url = buildTrailerEmbed('dQw4w9WgXcQ')
    // No youtube-dl needed — direct iframe embed
    expect(url).toContain('https://www.youtube.com/embed/dQw4w9WgXcQ')
    // Muted autoplay per browser policy (required for autoplay to work)
    expect(url).toContain('autoplay=1')
    expect(url).toContain('mute=1')
    // No controls (vyla pattern: controls=0)
    expect(url).toContain('controls=0')
    // Modest branding, no related videos
    expect(url).toContain('modestbranding=1')
    expect(url).toContain('rel=0')
    // Loop with playlist param (required for loop=1 to work on YouTube)
    expect(url).toContain('loop=1')
    expect(url).toContain('playlist=dQw4w9WgXcQ')
    // playsinline for mobile
    expect(url).toContain('playsinline=1')
    // enablejsapi for programmatic control
    expect(url).toContain('enablejsapi=1')
  })

  it('works for movie videos', () => {
    const movieVideos = [{ id: '1', key: 'abc', name: 'Trailer', site: 'YouTube', type: 'Trailer' }]
    const trailers = filterTrailers(movieVideos)
    expect(trailers).toHaveLength(1)
    expect(trailers[0].key).toBe('abc')
  })

  it('works for TV show videos', () => {
    const tvVideos = [
      { id: '1', key: 'xyz', name: 'Season 1 Trailer', site: 'YouTube', type: 'Trailer' },
      { id: '2', key: 'def', name: 'Season 2 Teaser', site: 'YouTube', type: 'Teaser' },
    ]
    const trailers = filterTrailers(tvVideos)
    expect(trailers).toHaveLength(2)
  })
})
