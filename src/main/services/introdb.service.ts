import { getSetting } from './cache.service'

interface SegmentQuery {
  tmdbId?: number
  imdbId?: string
  season?: number
  episode?: number
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
    // getMedia() is a public endpoint (no key required). The current user's
    // key is optional and — per the theintrodb package — goes in the second
    // transportOptions argument, where it only adds that user's pending
    // submissions to the response. Passing it inside `params` is silently
    // dropped by the package.
    const apiKey = getSetting<string>('introDbApiKey')

    const { getMedia } = await import('theintrodb')
    const params = {
      tmdbId: query.tmdbId,
      imdbId: query.imdbId,
      season: query.season,
      episode: query.episode,
    }
    const data = apiKey
      ? await getMedia(params, { apiKey })
      : await getMedia(params)

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
