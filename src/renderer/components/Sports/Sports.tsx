import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react'
import { useSportsStore, type ScheduleMatch } from '../../store/sportsStore'
import { useSettingsStore } from '../../store/settingsStore'

interface ReplayResult {
  title: string; sport: string; category: string; thumbnail: string; date: string
  sources: { label: string; type: string; url: string }[]
}

const SPORT_ICONS_RAW: Record<string, string> = {
  'Soccer': '⚽', 'American Football': '🏈', 'Basketball': '🏀',
  'Baseball': '⚾', 'Ice Hockey': '🏒', 'Tennis': '🎾',
  'Golf': '🏌️', 'Boxing': '🥊', 'MMA': '🥋',
  'Rugby': '🏉', 'Cricket': '🏏', 'Volleyball': '🏐',
  'Handball': '🤾', 'Water Sports': '🏊', 'Winter Sports': '⛷️',
  'Motor Sport': '🏎️', 'Cycling': '🚴', 'Horse Racing': '🏇',
  'Snooker': '🎱', 'Darts': '🎯', 'Badminton': '🏸',
  'Table Tennis': '🏓', 'Field Hockey': '🏑', 'Esports': '🎮',
  'Athletics': '🏃', 'Swimming': '🏊', 'Wrestling': '🤼',
  'Weightlifting': '🏋️', 'Archery': '🏹', 'Fencing': '🤺',
  'Skateboarding': '🛹', 'Surfing': '🏄',
}

const GRID_MIN_COL = 260

const cardStyle = (focused: boolean): React.CSSProperties => ({
  background: 'rgba(255,255,255,0.04)',
  borderRadius: 12,
  border: '2px solid transparent',
  borderColor: focused ? 'var(--accent, #FF6B00)' : 'transparent',
  overflow: 'hidden',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
})

const eventCardStyle = (focused: boolean): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'row' as const,
  alignItems: 'center',
  gap: 16,
  padding: 16,
  background: 'rgba(255,255,255,0.04)',
  borderRadius: 12,
  border: '2px solid transparent',
  borderColor: focused ? 'var(--accent, #FF6B00)' : 'transparent',
  cursor: 'pointer',
})

