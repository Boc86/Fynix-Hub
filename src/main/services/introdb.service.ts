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

    // theintrodb@4 targets API v4 (base https://api.theintrodb.org/v4).
    // We address media by tmdbId — v4 resolves it server-side to the TVDB
    // identity, converting our TMDB season/episode numbering automatically,
    // so no explicit `mapping` is needed here.
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

    // v4 getMedia() returns a discriminated union on `kind`; only 'media'
    // carries the grouped segment arrays.
    if (!data || data.kind !== 'media') return []

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
