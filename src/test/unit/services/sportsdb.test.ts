import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mapOurSportToDbNames, mapDbSportToOurName } from '@/main/services/sportsdb.service'

describe('sportsdb.service pure functions', () => {
  describe('mapOurSportToDbNames', () => {
    it('maps football to Soccer', () => {
      expect(mapOurSportToDbNames('football')).toEqual(['Soccer'])
    })

    it('maps basketball to Basketball', () => {
      expect(mapOurSportToDbNames('basketball')).toEqual(['Basketball'])
    })

    it('maps fight to multiple combat sports', () => {
      const result = mapOurSportToDbNames('fight')
      expect(result).toContain('Boxing')
      expect(result).toContain('MMA')
      expect(result).toContain('UFC')
      expect(result).toContain('WWE')
      expect(result).toContain('Wrestling')
    })

    it('maps motor-sports to multiple racing series', () => {
      const result = mapOurSportToDbNames('motor-sports')
      expect(result).toContain('Formula 1')
      expect(result).toContain('MotoGP')
      expect(result).toContain('NASCAR')
    })

    it('returns input as array for unknown sport', () => {
      expect(mapOurSportToDbNames('curling')).toEqual(['curling'])
    })

    it('maps hockey to Ice Hockey', () => {
      expect(mapOurSportToDbNames('hockey')).toEqual(['Ice Hockey'])
    })

    it('maps billiards to Snooker and Pool', () => {
      const result = mapOurSportToDbNames('billiards')
      expect(result).toContain('Snooker')
      expect(result).toContain('Pool')
    })
  })

  describe('mapDbSportToOurName', () => {
    it('maps Soccer to football', () => {
      expect(mapDbSportToOurName('Soccer')).toBe('football')
    })

    it('maps Basketball to basketball', () => {
      expect(mapDbSportToOurName('Basketball')).toBe('basketball')
    })

    it('maps Ice Hockey to hockey', () => {
      expect(mapDbSportToOurName('Ice Hockey')).toBe('hockey')
    })

    it('maps Boxing to fight', () => {
      expect(mapDbSportToOurName('Boxing')).toBe('fight')
    })

    it('maps UFC to fight', () => {
      expect(mapDbSportToOurName('UFC')).toBe('fight')
    })

    it('is case insensitive', () => {
      expect(mapDbSportToOurName('soccer')).toBe('football')
      expect(mapDbSportToOurName('BASKETBALL')).toBe('basketball')
    })

    it('returns undefined for unknown sport', () => {
      expect(mapDbSportToOurName('CricketSport')).toBeUndefined()
    })
  })
})

// --- API tests with MSW ---
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import * as CacheService from '@/main/services/cache.service'
import { getAllSports, searchTeams, getTeamById, getLeagueById } from '@/main/services/sportsdb.service'

vi.mock('@/main/services/cache.service', () => ({
  getCache: vi.fn(),
  setCache: vi.fn(),
  getSetting: vi.fn(),
}))

const mockGetCache = vi.mocked(CacheService.getCache)
const mockSetCache = vi.mocked(CacheService.setCache)

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => {
  server.resetHandlers()
  vi.clearAllMocks()
})
afterAll(() => server.close())

describe('sportsdb.service API', () => {
  it('getAllSports returns cached data when available', async () => {
    const cached = [{ id: '1', name: 'Soccer', thumb: '', icon: '', banner: '', description: '', format: '' }]
    mockGetCache.mockReturnValueOnce(JSON.stringify(cached))

    const result = await getAllSports()
    expect(result).toEqual(cached)
  })

  it('getAllSports fetches and parses sports', async () => {
    mockGetCache.mockReturnValueOnce(null)
    server.use(
      http.get('https://thesportsdb.com/api/v1/json/3/all_sports.php', () => {
        return HttpResponse.json({
          sports: [{
            idSport: '1',
            strSport: 'Soccer',
            strSportThumb: 'thumb.jpg',
            strSportIconGreen: 'icon.png',
            strSportBanner: 'banner.jpg',
            strSportDescription: 'A sport',
            strFormat: '11v11',
          }],
        })
      })
    )

    const result = await getAllSports()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Soccer')
    expect(result[0].thumb).toBe('thumb.jpg')
    expect(mockSetCache).toHaveBeenCalled()
  })

  it('searchTeams returns parsed teams', async () => {
    server.use(
      http.get('https://thesportsdb.com/api/v1/json/3/searchteams.php', ({ request }) => {
        const url = new URL(request.url!)
        expect(url.searchParams.get('t')).toBe('Arsenal')
        return HttpResponse.json({
          teams: [{
            idTeam: '1',
            strTeam: 'Arsenal',
            strBadge: 'badge.png',
            strLogo: 'logo.png',
            strStadium: 'Emirates',
          }],
        })
      })
    )

    const result = await searchTeams('Arsenal')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Arsenal')
    expect(result[0].badge).toBe('badge.png')
  })

  it('getTeamById returns cached team', async () => {
    const team = { id: '1', name: 'Arsenal', badge: 'badge.png' }
    mockGetCache.mockReturnValueOnce(JSON.stringify(team))

    const result = await getTeamById('1')
    expect(result).toEqual(team)
  })

  it('getTeamById fetches and caches when not cached', async () => {
    mockGetCache.mockReturnValueOnce(null)
    server.use(
      http.get('https://thesportsdb.com/api/v1/json/3/lookupteam.php', ({ request }) => {
        const url = new URL(request.url!)
        expect(url.searchParams.get('id')).toBe('42')
        return HttpResponse.json({
          teams: [{ idTeam: '42', strTeam: 'Chelsea' }],
        })
      })
    )

    const result = await getTeamById('42')
    expect(result?.name).toBe('Chelsea')
    expect(mockSetCache).toHaveBeenCalled()
  })

  it('getTeamById returns null for empty result', async () => {
    mockGetCache.mockReturnValueOnce(null)
    server.use(
      http.get('https://thesportsdb.com/api/v1/json/3/lookupteam.php', () => {
        return HttpResponse.json({ teams: null })
      })
    )

    const result = await getTeamById('999')
    expect(result).toBeNull()
  })

  it('getLeagueById returns cached league', async () => {
    const league = { id: '1', name: 'Premier League' }
    mockGetCache.mockReturnValueOnce(JSON.stringify(league))

    const result = await getLeagueById('1')
    expect(result).toEqual(league)
  })

  it('getLeagueById fetches when not cached', async () => {
    mockGetCache.mockReturnValueOnce(null)
    server.use(
      http.get('https://thesportsdb.com/api/v1/json/3/lookupleague.php', () => {
        return HttpResponse.json({
          leagues: [{ idLeague: '1', strLeague: 'Premier League' }],
        })
      })
    )

    const result = await getLeagueById('1')
    expect(result?.name).toBe('Premier League')
  })
})
