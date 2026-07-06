import { RivestreamResult } from '../../renderer/types.d'
import { searchRivestream } from './rivestream.service'

export interface ExtractorOptions {
  tmdbId: number
  type: 'movie' | 'tv'
  season?: number
  episode?: number
}

export async function searchStreams(
  options: ExtractorOptions, 
  onSourceFound?: (source: RivestreamResult) => void
): Promise<RivestreamResult[]> {
  const { tmdbId, type, season, episode } = options
  try {
    // Pass the callback to searchRivestream to enable real-time updates
    const riveResults = await searchRivestream(tmdbId, type, season, episode, onSourceFound)
    return riveResults
  } catch (e) {
    console.error('[Extractor] Rivestream search failed:', e)
    return []
  }
}
