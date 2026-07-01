import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react'
import { useSportsStore } from '../../store/sportsStore'
import { useSettingsStore } from '../../store/settingsStore'
import styles from './Sports.module.css'
import type { SportarrSport, SportsLeague, SportsEvent, SportsSeason } from '../../types.d'

interface ReplayResult {
  title: string
  sport: string
  category: string
  thumbnail: string
  date: string
  sources: { label: string; type: string; url: string }[]
}

interface ScheduleMatch {
  id: string
  title: string
  category: string
  date: number
  poster?: string
  teams?: { home?: { name: string; badge: string }; away?: { name: string; badge: string } }
  sources: { source: string; id: string }[]
}

const SPORT_ICONS: Record<string, string> = {
  'Soccer': '⚽',
  'American Football': '🏈',
  'Basketball': '🏀',
  'Baseball': '⚾',
  'Ice Hockey': '🏒',
  'Tennis': '🎾',
  'Golf': '🏌️',
  'Boxing': '🥊',
  'MMA': '🥋',
  'Rugby': '🏉',
  'Cricket': '🏏',
  'Volleyball': '🏐',
  'Handball': '🤾',
  'Water Sports': '🏊',
  'Winter Sports': '⛷️',
  'Motor Sport': '🏎️',
  'Cycling': '🚴',
  'Horse Racing': '🏇',
  'Snooker': '🎱',
  'Darts': '🎯',
  'Badminton': '🏸',
  'Table Tennis': '🏓',
  'Field Hockey': '🏑',
  'Esports': '🎮',
  'Athletics': '🏃',
  'Swimming': '🏊',
  'Wrestling': '🤼',
  'Weightlifting': '🏋️',
  'Archery': '🏹',
  'Fencing': '🤺',
  'Skateboarding': '🛹',
  'Surfing': '🏄',
}

const GRID_MIN_COL = 260

interface SportsProps {
  onPlay: (title: string, year?: number) => void
  onPlayUrl: (url: string) => Promise<void>
  onBack: () => void
}

