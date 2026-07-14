import * as CacheService from './cache.service'

const SPORTARR_BASE = 'https://sportarr.net/api/public/v1'
const SPORTARR_IMG_BASE = 'https://sportarr.net'
const IMAGE_API_BASE = 'https://sportarr.net/api/v1'

const CACHE_TTL = 300000

interface ApiResponse<T> {
  items: T[]
  total: number
  skip: number
  limit: number
}

interface SportarrSport {
  id: string
  shortId: string
  name: string
  slug: string
  description: string
  iconUrl: string
  isActive: boolean
}

interface SportarrLeague {
  id: string
  shortId: string
  name: string
  slug: string
  abbreviation: string
  description: string
  sportId: string
  sportName: string
  country: string
  logoUrl: string
  isActive: boolean
  alternateNames: string[]
}

interface SportarrSeason {
  id: string
  shortId: string
  name: string
  leagueId: string
  leagueName: string
  startDate: string
  endDate: string
  year: string | null
  isCurrent: boolean
  isActive: boolean
}

interface SportarrEvent {
  id: string
  shortId: string
  name: string
  eventType: string
  leagueId: string
  leagueName: string
  seasonId: string
  seasonName: string
  venueId: string
  venueName: string
  scheduledStart: string
  scheduledStartLocal: string
  scheduledEnd: string
  broadcastDate: string
  broadcastTimezone: string
  status: string
  homeTeamId: string
  homeTeamName: string
  awayTeamId: string
  awayTeamName: string
  homeScore: number | null
  awayScore: number | null
  seasonNumber: number
  episodeNumber: number
  episodeCode: string
  isActive: boolean
  parts: unknown[]
}

interface SportarrTeam {
  id: string
  shortId: string
  name: string
  slug: string
  abbreviation: string
  nickname: string
  city: string
  country: string
  logoUrl: string
  alternateNames: string[]
  primaryColor: string
  secondaryColor: string
  venueId: string
  venueName: string
  isActive: boolean
}

const IMAGE_PRIORITY: Record<string, string[]> = {
  sport: ['icon', 'logo', 'badge', 'thumbnail'],
  league: ['badge', 'logo', 'thumbnail'],
  team: ['badge', 'logo', 'thumbnail'],
}

interface EntityImage {
  id: string
  image_type: string
  is_primary: boolean
  priority: number
  url: string
  status: string
}

interface EntityImageResponse {
  images: EntityImage[]
  total: number
}

async function fetchBestImage(entityType: string, entityId: string): Promise<string | null> {
  try {
    const res = await fetch(`${IMAGE_API_BASE}/images/entity/${entityType}/${entityId}?completedOnly=true`)
    if (!res.ok) return null
    const data: EntityImageResponse = await res.json()
    if (!data.images || data.images.length === 0) return null

    const completed = data.images.filter((i: EntityImage) => i.status === 'completed' && i.url)
    if (completed.length === 0) return null

    const types = IMAGE_PRIORITY[entityType] || ['logo', 'badge', 'thumbnail']
    for (const t of types) {
      const match = completed.find((i: EntityImage) => i.image_type === t && i.is_primary)
      if (match) return `${SPORTARR_IMG_BASE}${match.url}`
      const fallback = completed.find((i: EntityImage) => i.image_type === t)
      if (fallback) return `${SPORTARR_IMG_BASE}${fallback.url}`
    }

    const primary = completed.find((i: EntityImage) => i.is_primary)
    if (primary) return `${SPORTARR_IMG_BASE}${primary.url}`
    return `${SPORTARR_IMG_BASE}${completed[0].url}`
  } catch {
    return null
  }
}

async function populateImages<T extends { id: string }>(
  entityType: string, items: T[], field: keyof T, batchSize = 5
): Promise<T[]> {
  const ids = items.map(i => i.id)
  const imageMap = new Map<string, string>()
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize)
    const urls = await Promise.all(batch.map(id => fetchBestImage(entityType, id)))
    for (let j = 0; j < batch.length; j++) {
      if (urls[j]) imageMap.set(batch[j], urls[j]!)
    }
  }
  for (const item of items) {
    const img = imageMap.get(item.id)
    if (img) item[field] = img as T[keyof T]
  }
  return items
}

