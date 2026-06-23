import * as CacheService from './cache.service'

const BASE_URL_TEMPLATE = 'https://v2.{sport}.sportsapipro.com'

let apiKey = ''

export function loadApiKey(): void {
  apiKey = CacheService.getSetting<string>('sportsDbApiKey') || ''
}

export function setApiKey(key: string): void {
  apiKey = key
  CacheService.setSetting('sportsDbApiKey', key)
}

function getApiKey(): string {
  loadApiKey()
  return apiKey
}

function baseUrl(sportSlug: string): string {
  return BASE_URL_TEMPLATE.replace('{sport}', sportSlug)
}

async function fetchJson<T>(sportSlug: string, path: string, query?: Record<string, string | number>): Promise<T> {
  const key = getApiKey()
  if (!key) throw new Error('SportsAPI Pro key not configured')

  const url = new URL(baseUrl(sportSlug) + path)
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
    })
  }

  const res = await fetch(url.toString(), {
    headers: { 'x-api-key': key },
  })
  if (!res.ok) throw new Error(`SportsAPI Pro HTTP ${res.status}`)
  return res.json() as Promise<T>
}

export interface Sport {
  id: number
  name: string
  slug: string
}

export interface Country {
  id: number
  name: string
  slug: string
  code?: string
  flagUrl?: string
}

export interface Competition {
  id: number
  name: string
  slug: string
  countryId?: number
  countryName?: string
  sportSlug: string
}

export interface Season {
  id: number
  name: string
  year?: string
}

export interface Fixture {
  id: number
  name: string
  homeTeam: string
  awayTeam: string
  homeTeamId?: number
  awayTeamId?: number
  startTimestamp?: number
  statusCode?: number
  statusType?: string
  homeScore?: number
  awayScore?: number
  tournament?: string
}

export interface Team {
  id: number
  name: string
  slug?: string
  country?: string
  countryCode?: string
}

export const SUPPORTED_SPORTS: Sport[] = [
  { id: 1, name: 'Football', slug: 'football' },
  { id: 2, name: 'Basketball', slug: 'basketball' },
  { id: 3, name: 'Tennis', slug: 'tennis' },
  { id: 4, name: 'Ice Hockey', slug: 'hockey' },
  { id: 5, name: 'Handball', slug: 'handball' },
  { id: 6, name: 'American Football', slug: 'american-football' },
  { id: 7, name: 'Baseball', slug: 'baseball' },
  { id: 8, name: 'Volleyball', slug: 'volleyball' },
  { id: 10, name: 'Cycling', slug: 'cycling' },
  { id: 11, name: 'Motorsport', slug: 'motorsport' },
  { id: 12, name: 'Rugby', slug: 'rugby' },
  { id: 15, name: 'Table Tennis', slug: 'table-tennis' },
  { id: 19, name: 'Snooker', slug: 'snooker' },
  { id: 22, name: 'Darts', slug: 'darts' },
  { id: 26, name: 'Water Polo', slug: 'waterpolo' },
  { id: 29, name: 'Futsal', slug: 'futsal' },
  { id: 31, name: 'Badminton', slug: 'badminton' },
  { id: 32, name: 'Bandy', slug: 'bandy' },
  { id: 34, name: 'Beach Volleyball', slug: 'beach-volley' },
  { id: 62, name: 'Cricket', slug: 'cricket' },
  { id: 64, name: 'Minifootball', slug: 'minifootball' },
  { id: 71, name: 'Aussie Rules', slug: 'aussie-rules' },
  { id: 72, name: 'Esports', slug: 'esports' },
  { id: 74, name: 'Floorball', slug: 'floorball' },
  { id: 117, name: 'MMA', slug: 'mma' },
]

export async function getAllSports(): Promise<Sport[]> {
  return SUPPORTED_SPORTS
}

function parseCountries(data: any): Country[] {
  const raw = Array.isArray(data) ? data : (data.countries || [])
  return raw.map((c: any) => ({
    id: c.id,
    name: c.name,
    slug: c.slug || c.nameForURL || String(c.id),
    code: c.code || c.alpha2,
    flagUrl: c.flagUrl || (c.imageVersion !== undefined ? `${baseUrl('football')}/api/country/${c.code || c.alpha2}/flag` : undefined),
  })).filter((c: Country) => c.id && c.name).sort((a: Country, b: Country) => a.name.localeCompare(b.name))
}

export async function getCountries(sportSlug: string): Promise<Country[]> {
  const data = await fetchJson<any>(sportSlug, '/api/countries')
  return parseCountries(data)
}

