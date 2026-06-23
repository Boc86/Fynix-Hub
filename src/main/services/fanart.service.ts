import * as CacheService from './cache.service'
import * as TmdbService from './tmdb.service'

const FANART_BASE = 'https://webservice.fanart.tv/v3'

let apiKey = ''

export function setApiKey(key: string) {
  apiKey = key
  console.log('[Fanart] API key updated:', apiKey ? 'yes' : 'no')
}

export function loadApiKey() {
  apiKey = CacheService.getSetting<string>('fanartApiKey') || ''
  console.log('[Fanart] API key loaded:', apiKey ? 'yes' : 'no')
}

function getApiKey(): string {
  return apiKey
}

async function fetchFanart(path: string) {
  if (!apiKey) throw new Error('Fanart.tv API key not set')
  const res = await fetch(`${FANART_BASE}${path}?api_key=${apiKey}`)
  if (!res.ok) throw new Error(`Fanart.tv error: ${res.status}`)
  return res.json()
}

async function getTvdbId(tmdbId: number): Promise<number | null> {
  const cacheKey = `fanart:tvdb-id:${tmdbId}`
  const cached = CacheService.getCache(cacheKey)
  if (cached) return JSON.parse(cached)

  const tmdbKey = TmdbService.getApiKey()
  if (!tmdbKey) return null

  try {
    const res = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/external_ids?api_key=${tmdbKey}`)
    if (!res.ok) return null
    const data = await res.json()
    const tvdbId = data.tvdb_id ?? null
    CacheService.setCache(cacheKey, JSON.stringify(tvdbId), 86400000)
    return tvdbId
  } catch {
    return null
  }
}

export interface FanartImages {
  clearlogo: string | null
  clearart: string | null
}

async function fetchTmdbLogo(tmdbId: number, type: 'movie' | 'tv'): Promise<string | null> {
  const tmdbKey = TmdbService.getApiKey()
  if (!tmdbKey) return null
  try {
    const res = await fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}/images?api_key=${tmdbKey}&include_image_language=en,null`)
    if (!res.ok) return null
    const data = await res.json()
    const logos: Array<{ file_path: string; iso_639_1: string | null }> = data?.logos || []
    const englishLogos = logos.filter(l => l.iso_639_1 === 'en' || !l.iso_639_1)
    if (englishLogos.length === 0) return null
    const preferred = englishLogos.find(l => l.iso_639_1 === 'en') || englishLogos[0]
    return `https://image.tmdb.org/t/p/original${preferred.file_path}`
  } catch {
    return null
  }
}

export async function getImages(tmdbId: number, type: 'movie' | 'tv'): Promise<FanartImages> {
  const cacheKey = `fanart:images:${type}:${tmdbId}`
  const cached = CacheService.getCache(cacheKey)
  if (cached) return JSON.parse(cached)

  try {
    let clearlogo: string | null = null
    let clearart: string | null = null

    // Try Fanart.tv first if key is set (best clearlogo/clearart artwork)
    if (apiKey) {
      try {
        let path: string
        if (type === 'movie') {
          path = `/movies/${tmdbId}`
        } else {
          const tvdbId = await getTvdbId(tmdbId)
          if (!tvdbId) throw new Error('No TVDB id')
          path = `/tv/${tvdbId}`
        }

        const data = await fetchFanart(path)
        const pickEnglish = (arr?: Array<{ url: string; lang?: string }>) => {
          if (!arr || arr.length === 0) return null
          const en = arr.find(i => i.lang === 'en')
          return en ? en.url : null
        }
        clearlogo = pickEnglish(data.clearlogo) || pickEnglish(data.clearlogos) || pickEnglish(data.hdclearlogo) || null
        clearart = pickEnglish(data.clearart) || pickEnglish(data.cleararts) || pickEnglish(data.hdclearart) || null
        console.log(`[Fanart] ${type} ${tmdbId} Fanart.tv clearlogo:`, clearlogo ? 'found' : 'not found', 'clearart:', clearart ? 'found' : 'not found')
      } catch (err: any) {
        console.log(`[Fanart] ${type} ${tmdbId} Fanart.tv fetch failed:`, err.message)
      }
    } else {
      console.log('[Fanart] No Fanart.tv API key set; using TMDB logos')
    }

    // Fallback to TMDB logos (English or no-language only)
    if (!clearlogo) {
      clearlogo = await fetchTmdbLogo(tmdbId, type)
      console.log(`[Fanart] ${type} ${tmdbId} TMDB logo fallback:`, clearlogo ? 'found' : 'not found')
    }

    const result: FanartImages = { clearlogo, clearart }
    CacheService.setCache(cacheKey, JSON.stringify(result), 86400000)
    return result
  } catch (err: any) {
    console.error('[Fanart] Unexpected error:', err.message)
    return { clearlogo: null, clearart: null }
  }
}