export default function Sports({ onPlay, onPlayUrl, onBack }: SportsProps) {
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
  const [scheduleStreams, setScheduleStreams] = useState<{ source: string; streamNo: number; language: string; hd: boolean; embedUrl: string }[]>([])
  const [scheduleStreamLoading, setScheduleStreamLoading] = useState(false)
  const [viewKey, setViewKey] = useState(0)

  const visibleSports = useMemo(() => {
    if (settingsStore.sportsSelected.length === 0) return store.sportsList
    return store.sportsList.filter(s => settingsStore.sportsSelected.includes(s.id))
  }, [store.sportsList, settingsStore.sportsSelected])

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
        .then((list: SportarrSport[]) => {
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

  const getGridCols = useCallback(() => {
    const el = contentRef.current
    if (!el) return 1
    const grid = el.querySelector('[data-grid]') as HTMLElement | null
    if (!grid) return 1
    const width = grid.clientWidth
    return Math.max(1, Math.floor((width + 16) / (GRID_MIN_COL + 16)))
  }, [])

  const loadLeagues = useCallback(async (sport: SportarrSport) => {
    store.setLoading(true)
    useSportsStore.setState({ selectedSport: sport, view: 'leagues', leagues: [] })
    try {
      const leagues = await window.api.sports.getLeaguesBySport(sport.id)
      store.setLeagues(leagues)
    } catch {
      store.setError('Failed to load leagues')
    }
    store.setLoading(false)
  }, [store])

  const loadSeasons = useCallback(async (league: SportsLeague) => {
    store.setLoading(true)
    useSportsStore.setState({ selectedLeague: league, view: 'seasons', seasons: [] })
    try {
      const seasons = await window.api.sports.getSeasons(league.id)
      store.setSeasons(seasons)
    } catch {
      store.setError('Failed to load seasons')
    }
    store.setLoading(false)
  }, [store])

  const loadEvents = useCallback(async (season: SportsSeason) => {
    store.setLoading(true)
    useSportsStore.setState({ selectedSeason: season, view: 'events', upcomingEvents: [], pastEvents: [] })
    try {
      const leagueId = useSportsStore.getState().selectedLeague!.id
      const [upcoming, past] = await Promise.all([
        window.api.sports.getUpcomingEvents(leagueId, season.id),
        window.api.sports.getPastEvents(leagueId, season.id),
      ])
      store.setUpcomingEvents(season.isCurrent ? [] : upcoming)
      store.setPastEvents(past)
    } catch {
      store.setError('Failed to load events')
    }
    store.setLoading(false)
  }, [store])

  const loadEventDetail = useCallback(async (event: SportsEvent) => {
    store.setLoading(true)
    useSportsStore.setState({ selectedEvent: event, view: 'detail', homeTeam: null, awayTeam: null })
    try {
      const [homeTeam, awayTeam] = await Promise.all([
        event.homeTeamId ? window.api.sports.getTeamDetails(event.homeTeamId) : Promise.resolve(null),
        event.awayTeamId ? window.api.sports.getTeamDetails(event.awayTeamId) : Promise.resolve(null),
      ])
      store.setHomeTeam(homeTeam)
      store.setAwayTeam(awayTeam)
    } catch {
      // teams are optional
    }
    store.setLoading(false)
  }, [store])

  const loadSchedule = useCallback(async () => {
    setScheduleLoading(true)
    setShowSchedule(true)
    setFocusedIndex(0)
    try {
      const matches: ScheduleMatch[] = await window.api.streamedpk.getToday()
      const selectedSports = settingsStore.sportsSelected
      if (selectedSports.length === 0) {
        setScheduleMatches(matches)
      } else {
        const selectedNames = new Set(
          store.sportsList
            .filter(s => selectedSports.includes(s.id))
            .map(s => s.slug?.toLowerCase() || s.name.toLowerCase())
        )
        setScheduleMatches(matches.filter(m => selectedNames.has(m.category.toLowerCase())))
      }
    } catch {
      setScheduleMatches([])
    }
    setScheduleLoading(false)
  }, [settingsStore.sportsSelected, store.sportsList])

  const loadScheduleStreams = useCallback(async (match: ScheduleMatch) => {
    setScheduleStreamLoading(true)
    setScheduleStreams([])
    setFocusedIndex(0)
    try {
      const all: { source: string; streamNo: number; language: string; hd: boolean; embedUrl: string }[] = []
      for (const src of match.sources) {
        const streams = await window.api.streamedpk.getStreams(src.source, src.id)
        for (const s of streams) {
          all.push(s)
        }
      }
      setScheduleStreams(all)
    } catch {
      setScheduleStreams([])
    }
    setScheduleStreamLoading(false)
  }, [])

  const isTeamEvent = useCallback((event: SportsEvent) => {
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
      if (results.length > 0) {
        setReplayResults(results)
      } else {
        onPlay(title, new Date(event.scheduledStart).getFullYear() || undefined)
      }
    } catch {
      onPlay(title, new Date(event.scheduledStart).getFullYear() || undefined)
    }
    setReplaySearching(false)
  }, [store.selectedEvent, onPlay, isTeamEvent])

  const goBack = useCallback(() => {
    if (showSchedule) {
      if (scheduleStreams.length > 0) {
        setScheduleStreams([])
      } else {
        setShowSchedule(false)
        setScheduleMatches([])
        setScheduleStreams([])
        setScheduleLoading(false)
        setScheduleStreamLoading(false)
      }
      setFocusedIndex(0)
      return
    }
    const { view } = useSportsStore.getState()
    switch (view) {
      case 'sports':
        onBack()
        break
      case 'leagues': {
        const keepSportsList = useSportsStore.getState().sportsList
        store.reset()
        store.setSportsList(keepSportsList)
        setShowSchedule(false)
        setScheduleMatches([])
        setScheduleStreams([])
        setScheduleLoading(false)
        setScheduleStreamLoading(false)
        setReplayResults([])
        setReplaySearching(false)
        setFocusedIndex(0)
        setViewKey(k => k + 1)
        break
      }
      case 'seasons':
        useSportsStore.setState({ view: 'leagues', selectedLeague: null, seasons: [] })
        setFocusedIndex(0)
        break
      case 'events':
        useSportsStore.setState({ view: 'seasons', selectedSeason: null, upcomingEvents: [], pastEvents: [] })
        setFocusedIndex(0)
        break
      case 'detail':
        useSportsStore.setState({ view: 'events', selectedEvent: null, homeTeam: null, awayTeam: null })
        setReplayResults([])
        setReplaySearching(false)
        setFocusedIndex(0)
        break
    }
  }, [onBack])

  const getItems = useCallback((): (SportarrSport | SportsLeague | SportsSeason | SportsEvent)[] => {
    switch (store.view) {
      case 'sports':
        return visibleSports
      case 'leagues':
        return store.leagues
      case 'seasons':
        return store.seasons
      case 'events':
        return [...store.upcomingEvents, ...store.pastEvents]
      case 'detail':
        return []
    }
  }, [store.view, visibleSports, store.leagues, store.seasons, store.upcomingEvents, store.pastEvents])

  const isFocused = (index: number, focusedIndex: number) => index === focusedIndex

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function handleKeyDown(e: KeyboardEvent) {
      // Schedule view keyboard handling
      if (showSchedule) {
        if (scheduleStreams.length > 0) {
          if (e.key === 'ArrowDown') {
            e.preventDefault(); e.stopPropagation()
            setFocusedIndex((i) => Math.min(i + 1, scheduleStreams.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault(); e.stopPropagation()
            setFocusedIndex((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault(); e.stopPropagation()
            const s = scheduleStreams[focusedIndex]
            if (s) onPlayUrl(s.embedUrl)
          } else if (e.key === 'Backspace' || e.key === 'Escape') {
            e.preventDefault(); e.stopPropagation()
            setScheduleStreams([])
            setFocusedIndex(0)
          }
          return
        }
        if (scheduleMatches.length > 0) {
          if (e.key === 'ArrowDown') {
            e.preventDefault(); e.stopPropagation()
            setFocusedIndex((i) => Math.min(i + 1, scheduleMatches.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault(); e.stopPropagation()
            setFocusedIndex((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault(); e.stopPropagation()
            loadScheduleStreams(scheduleMatches[focusedIndex])
          } else if (e.key === 'Backspace' || e.key === 'Escape') {
            e.preventDefault(); e.stopPropagation()
            goBack()
          }
          return
        }
        return
      }
      // Normal navigation (sports/leagues/seasons/events)
      const items = getItems()
      if (store.view === 'detail') {
        if (replayResults.length > 0) {
          if (e.key === 'ArrowDown') {
            e.preventDefault(); e.stopPropagation()
            setReplayFocused((i) => Math.min(i + 1, replayResults.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault(); e.stopPropagation()
            setReplayFocused((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault(); e.stopPropagation()
            const r = replayResults[replayFocused]
            if (r && r.sources[0]) {
              window.api.log('[Sports] Opening replay: ' + r.sources[0].url)
              onPlayUrl(r.sources[0].url)
            }
          } else if (e.key === 'Backspace' || e.key === 'Escape') {
            e.preventDefault(); e.stopPropagation()
            setReplayResults([])
          }
          return
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          handlePlayEvent()
        }
        if (e.key === 'Backspace' || e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          goBack()
        }
        return
      }
      // Always allow Backspace/Escape to go back, even when items are empty
      if (e.key === 'Backspace' || e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        goBack()
        return
      }
      if (items.length === 0) return
      const cols = getGridCols()
      const isGridView = store.view === 'sports' || store.view === 'leagues' || store.view === 'seasons'

      const maxIndex = store.view === 'sports' ? items.length : items.length - 1

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        if (isGridView) {
          setFocusedIndex((i) => Math.min(i + cols, maxIndex))
        } else {
          setFocusedIndex((i) => Math.min(i + 1, maxIndex))
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        if (isGridView) {
          setFocusedIndex((i) => Math.max(i - cols, 0))
        } else {
          setFocusedIndex((i) => Math.max(i - 1, 0))
        }
      } else if (e.key === 'ArrowRight' && isGridView) {
        e.preventDefault()
        e.stopPropagation()
        setFocusedIndex((i) => Math.min(i + 1, maxIndex))
      } else if (e.key === 'ArrowLeft' && isGridView) {
        e.preventDefault()
        e.stopPropagation()
        setFocusedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        e.stopPropagation()
        if (store.view === 'sports') {
          if (focusedIndex === 0) {
            loadSchedule()
          } else {
            const item = items[focusedIndex - 1]
            if (item) loadLeagues(item as SportarrSport)
          }
        } else {
          const item = items[focusedIndex]
          if (!item) return
          if (store.view === 'leagues') {
            loadSeasons(item as SportsLeague)
          } else if (store.view === 'seasons') {
            loadEvents(item as SportsSeason)
          } else if (store.view === 'events') {
            loadEventDetail(item as SportsEvent)
          }
        }
      }
    }
    el.addEventListener('keydown', handleKeyDown)
    return () => el.removeEventListener('keydown', handleKeyDown)
  }, [store.view, visibleSports, store.leagues, store.seasons, store.upcomingEvents, store.pastEvents, focusedIndex, loadLeagues, loadSeasons, loadEvents, loadEventDetail, goBack, handlePlayEvent, getItems, getGridCols, replayResults, replayFocused, showSchedule, scheduleMatches, scheduleStreams, loadSchedule, loadScheduleStreams, onPlayUrl])

  useEffect(() => {
    setFocusedIndex(0)
  }, [store.view, visibleSports, store.leagues, store.seasons, store.upcomingEvents, store.pastEvents])

  useEffect(() => {
    if (focusedIndex >= 0 && contentRef.current) {
      const focused = contentRef.current.querySelector(`[data-focus-index="${focusedIndex}"]`) as HTMLElement | undefined
      if (focused) focused.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [focusedIndex])

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      return dateStr
    }
  }

  const formatTime = (dateStr: string) => {
    if (!dateStr) return ''
    try {
      const d = new Date(dateStr)
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  const renderEventCard = (event: SportsEvent, i: number, isPast: boolean) => {
    const teamEvent = isTeamEvent(event)
    return (
      <div
        key={event.id}
        data-focus-index={i}
        className={`${styles.eventCard} ${isFocused(i, focusedIndex) ? styles.eventCardFocused : ''}`}
        tabIndex={0}
        onClick={() => loadEventDetail(event)}
        onMouseEnter={() => setFocusedIndex(i)}
      >
        {teamEvent ? (
          <>
            <div className={styles.teamInfo}>
              <div className={styles.teamName}>{event.homeTeamName}</div>
              {isPast && <div className={styles.score}>{event.homeScore ?? '-'}</div>}
            </div>
            <div className={styles.vs}>VS</div>
            <div className={styles.teamInfo}>
              <div className={styles.teamName}>{event.awayTeamName}</div>
              {isPast && <div className={styles.score}>{event.awayScore ?? '-'}</div>}
            </div>
          </>
        ) : (
          <div className={styles.teamInfo} style={{ flex: 1 }}>
            <div className={styles.teamName} style={{ fontSize: 15 }}>{event.name}</div>
            {event.venueName && <div className={styles.cardSub}>{event.venueName}</div>}
            {isPast && event.homeScore !== null && event.homeScore !== undefined && (
              <div className={styles.score}>{event.homeScore}</div>
            )}
          </div>
        )}
        <div className={styles.eventDate}>
          {formatDate(event.scheduledStart)}{formatTime(event.scheduledStart) ? ` ${formatTime(event.scheduledStart)}` : ''}
        </div>
      </div>
    )
  }

  const renderContent = () => {
    if (store.loading && !showSchedule) {
      return <div className={styles.loading}>Loading...</div>
    }
    if (store.error && !showSchedule) {
      return <div className={styles.error}>{store.error}</div>
    }

    // Schedule view
    if (showSchedule) {
      if (scheduleLoading) {
        return <div className={styles.loading}>Loading schedule...</div>
      }
      if (scheduleStreamLoading) {
        return <div className={styles.loading}>Loading stream sources...</div>
      }
      // Stream sources list for a match
      if (scheduleStreams.length > 0) {
        return (
          <div>
            <h2 className={styles.sectionTitle}>Select Source</h2>
            <div className={styles.eventsList}>
              {scheduleStreams.map((s, i) => (
                <div
                  key={i}
                  data-focus-index={i}
                  className={`${styles.eventCard} ${isFocused(i, focusedIndex) ? styles.eventCardFocused : ''}`}
                  tabIndex={0}
                  onClick={() => onPlayUrl(s.embedUrl)}
                  onMouseEnter={() => setFocusedIndex(i)}
                >
                  <div className={styles.teamInfo} style={{ flex: 1 }}>
                    <div className={styles.teamName} style={{ fontSize: 14 }}>
                      {s.source} #{s.streamNo}{s.hd ? ' HD' : ''}
                    </div>
                    <div className={styles.cardSub}>{s.language}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      }
      // Match list
      if (scheduleMatches.length === 0) {
        return <div className={styles.emptyState}>No live events today for the selected sports.</div>
      }
      return (
        <div>
          <h2 className={styles.sectionTitle}>Today's Schedule</h2>
          <div className={styles.eventsList}>
            {scheduleMatches.map((match, i) => (
              <div
                key={match.id}
                data-focus-index={i}
                className={`${styles.eventCard} ${isFocused(i, focusedIndex) ? styles.eventCardFocused : ''}`}
                tabIndex={0}
                onClick={() => loadScheduleStreams(match)}
                onMouseEnter={() => setFocusedIndex(i)}
              >
                <div className={styles.teamInfo} style={{ flex: 1 }}>
                  <div className={styles.teamName} style={{ fontSize: 14 }}>{match.title}</div>
                  <div className={styles.cardSub}>{match.category}</div>
                </div>
                {match.poster && (
                  <img src={match.poster} alt="" className={styles.teamBadge} style={{ width: 56, height: 56, borderRadius: 6 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                )}
              </div>
            ))}
          </div>
        </div>
      )
    }

    switch (store.view) {
      case 'sports':
        return (
          <div>
            <h2 className={styles.sectionTitle}>Choose a Sport</h2>
            <div className={styles.grid} data-grid>
              <div
                data-focus-index={0}
                className={`${styles.card} ${isFocused(0, focusedIndex) ? styles.cardFocused : ''}`}
                tabIndex={0}
                onClick={loadSchedule}
                onMouseEnter={() => setFocusedIndex(0)}
              >
                <div className={styles.cardBody} style={{ alignItems: 'center', padding: 24 }}>
                  <div className={styles.sportIcon}>📅</div>
                  <div className={styles.cardTitle} style={{ marginTop: 8 }}>Schedule</div>
                </div>
              </div>
              {visibleSports.map((sport, i) => (
                <div
                  key={sport.id}
                  data-focus-index={i + 1}
                  className={`${styles.card} ${isFocused(i + 1, focusedIndex) ? styles.cardFocused : ''}`}
                  tabIndex={0}
                  onClick={() => loadLeagues(sport)}
                  onMouseEnter={() => setFocusedIndex(i + 1)}
                >
                  <div className={styles.cardBody} style={{ alignItems: 'center', padding: 24 }}>
                    <div className={styles.sportIcon}>{SPORT_ICONS[sport.name] || '🏅'}</div>
                    <div className={styles.cardTitle} style={{ marginTop: 8 }}>{sport.name}</div>
                  </div>
                </div>
              ))}
            </div>
            {visibleSports.length === 0 && (
              <div className={styles.emptyState}>No sports available.</div>
            )}
          </div>
        )

      case 'leagues':
        return (
          <div>
            <h2 className={styles.sectionTitle}>{store.selectedSport?.name} Leagues</h2>
            <div className={styles.grid} data-grid>
              {store.leagues.map((league, i) => (
                <div
                  key={league.id}
                  data-focus-index={i}
                  className={`${styles.card} ${isFocused(i, focusedIndex) ? styles.cardFocused : ''}`}
                  tabIndex={0}
                  onClick={() => loadSeasons(league)}
                  onMouseEnter={() => setFocusedIndex(i)}
                >
                  {league.logoUrl && (
                    <img
                      className={styles.cardImage}
                      src={league.logoUrl}
                      alt={league.name}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  )}
                  <div className={styles.cardBody}>
                    <div className={styles.cardTitle}>{league.name}</div>
                    <div className={styles.cardSub}>{league.country}{league.abbreviation ? ` - ${league.abbreviation}` : ''}</div>
                  </div>
                </div>
              ))}
            </div>
            {store.leagues.length === 0 && (
              <div className={styles.emptyState}>No leagues found for {store.selectedSport?.name}</div>
            )}
          </div>
        )

      case 'seasons':
        return (
          <div>
            <h2 className={styles.sectionTitle}>{store.selectedLeague?.name} — Seasons</h2>
            <div className={styles.grid} data-grid>
              {store.seasons.map((season, i) => (
                <div
                  key={season.id}
                  data-focus-index={i}
                  className={`${styles.card} ${isFocused(i, focusedIndex) ? styles.cardFocused : ''}`}
                  tabIndex={0}
                  onClick={() => loadEvents(season)}
                  onMouseEnter={() => setFocusedIndex(i)}
                >
                  <div className={styles.cardBody} style={{ alignItems: 'center', padding: 24 }}>
                    <div className={styles.cardTitle} style={{ fontSize: 18 }}>{season.name}</div>
                    {season.isCurrent && <div className={styles.cardSub}>Current Season</div>}
                    {season.startDate && (
                      <div className={styles.cardSub}>{formatDate(season.startDate)} - {season.endDate ? formatDate(season.endDate) : '...'}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {store.seasons.length === 0 && (
              <div className={styles.emptyState}>No seasons found for {store.selectedLeague?.name}</div>
            )}
          </div>
        )

      case 'events':
        return (
          <div>
            {store.upcomingEvents.length > 0 && (
              <>
                <h2 className={styles.sectionTitle}>Upcoming Events</h2>
                <div className={styles.eventsList}>
                  {store.upcomingEvents.map((event, i) => renderEventCard(event, i, false))}
                </div>
              </>
            )}
            {store.pastEvents.length > 0 && (
              <>
                <h2 className={styles.sectionTitle} style={{ marginTop: 24 }}>
                  {store.selectedSeason?.isCurrent ? 'Results' : 'Past Results'}
                </h2>
                <div className={styles.eventsList}>
                  {store.pastEvents.map((event, i) => renderEventCard(event, i + store.upcomingEvents.length, true))}
                </div>
              </>
            )}
            {store.upcomingEvents.length === 0 && store.pastEvents.length === 0 && (
              <div className={styles.emptyState}>No events found for this season</div>
            )}
          </div>
        )

      case 'detail': {
        const event = store.selectedEvent
        if (!event) return <div className={styles.emptyState}>No event selected</div>
        const teamEvent = isTeamEvent(event)
        const searchTitle = teamEvent
          ? `${event.homeTeamName} vs ${event.awayTeamName}`
          : event.name
        return (
          <div>
            <div className={styles.detailHeader}>
              {teamEvent ? (
                <div className={styles.detailTeams}>
                  <div className={styles.detailTeam}>
                    <img
                      className={styles.detailTeamBadge}
                      src={store.homeTeam?.logoUrl || ''}
                      alt={event.homeTeamName}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                    <div className={styles.detailTeamName}>{store.homeTeam?.name || event.homeTeamName}</div>
                    {event.homeScore !== null && event.homeScore !== undefined && <div className={styles.detailScore}>{event.homeScore}</div>}
                  </div>
                  <div className={styles.vs} style={{ fontSize: 20 }}>VS</div>
                  <div className={styles.detailTeam}>
                    <img
                      className={styles.detailTeamBadge}
                      src={store.awayTeam?.logoUrl || ''}
                      alt={event.awayTeamName}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                    <div className={styles.detailTeamName}>{store.awayTeam?.name || event.awayTeamName}</div>
                    {event.awayScore !== null && event.awayScore !== undefined && <div className={styles.detailScore}>{event.awayScore}</div>}
                  </div>
                </div>
              ) : (
                <div className={styles.detailTeam}>
                  <div className={styles.detailTeamName} style={{ fontSize: 20 }}>{event.name}</div>
                </div>
              )}
              <div className={styles.eventDate}>{formatDate(event.scheduledStart)}{formatTime(event.scheduledStart) ? ` at ${formatTime(event.scheduledStart)}` : ''}</div>
            </div>

            <div className={styles.detailInfo}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Event</span>
                <span className={styles.detailValue}>{event.name || event.leagueName || '-'}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>League</span>
                <span className={styles.detailValue}>{event.leagueName || store.selectedLeague?.name || '-'}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Season</span>
                <span className={styles.detailValue}>{event.seasonName || store.selectedSeason?.name || '-'}</span>
              </div>
              {event.venueName && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Venue</span>
                  <span className={styles.detailValue}>{event.venueName}</span>
                </div>
              )}
              {teamEvent && event.homeScore !== null && event.awayScore !== null && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Score</span>
                  <span className={styles.detailValue}>{event.homeScore ?? '-'} - {event.awayScore ?? '-'}</span>
                </div>
              )}
            </div>

            {replaySearching && (
              <div className={styles.loading}>Searching for replays...</div>
            )}

            {replayResults.length > 0 && (
              <div className={styles.detailInfo} style={{ marginTop: 16 }}>
                <h3 className={styles.sectionTitle} style={{ marginBottom: 12 }}>Replays Found</h3>
                <div className={styles.eventsList}>
                  {replayResults.map((r, i) => (
                    <div
                      key={i}
                      className={`${styles.eventCard} ${replayFocused === i ? styles.eventCardFocused : ''}`}
                      tabIndex={0}
                      onClick={() => { if (r.sources[0]) onPlayUrl(r.sources[0].url) }}
                      onMouseEnter={() => setReplayFocused(i)}
                    >
                      <div className={styles.teamInfo} style={{ flex: 1 }}>
                        <div className={styles.teamName} style={{ fontSize: 14 }}>{r.title}</div>
                        <div className={styles.cardSub}>{r.sport} - {r.category}</div>
                        <div className={styles.cardSub}>{r.sources.length} source{r.sources.length !== 1 ? 's' : ''}</div>
                      </div>
                      {r.thumbnail && (
                        <img src={r.thumbnail} alt="" className={styles.teamBadge} style={{ width: 56, height: 56, borderRadius: 6 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      )}
                    </div>
                  ))}
                </div>
                <button
                  className={styles.playBtn}
                  onClick={() => {
                    setReplayResults([])
                    onPlay(searchTitle, new Date(event.scheduledStart).getFullYear() || undefined)
                  }}
                  tabIndex={0}
                  style={{ marginTop: 12, opacity: 0.7 }}
                >
                  No replay? Search torrents for {searchTitle}
                </button>
              </div>
            )}

            {replayResults.length === 0 && !replaySearching && (
              <button
                className={styles.playBtn}
                onClick={handlePlayEvent}
                tabIndex={0}
              >
                Search for {searchTitle}
              </button>
            )}
          </div>
        )
      }
    }
  }

  return (
    <div className={styles.container} ref={containerRef} tabIndex={-1} key={viewKey}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={goBack} tabIndex={0}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className={styles.title}>
          {showSchedule && scheduleStreams.length > 0 && 'Stream Sources'}
          {showSchedule && scheduleStreams.length === 0 && 'Live Schedule'}
          {!showSchedule && store.view === 'sports' && 'Sports'}
          {!showSchedule && store.view === 'leagues' && store.selectedSport?.name}
          {!showSchedule && store.view === 'seasons' && store.selectedLeague?.name}
          {!showSchedule && store.view === 'events' && `${store.selectedLeague?.name} — ${store.selectedSeason?.name}`}
          {!showSchedule && store.view === 'detail' && (isTeamEvent(store.selectedEvent!)
            ? `${store.selectedEvent?.homeTeamName ?? ''} vs ${store.selectedEvent?.awayTeamName ?? ''}`
            : store.selectedEvent?.name ?? '')}
        </h1>
      </div>
      <div className={styles.content} ref={contentRef}>
        {renderContent()}
      </div>
    </div>
  )
}