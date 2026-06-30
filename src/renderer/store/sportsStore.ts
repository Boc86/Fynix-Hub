import { create } from 'zustand'
import type { SportsLeague, SportsEvent, SportsTeam } from '../types.d'

interface SportsState {
  sportsList: string[]
  leagues: SportsLeague[]
  selectedSport: string | null
  selectedLeague: SportsLeague | null
  upcomingEvents: SportsEvent[]
  pastEvents: SportsEvent[]
  selectedEvent: SportsEvent | null
  homeTeam: SportsTeam | null
  awayTeam: SportsTeam | null
  loading: boolean
  error: string | null
  view: 'sports' | 'leagues' | 'events' | 'detail'

  setSportsList: (list: string[]) => void
  setLeagues: (leagues: SportsLeague[]) => void
  setSelectedSport: (sport: string | null) => void
  setSelectedLeague: (league: SportsLeague | null) => void
  setUpcomingEvents: (events: SportsEvent[]) => void
  setPastEvents: (events: SportsEvent[]) => void
  setSelectedEvent: (event: SportsEvent | null) => void
  setHomeTeam: (team: SportsTeam | null) => void
  setAwayTeam: (team: SportsTeam | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setView: (view: 'sports' | 'leagues' | 'events' | 'detail') => void
  reset: () => void
}

const initialState = {
  sportsList: [],
  leagues: [],
  selectedSport: null,
  selectedLeague: null,
  upcomingEvents: [],
  pastEvents: [],
  selectedEvent: null,
  homeTeam: null,
  awayTeam: null,
  loading: false,
  error: null,
  view: 'sports' as const,
}

export const useSportsStore = create<SportsState>((set) => ({
  ...initialState,

  setSportsList: (list) => set({ sportsList: list }),
  setLeagues: (leagues) => set({ leagues }),
  setSelectedSport: (sport) => set({ selectedSport: sport }),
  setSelectedLeague: (league) => set({ selectedLeague: league }),
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
