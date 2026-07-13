import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react'
import { useSportsStore } from '../../store/sportsStore'
import { useSettingsStore } from '../../store/settingsStore'

const OUR_TO_DB_SPORT: Record<string, string> = {
  'football': 'Soccer',
  'basketball': 'Basketball',
  'tennis': 'Tennis',
  'motorsport': 'Motor Sport',
  'rugby': 'Rugby',
  'golf': 'Golf',
  'darts': 'Darts',
  'cricket': 'Cricket',
  'baseball': 'Baseball',
  'hockey': 'Ice Hockey',
  'combat': 'Fight',
  'snooker': 'Billiards',
  'handball': 'Handball',
  'table tennis': 'Table Tennis',
  'volleyball': 'Volleyball',
  'badminton': 'Badminton',
  'australian football': 'Australian Rules Football',
  'soccer': 'Soccer',
}

interface ScheduleMatch {
  id: string; title: string; category: string; date: number; poster?: string
  teams?: { home?: { name: string; badge: string }; away?: { name: string; badge: string } }
  sources: { source: string; id: string; embedUrl?: string }[]
}

interface ReplayResult {
  title: string; sport: string; category: string; thumbnail: string; date: string
  sources: { label: string; type: string; url: string }[]
}

const SPORT_ICONS: Record<string, string> = {
  'Soccer': '\u26BD', 'American Football': '\uD83C\uDFC8', 'Basketball': '\uD83C\uDFC0',
  'Baseball': '\u26BE', 'Ice Hockey': '\uD83C\uDFD2', 'Tennis': '\uD83C\uDFBE',
  'Golf': '\uD83C\uDFCC\uFE0F', 'Boxing': '\uD83E\uDD4A', 'MMA': '\uD83E\uDD4B',
  'Rugby': '\uD83C\uDFC9', 'Cricket': '\uD83C\uDFCF', 'Volleyball': '\uD83C\uDFD0',
  'Handball': '\uD83E\uDD3E', 'Water Sports': '\uD83C\uDFCA', 'Winter Sports': '\u26F7\uFE0F',
  'Motor Sport': '\uD83C\uDFCE\uFE0F', 'Cycling': '\uD83D\uDEB4', 'Horse Racing': '\uD83C\uDFC7',
  'Snooker': '\uD83C\uDFB1', 'Darts': '\uD83C\uDFAF', 'Badminton': '\uD83C\uDFF8',
  'Table Tennis': '\uD83C\uDFD3', 'Field Hockey': '\uD83C\uDFD1', 'Esports': '\uD83C\uDFAE',
  'Athletics': '\uD83C\uDFC3', 'Swimming': '\uD83C\uDFCA', 'Wrestling': '\uD83E\uDD3C',
  'Weightlifting': '\uD83C\uDFCB\uFE0F', 'Archery': '\uD83C\uDFF9', 'Fencing': '\uD83E\uDD3A',
  'Skateboarding': '\uD83D\uDEF9', 'Surfing': '\uD83C\uDFC4',
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
  const [scheduleMatches, setScheduleMatches] = useState<ScheduleMatch[]>([])
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [scheduleLastUpdated, setScheduleLastUpdated] = useState<Date | null>(null)
  const [schedulePage, setSchedulePage] = useState(1)
  const [scheduleStreams, setScheduleStreams] = useState<{ source: string; streamNo: number; language: string; hd: boolean; embedUrl: string }[]>([])
  const [scheduleStreamLoading, setScheduleStreamLoading] = useState(false)
  const [viewKey, setViewKey] = useState(0)
  const [selectedCountry, setSelectedCountry] = useState<string>('')
  const [sportsdbImages, setSportsdbImages] = useState<Record<string, string>>({})
  const [failedSportImages, setFailedSportImages] = useState<Set<string>>(new Set())
  const [leagueImgErrors, setLeagueImgErrors] = useState<Set<string>>(new Set())
  const [teamImgErrors, setTeamImgErrors] = useState<Set<string>>(new Set())
  const [leagueDbImages, setLeagueDbImages] = useState<Record<string, string>>({})
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
  }, [store.loading, store.view])

  useEffect(() => {
    if (store.sportsList.length === 0) return
    window.api.sportsdb.getAllSports().then((all: any[]) => {
      window.api.log(`[Sports] TheSportsDB: ${all.length} sports returned`)
      const dbByName: Record<string, any> = {}
      for (const s of all) {
        dbByName[s.name?.toLowerCase()] = s
        if (s.thumb) window.api.log(`[Sports] TheSportsDB: "${s.name}" has thumb`)
      }
      const map: Record<string, string> = {}
      for (const sport of store.sportsList) {
        const key = sport.name.toLowerCase()
        const dbName = OUR_TO_DB_SPORT[key]
        if (dbName) {
          const dbSport = dbByName[dbName.toLowerCase()]
          if (dbSport?.thumb) map[sport.id] = dbSport.thumb
          else window.api.log(`[Sports] No TheSportsDB thumb for "${sport.name}" (dbName="${dbName}")`)
        } else {
          window.api.log(`[Sports] No TheSportsDB name mapping for "${sport.name}" (key="${key}")`)
        }
      }
      window.api.log(`[Sports] TheSportsDB images: ${Object.keys(map).length}/${store.sportsList.length} mapped`)
      setSportsdbImages(map)
    }).catch((err: any) => window.api.log(`[Sports] TheSportsDB getAllSports error: ${err?.message || err}`))
  }, [store.sportsList.length])

  const fetchLeagueDbImage = useCallback(async (sportName: string | undefined, leagueName: string, leagueId: string) => {
    if (!sportName) { window.api.log(`[Sports] fetchLeagueDbImage: no sportName for "${leagueName}"`); return }
    const key = sportName.toLowerCase()
    window.api.log(`[Sports] fetchLeagueDbImage: name="${sportName}" key="${key}" league="${leagueName}"`)
    try {
      const imgUrl = await window.api.sportsapipro.getCompetitionImage(key, leagueName)
      if (imgUrl) {
        window.api.log(`[Sports] SportsAPIPRO found image for "${leagueName}"`)
        setLeagueDbImages(prev => ({ ...prev, [leagueId]: imgUrl }))
        return
      }
      window.api.log(`[Sports] SportsAPIPRO no image for "${leagueName}"`)
    } catch (err: any) {
      window.api.log(`[Sports] SportsAPIPRO error: ${err?.message || err}`)
    }
    const dbName = OUR_TO_DB_SPORT[key]
    if (!dbName) { window.api.log(`[Sports] No TheSportsDB name mapping for key="${key}"`); return }
    try {
      const teams = await window.api.sportsdb.getTeamsBySport(dbName)
      const match = teams.find((t: any) =>
        t.league?.toLowerCase() === leagueName.toLowerCase() ||
        t.name?.toLowerCase() === leagueName.toLowerCase()
      )
      if (match?.badge) {
        window.api.log(`[Sports] TheSportsDB found badge for "${leagueName}"`)
        setLeagueDbImages(prev => ({ ...prev, [leagueId]: match.badge }))
      } else {
        window.api.log(`[Sports] TheSportsDB no match for "${leagueName}" among ${teams.length} teams`)
      }
    } catch (err: any) {
      window.api.log(`[Sports] TheSportsDB error: ${err?.message || err}`)
    }
  }, [])

  const loadLeagues = useCallback(async (sport: any) => {
    store.setLoading(true)
    setSelectedCountry('')
    setLeaguesPage(1)
    useSportsStore.setState({ selectedSport: sport, view: 'leagues', leagues: [] })
    try {
      const leagues = await window.api.sports.getLeaguesBySport(sport.id)
      store.setLeagues(leagues)
      // trigger fallback image fetching for leagues without logoUrl
      if (sport.name) {
        for (const league of leagues) {
          if (!league.logoUrl && !leagueDbImages[league.id] && !leagueImgErrors.has(league.id)) {
            fetchLeagueDbImage(sport.name, league.name, league.id)
          }
        }
      }
    } catch { store.setError('Failed to load leagues') }
    store.setLoading(false)
  }, [store, leagueDbImages, leagueImgErrors, fetchLeagueDbImage])

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
    useSportsStore.setState({ selectedSeason: season, view: 'events', upcomingEvents: [], pastEvents: [] })
    try {
      const leagueId = useSportsStore.getState().selectedLeague!.id
      const today = new Date()
      const todayStr = today.toISOString().split('T')[0]
      const fromDate = season.startDate || '2020-01-01'
      const past = await window.api.sports.getEventsInRange(leagueId, season.id, fromDate, todayStr)
      window.api.log(`[Sports] Season "${season.name}" (${season.id}): ${past?.length || 0} past events (${fromDate}→${todayStr})`)
      store.setPastEvents(past || [])
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
      window.api.log(`[Sports] loadEventDetail: home=${homeTeam?.name || event.homeTeamName}, away=${awayTeam?.name || event.awayTeamName}`)

      // run TheSportsDB lookups + SportsAPIPRO fallback in parallel so one slow fetch doesn't block the others
      const fallbackImgPromise = (async () => {
        if (!store.selectedSport?.name) { window.api.log(`[Sports] No selectedSport, skipping fallback`); return null }
        const key = store.selectedSport.name.toLowerCase()
        window.api.log(`[Sports] Trying SportsAPIPRO fallback for team logos (sport="${key}")`)
        try {
          const img = await window.api.sportsapipro.getCompetitionImage(key, event.leagueName || event.homeTeamName || '')
          if (img) {
            window.api.log(`[Sports] SportsAPIPRO found fallback image`)
          } else {
            window.api.log(`[Sports] SportsAPIPRO no fallback image`)
          }
          return img
        } catch (err: any) {
          window.api.log(`[Sports] SportsAPIPRO fallback error: ${err?.message || err}`)
          return null
        }
      })()

      await Promise.all([
        (async () => {
          if (!homeTeam?.logoUrl && event.homeTeamName) {
            try {
              const teams = await window.api.sportsdb.searchTeams(event.homeTeamName)
              window.api.log(`[Sports] TheSportsDB home "${event.homeTeamName}": ${teams?.length || 0} results`)
              if (teams?.[0]?.badge) homeTeam.logoUrl = teams[0].badge
            } catch (err: any) { window.api.log(`[Sports] TheSportsDB home error: ${err?.message || err}`) }
          }
        })(),
        (async () => {
          if (!awayTeam?.logoUrl && event.awayTeamName) {
            try {
              const teams = await window.api.sportsdb.searchTeams(event.awayTeamName)
              window.api.log(`[Sports] TheSportsDB away "${event.awayTeamName}": ${teams?.length || 0} results`)
              if (teams?.[0]?.badge) awayTeam.logoUrl = teams[0].badge
            } catch (err: any) { window.api.log(`[Sports] TheSportsDB away error: ${err?.message || err}`) }
          }
        })(),
        fallbackImgPromise.then((img) => {
          if (img) {
            // always apply fallback — Sportarr logos are often broken
            if (!homeTeam?.logoUrl) homeTeam.logoUrl = img
            if (!awayTeam?.logoUrl) awayTeam.logoUrl = img
          }
        }),
      ])

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
      const selectedCategories = new Set<string>()
      store.sportsList.filter((s: any) => selectedSports.length === 0 || selectedSports.includes(s.id)).forEach((sport: any) => {
        const names = new Set<string>()
        const add = (n: string) => { if (n) names.add(n.toLowerCase()) }
        add(sport.slug); add(sport.name)
        const lower = (sport.slug || sport.name || '').toLowerCase()
        switch (lower) {
          case 'football': case 'soccer':
            add('soccer')
            break
          case 'american football':
            add('nfl')
            break
          case 'basketball':
            add('basketball'); add('nba')
            break
          case 'ice hockey':
            add('hockey'); add('nhl')
            break
          case 'baseball':
            add('baseball'); add('mlb')
            break
          case 'tennis':
            add('tennis')
            break
          case 'boxing': case 'mma':
            add('ufc'); add('mma'); add('wwe')
            break
          case 'motor sport': case 'motorsport':
            add('motorsport')
            break
          case 'rugby':
            add('rugby')
            break
          case 'golf':
            add('golf')
            break
          case 'cricket':
            add('cricket')
            break
          case 'darts':
            add('darts')
            break
          case 'snooker': case 'billiards':
            add('darts')
            break
          default:
            if (lower.includes('rugby')) add('rugby')
        }
        names.forEach(n => selectedCategories.add(n))
      })

      if (selectedCategories.size === 0) {
        setScheduleMatches([])
        setScheduleLastUpdated(new Date())
        setScheduleLoading(false)
        return
      }

      const matches: ScheduleMatch[] = await window.api.streamedpk.getMatchesForSports([...selectedCategories])
      if (!Array.isArray(matches)) throw new Error('Invalid response from schedule service')

      setScheduleMatches(matches.filter(m => m.date >= todayMsStart && m.date <= todayMsEnd))
      setScheduleLastUpdated(new Date())
    } catch (err: any) {
      console.error('[Sports] Schedule load failed:', err?.message || err)
      setScheduleError(err?.message ? `Schedule service unavailable (${err.message})` : 'Schedule service unavailable')
      setScheduleMatches([])
    }
    setScheduleLoading(false)
  }, [settingsStore.sportsSelected, store.sportsList, scheduleMatches, scheduleLastUpdated])

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
    setFocusedIndex(0)
    try {
      const all: { source: string; streamNo: number; language: string; hd: boolean; embedUrl: string }[] = match.sources
        .filter(s => s.embedUrl)
        .map((s, i) => ({
          source: s.source,
          streamNo: i + 1,
          language: 'Unknown',
          hd: true,
          embedUrl: s.embedUrl!
        }))
      setScheduleStreams(all)
    } catch { setScheduleStreams([]) }
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

  const goBack = useCallback(() => {
    if (showSchedule) {
      if (scheduleStreams.length > 0) setScheduleStreams([])
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
        setShowSchedule(false); setScheduleMatches([]); setScheduleStreams([])
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
        setFocusedIndex(0); break
    }
  }, [onBack, showSchedule, scheduleStreams.length])

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
          else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); const s = scheduleStreams[focusedIndex]; if (s) onPlayUrl(s.embedUrl) }
          else if (e.key === 'Backspace' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setScheduleStreams([]); setFocusedIndex(0) }
          return
        }
        if (scheduleMatches.length > 0) {
          const scheduleCols = getGridCols()
          const scheduleMax = paginatedScheduleMatches.length - 1
          if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setFocusedIndex((i: number) => Math.min(i + scheduleCols, scheduleMax)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setFocusedIndex((i: number) => Math.max(i - scheduleCols, 0)) }
          else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); setFocusedIndex((i: number) => Math.min(i + 1, scheduleMax)) }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); setFocusedIndex((i: number) => Math.max(i - 1, 0)) }
          else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); loadScheduleStreams(paginatedScheduleMatches[focusedIndex]) }
          else if (e.key === 'Backspace' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); goBack() }
          return
        }
        if (e.key === 'Backspace' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); goBack() }
        return
      }
      const items = getItems()
      if (store.view === 'detail') {
        if (replayResults.length > 0) {
          if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setReplayFocused((i: number) => Math.min(i + 1, replayResults.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setReplayFocused((i: number) => Math.max(i - 1, 0)) }
          else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); const r = replayResults[replayFocused]; if (r && r.sources[0]) onPlayUrl(r.sources[0].url) }
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
  }, [store.view, visibleSports, store.leagues, store.seasons, store.upcomingEvents, store.pastEvents, focusedIndex, loadLeagues, loadSeasons, loadEvents, loadEventDetail, goBack, handlePlayEvent, getItems, getGridCols, replayResults, replayFocused, showSchedule, scheduleMatches, scheduleStreams, loadSchedule, loadScheduleStreams, onPlayUrl, totalPages, paginatedLeagues, paginationButtons, setLeaguesPage, paginatedScheduleMatches])

  useEffect(() => { setFocusedIndex(0) }, [store.view, visibleSports, store.leagues, store.seasons, store.upcomingEvents, store.pastEvents])

  useEffect(() => {
    if (focusedIndex >= 0 && contentRef.current) {
    const focused = contentRef.current.querySelector(`[data-focus-index="${focusedIndex}"]`) as HTMLElement | undefined
    if (focused) { focused.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); focused.focus() }
    }
  }, [focusedIndex])

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    try { return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) } catch { return dateStr }
  }

  const formatTime = (dateStr: string) => {
    if (!dateStr) return ''
    try { return new Date(dateStr).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
  }

  const getStatus = (date: number) => {
    const now = Date.now()
    const diff = now - date
    if (diff < 0) return 'upcoming'
    if (diff < 10800000) return 'live'
    return 'finished'
  }

  const formatTimeGMT = (ts: number) => {
    try { return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: 'GMT' }) } catch { return '' }
  }

  const isFocused = (index: number, focusedIndex: number) => index === focusedIndex

  const renderEventCard = (event: any, i: number, isPast: boolean) => {
    const teamEvent = isTeamEvent(event)
    return (
      <div
        key={event.id}
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
      if (scheduleStreams.length > 0) {
        return (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: '0 0 16px 0' }}>Select Source</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {scheduleStreams.map((s, i) => (
                <div key={i} data-focus-index={i} tabIndex={0}
                  style={eventCardStyle(isFocused(i, focusedIndex))}
                  onClick={() => onPlayUrl(s.embedUrl)}
                  onMouseEnter={() => setFocusedIndex(i)}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{s.source} #{s.streamNo}{s.hd ? ' HD' : ''}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{s.language}</div>
                  </div>
                </div>
              ))}
            </div>
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
              <div key={match.id} data-focus-index={i} tabIndex={0}
                style={cardStyle(isFocused(i, focusedIndex))}
                onClick={() => loadScheduleStreams(match)}
                onMouseEnter={() => setFocusedIndex(i)}
              >
                <div style={{ width: '100%', height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', background: match.poster ? `rgba(255,255,255,0.03) url(${match.poster.startsWith('http') ? match.poster : `https://streamed.pk${match.poster}`}) center/cover no-repeat` : 'rgba(255,255,255,0.03)' }}>
                  {match.poster && <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,20,20,0.55)', zIndex: 0 }} />}
                  {match.teams?.home?.badge && match.teams?.away?.badge ? (
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center', position: 'relative', zIndex: 1 }}>
                      <img src={match.teams.home.badge} alt="" style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 6 }}
                        onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3' }} />
                      <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 600 }}>vs</span>
                      <img src={match.teams.away.badge} alt="" style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 6 }}
                        onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3' }} />
                    </div>
                  ) : match.teams?.home?.badge ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1 }}>
                      <img src={match.teams.home.badge} alt="" style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 6 }}
                        onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3' }} />
                      <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 600 }}>{match.teams.home.name}</span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 40, opacity: 0.15, position: 'relative', zIndex: 1 }}>{SPORT_ICONS_RAW[match.category as keyof typeof SPORT_ICONS_RAW] || '🏅'}</span>
                  )}
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
              <button tabIndex={0}
                disabled={schedulePage <= 1}
                onClick={() => setSchedulePage(p => Math.max(1, p - 1))}
                style={{
                  padding: '6px 14px', borderRadius: 6, border: '2px solid transparent',
                  cursor: schedulePage <= 1 ? 'default' : 'pointer',
                  background: schedulePage <= 1 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)',
                  color: schedulePage <= 1 ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)',
                  fontSize: 13, fontWeight: 600,
                }}
              >Prev</button>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', padding: '0 8px' }}>{schedulePage} / {scheduleTotalPages}</span>
              <button tabIndex={0}
                disabled={schedulePage >= scheduleTotalPages}
                onClick={() => setSchedulePage(p => Math.min(scheduleTotalPages, p + 1))}
                style={{
                  padding: '6px 14px', borderRadius: 6, border: '2px solid transparent',
                  cursor: schedulePage >= scheduleTotalPages ? 'default' : 'pointer',
                  background: schedulePage >= scheduleTotalPages ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)',
                  color: schedulePage >= scheduleTotalPages ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)',
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
                const imgUrl = sportsdbImages[sport.id]
                const imgFailed = failedSportImages.has(sport.id)
                return (
                  <div key={sport.id} data-focus-index={i + 1} tabIndex={0}
                    style={cardStyle(isFocused(i + 1, focusedIndex))}
                    onClick={() => loadLeagues(sport)}
                    onMouseEnter={() => setFocusedIndex(i + 1)}
                  >
                    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                      {imgUrl && !imgFailed ? (
                        <img src={imgUrl} alt={sport.name} style={{ width: 48, height: 48, objectFit: 'contain' }} onError={() => setFailedSportImages(prev => new Set(prev).add(sport.id))} />
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
                    <img src={league.logoUrl} alt={league.name} style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} onError={() => {
                      setLeagueImgErrors(prev => new Set(prev).add(league.id))
                      if (!leagueDbImages[league.id]) fetchLeagueDbImage(store.selectedSport?.name, league.name, league.id)
                    }} />
                  ) : leagueDbImages[league.id] ? (
                    <img src={leagueDbImages[league.id]} alt={league.name} style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} onError={() => setLeagueImgErrors(prev => new Set(prev).add(league.id))} />
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
            {store.pastEvents.length > 0 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: '0 0 16px 0' }}>
                  {store.selectedSeason?.isCurrent ? 'Results' : 'Past Results'}
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {store.pastEvents.map((event: any, i: number) => renderEventCard(event, i, true))}
                </div>
              </>
            )}
            {store.pastEvents.length === 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>No events found for this season</div>
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
            {replayResults.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, marginTop: 16 }}>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: '0 0 12px 0' }}>Replays Found</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {replayResults.map((r, i) => (
                    <div key={i} tabIndex={0}
                      style={eventCardStyle(replayFocused === i)}
                      onClick={() => { if (r.sources[0]) onPlayUrl(r.sources[0].url) }}
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