const http = {
  async get<T>(path: string): Promise<ApiResponse<T>> {
    const res = await fetch(`${SPORTARR_BASE}${path}`)
    if (!res.ok) throw new Error(`Sportarr API error: ${res.status}`)
    return res.json()
  },
  async getOne<T>(path: string): Promise<T> {
    const res = await fetch(`${SPORTARR_BASE}${path}`)
    if (!res.ok) throw new Error(`Sportarr API error: ${res.status}`)
    return res.json()
  },
}

export async function getSportsList(): Promise<SportarrSport[]> {
  const cacheKey = 'sports:list:v3'
  const cached = CacheService.getCache(cacheKey)
  if (cached) return JSON.parse(cached) as SportarrSport[]

  try {
    const data = await http.get<SportarrSport>('/sports')
    let sports = data.items.filter(s => s.isActive)
    sports = await populateImages('sport', sports, 'iconUrl')
    console.log(`[Sports] getSportsList: ${sports.length} sports, with image count: ${sports.filter(s => s.iconUrl).length}`)
    CacheService.setCache(cacheKey, JSON.stringify(sports), 86400000)
    return sports
  } catch (err: any) {
    console.error('[Sports] Failed to fetch sports list:', err.message)
    return []
  }
}

async function fetchAll<T>(basePath: string): Promise<T[]> {
  const all: T[] = []
  let skip = 0
  const pageSize = 100
  while (true) {
    const sep = basePath.includes('?') ? '&' : '?'
    const data = await http.get<T>(`${basePath}${sep}skip=${skip}&limit=${pageSize}`)
    all.push(...data.items)
    if (all.length >= data.total || data.items.length === 0) break
    skip += pageSize
  }
  return all
}

export async function getLeaguesBySport(sportId: string): Promise<SportarrLeague[]> {
  const cacheKey = `sports:leagues:v3:${sportId}`
  const cached = CacheService.getCache(cacheKey)
  if (cached) return JSON.parse(cached) as SportarrLeague[]

  try {
    const items = await fetchAll<SportarrLeague>(`/leagues?sport=${encodeURIComponent(sportId)}`)
    let leagues = items.filter(l => l.isActive)
    leagues = await populateImages('league', leagues, 'logoUrl')
    console.log(`[Sports] getLeaguesBySport(${sportId}): ${leagues.length} leagues, with image count: ${leagues.filter(l => l.logoUrl).length}`)
    CacheService.setCache(cacheKey, JSON.stringify(leagues), CACHE_TTL)
    return leagues
  } catch (err: any) {
    console.error(`[Sports] Failed to fetch leagues for ${sportId}:`, err.message)
    return []
  }
}

export async function getSeasons(leagueId: string): Promise<SportarrSeason[]> {
  const cacheKey = `sports:seasons:v2:${leagueId}`
  const cached = CacheService.getCache(cacheKey)
  if (cached) return JSON.parse(cached) as SportarrSeason[]

  try {
    const data = await http.get<SportarrSeason>(`/seasons?league=${encodeURIComponent(leagueId)}`)
    const seasons = data.items
    CacheService.setCache(cacheKey, JSON.stringify(seasons), CACHE_TTL)
    return seasons
  } catch (err: any) {
    console.error(`[Sports] Failed to fetch seasons for ${leagueId}:`, err.message)
    return []
  }
}