export default function Sports({ onPlay, onPlayUrl, onBack }: { onPlay: (title: string, year?: number) => void; onPlayUrl: (url: string) => Promise<void>; onBack: () => void }) {
  const store = useSportsStore()
  const settingsStore = useSettingsStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [replayResults, setReplayResults] = useState<ReplayResult[]>([])
  const [replaySearching, setReplaySearching] = useState(false)
  const [replayFocused, setReplayFocused] = useState(0)
  const [showSchedule, setShowSchedule] = useState(false)
  const [fallbackReplayResults, setFallbackReplayResults] = useState<ReplayResult[]>([])
  const [fallbackReplaySearch, setFallbackReplaySearch] = useState(false)
  const [fallbackSearchActive, setFallbackSearchActive] = useState(false)
  const scheduleMatches = store.scheduleMatches
  const scheduleLastUpdated = store.scheduleLastUpdated
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [schedulePage, setSchedulePage] = useState(1)
  const [scheduleStreams, setScheduleStreams] = useState<{ source: string; streamNo: number; language: string; hd: boolean; embedUrl: string }[]>([])
  const [scheduleStreamLoading, setScheduleStreamLoading] = useState(false)
  const [scheduleStreamError, setScheduleStreamError] = useState<string | null>(null)
  const [selectedReplay, setSelectedReplay] = useState<ReplayResult | null>(null)
  const [sourcePlayError, setSourcePlayError] = useState<string | null>(null)
  const [viewKey, setViewKey] = useState(0)
  const [selectedCountry, setSelectedCountry] = useState<string>('')
  const [failedSportImages, setFailedSportImages] = useState<Set<string>>(new Set())
  const [leagueImgErrors, setLeagueImgErrors] = useState<Set<string>>(new Set())
  const [teamImgErrors, setTeamImgErrors] = useState<Set<string>>(new Set())
  const [leaguesPage, setLeaguesPage] = useState(1)
  const LEAGUES_PER_PAGE = 24
  const SCHEDULE_PER_PAGE = 24
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null)

  const visibleSports = useMemo(() => {
    if (settingsStore.sportsSelected.length === 0) return store.sportsList
    return store.sportsList.filter((s: any) => settingsStore.sportsSelected.includes(s.id))
  }, [store.sportsList, settingsStore.sportsSelected])

  const leagueCountries = useMemo(() => {
    const countries = new Set<string>()
    store.leagues.forEach((l: any) => { if (l.country) countries.add(l.country) })
    return Array.from(countries).sort()
  }, [store.leagues])

  const filteredLeagues = useMemo(() => {
    if (!selectedCountry) return store.leagues
    return store.leagues.filter((l: any) => l.country === selectedCountry)
  }, [store.leagues, selectedCountry])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredLeagues.length / LEAGUES_PER_PAGE)), [filteredLeagues])
  const paginatedLeagues = useMemo(() => {
    const startIdx = (leaguesPage - 1) * LEAGUES_PER_PAGE
    return filteredLeagues.slice(startIdx, startIdx + LEAGUES_PER_PAGE)
  }, [filteredLeagues, leaguesPage])

  const scheduleTotalPages = useMemo(() => Math.max(1, Math.ceil(scheduleMatches.length / SCHEDULE_PER_PAGE)), [scheduleMatches])
  const paginatedScheduleMatches = useMemo(() => {
    const startIdx = (schedulePage - 1) * SCHEDULE_PER_PAGE
    return scheduleMatches.slice(startIdx, startIdx + SCHEDULE_PER_PAGE)
  }, [scheduleMatches, schedulePage])

  const paginationButtons = useMemo(() => {
    const btns: { type: 'prev' | 'page' | 'next'; page?: number; focusIndex: number }[] = []
    if (totalPages <= 1) return btns
    let fi = paginatedLeagues.length
    btns.push({ type: 'prev', focusIndex: fi++ })
    for (let page = 1; page <= totalPages; page++) {
      const isNearby = Math.abs(page - leaguesPage) <= 2 || page === 1 || page === totalPages
      if (!isNearby) continue
      btns.push({ type: 'page', page, focusIndex: fi++ })
    }
    btns.push({ type: 'next', focusIndex: fi++ })
    return btns
  }, [totalPages, leaguesPage, paginatedLeagues.length])

  useEffect(() => {
    const { view } = useSportsStore.getState()
    if (view !== 'sports') {
      useSportsStore.setState({
        view: 'sports',
        selectedSport: null, leagues: [],
        selectedLeague: null, seasons: [],
        selectedSeason: null, upcomingEvents: [], pastEvents: [],
        selectedEvent: null, homeTeam: null, awayTeam: null,
      })
    }
    if (store.sportsList.length === 0) {
      store.setLoading(true)
      window.api.sports.getSportsList()
        .then((list: any[]) => {
          window.api.log(`[Sports] Sports list: ${list.length} sports, first 3 iconUrls: ${list.slice(0,3).map((s:any) => `${s.name}=${s.iconUrl}`).join(', ')}`)
          store.setSportsList(list)
          store.setLoading(false)
        })
        .catch(() => {
          store.setError('Failed to load sports')
          store.setLoading(false)
        })
    }
  }, [])

  useEffect(() => {
    if (!store.loading && containerRef.current) {
      containerRef.current.focus()
    }
  }, [store.loading, store.view, showSchedule])



  const loadLeagues = useCallback(async (sport: any) => {
    store.setLoading(true)
    setSelectedCountry('')
    setLeaguesPage(1)
    useSportsStore.setState({ selectedSport: sport, view: 'leagues', leagues: [] })
    try {
      const leagues = await window.api.sports.getLeaguesBySport(sport.id)
      window.api.log(`[Sports] Leagues for "${sport.name}": ${leagues.length} leagues, first 3 logoUrl: ${leagues.slice(0,3).map((l:any) => `${l.name}=${l.logoUrl}`).join(', ')}`)
      store.setLeagues(leagues)
    } catch { store.setError('Failed to load leagues') }
    store.setLoading(false)
  }, [store])

  const loadSeasons = useCallback(async (league: any) => {
    store.setLoading(true)
    useSportsStore.setState({ selectedLeague: league, view: 'seasons', seasons: [] })
    try {
      const seasons = await window.api.sports.getSeasons(league.id)
      store.setSeasons(seasons)
    } catch { store.setError('Failed to load seasons') }
    store.setLoading(false)
  }, [store])

  const loadEvents = useCallback(async (season: any) => {
    store.setLoading(true)
    useSportsStore.setState({ selectedSeason: season, view: 'events', upcomingEvents: [], pastEvents: [], replayEvents: [] })
    try {
      const leagueId = useSportsStore.getState().selectedLeague!.id
      const today = new Date()
      const todayStr = today.toISOString().split('T')[0]
      const fromDate = season.startDate || '2020-01-01'
      const past = await window.api.sports.getEventsInRange(leagueId, season.id, fromDate, todayStr)
      // Sort newest - oldest so the most recent results appear first
      const sortedPast = [...(past || [])].sort((a, b) => {
        const ta = new Date(a.scheduledStart).getTime() || 0
        const tb = new Date(b.scheduledStart).getTime() || 0
        return tb - ta
      })
      window.api.log(`[Sports] Season "${season.name}" (${season.id}): ${past?.length || 0} past events (${fromDate}→${todayStr})`)

      // Also trigger fallback if the latest event is stale (no data after ~30 days)
      const mostRecentDate = sortedPast.length > 0
        ? new Date(sortedPast[0].scheduledStart).getTime()
        : 0
      const staleCutoff = today.getTime() - 30 * 24 * 60 * 60 * 1000
      const isStale = sortedPast.length > 0 && mostRecentDate < staleCutoff

      if (sortedPast.length === 0 || isStale) {
        // Fallback: Search ReplayZone for motorsport/replay data
        const leagueName = season.name || ''
        const year = season.year || today.getFullYear()
        const searchTerms: string[] = []
        if (leagueName.includes('MotoGP') || leagueName.includes('Moto')) searchTerms.push(`MotoGP ${year}`)
        if (leagueName.includes('Formula') || leagueName.includes('F1')) searchTerms.push(`Formula 1 ${year}`)
        if (leagueName.includes('NASCAR')) searchTerms.push(`NASCAR ${year}`)
        if (leagueName.includes('IndyCar')) searchTerms.push(`IndyCar ${year}`)
        // Always also search with the league name
        if (!searchTerms.some(t => t === `${leagueName} ${year}`) && leagueName.trim()) {
          searchTerms.push(`${leagueName} ${year}`)
        }

        if (searchTerms.length > 0) {
          const allResults: ReplayResult[] = []
          for (const term of searchTerms) {
            const results = await window.api.sports.searchReplays(term)
            allResults.push(...results)
          }
          // Deduplicate by title
          const seen = new Set<string>()
          const deduped = allResults.filter(r => {
            if (seen.has(r.title)) return false
            seen.add(r.title)
            return true
          })
          window.api.log(`[Sports] Fallback replay search for "${leagueName}" returned ${deduped.length} results`)
          setFallbackReplayResults(deduped)
          setFallbackSearchActive(true)
        }
      }

      store.setPastEvents(sortedPast)
    } catch { store.setError('Failed to load events') }
    store.setLoading(false)
  }, [store])

  const loadEventDetail = useCallback(async (event: any) => {
    store.setLoading(true)
    useSportsStore.setState({ selectedEvent: event, view: 'detail', homeTeam: null, awayTeam: null })
    try {
      const [homeTeam, awayTeam] = await Promise.all([
        event.homeTeamId ? window.api.sports.getTeamDetails(event.homeTeamId) : Promise.resolve(null),
        event.awayTeamId ? window.api.sports.getTeamDetails(event.awayTeamId) : Promise.resolve(null),
      ])
      window.api.log(`[Sports] loadEventDetail: home=${homeTeam?.name || event.homeTeamName} logoUrl=${homeTeam?.logoUrl || 'NONE'}, away=${awayTeam?.name || event.awayTeamName} logoUrl=${awayTeam?.logoUrl || 'NONE'}`)

      store.setHomeTeam(homeTeam)
      store.setAwayTeam(awayTeam)
    } catch (err: any) { window.api.log(`[Sports] loadEventDetail error: ${err?.message || err}`) }
    store.setLoading(false)
  }, [store])

  const loadSchedule = useCallback(async () => {
    setScheduleLoading(true)
    setScheduleError(null)
    setShowSchedule(true)
    setFocusedIndex(0)
    setSchedulePage(1)
    try {
      // Use cached data if already fetched today
      const now = new Date()
      const todayStr = now.toDateString()
      if (scheduleMatches.length > 0 && scheduleLastUpdated) {
        const cacheDay = scheduleLastUpdated.toDateString()
        if (cacheDay === todayStr) {
          setScheduleLoading(false)
          return
        }
      }

      const selectedSports = settingsStore.sportsSelected
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)
      const todayMsStart = todayStart.getTime()
      const todayMsEnd = todayEnd.getTime()

      // Map local sport selections to Streamed.pk category IDs
      const CATEGORY_MAP: [string[], string][] = [
        [['football', 'soccer'], 'soccer'],
        [['american football'], 'nfl'],
        [['basketball', 'nba'], 'basketball'],
        [['ice hockey', 'hockey', 'nhl'], 'hockey'],
        [['baseball', 'mlb'], 'baseball'],
        [['tennis'], 'tennis'],
        [['boxing', 'mma', 'ufc', 'wwe'], 'ufc'],
        [['motor sport', 'motorsport', 'formula 1', 'f1', 'nascar', 'moto gp', 'motogp'], 'motorsport'],
        [['rugby'], 'rugby'],
        [['golf'], 'golf'],
        [['cricket'], 'cricket'],
        [['darts'], 'darts'],
        [['snooker', 'billiards'], 'snooker'],
        [['cycling'], 'cycling'],
        [['volleyball'], 'volleyball'],
        [['badminton'], 'badminton'],
        [['handball'], 'handball'],
        [['futsal'], 'futsal'],
        [['horse racing'], 'horse racing'],
        [['winter sports'], 'winter sports'],
        [['ncaa', 'college'], 'ncaa'],
      ]
      const selectedCategories = new Set<string>()
      const add = (n: string) => { if (n) selectedCategories.add(n.toLowerCase()) }
      store.sportsList.filter((s: any) => selectedSports.length === 0 || selectedSports.includes(s.id)).forEach((sport: any) => {
        const lower = (sport.slug || sport.name || '').toLowerCase()
        let matched = false
        for (const [aliases, category] of CATEGORY_MAP) {
          if (aliases.some(a => lower === a || lower.includes(a))) {
            add(category); matched = true
          }
        }
        if (!matched) add(sport.slug || sport.name)
      })

      if (selectedCategories.size === 0) {
        store.setScheduleMatches([])
        store.setScheduleLastUpdated(new Date())
        setScheduleLoading(false)
        return
      }

      const matches: ScheduleMatch[] = await window.api.streamedpk.getMatchesForSports([...selectedCategories])
      if (!Array.isArray(matches)) throw new Error('Invalid response from schedule service')

      const firstWithBadge = matches.find(m => m.teams?.home?.badge || m.teams?.away?.badge)
      window.api.log(`[Sports] Schedule: ${matches.length} matches, sample badge: ${firstWithBadge ? `${firstWithBadge.teams?.home?.name}=${firstWithBadge.teams?.home?.badge || 'NONE'}, ${firstWithBadge.teams?.away?.name}=${firstWithBadge.teams?.away?.badge || 'NONE'}` : 'no badges found'}`)

      store.setScheduleMatches(matches.filter(m => m.date >= todayMsStart && m.date <= todayMsEnd))
      store.setScheduleLastUpdated(new Date())
    } catch (err: any) {
      console.error('[Sports] Schedule load failed:', err?.message || err)
      setScheduleError(err?.message ? `Schedule service unavailable (${err.message})` : 'Schedule service unavailable')
      store.setScheduleMatches([])
    }
    setScheduleLoading(false)
  }, [settingsStore.sportsSelected, store.sportsList, store.scheduleMatches, store.scheduleLastUpdated])

  // Auto-refresh schedule every 5 minutes when visible
  useEffect(() => {
    if (showSchedule && scheduleMatches.length > 0 && refreshTimerRef) {
      refreshTimerRef.current = setInterval(() => { loadSchedule() }, 5 * 60 * 1000)
    }
    return () => {
      if (refreshTimerRef.current) { clearInterval(refreshTimerRef.current); refreshTimerRef.current = null }
    }
  }, [showSchedule, scheduleMatches.length, loadSchedule])

  const loadScheduleStreams = useCallback(async (match: ScheduleMatch) => {
    setScheduleStreamLoading(true)
    setScheduleStreams([])
    setScheduleStreamError(null)
    setFocusedIndex(0)
    try {
      const resolved = await Promise.all(match.sources
        .filter(s => s.embedUrl)
        .map(async (s) => {
          let url = s.embedUrl!
          if (!url.endsWith('.m3u8')) {
            const server = useSettingsStore.getState().liveTvServer || 'cdnlive'
            const result = await window.api.damiTv.extractUrl({ id: s.id || s.source, name: match.title, countryCode: '', playerUrl: url }, server).catch(() => null)
            if (result?.hlsUrl) url = result.hlsUrl
          }
          return { source: s.source, streamNo: 1, language: 'Unknown', hd: true, embedUrl: url }
        }))
      const valid = resolved.filter(s => s.embedUrl)
      if (valid.length === 0) setScheduleStreamError('No playable streams found for this event')
      else setScheduleStreams(valid.map((s, i) => ({ ...s, streamNo: i + 1 })))
    } catch { setScheduleStreamError('Failed to resolve stream sources') }
    setScheduleStreamLoading(false)
  }, [])

  const isTeamEvent = useCallback((event: any) => {
    return !!(event.homeTeamName && event.awayTeamName)
  }, [])

  const handlePlayEvent = useCallback(async () => {
    const event = store.selectedEvent
    if (!event) return
    const title = isTeamEvent(event)
      ? `${event.homeTeamName} vs ${event.awayTeamName}`
      : event.name
    setReplaySearching(true)
    setReplayResults([])
    setReplayFocused(0)
    try {
      const results = await window.api.sports.searchReplays(title)
      if (results.length > 0) setReplayResults(results)
      else onPlay(title, new Date(event.scheduledStart).getFullYear() || undefined)
    } catch { onPlay(title, new Date(event.scheduledStart).getFullYear() || undefined) }
    setReplaySearching(false)
  }, [store.selectedEvent, onPlay, isTeamEvent])

  const handlePlaySource = useCallback(async (url: string) => {
    setSourcePlayError(null)
    try {
      await onPlayUrl(url)
    } catch (err: any) {
      setSourcePlayError(err?.message ? `Playback failed: ${err.message}` : 'This source could not be played. Try another.')
    }
  }, [onPlayUrl])

  const handleFallbackReplaySelect = useCallback(async (result: ReplayResult) => {
    if (result.sources.length === 0) return
    const firstSource = result.sources[0].url
    await handlePlaySource(firstSource)
  }, [handlePlaySource])

  const goBack = useCallback(() => {
    if (showSchedule) {
      if (scheduleStreams.length > 0) setScheduleStreams([])
      else if (scheduleStreamError) setScheduleStreamError(null)
      else setShowSchedule(false)
      setScheduleLoading(false)
      setScheduleStreamLoading(false)
      setFocusedIndex(0)
      return
    }
    const { view } = useSportsStore.getState()
    switch (view) {
      case 'sports': onBack(); break
      case 'leagues': {
        const keepSportsList = useSportsStore.getState().sportsList
        store.reset(); store.setSportsList(keepSportsList)
        setShowSchedule(false); setScheduleStreams([])
        setScheduleLoading(false); setScheduleStreamLoading(false)
        setReplayResults([]); setReplaySearching(false)
        setFocusedIndex(0); setViewKey(k => k + 1)
        break
      }
      case 'seasons':
        useSportsStore.setState({ view: 'leagues', selectedLeague: null, seasons: [] })
        setFocusedIndex(0); break
      case 'events':
        useSportsStore.setState({ view: 'seasons', selectedSeason: null, upcomingEvents: [], pastEvents: [] })
        setFocusedIndex(0); break
      case 'detail':
        useSportsStore.setState({ view: 'events', selectedEvent: null, homeTeam: null, awayTeam: null })
        setReplayResults([]); setReplaySearching(false)
        setSelectedReplay(null); setScheduleStreamError(null); setSourcePlayError(null)
        setFocusedIndex(0); break
    }
  }, [onBack, showSchedule, scheduleStreams.length, scheduleStreamError])

  const getItems = useCallback((): any[] => {
    switch (store.view) {
      case 'sports': return visibleSports
      case 'leagues': return paginatedLeagues
      case 'seasons': return store.seasons
      case 'events': return [...store.upcomingEvents, ...store.pastEvents]
      case 'detail': return []
    }
  }, [store.view, visibleSports, paginatedLeagues, store.seasons, store.upcomingEvents, store.pastEvents])

  const getGridCols = useCallback(() => {
    const el = contentRef.current
    if (!el) return 1
    const grid = el.querySelector('[data-grid]') as HTMLElement | null
    if (!grid) return 1
    return Math.max(1, Math.floor((grid.clientWidth + 16) / (GRID_MIN_COL + 16)))
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function handleKeyDown(e: KeyboardEvent) {
      if (showSchedule) {
        if (scheduleStreams.length > 0) {
          if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setFocusedIndex((i: number) => Math.min(i + 1, scheduleStreams.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setFocusedIndex((i: number) => Math.max(i - 1, 0)) }
          else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); const s = scheduleStreams[focusedIndex]; if (s) handlePlaySource(s.embedUrl) }
          else if (e.key === 'Backspace' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setScheduleStreams([]); setFocusedIndex(0) }
          return
        }
        if (scheduleStreamError) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setScheduleStreamError(null) }
          else if (e.key === 'Backspace' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setScheduleStreamError(null) }
          return
        }
        if (scheduleMatches.length > 0) {
          const scheduleCols = getGridCols()
          const scheduleHasPagination = scheduleMatches.length > 24
          const schedulePagEnd = scheduleHasPagination ? paginatedScheduleMatches.length + 1 : paginatedScheduleMatches.length - 1
          const scheduleMax = scheduleHasPagination ? schedulePagEnd : paginatedScheduleMatches.length - 1
          if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setFocusedIndex((i: number) => Math.min(i + scheduleCols, scheduleMax)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setFocusedIndex((i: number) => Math.max(i - scheduleCols, 0)) }
          else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); setFocusedIndex((i: number) => Math.min(i + 1, scheduleMax)) }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); setFocusedIndex((i: number) => Math.max(i - 1, 0)) }
          else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault(); e.stopPropagation()
            if (scheduleHasPagination && focusedIndex >= paginatedScheduleMatches.length) {
              if (focusedIndex === paginatedScheduleMatches.length && schedulePage > 1) setSchedulePage(p => Math.max(1, p - 1))
              else if (focusedIndex === paginatedScheduleMatches.length + 1 && schedulePage < scheduleTotalPages) setSchedulePage(p => Math.min(scheduleTotalPages, p + 1))
            } else {
              loadScheduleStreams(paginatedScheduleMatches[focusedIndex])
            }
          }
          else if (e.key === 'Backspace' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); goBack() }
          return
        }
        if (e.key === 'Backspace' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); goBack() }
        return
      }
      const items = getItems()
      if (store.view === 'detail') {
        if (selectedReplay) {
          if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setReplayFocused((i: number) => Math.min(i + 1, selectedReplay.sources.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setReplayFocused((i: number) => Math.max(i - 1, 0)) }
          else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); const s = selectedReplay.sources[replayFocused]; if (s) handlePlaySource(s.url) }
          else if (e.key === 'Backspace' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setSelectedReplay(null); setReplayFocused(0); setSourcePlayError(null) }
          return
        }
        if (replayResults.length > 0) {
          if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setReplayFocused((i: number) => Math.min(i + 1, replayResults.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setReplayFocused((i: number) => Math.max(i - 1, 0)) }
          else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); const r = replayResults[replayFocused]; if (r) setSelectedReplay(r); setReplayFocused(0); setSourcePlayError(null) }
          else if (e.key === 'Backspace' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setReplayResults([]) }
          return
        }
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); handlePlayEvent() }
        if (e.key === 'Backspace' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); goBack() }
        return
      }
      if (e.key === 'Backspace' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); goBack(); return }
      if (items.length === 0) return
      const cols = getGridCols()
      const isGridView = store.view === 'sports' || store.view === 'leagues' || store.view === 'seasons'
      const hasPagination = store.view === 'leagues' && totalPages > 1
      const pagEnd = hasPagination ? (paginationButtons.length > 0 ? paginationButtons[paginationButtons.length - 1].focusIndex : items.length - 1) : items.length - 1
      const totalFocusable = store.view === 'sports' ? items.length : pagEnd + 1
      const maxIndex = store.view === 'sports' ? items.length : totalFocusable - 1
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setFocusedIndex((i: number) => Math.min(i + (isGridView ? cols : 1), maxIndex)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setFocusedIndex((i: number) => Math.max(i - (isGridView ? cols : 1), 0)) }
      else if (e.key === 'ArrowRight' && (isGridView || (hasPagination && focusedIndex >= items.length))) { e.preventDefault(); e.stopPropagation(); setFocusedIndex((i: number) => Math.min(i + 1, maxIndex)) }
      else if (e.key === 'ArrowLeft' && (isGridView || (hasPagination && focusedIndex >= items.length))) { e.preventDefault(); e.stopPropagation(); setFocusedIndex((i: number) => Math.max(i - 1, 0)) }
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); e.stopPropagation()
        if (store.view === 'sports') {
          if (focusedIndex === 0) loadSchedule()
          else { const item = items[focusedIndex - 1]; if (item) loadLeagues(item) }
        } else if (hasPagination && focusedIndex >= items.length) {
          const btn = paginationButtons.find(b => b.focusIndex === focusedIndex)
          if (btn?.type === 'prev' && leaguesPage > 1) setLeaguesPage(p => Math.max(1, p - 1))
          else if (btn?.type === 'page' && btn.page) setLeaguesPage(btn.page)
          else if (btn?.type === 'next' && leaguesPage < totalPages) setLeaguesPage(p => Math.min(totalPages, p + 1))
        } else {
          const item = items[focusedIndex]
          if (!item) return
          if (store.view === 'leagues') loadSeasons(item)
          else if (store.view === 'seasons') loadEvents(item)
          else if (store.view === 'events') loadEventDetail(item)
        }
      }
    }
    el.addEventListener('keydown', handleKeyDown)
    return () => el.removeEventListener('keydown', handleKeyDown)
  }, [store.view, visibleSports, store.leagues, store.seasons, store.upcomingEvents, store.pastEvents, focusedIndex, loadLeagues, loadSeasons, loadEvents, loadEventDetail, goBack, handlePlayEvent, getItems, getGridCols, replayResults, replayFocused, selectedReplay, showSchedule, scheduleMatches, scheduleStreams, scheduleStreamError, loadSchedule, loadScheduleStreams, onPlayUrl, handlePlaySource, sourcePlayError, totalPages, paginatedLeagues, paginationButtons, setLeaguesPage, paginatedScheduleMatches])

  useEffect(() => { setFocusedIndex(0) }, [store.view, visibleSports, store.leagues, store.seasons, store.upcomingEvents, store.pastEvents])

  useEffect(() => {
    if (focusedIndex >= 0 && contentRef.current) {
    const focused = contentRef.current.querySelector(`[data-focus-index="${focusedIndex}"]`) as HTMLElement | undefined
    if (focused) { focused.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); focused.focus() }
    }
  }, [focusedIndex, scheduleStreams])

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    try { return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) } catch { return dateStr }
  }

  const formatTime = (dateStr: string) => {
    if (!dateStr) return ''
    const tz = settingsStore.sportsTimezone || 'GMT'
    try { return new Date(dateStr).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: tz }) } catch { return '' }
  }

  const getStatus = (date: number) => {
    const now = Date.now()
    const diff = now - date
    if (diff < 0) return 'upcoming'
    if (diff < 10800000) return 'live'
    return 'finished'
  }

  const formatTimeGMT = (ts: number) => {
    const tz = settingsStore.sportsTimezone || 'GMT'
    try { return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: tz }) } catch { return '' }
  }

  const isFocused = (index: number, focusedIndex: number) => index === focusedIndex

  const renderEventCard = (event: any, i: number, isPast: boolean) => {
    const teamEvent = isTeamEvent(event)
    return (
      <div
        key={`${event.id}-${i}`}
        data-focus-index={i}
        tabIndex={0}
        style={eventCardStyle(isFocused(i, focusedIndex))}
        onClick={() => loadEventDetail(event)}
        onMouseEnter={() => setFocusedIndex(i)}
      >
        {teamEvent ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{event.homeTeamName}</div>
              {isPast && <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent, #FF6B00)' }}>{event.homeScore ?? '-'}</div>}
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', fontWeight: 600, padding: '0 8px' }}>VS</div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{event.awayTeamName}</div>
              {isPast && <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent, #FF6B00)' }}>{event.awayScore ?? '-'}</div>}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{event.name}</div>
            {event.venueName && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{event.venueName}</div>}
            {isPast && event.homeScore !== null && event.homeScore !== undefined && (
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent, #FF6B00)' }}>{event.homeScore}</div>
            )}
          </div>
        )}
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
          {formatDate(event.scheduledStart)}{formatTime(event.scheduledStart) ? ` ${formatTime(event.scheduledStart)}` : ''}
        </div>
      </div>
    )
  }

  const renderContent = () => {
    if (store.loading && !showSchedule) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Loading...</div>
    if (store.error && !showSchedule) return <div style={{ padding: 16, color: '#ff4444', fontSize: 14 }}>{store.error}</div>

    if (showSchedule) {
      if (scheduleLoading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Loading schedule...</div>
      if (scheduleStreamLoading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Loading stream sources...</div>
      if (scheduleStreamError) return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 24 }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>{scheduleStreamError}</div>
          <button onClick={() => { setScheduleStreamError(null); setScheduleStreams([]) }}
            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
            Back to schedule
          </button>
        </div>
      )
      if (scheduleStreams.length > 0) {
        return (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: '0 0 16px 0' }}>Select Source</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {scheduleStreams.map((s, i) => (
                <div key={i} data-focus-index={i} tabIndex={0}
                  style={eventCardStyle(isFocused(i, focusedIndex))}
                  onClick={() => handlePlaySource(s.embedUrl)}
                  onMouseEnter={() => setFocusedIndex(i)}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{s.source} #{s.streamNo}{s.hd ? ' HD' : ''}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{s.language}</div>
                  </div>
                </div>
              ))}
            </div>
            {sourcePlayError && (
              <div style={{ fontSize: 13, color: '#ff6b6b', textAlign: 'center', marginTop: 12, padding: 8, background: 'rgba(255,0,0,0.08)', borderRadius: 6 }}>
                {sourcePlayError}
              </div>
            )}
          </div>
        )
      }
      if (scheduleMatches.length === 0) return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, color: scheduleError ? 'rgba(255,150,50,0.6)' : 'rgba(255,255,255,0.3)', fontSize: 14 }}>
          {scheduleError || 'No live events today for the selected sports.'}
        </div>
      )
      return (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: 0 }}>Today's Schedule</h2>
            {scheduleLastUpdated && (
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
                Updated {scheduleLastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginBottom: scheduleMatches.length > 24 ? 20 : 0 }} data-grid>
            {paginatedScheduleMatches.map((match, i) => (
              <div key={`${match.id}-${i}`} data-focus-index={i} tabIndex={0}
                style={cardStyle(isFocused(i, focusedIndex))}
                onClick={() => loadScheduleStreams(match)}
                onMouseEnter={() => setFocusedIndex(i)}
              >
                <div style={{ width: '100%', height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', background: match.poster ? `rgba(255,255,255,0.03) url(${match.poster.startsWith('http') ? match.poster : `https://streamed.pk${match.poster}`}) center/cover no-repeat` : 'rgba(255,255,255,0.03)' }}>
                  {match.poster && <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,20,20,0.55)', zIndex: 0 }} />}
                  {(() => {
                    const homeName = match.teams?.home?.name
                    const awayName = match.teams?.away?.name
                    const homeBadge = match.teams?.home?.badge
                    const awayBadge = match.teams?.away?.badge
                    if (homeName || awayName) window.api.log(`[Sports] Badge render: ${homeName}=${homeBadge || 'NONE'}, ${awayName}=${awayBadge || 'NONE'}`)
                    if (homeBadge && awayBadge && homeName && awayName) {
                      return (
                        <div style={{ display: 'flex', gap: 16, alignItems: 'center', position: 'relative', zIndex: 1 }}>
                          <img src={homeBadge} alt="" style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 6 }} />
                          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 600 }}>vs</span>
                          <img src={awayBadge} alt="" style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 6 }} />
                        </div>
                      )
                    }
                    if (homeBadge && homeName) {
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1 }}>
                          <img src={homeBadge} alt="" style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 6 }} />
                          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 600 }}>{match.teams!.home!.name}</span>
                        </div>
                      )
                    }
                    return <span style={{ fontSize: 40, opacity: 0.15, position: 'relative', zIndex: 1 }}>{SPORT_ICONS_RAW[match.category as keyof typeof SPORT_ICONS_RAW] || '🏅'}</span>
                  })()}
                  <div style={{ position: 'absolute', top: 8, left: 8, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: getStatus(match.date) === 'live' ? '#e74c3c' : getStatus(match.date) === 'finished' ? '#555' : 'rgba(0,0,0,0.5)', color: '#fff' }}>
                    {getStatus(match.date) === 'live' ? 'LIVE' : getStatus(match.date) === 'finished' ? 'FINISHED' : formatTimeGMT(match.date) || 'UPCOMING'}
                  </div>
                </div>
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', lineHeight: 1.3 }}>{match.title}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{match.category}</div>
                </div>
              </div>
            ))}
          </div>
          {scheduleMatches.length > 24 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <button tabIndex={0} data-focus-index={paginatedScheduleMatches.length}
                disabled={schedulePage <= 1}
                onClick={() => setSchedulePage(p => Math.max(1, p - 1))}
                style={{
                  padding: '6px 14px', borderRadius: 6, border: focusedIndex === paginatedScheduleMatches.length ? '2px solid var(--accent)' : '2px solid transparent',
                  cursor: schedulePage <= 1 ? 'default' : 'pointer',
                  background: schedulePage <= 1 ? 'rgba(255,255,255,0.05)' : (focusedIndex === paginatedScheduleMatches.length ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.1)'),
                  color: schedulePage <= 1 ? 'rgba(255,255,255,0.3)' : (focusedIndex === paginatedScheduleMatches.length ? '#fff' : 'rgba(255,255,255,0.7)'),
                  fontSize: 13, fontWeight: 600,
                }}
              >Prev</button>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', padding: '0 8px' }}>{schedulePage} / {scheduleTotalPages}</span>
              <button tabIndex={0} data-focus-index={paginatedScheduleMatches.length + 1}
                disabled={schedulePage >= scheduleTotalPages}
                onClick={() => setSchedulePage(p => Math.min(scheduleTotalPages, p + 1))}
                style={{
                  padding: '6px 14px', borderRadius: 6, border: focusedIndex === paginatedScheduleMatches.length + 1 ? '2px solid var(--accent)' : '2px solid transparent',
                  cursor: schedulePage >= scheduleTotalPages ? 'default' : 'pointer',
                  background: schedulePage >= scheduleTotalPages ? 'rgba(255,255,255,0.05)' : (focusedIndex === paginatedScheduleMatches.length + 1 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.1)'),
                  color: schedulePage >= scheduleTotalPages ? 'rgba(255,255,255,0.3)' : (focusedIndex === paginatedScheduleMatches.length + 1 ? '#fff' : 'rgba(255,255,255,0.7)'),
                  fontSize: 13, fontWeight: 600,
                }}
              >Next</button>
            </div>
          )}
        </div>
      )
    }

    switch (store.view) {
      case 'sports':
        return (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: '0 0 16px 0' }}>Choose a Sport</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }} data-grid>
              <div data-focus-index={0} tabIndex={0}
                style={cardStyle(isFocused(0, focusedIndex))}
                onClick={loadSchedule}
                onMouseEnter={() => setFocusedIndex(0)}
              >
                <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                  <div style={{ fontSize: 28, width: 40, textAlign: 'center' }}>📅</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginTop: 8 }}>Schedule</div>
                </div>
              </div>
              {visibleSports.map((sport: any, i: number) => {
                const imgFailed = failedSportImages.has(sport.id)
                if (i === 0) window.api.log(`[Sports] Sport card icons: ${visibleSports.slice(0,5).map((s:any) => `${s.name}=${s.iconUrl || 'NONE'}`).join(', ')}`)
                return (
                  <div key={sport.id} data-focus-index={i + 1} tabIndex={0}
                    style={cardStyle(isFocused(i + 1, focusedIndex))}
                    onClick={() => loadLeagues(sport)}
                    onMouseEnter={() => setFocusedIndex(i + 1)}
                  >
                    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                      {sport.iconUrl && !imgFailed ? (
                        <img src={sport.iconUrl} alt={sport.name} style={{ width: 48, height: 48, objectFit: 'contain' }} onError={() => setFailedSportImages(prev => new Set(prev).add(sport.id))} />
                      ) : (
                        <div style={{ fontSize: 28, width: 40, textAlign: 'center' }}>{SPORT_ICONS_RAW[sport.name] || '🏅'}</div>
                      )}
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginTop: 8 }}>{sport.name}</div>
                    </div>
                  </div>
                )
              })}
            </div>
            {visibleSports.length === 0 && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>No sports available.</div>}
          </div>
        )

      case 'leagues':
        return (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: '0 0 16px 0' }}>{store.selectedSport?.name} Leagues</h2>
            {leagueCountries.length > 1 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <button
                  onClick={() => { setSelectedCountry(''); setLeaguesPage(1) }}
                  style={{
                    padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600,
                    background: !selectedCountry ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                    color: !selectedCountry ? '#fff' : 'rgba(255,255,255,0.7)',
                  }}
                >All</button>
                {leagueCountries.map(country => (
                  <button
                    key={country}
                    onClick={() => { setSelectedCountry(country); setLeaguesPage(1) }}
                    style={{
                      padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                      fontSize: 12, fontWeight: 600,
                      background: selectedCountry === country ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                      color: selectedCountry === country ? '#fff' : 'rgba(255,255,255,0.7)',
                    }}
                  >{country}</button>
                ))}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }} data-grid>
              {paginatedLeagues.map((league: any, i: number) => (
                <div key={league.id} data-focus-index={i} tabIndex={0}
                  style={cardStyle(isFocused(i, focusedIndex))}
                  onClick={() => loadSeasons(league)}
                  onMouseEnter={() => setFocusedIndex(i)}
                >
                  {(league.logoUrl && !leagueImgErrors.has(league.id)) ? (
                    <img src={league.logoUrl} alt={league.name} style={{ width: '100%', height: 140, objectFit: 'contain', display: 'block', background: 'rgba(255,255,255,0.03)' }} onError={() => setLeagueImgErrors(prev => new Set(prev).add(league.id))} />
                  ) : (
                    <div style={{ width: '100%', height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)' }}>
                      <div style={{ fontSize: 48, fontWeight: 800, color: 'rgba(255,255,255,0.1)' }}>{league.name?.charAt(0).toUpperCase() || '?'}</div>
                    </div>
                  )}
                  <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{league.name}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{league.country}{league.abbreviation ? ` - ${league.abbreviation}` : ''}</div>
                  </div>
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 20, flexWrap: 'wrap' }}>
                {paginationButtons.map(btn => {
                  const isFocused = focusedIndex === btn.focusIndex
                  if (btn.type === 'prev') {
                    return (
                      <button key="prev" tabIndex={0} data-focus-index={btn.focusIndex}
                        disabled={leaguesPage <= 1}
                        aria-label="Previous page"
                        aria-disabled={leaguesPage <= 1}
                        onClick={() => setLeaguesPage(p => Math.max(1, p - 1))}
                        style={{
                          padding: '6px 14px', borderRadius: 6, border: isFocused ? '2px solid var(--accent)' : '2px solid transparent',
                          cursor: leaguesPage <= 1 ? 'default' : 'pointer',
                          background: leaguesPage <= 1 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)',
                          color: leaguesPage <= 1 ? 'rgba(255,255,255,0.3)' : (isFocused ? '#fff' : 'rgba(255,255,255,0.7)'),
                          fontSize: 13, fontWeight: 600,
                        }}
                      >Prev</button>
                    )
                  }
                  if (btn.type === 'next') {
                    return (
                      <button key="next" tabIndex={0} data-focus-index={btn.focusIndex}
                        disabled={leaguesPage >= totalPages}
                        aria-label="Next page"
                        aria-disabled={leaguesPage >= totalPages}
                        onClick={() => setLeaguesPage(p => Math.min(totalPages, p + 1))}
                        style={{
                          padding: '6px 14px', borderRadius: 6, border: isFocused ? '2px solid var(--accent)' : '2px solid transparent',
                          cursor: leaguesPage >= totalPages ? 'default' : 'pointer',
                          background: leaguesPage >= totalPages ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)',
                          color: leaguesPage >= totalPages ? 'rgba(255,255,255,0.3)' : (isFocused ? '#fff' : 'rgba(255,255,255,0.7)'),
                          fontSize: 13, fontWeight: 600,
                        }}
                      >Next</button>
                    )
                  }
                  if (btn.type === 'page' && btn.page) {
                    const isActive = btn.page === leaguesPage
                    return (
                      <button key={btn.page} tabIndex={0} data-focus-index={btn.focusIndex}
                        onClick={() => setLeaguesPage(btn.page!)}
                        aria-label={`Page ${btn.page}`}
                        aria-current={isActive ? 'page' : undefined}
                        style={{
                          padding: '6px 12px', borderRadius: 6, border: isFocused ? '2px solid var(--accent)' : (isActive ? '2px solid var(--accent)' : '2px solid transparent'),
                          cursor: 'pointer',
                          background: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                          color: isActive ? '#fff' : (isFocused ? '#fff' : 'rgba(255,255,255,0.7)'),
                          fontSize: 13, fontWeight: isActive ? 700 : 500,
                          minWidth: 32, textAlign: 'center',
                        }}
                      >{btn.page}</button>
                    )
                  }
                  return null
                })}
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginLeft: 4 }}>{filteredLeagues.length} leagues</span>
              </div>
            )}
            {filteredLeagues.length === 0 && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>No leagues found{selectedCountry ? ` for ${selectedCountry}` : ` for ${store.selectedSport?.name}`}</div>}
          </div>
        )

      case 'seasons':
        return (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: '0 0 16px 0' }}>{store.selectedLeague?.name} — Seasons</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }} data-grid>
              {store.seasons.map((season: any, i: number) => (
                <div key={season.id} data-focus-index={i} tabIndex={0}
                  style={cardStyle(isFocused(i, focusedIndex))}
                  onClick={() => loadEvents(season)}
                  onMouseEnter={() => setFocusedIndex(i)}
                >
                  <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                    <div style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>{season.name}</div>
                    {season.isCurrent && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Current Season</div>}
                    {season.startDate && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{formatDate(season.startDate)} - {season.endDate ? formatDate(season.endDate) : '...'}</div>}
                  </div>
                </div>
              ))}
            </div>
            {store.seasons.length === 0 && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>No seasons found for {store.selectedLeague?.name}</div>}
          </div>
        )

      case 'events':
        return (
          <div>
            {fallbackSearchActive && fallbackReplayResults.length > 0 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: '0 0 16px 0' }}>
                  Replays for {store.selectedSeason?.name}
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {fallbackReplayResults.map((result: ReplayResult, i: number) => (
                    <div
                      key={`replay-${i}`}
                      data-focus-index={i}
                      tabIndex={0}
                      style={cardStyle(isFocused(i, focusedIndex))}
                      onClick={() => handleFallbackReplaySelect(result)}
                      onMouseEnter={() => setFocusedIndex(i)}
                    >
                      <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
                        {result.thumbnail && (
                          <img src={result.thumbnail} alt=""
                            style={{ width: 120, height: 68, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                            loading="lazy"
                          />
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{result.title}</div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                            {result.category} · {result.date} · {result.sources.length} sources
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {store.pastEvents.length > 0 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: `${fallbackSearchActive ? '32px 0 16px' : '0'} 0 16px 0` }}>
                  {store.selectedSeason?.isCurrent ? 'Results' : 'Past Results'}
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {store.pastEvents.map((event: any, i: number) => renderEventCard(event, i, true))}
                </div>
              </>
            )}
            {store.pastEvents.length === 0 && (
              <div>
                {fallbackReplaySearch ? (
                  <>
                    <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: '0 0 16px 0' }}>
                      Replays for {store.selectedSeason?.name}
                    </h2>
                    {fallbackReplayResults.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {fallbackReplayResults.map((result: ReplayResult, i: number) => (
                          <div
                            key={i}
                            data-focus-index={i}
                            tabIndex={0}
                            style={cardStyle(isFocused(i, focusedIndex))}
                            onClick={() => handleFallbackReplaySelect(result)}
                            onMouseEnter={() => setFocusedIndex(i)}
                          >
                            <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
                              {result.thumbnail && (
                                <img src={result.thumbnail} alt=""
                                  style={{ width: 120, height: 68, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                                  loading="lazy"
                                />
                              )}
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{result.title}</div>
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                                  {result.category} · {result.date} · {result.sources.length} sources
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
                        No replays found for this season
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 40 }}>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>No events found in schedule service</div>
                    <button
                      onClick={() => {
                        setFallbackReplaySearch(true)
                        setFallbackReplayResults([])
                        const leagueName = store.selectedSeason?.name || ''
                        const year = store.selectedSeason?.year || new Date().getFullYear()
                        const terms: string[] = []
                        if (leagueName.includes('MotoGP') || leagueName.includes('Moto')) terms.push(`MotoGP ${year}`)
                        if (leagueName.includes('Formula') || leagueName.includes('F1')) terms.push(`Formula 1 ${year}`)
                        if (leagueName.includes('NASCAR')) terms.push(`NASCAR ${year}`)
                        if (leagueName.includes('IndyCar')) terms.push(`IndyCar ${year}`)
                        terms.push(`${leagueName} ${year}`)
                        Promise.all(terms.map(t => window.api.sports.searchReplays(t)))
                          .then(results => {
                            const all = results.flat()
                            const seen = new Set<string>()
                            const deduped = all.filter(r => {
                              if (seen.has(r.title)) return false
                              seen.add(r.title)
                              return true
                            })
                            setFallbackReplayResults(deduped)
                          })
                          .catch(() => setFallbackReplayResults([]))
                      }}
                      style={{
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: '#fff',
                        padding: '10px 24px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontSize: 14,
                      }}
                    >
                      Search Replay Archive
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )

      case 'detail': {
        const event = store.selectedEvent
        if (!event) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>No event selected</div>
        const teamEvent = isTeamEvent(event)
        const searchTitle = teamEvent ? `${event.homeTeamName} vs ${event.awayTeamName}` : event.name
        return (
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 24, background: 'rgba(255,255,255,0.03)', borderRadius: 12, marginBottom: 24 }}>
              {teamEvent ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 24, width: '100%', maxWidth: 500 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1, textAlign: 'center' }}>
                    {store.homeTeam?.logoUrl && !teamImgErrors.has('home') ? (
                      <img src={store.homeTeam.logoUrl} alt="" style={{ width: 64, height: 64, objectFit: 'contain' }} onError={() => setTeamImgErrors(prev => new Set(prev).add('home'))} />
                    ) : (
                      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.2)' }}>{(store.homeTeam?.name || event.homeTeamName || '?').charAt(0).toUpperCase()}</div>
                      </div>
                    )}
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>{store.homeTeam?.name || event.homeTeamName}</div>
                    {event.homeScore !== null && event.homeScore !== undefined && <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--accent, #FF6B00)' }}>{event.homeScore}</div>}
                  </div>
                  <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.3)', fontWeight: 600, padding: '0 8px' }}>VS</div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1, textAlign: 'center' }}>
                    {store.awayTeam?.logoUrl && !teamImgErrors.has('away') ? (
                      <img src={store.awayTeam.logoUrl} alt="" style={{ width: 64, height: 64, objectFit: 'contain' }} onError={() => setTeamImgErrors(prev => new Set(prev).add('away'))} />
                    ) : (
                      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.2)' }}>{(store.awayTeam?.name || event.awayTeamName || '?').charAt(0).toUpperCase()}</div>
                      </div>
                    )}
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>{store.awayTeam?.name || event.awayTeamName}</div>
                    {event.awayScore !== null && event.awayScore !== undefined && <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--accent, #FF6B00)' }}>{event.awayScore}</div>}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 600, color: '#fff' }}>{event.name}</div>
                </div>
              )}
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{formatDate(event.scheduledStart)}{formatTime(event.scheduledStart) ? ` at ${formatTime(event.scheduledStart)}` : ''}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span style={{ color: 'rgba(255,255,255,0.5)' }}>Event</span><span style={{ color: '#fff', textAlign: 'right' }}>{event.name || event.leagueName || '-'}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span style={{ color: 'rgba(255,255,255,0.5)' }}>League</span><span style={{ color: '#fff', textAlign: 'right' }}>{event.leagueName || store.selectedLeague?.name || '-'}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span style={{ color: 'rgba(255,255,255,0.5)' }}>Season</span><span style={{ color: '#fff', textAlign: 'right' }}>{event.seasonName || store.selectedSeason?.name || '-'}</span></div>
              {event.venueName && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span style={{ color: 'rgba(255,255,255,0.5)' }}>Venue</span><span style={{ color: '#fff', textAlign: 'right' }}>{event.venueName}</span></div>}
              {teamEvent && event.homeScore !== null && event.awayScore !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span style={{ color: 'rgba(255,255,255,0.5)' }}>Score</span><span style={{ color: '#fff', textAlign: 'right' }}>{event.homeScore ?? '-'} - {event.awayScore ?? '-'}</span></div>
              )}
            </div>
            {replaySearching && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Searching for replays...</div>}
            {selectedReplay && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: 0 }}>Select Source</h3>
                  <button onClick={() => { setSelectedReplay(null); setReplayFocused(0); setSourcePlayError(null) }}
                    style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.7)', padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                    Back
                  </button>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{selectedReplay.title}</div>
                {selectedReplay.sources.map((s, i) => (
                  <div key={i} tabIndex={0}
                    style={eventCardStyle(replayFocused === i)}
                    onClick={() => handlePlaySource(s.url)}
                    onMouseEnter={() => setReplayFocused(i)}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{s.label}{s.type ? ` (${s.type})` : ''}</div>
                    </div>
                  </div>
                ))}
                {sourcePlayError && (
                  <div style={{ fontSize: 13, color: '#ff6b6b', textAlign: 'center', marginTop: 8, padding: 8, background: 'rgba(255,0,0,0.08)', borderRadius: 6 }}>
                    {sourcePlayError}
                  </div>
                )}
              </div>
            )}
            {replayResults.length > 0 && !selectedReplay && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, marginTop: 16 }}>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: '0 0 12px 0' }}>Replays Found</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {replayResults.map((r, i) => (
                    <div key={i} tabIndex={0}
                      style={eventCardStyle(replayFocused === i)}
                      onClick={() => { setSelectedReplay(r); setReplayFocused(0); setSourcePlayError(null) }}
                      onMouseEnter={() => setReplayFocused(i)}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, textAlign: 'center' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{r.title}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{r.sport} - {r.category}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{r.sources.length} source{r.sources.length !== 1 ? 's' : ''}</div>
                      </div>
                      {r.thumbnail && <img src={r.thumbnail} alt="" style={{ width: 56, height: 56, borderRadius: 6, objectFit: 'contain' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />}
                    </div>
                  ))}
                </div>
                <button onClick={() => { setReplayResults([]); onPlay(searchTitle, new Date(event.scheduledStart).getFullYear() || undefined) }}
                  tabIndex={0} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 24px', background: 'var(--accent, #FF6B00)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 12, opacity: 0.7 }}>
                  No replay? Search torrents for {searchTitle}
                </button>
              </div>
            )}
            {replayResults.length === 0 && !replaySearching && (
              <button onClick={handlePlayEvent} tabIndex={0}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 24px', background: 'var(--accent, #FF6B00)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 16, width: '100%' }}>
                Search for {searchTitle}
              </button>
            )}
          </div>
        )
      }
      default:
        return null
    }
  }

  return (
    <div ref={containerRef} tabIndex={-1} key={viewKey} style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg-primary, #141414)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <button onClick={goBack} tabIndex={0} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', width: 36, height: 36, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>
          {showSchedule && scheduleStreams.length > 0 && 'Stream Sources'}
          {showSchedule && scheduleStreams.length === 0 && 'Live Schedule'}
          {!showSchedule && store.view === 'sports' && 'Sports'}
          {!showSchedule && store.view === 'leagues' && (store.selectedSport?.name || '')}
          {!showSchedule && store.view === 'seasons' && (store.selectedLeague?.name || '')}
          {!showSchedule && store.view === 'events' && `${store.selectedLeague?.name || ''} — ${store.selectedSeason?.name || ''}`}
          {!showSchedule && store.view === 'detail' && (store.selectedEvent ? (isTeamEvent(store.selectedEvent) ? `${store.selectedEvent.homeTeamName || ''} vs ${store.selectedEvent.awayTeamName || ''}` : store.selectedEvent.name || '') : '')}
        </h1>
      </div>
      <div ref={contentRef} style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {renderContent()}
      </div>
    </div>
  )
}
