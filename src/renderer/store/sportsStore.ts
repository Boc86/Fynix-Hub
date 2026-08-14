import { create } from 'zustand'
import type { SportsLeague, SportsEvent, SportsTeam, SportarrSport, SportsSeason } from '../types.d'

export interface ReplayEvent {
  id: string
  title: string
  date: string
  thumbnail?: string
  sources: { label: string; type: string; url: string }[]
}

export interface ScheduleMatch {
  id: string; title: string; category: string; date: number; poster?: string
  teams?: { home?: { name: string; badge: string }; away?: { name: string; badge: string } }
  sources: { source: string; id: string; embedUrl?: string }[]
}

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
  replayEvents: ReplayEvent[]  // fallback when Sportarr has no events (e.g., motorsport)
  selectedEvent: SportsEvent | null
  homeTeam: SportsTeam | null
  awayTeam: SportsTeam | null
  loading: boolean
  error: string | null
  view: SportsView
  // Live schedule lives in the store (not component state) so it survives
  // navigating away and back — re-fetching the whole day's matches on every
  // screen entry was the "loads every time" slowdown.
  scheduleMatches: ScheduleMatch[]
  scheduleLastUpdated: Date | null

  setSportsList: (list: SportarrSport[]) => void
  setLeagues: (leagues: SportsLeague[]) => void
  setSeasons: (seasons: SportsSeason[]) => void
  setSelectedSport: (sport: SportarrSport | null) => void
  setSelectedLeague: (league: SportsLeague | null) => void
  setSelectedSeason: (season: SportsSeason | null) => void
  setUpcomingEvents: (events: SportsEvent[]) => void
  setPastEvents: (events: SportsEvent[]) => void
  setReplayEvents: (events: ReplayEvent[]) => void
  setSelectedEvent: (event: SportsEvent | null) => void
  setHomeTeam: (team: SportsTeam | null) => void
  setAwayTeam: (team: SportsTeam | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setView: (view: SportsView) => void
  setScheduleMatches: (matches: ScheduleMatch[]) => void
  setScheduleLastUpdated: (date: Date | null) => void
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
  replayEvents: [] as ReplayEvent[],
  selectedEvent: null as SportsEvent | null,
  homeTeam: null as SportsTeam | null,
  awayTeam: null as SportsTeam | null,
  loading: false,
  error: null as string | null,
  view: 'sports' as const,
  scheduleMatches: [] as ScheduleMatch[],
  scheduleLastUpdated: null as Date | null,
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
  setReplayEvents: (events) => set({ replayEvents: events }),
  setSelectedEvent: (event) => set({ selectedEvent: event }),
  setHomeTeam: (team) => set({ homeTeam: team }),
  setAwayTeam: (team) => set({ awayTeam: team }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setView: (view) => set({ view }),
  setScheduleMatches: (matches) => set({ scheduleMatches: matches }),
  setScheduleLastUpdated: (date) => set({ scheduleLastUpdated: date }),
  reset: () => set(initialState),
}))