export async function getUpcomingEvents(leagueId: string, seasonId?: string): Promise<SportarrEvent[]> {
  const cacheKey = `sports:upcoming:v2:${leagueId}:${seasonId || 'all'}`
  const cached = CacheService.getCache(cacheKey)
  if (cached) return JSON.parse(cached) as SportarrEvent[]

  try {
    let path = `/events?league=${encodeURIComponent(leagueId)}`
    if (seasonId) path += `&season=${encodeURIComponent(seasonId)}`
    const items = await fetchAll<SportarrEvent>(path)
    const now = new Date()
    const events = items.filter(e => e.isActive && new Date(e.scheduledStart) > now)
    CacheService.setCache(cacheKey, JSON.stringify(events), CACHE_TTL)
    return events
  } catch (err: any) {
    console.error(`[Sports] Failed to fetch upcoming events for ${leagueId}:`, err.message)
    return []
  }
}

export async function getPastEvents(leagueId: string, seasonId?: string): Promise<SportarrEvent[]> {
  const cacheKey = `sports:past:v2:${leagueId}:${seasonId || 'all'}`
  const cached = CacheService.getCache(cacheKey)
  if (cached) return JSON.parse(cached) as SportarrEvent[]

  try {
    let path = `/events?league=${encodeURIComponent(leagueId)}`
    if (seasonId) path += `&season=${encodeURIComponent(seasonId)}`
    const items = await fetchAll<SportarrEvent>(path)
    const now = new Date()
    const events = items.filter(e => e.isActive && new Date(e.scheduledStart) <= now)
    CacheService.setCache(cacheKey, JSON.stringify(events), CACHE_TTL)
    return events
  } catch (err: any) {
    console.error(`[Sports] Failed to fetch past events for ${leagueId}:`, err.message)
    return []
  }
}

export async function getEventDetails(eventId: string): Promise<SportarrEvent | null> {
  const cacheKey = `sports:event:v2:${eventId}`
  const cached = CacheService.getCache(cacheKey)
  if (cached) return JSON.parse(cached) as SportarrEvent

  try {
    const event = await http.getOne<SportarrEvent>(`/events/${encodeURIComponent(eventId)}`)
    if (event) CacheService.setCache(cacheKey, JSON.stringify(event), CACHE_TTL)
    return event
  } catch (err: any) {
    console.error(`[Sports] Failed to fetch event ${eventId}:`, err.message)
    return null
  }
}

export async function getEventsInRange(leagueId: string, seasonId: string, from: string, to: string): Promise<SportarrEvent[]> {
  const cacheKey = `sports:events:range:${leagueId}:${seasonId}:${from}:${to}`
  const cached = CacheService.getCache(cacheKey)
  if (cached) return JSON.parse(cached) as SportarrEvent[]

  try {
    const path = `/events?league=${encodeURIComponent(leagueId)}&season=${encodeURIComponent(seasonId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    const items = await fetchAll<SportarrEvent>(path)
    const events = items.filter(e => e.isActive)
    CacheService.setCache(cacheKey, JSON.stringify(events), CACHE_TTL)
    return events
  } catch (err: any) {
    console.error(`[Sports] Failed to fetch events in range for ${leagueId}:`, err.message)
    return []
  }
}

export async function getTeamDetails(teamId: string): Promise<SportarrTeam | null> {
  const cacheKey = `sports:team:v3:${teamId}`
  const cached = CacheService.getCache(cacheKey)
  if (cached) return JSON.parse(cached) as SportarrTeam

  try {
    const team = await http.getOne<SportarrTeam>(`/teams/${encodeURIComponent(teamId)}`)
    if (team) {
      const img = await fetchBestImage('team', teamId)
      if (img) team.logoUrl = img
      CacheService.setCache(cacheKey, JSON.stringify(team), 86400000)
    }
    console.log(`[Sports] getTeamDetails(${teamId}):`, team ? `${team.name} logoUrl=${team.logoUrl || 'NONE'}` : 'null')
    return team
  } catch (err: any) {
    console.error(`[Sports] Failed to fetch team ${teamId}:`, err.message)
    return null
  }
}

export async function searchEvents(query: string): Promise<SportarrEvent[]> {
  try {
    const data = await http.get<SportarrEvent>(`/search?q=${encodeURIComponent(query)}&types=event`)
    return data.items
  } catch (err: any) {
    console.error(`[Sports] Failed to search events for ${query}:`, err.message)
    return []
  }
}
