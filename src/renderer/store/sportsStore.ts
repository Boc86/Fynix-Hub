import { create } from 'zustand'
import type { SportsLeague, SportsEvent, SportsTeam, SportarrSport, SportsSeason } from '../types.d'

type SportsView = 'sports' | 'leagues' | 'seasons' | 'events' | 'detail'

interface SportsState {
  sportsList: SportarrSport[]
  leagues: SportsLeague[]
  seasons: SportsSeason[]
  selectedSport: SportarrSport | null
  selectedLeague: SportsLeague | null
  selectedSeason: SportsSeason | null
  upcomingEvents: SportsEvent[]
  pastEvents: SportsEvent[]
  selectedEvent: SportsEvent | null
  homeTeam: SportsTeam | null
  awayTeam: SportsTeam | null
  loading: boolean
  error: string | null
  view: SportsView

  setSportsList: (list: SportarrSport[]) => void
  setLeagues: (leagues: SportsLeague[]) => void
  setSeasons: (seasons: SportsSeason[]) => void
  setSelectedSport: (sport: SportarrSport | null) => void
  setSelectedLeague: (league: SportsLeague | null) => void
  setSelectedSeason: (season: SportsSeason | null) => void
  setUpcomingEvents: (events: SportsEvent[]) => void
  setPastEvents: (events: SportsEvent[]) => void
  setSelectedEvent: (event: SportsEvent | null) => void
  setHomeTeam: (team: SportsTeam | null) => void
  setAwayTeam: (team: SportsTeam | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setView: (view: SportsView) => void
  reset: () => void
}

const initialState = {
  sportsList: [] as SportarrSport[],
  leagues: [] as SportsLeague[],
  seasons: [] as SportsSeason[],
  selectedSport: null as SportarrSport | null,
  selectedLeague: null as SportsLeague | null,
  selectedSeason: null as SportsSeason | null,
  upcomingEvents: [] as SportsEvent[],
  pastEvents: [] as SportsEvent[],
  selectedEvent: null as SportsEvent | null,
  homeTeam: null as SportsTeam | null,
  awayTeam: null as SportsTeam | null,
  loading: false,
  error: null as string | null,
  view: 'sports' as const,
}

export const useSportsStore = create<SportsState>((set) => ({
  ...initialState,

  setSportsList: (list) => set({ sportsList: list }),
  setLeagues: (leagues) => set({ leagues }),
  setSeasons: (seasons) => set({ seasons }),
  setSelectedSport: (sport) => set({ selectedSport: sport }),
  setSelectedLeague: (league) => set({ selectedLeague: league }),
  setSelectedSeason: (season) => set({ selectedSeason: season }),
  setUpcomingEvents: (events) => set({ upcomingEvents: events }),
  setPastEvents: (events) => set({ pastEvents: events }),
  setSelectedEvent: (event) => set({ selectedEvent: event }),
  setHomeTeam: (team) => set({ homeTeam: team }),
  setAwayTeam: (team) => set({ awayTeam: team }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setView: (view) => set({ view }),
  reset: () => set(initialState),
}))
