import * as CacheService from './cache.service'

const API_BASE_V2 = 'https://api.sportsapipro.com/v2'
const API_BASE_V1 = 'https://api.sportsapipro.com/v1'

let apiKey = ''

export function setApiKey(key: string) {
  apiKey = key
  console.log('[SportsAPIPRO] API key updated:', apiKey ? 'yes' : 'no')
}

export function loadApiKey() {
  apiKey = CacheService.getSetting<string>('sportsApiProKey') || ''
  console.log('[SportsAPIPRO] API key loaded:', apiKey ? 'yes' : 'no')
}

// TheSportsDB sport name (lowercased) -> SportsAPIPRO path segment
const SPORT_TO_PATH: Record<string, string> = {
  'football': 'football',
  'soccer': 'football',
  'basketball': 'basketball',
  'tennis': 'tennis',
  'hockey': 'hockey',
  'ice hockey': 'hockey',
  'handball': 'handball',
  'american-football': 'american-football',
  'american football': 'american-football',
  'baseball': 'baseball',
  'volleyball': 'volleyball',
  'rugby': 'rugby',
}

const CACHE_TTL = 86400000

interface ApiCompetition {
  id: number
  name: string
  imageVersion?: number
  country?: string
}

async function fetchApi<T>(base: string, path: string): Promise<T> {
  if (!apiKey) {
    console.log(`[SportsAPIPRO] No API key set, skipping ${path}`)
    throw new Error('SportsAPIPRO API key not set')
  }
  const url = `${base}${path}`
  console.log(`[SportsAPIPRO] Fetching: ${url}`)
  const res = await fetch(url, {
    headers: {
      'x-api-key': apiKey,
      'User-Agent': 'Mozilla/5.0',
    },
  })
  if (!res.ok) {
    console.log(`[SportsAPIPRO] HTTP ${res.status} for ${url}`)
    throw new Error(`SportsAPIPRO HTTP ${res.status}`)
  }
  const data = await res.json()
  console.log(`[SportsAPIPRO] Response type: ${typeof data}, keys: ${data ? Object.keys(data).join(', ') : 'null'}`)
  return data
}

function imageUrlV1(sport: string, competitionId: number, version?: number): string {
  const base = `${API_BASE_V1}/${sport}/images/competitions/${competitionId}`
  return version ? `${base}?imageVersion=${version}` : base
}

async function fetchImageV2(sportPath: string, tournamentId: number): Promise<string | null> {
  try {
    const url = `${API_BASE_V2}/${sportPath}/images/tournaments/${tournamentId}`
    console.log(`[SportsAPIPRO] Fetching V2 image: ${url}`)
    const res = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        'User-Agent': 'Mozilla/5.0',
      },
    })
    if (!res.ok) {
      console.log(`[SportsAPIPRO] V2 image HTTP ${res.status} for tournament ${tournamentId}`)
      return null
    }
    const contentType = res.headers.get('content-type') || 'image/png'
    const buf = Buffer.from(await res.arrayBuffer())
    console.log(`[SportsAPIPRO] V2 image OK: ${buf.length} bytes, type=${contentType}`)
    return `data:${contentType};base64,${buf.toString('base64')}`
  } catch (err: any) {
    console.log(`[SportsAPIPRO] Failed to fetch V2 image for tournament ${tournamentId}: ${err?.message || err}`)
    return null
  }
}

async function getCompetitionsV2(sportKey: string, path: string): Promise<ApiCompetition[]> {
  try {
    console.log(`[SportsAPIPRO] V2: Fetching leagues for ${sportKey}`)
    const data = await fetchApi<{ success: boolean; countries?: Array<{ country: string; leagues: Array<{ id: number; name: string }> }> }>(API_BASE_V2, `/${path}/leagues`)
    if (!data.success || !data.countries) {
      console.log(`[SportsAPIPRO] V2: no data for ${sportKey}, falling back`)
      return []
    }
    const competitions: ApiCompetition[] = []
    for (const country of data.countries) {
      for (const league of country.leagues || []) {
        competitions.push({ id: league.id, name: league.name, country: country.country })
      }
    }
    console.log(`[SportsAPIPRO] V2: Parsed ${competitions.length} competitions for ${sportKey}`)
    return competitions
  } catch (err: any) {
    console.log(`[SportsAPIPRO] V2 failed for ${sportKey}: ${err?.message || err}`)
    return []
  }
}

async function getCompetitionsV1(sportKey: string, path: string): Promise<ApiCompetition[]> {
  try {
    console.log(`[SportsAPIPRO] V1: Fetching competitions for ${sportKey}`)
    const data = await fetchApi<{ success: boolean; data?: { competitions?: any[] } }>(API_BASE_V1, `/${path}/competitions`)
    const raw = data.data?.competitions || []
    console.log(`[SportsAPIPRO] V1: Raw competitions: ${raw.length} items`)
    return raw.map((c: any) => ({
      id: c.id,
      name: c.name || '',
      imageVersion: c.imageVersion || 1,
      country: c.country || '',
    }))
  } catch (err: any) {
    console.log(`[SportsAPIPRO] V1 failed for ${sportKey}: ${err?.message || err}`)
    return []
  }
}

export async function getCompetitions(sportKey: string): Promise<ApiCompetition[]> {
  const path = SPORT_TO_PATH[sportKey]
  if (!path) { console.log(`[SportsAPIPRO] No path mapping for sport: ${sportKey}`); return [] }

  const cacheKey = `sportsapipro:competitions:${sportKey}`
  const cached = CacheService.getCache(cacheKey)
  if (cached) { console.log(`[SportsAPIPRO] Returning ${JSON.parse(cached).length} cached competitions for ${sportKey}`); return JSON.parse(cached) }

  // Try V2 first, fall back to V1
  let competitions = await getCompetitionsV2(sportKey, path)
  if (competitions.length === 0) {
    competitions = await getCompetitionsV1(sportKey, path)
  }

  if (competitions.length > 0) {
    CacheService.setCache(cacheKey, JSON.stringify(competitions), CACHE_TTL)
  }
  console.log(`[SportsAPIPRO] Final: ${competitions.length} competitions for ${sportKey}`)
  return competitions
}

export async function getCompetitionImage(sportKey: string, leagueName: string): Promise<string | null> {
  const competitions = await getCompetitions(sportKey)
  const lowerLeague = leagueName.toLowerCase()
  let match = competitions.find(c => c.name.toLowerCase() === lowerLeague)
  if (!match) match = competitions.find(c => c.name.toLowerCase().includes(lowerLeague) || lowerLeague.includes(c.name.toLowerCase()))
  // fallback: return first competition's image as best effort
  if (!match && competitions.length > 0) {
    console.log(`[SportsAPIPRO] No name match for "${leagueName}", using first competition: "${competitions[0].name}"`)
    match = competitions[0]
  }
  if (!match) {
    console.log(`[SportsAPIPRO] No competitions at all for sport "${sportKey}", returning null`)
    return null
  }

  const path = SPORT_TO_PATH[sportKey]
  if (!path) return null

  // V2: fetch image directly from API with auth header, return data: URL
  if (match.imageVersion === undefined) {
    return fetchImageV2(path, match.id)
  }

  // V1: construct image URL directly (public, no auth)
  return imageUrlV1(path, match.id, match.imageVersion)
}
