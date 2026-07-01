import * as CacheService from './cache.service'

const SPORTARR_BASE = 'https://sportarr.net/api/public/v1'

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
  const cacheKey = 'sports:list:v2'
  const cached = CacheService.getCache(cacheKey)
  if (cached) return JSON.parse(cached) as SportarrSport[]

  try {
    const data = await http.get<SportarrSport>('/sports')
    const sports = data.items.filter(s => s.isActive)
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
  const cacheKey = `sports:leagues:v2:${sportId}`
  const cached = CacheService.getCache(cacheKey)
  if (cached) return JSON.parse(cached) as SportarrLeague[]

  try {
    const items = await fetchAll<SportarrLeague>(`/leagues?sport=${encodeURIComponent(sportId)}`)
    const leagues = items.filter(l => l.isActive)
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

export async function getTeamDetails(teamId: string): Promise<SportarrTeam | null> {
  const cacheKey = `sports:team:v2:${teamId}`
  const cached = CacheService.getCache(cacheKey)
  if (cached) return JSON.parse(cached) as SportarrTeam

  try {
    const team = await http.getOne<SportarrTeam>(`/teams/${encodeURIComponent(teamId)}`)
    if (team) CacheService.setCache(cacheKey, JSON.stringify(team), 86400000)
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
