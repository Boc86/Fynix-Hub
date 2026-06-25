import { getSetting } from './cache.service'

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
  if (!query.tmdbId) return []

  try {
    const apiKey = await getSetting<string>('introDbApiKey')
    if (!apiKey) return []

    const { getMedia } = await import('theintrodb')
    const data = await getMedia({
      // @ts-ignore
      apiKey,
      tmdbId: query.tmdbId,
      season: query.season,
      episode: query.episode,
    })

    if (!data) return []

    const results: SegmentResult[] = []

    for (const segType of ['intro', 'recap', 'credits'] as const) {
      const segments = data[segType]
      if (!segments || segments.length === 0) continue
      for (const seg of segments) {
        results.push({
          type: segType,
          startMs: seg.startMs ?? null,
          endMs: seg.endMs ?? null,
          durationMs: seg.durationMs ?? null,
          startsAtBeginning: seg.startsAtBeginning ?? false,
          endsAtMediaEnd: seg.endsAtMediaEnd ?? false,
        })
      }
    }

    return results
  } catch {
    return []
  }
}