function parseCompetitions(data: any, sportSlug: string): Competition[] {
  let raw: any[] = []
  if (Array.isArray(data)) {
    raw = data
  } else if (data.tournaments) {
    raw = data.tournaments
  } else if (data.leagues) {
    raw = data.leagues
  } else if (data.categories) {
    raw = data.categories.flatMap((cat: any) => cat.tournaments || cat.leagues || [])
  }

  return raw.map((c: any) => ({
    id: c.id,
    name: c.name || c.uniqueName,
    slug: c.slug || c.nameForURL || String(c.id),
    countryId: c.countryId,
    countryName: c.country?.name,
    sportSlug,
  })).filter((c: Competition) => c.id && c.name).sort((a: Competition, b: Competition) => a.name.localeCompare(b.name))
}

export async function getCompetitions(sportSlug: string, sportId: number, countrySlug?: string): Promise<Competition[]> {
  // Some sports (e.g., rugby, motorsport) do not use a country hierarchy.
  // If a countrySlug is provided we query by country, otherwise we query by sport ID.
  const query: Record<string, string | number> = {}
  if (countrySlug) query.country = countrySlug
  else query.sports = sportId
  const data = await fetchJson<any>(sportSlug, '/api/competitions', query)
  const all = parseCompetitions(data, sportSlug)
  if (countrySlug) {
    return all.filter((c) =>
      c.countryName?.toLowerCase() === countrySlug.toLowerCase() ||
      c.slug?.toLowerCase().includes(countrySlug.toLowerCase())
    )
  }
  return all
}

export async function getTournamentSeasons(sportSlug: string, tournamentId: number): Promise<Season[]> {
  const data = await fetchJson<any>(sportSlug, `/api/tournaments/${tournamentId}/seasons`)
  const raw = data.seasons || []
  return raw.map((s: any) => ({
    id: s.id,
    name: s.name || s.year,
    year: s.year,
  })).filter((s: Season) => s.id && s.name).sort((a: Season, b: Season) => String(b.name).localeCompare(String(a.name)))
}

function parseEvent(e: any): Fixture | null {
  if (!e) return null
  const home = e.homeTeam?.name || e.home
  const away = e.awayTeam?.name || e.away
  if (!home || !away) return null
  return {
    id: e.id,
    name: e.name || `${home} vs ${away}`,
    homeTeam: home,
    awayTeam: away,
    homeTeamId: e.homeTeam?.id,
    awayTeamId: e.awayTeam?.id,
    startTimestamp: e.startTimestamp,
    statusCode: e.status?.code,
    statusType: e.status?.type,
    homeScore: e.homeScore?.current ?? e.homeScore,
    awayScore: e.awayScore?.current ?? e.awayScore,
    tournament: e.tournament?.name || e.tournament,
  }
}

export async function getTournamentEvents(
  sportSlug: string,
  tournamentId: number,
  seasonId: number,
  page = 0,
  direction: 'last' | 'next' = 'last'
): Promise<{ fixtures: Fixture[]; hasMore: boolean }> {
  const data = await fetchJson<any>(sportSlug, `/api/tournament/${tournamentId}/season/${seasonId}/events/${direction}/${page}`)
  const raw = data.events || []
  const fixtures = raw.map(parseEvent).filter((f: Fixture | null): f is Fixture => f !== null)
  return { fixtures, hasMore: !!data.hasMore || data.events?.length === 30 || false }
}

export async function searchTeams(sportSlug: string, query: string): Promise<Team[]> {
  const data = await fetchJson<any>(sportSlug, '/api/search', { q: query })
  const results = data.data?.results || data.results || []
  return results
    .filter((r: any) => r.type === 'team' || r.entity?.type === 0 || r.entity?.type === 1)
    .map((r: any) => {
      const entity = r.entity || r
      return {
        id: entity.id,
        name: entity.name,
        slug: entity.slug,
        country: entity.country?.name,
        countryCode: entity.country?.alpha2,
      }
    })
    .filter((t: Team) => t.id && t.name)
}

export async function getTeamProfile(sportSlug: string, teamId: number): Promise<Team & { venue?: string; manager?: string }> {
  const data = await fetchJson<any>(sportSlug, `/api/teams/${teamId}`)
  const team = data.team || data.data?.team || data
  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    country: team.country?.name,
    countryCode: team.country?.alpha2,
    venue: team.venue?.name,
    manager: team.manager?.name,
  }
}

export async function getTeamEvents(
  sportSlug: string,
  teamId: number,
  page = 0,
  direction: 'last' | 'next' = 'last'
): Promise<{ fixtures: Fixture[]; hasMore: boolean }> {
  const data = await fetchJson<any>(sportSlug, `/api/teams/${teamId}/events/${direction}/${page}`)
  const raw = data.events || []
  const fixtures = raw.map(parseEvent).filter((f: Fixture | null): f is Fixture => f !== null)
  return { fixtures, hasMore: !!data.hasMore || data.events?.length === 30 || false }
}
