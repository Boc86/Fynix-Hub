import * as CacheService from './cache.service'

const SPORTSDB_BASE = 'https://www.thesportsdb.com/api/v1/json'

let apiKey = ''

export function setApiKey(key: string) {
  apiKey = key
}

export function loadApiKey() {
  apiKey = CacheService.getSetting<string>('sportsDbApiKey') || ''
}

function getApiKey(): string {
  return apiKey || '3' // free test key
}

async function fetchSportsDb(path: string) {
  const key = getApiKey()
  const res = await fetch(`${SPORTSDB_BASE}/${key}${path}`)
  if (!res.ok) throw new Error(`TheSportsDB error: ${res.status}`)
  return res.json()
}

export interface SportsLeague {
  idLeague: string
  strLeague: string
  strSport: string
  strBadge: string
  strLogo: string
  strTrophy: string
  strDescription: string
  strBanner: string
  strCountry: string
  strFanart1: string
  strFanart2: string
  strFanart3: string
  strCurrentSeason: string
  strDivision: string
}

export interface SportsEvent {
  idEvent: string
  idLeague: string
  idHomeTeam: string
  idAwayTeam: string
  strEvent: string
  strEventAlternate: string
  strHomeTeam: string
  strAwayTeam: string
  strHomeTeamBadge: string
  strAwayTeamBadge: string
  dateEvent: string
  strTime: string
  strThumb: string
  strSeason: string
  strSport: string
  intHomeScore: string
  intAwayScore: string
  strStatus: string
  strPoster: string
  strVideo: string
  strFilename: string
  strCountry: string
  strVenue: string
}

export interface SportsTeam {
  idTeam: string
  strTeam: string
  strTeamBadge: string
  strTeamJersey: string
  strTeamLogo: string
  strTeamFanart1: string
  strTeamBanner: string
  strDescription: string
  strCountry: string
  strStadium: string
  strLeague: string
  idLeague: string
}

const CACHE_TTL = 300000 // 5 minutes

export async function getAllLeagues(): Promise<SportsLeague[]> {
  const cacheKey = 'sports:all-leagues'
  const cached = CacheService.getCache(cacheKey)
  if (cached) return JSON.parse(cached) as SportsLeague[]

  try {
    const data = await fetchSportsDb('/all_leagues.php')
    const leagues = (data?.leagues || []) as SportsLeague[]
    CacheService.setCache(cacheKey, JSON.stringify(leagues), CACHE_TTL)
    return leagues
  } catch (err: any) {
    console.error('[Sports] Failed to fetch leagues:', err.message)
    return []
  }
}

export async function getLeaguesBySport(sport: string): Promise<SportsLeague[]> {
  const cacheKey = `sports:leagues:${sport}`
  const cached = CacheService.getCache(cacheKey)
  if (cached) return JSON.parse(cached) as SportsLeague[]

  try {
    const data = await fetchSportsDb(`/search_all_leagues.php?s=${encodeURIComponent(sport)}`)
    const leagues = (data?.country || []) as SportsLeague[]
    CacheService.setCache(cacheKey, JSON.stringify(leagues), CACHE_TTL)
    return leagues
  } catch (err: any) {
    console.error(`[Sports] Failed to fetch ${sport} leagues:`, err.message)
    return []
  }
}

export async function getSportsList(): Promise<string[]> {
  const cacheKey = 'sports:list'
  const cached = CacheService.getCache(cacheKey)
  if (cached) return JSON.parse(cached) as string[]

  try {
    const data = await fetchSportsDb('/all_sports.php')
    const sports = (data?.sports || []).map((s: any) => s.strSport) as string[]
    CacheService.setCache(cacheKey, JSON.stringify(sports), 86400000)
    return sports
  } catch (err: any) {
    console.error('[Sports] Failed to fetch sports list:', err.message)
    return []
  }
}

export async function getUpcomingEvents(leagueId: string): Promise<SportsEvent[]> {
  const cacheKey = `sports:upcoming:${leagueId}`
  const cached = CacheService.getCache(cacheKey)
  if (cached) return JSON.parse(cached) as SportsEvent[]

  try {
    const data = await fetchSportsDb(`/eventsnextleague.php?id=${leagueId}`)
    const events = (data?.events || []) as SportsEvent[]
    CacheService.setCache(cacheKey, JSON.stringify(events), CACHE_TTL)
    return events
  } catch (err: any) {
    console.error(`[Sports] Failed to fetch upcoming events for ${leagueId}:`, err.message)
    return []
  }
}

export async function getPastEvents(leagueId: string): Promise<SportsEvent[]> {
  const cacheKey = `sports:past:${leagueId}`
  const cached = CacheService.getCache(cacheKey)
  if (cached) return JSON.parse(cached) as SportsEvent[]

  try {
    const data = await fetchSportsDb(`/eventspastleague.php?id=${leagueId}`)
    const events = (data?.events || []) as SportsEvent[]
    CacheService.setCache(cacheKey, JSON.stringify(events), CACHE_TTL)
    return events
  } catch (err: any) {
    console.error(`[Sports] Failed to fetch past events for ${leagueId}:`, err.message)
    return []
  }
}

export async function getEventDetails(eventId: string): Promise<SportsEvent | null> {
  const cacheKey = `sports:event:${eventId}`
  const cached = CacheService.getCache(cacheKey)
  if (cached) return JSON.parse(cached) as SportsEvent

  try {
    const data = await fetchSportsDb(`/event_details.php?id=${eventId}`)
    const events = (data?.events || []) as SportsEvent[]
    if (events.length === 0) return null
    CacheService.setCache(cacheKey, JSON.stringify(events[0]), CACHE_TTL)
    return events[0]
  } catch (err: any) {
    console.error(`[Sports] Failed to fetch event ${eventId}:`, err.message)
    return null
  }
}

export async function getTeamDetails(teamId: string): Promise<SportsTeam | null> {
  const cacheKey = `sports:team:${teamId}`
  const cached = CacheService.getCache(cacheKey)
  if (cached) return JSON.parse(cached) as SportsTeam

  try {
    const data = await fetchSportsDb(`/lookupteam.php?id=${teamId}`)
    const teams = (data?.teams || []) as SportsTeam[]
    if (teams.length === 0) return null
    CacheService.setCache(cacheKey, JSON.stringify(teams[0]), 86400000)
    return teams[0]
  } catch (err: any) {
    console.error(`[Sports] Failed to fetch team ${teamId}:`, err.message)
    return null
  }
}

export async function searchEvents(query: string): Promise<SportsEvent[]> {
  try {
    const data = await fetchSportsDb(`/searchteams.php?t=${encodeURIComponent(query)}`)
    return (data?.event || []) as SportsEvent[]
  } catch (err: any) {
    console.error(`[Sports] Failed to search events for ${query}:`, err.message)
    return []
  }
}
