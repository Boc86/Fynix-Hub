const INTRODB_API = 'https://api.introdb.app'

interface SegmentQuery {
  tmdbId?: number
  imdbId?: string
  season?: number
  episode?: number
  type?: 'movie' | 'episode'
}

interface SegmentResult {
  type: 'intro' | 'recap' | 'credits'
  startMs: number | null
  endMs: number | null
  durationMs: number | null
  startsAtBeginning: boolean
  endsAtMediaEnd: boolean
}

export async function getSegments(query: SegmentQuery): Promise<SegmentResult[]> {
  const params = new URLSearchParams()
  if (query.tmdbId) params.set('tmdb_id', String(query.tmdbId))
  if (query.imdbId) params.set('imdb_id', query.imdbId)
  if (query.season) params.set('season', String(query.season))
  if (query.episode) params.set('episode', String(query.episode))

  try {
    const res = await fetch(`${INTRODB_API}/segments?${params}`)
    if (!res.ok) return []
    const data = await res.json()
    return (data.segments || []).map((seg: any) => ({
      type: seg.segment_type || seg.type,
      startMs: seg.start_ms ?? (seg.start_sec != null ? seg.start_sec * 1000 : null),
      endMs: seg.end_ms ?? (seg.end_sec != null ? seg.end_sec * 1000 : null),
      durationMs: seg.duration_ms ?? null,
      startsAtBeginning: seg.start_ms === null || seg.start_ms === 0,
      endsAtMediaEnd: seg.end_ms === null,
    }))
  } catch {
    return []
  }
}
