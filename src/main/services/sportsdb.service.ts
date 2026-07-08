import * as CacheService from './cache.service'

const API_BASE = 'https://thesportsdb.com/api/v1/json'
const API_KEY = '3'
const RATE_LIMIT_MS = 2000
const CACHE_TTL_SPORTS = 86400000
const CACHE_TTL_LEAGUES = 86400000
const CACHE_TTL_TEAMS = 86400000

let lastRequestTime = 0

async function rateLimitedFetch(url: string): Promise<any> {
  const now = Date.now()
  const wait = Math.max(0, RATE_LIMIT_MS - (now - lastRequestTime))
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastRequestTime = Date.now()
  const res = await fetch(url)
  if (!res.ok) throw new Error(`SportsDB HTTP ${res.status}`)
  return res.json()
}

export interface SportsDBSport {
  id: string
  name: string
  thumb: string
  icon: string
  banner: string
  description: string
  format: string
}

export interface SportsDBLeague {
  id: string
  name: string
  alternateName: string
  sport: string
  sportId: string
  logo: string
  banner: string
  badge: string
  poster: string
  country: string
  description: string
  formedYear: string
}

export interface SportsDBTeam {
  id: string
  name: string
  alternateName: string
  country: string
  league: string
  leagueId: string
  sport: string
  sportId: string
  badge: string
  logo: string
  banner: string
  jersey: string
  stadium: string
  stadiumThumb: string
  description: string
  formedYear: string
  primaryColor: string
  secondaryColor: string
}

function parseSport(item: any): SportsDBSport {
  return {
    id: item.idSport || '',
    name: item.strSport || '',
    thumb: item.strSportThumb || '',
    icon: item.strSportIconGreen || item.strSportIcon || '',
    banner: item.strSportBanner || '',
    description: item.strSportDescription || '',
    format: item.strFormat || '',
  }
}

function parseLeague(item: any): SportsDBLeague {
  return {
    id: item.idLeague || '',
    name: item.strLeague || '',
    alternateName: item.strLeagueAlternate || '',
    sport: item.strSport || '',
    sportId: item.idSport || '',
    logo: item.strLogo || item.strBadge || item.strPoster || '',
    banner: item.strBanner || '',
    badge: item.strBadge || '',
    poster: item.strPoster || '',
    country: item.strCountry || '',
    description: item.strDescriptionEN || '',
    formedYear: item.intFormedYear || '',
  }
}

function parseTeam(item: any): SportsDBTeam {
  return {
    id: item.idTeam || '',
    name: item.strTeam || '',
    alternateName: item.strAlternate || '',
    country: item.strCountry || '',
    league: item.strLeague || '',
    leagueId: item.idLeague || '',
    sport: item.strSport || '',
    sportId: item.idSport || '',
    badge: item.strBadge || item.strLogo || item.strTeamBadge || '',
    logo: item.strLogo || item.strTeamLogo || '',
    banner: item.strBanner || item.strTeamBanner || '',
    jersey: item.strEquipment || '',
    stadium: item.strStadium || '',
    stadiumThumb: item.strStadiumThumb || '',
    description: item.strDescriptionEN || '',
    formedYear: item.intFormedYear || '',
    primaryColor: item.strTeam || '',
    secondaryColor: item.strTeam2 || '',
  }
}

export async function getAllSports(): Promise<SportsDBSport[]> {
  const cacheKey = 'sportsdb:sports'
  const cached = CacheService.getCache(cacheKey)
  if (cached) return JSON.parse(cached)

  const data = await rateLimitedFetch(`${API_BASE}/${API_KEY}/all_sports.php`)
  const sports: SportsDBSport[] = (data.sports || []).map(parseSport)
  CacheService.setCache(cacheKey, JSON.stringify(sports), CACHE_TTL_SPORTS)
  return sports
}

export async function searchTeams(teamName: string): Promise<SportsDBTeam[]> {
  const data = await rateLimitedFetch(`${API_BASE}/${API_KEY}/searchteams.php?t=${encodeURIComponent(teamName)}`)
  return (data.teams || []).map(parseTeam)
}

export async function getTeamById(teamId: string): Promise<SportsDBTeam | null> {
  const cacheKey = `sportsdb:team:${teamId}`
  const cached = CacheService.getCache(cacheKey)
  if (cached) return JSON.parse(cached)

  const data = await rateLimitedFetch(`${API_BASE}/${API_KEY}/lookupteam.php?id=${teamId}`)
  const teams = (data.teams || []).map(parseTeam)
  const team = teams[0] || null
  if (team) CacheService.setCache(cacheKey, JSON.stringify(team), CACHE_TTL_TEAMS)
  return team
}

export async function getLeagueById(leagueId: string): Promise<SportsDBLeague | null> {
  const cacheKey = `sportsdb:league:${leagueId}`
  const cached = CacheService.getCache(cacheKey)
  if (cached) return JSON.parse(cached)

  const data = await rateLimitedFetch(`${API_BASE}/${API_KEY}/lookupleague.php?id=${leagueId}`)
  const leagues = (data.leagues || []).map(parseLeague)
  const league = leagues[0] || null
  if (league) CacheService.setCache(cacheKey, JSON.stringify(league), CACHE_TTL_LEAGUES)
  return league
}

export async function searchLeagues(query: string): Promise<SportsDBLeague[]> {
  const data = await rateLimitedFetch(`${API_BASE}/${API_KEY}/searchteams.php?t=${encodeURIComponent(query)}`)
  return (data.teams || []).map(parseLeague)
}

export async function getTeamsBySport(sportName: string): Promise<SportsDBTeam[]> {
  const data = await rateLimitedFetch(`${API_BASE}/${API_KEY}/searchteams.php?s=${encodeURIComponent(sportName)}`)
  return (data.teams || []).map(parseTeam)
}

const SPORT_NAME_MAP: Record<string, string[]> = {
  'football': ['Soccer'],
  'american-football': ['American Football'],
  'basketball': ['Basketball'],
  'hockey': ['Ice Hockey'],
  'baseball': ['Baseball'],
  'motor-sports': ['Formula 1', 'MotoGP', 'NASCAR', 'IndyCar'],
  'fight': ['Boxing', 'MMA', 'UFC', 'WWE', 'Wrestling'],
  'tennis': ['Tennis'],
  'rugby': ['Rugby'],
  'golf': ['Golf'],
  'billiards': ['Snooker', 'Pool'],
  'afl': ['Australian Rules Football'],
  'darts': ['Darts'],
  'cricket': ['Cricket'],
}

const REVERSE_SPORT_MAP: Record<string, string> = {}
for (const [ourSport, dbSports] of Object.entries(SPORT_NAME_MAP)) {
  for (const dbSport of dbSports) {
    REVERSE_SPORT_MAP[dbSport.toLowerCase()] = ourSport
  }
}

export function mapOurSportToDbNames(ourSport: string): string[] {
  return SPORT_NAME_MAP[ourSport] || [ourSport]
}

export function mapDbSportToOurName(dbSportName: string): string | undefined {
  return REVERSE_SPORT_MAP[dbSportName.toLowerCase()]
}
