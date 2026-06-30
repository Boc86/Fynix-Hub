import React, { useEffect, useCallback, useRef, useState } from 'react'
import { useSportsStore } from '../../store/sportsStore'
import { useSettingsStore } from '../../store/settingsStore'
import styles from './Sports.module.css'

interface SportsProps {
  onPlay: (title: string, year?: number) => void
  onBack: () => void
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

export default function Sports({ onPlay, onBack }: SportsProps) {
  const store = useSportsStore()
  const settingsStore = useSettingsStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const [focusedIndex, setFocusedIndex] = useState(0)

  const hasApiKey = !!settingsStore.sportsDbApiKey

  useEffect(() => {
    if (store.view === 'sports' && store.sportsList.length === 0) {
      store.setLoading(true)
      window.api.sports.getSportsList()
        .then((list: string[]) => {
          store.setSportsList(list)
          store.setLoading(false)
        })
        .catch(() => {
          store.setError('Failed to load sports')
          store.setLoading(false)
        })
    }
  }, [store.view])

  const loadLeagues = useCallback(async (sport: string) => {
    store.setLoading(true)
    store.setSelectedSport(sport)
    store.setView('leagues')
    try {
      const leagues = await window.api.sports.getLeaguesBySport(sport)
      store.setLeagues(leagues)
    } catch {
      store.setError('Failed to load leagues')
    }
    store.setLoading(false)
  }, [store])

  const loadEvents = useCallback(async (league: any) => {
    store.setLoading(true)
    store.setSelectedLeague(league)
    store.setView('events')
    try {
      const [upcoming, past] = await Promise.all([
        window.api.sports.getUpcomingEvents(league.idLeague),
        window.api.sports.getPastEvents(league.idLeague),
      ])
      store.setUpcomingEvents(upcoming)
      store.setPastEvents(past)
    } catch {
      store.setError('Failed to load events')
    }
    store.setLoading(false)
  }, [store])

  const loadEventDetail = useCallback(async (event: any) => {
    store.setLoading(true)
    store.setSelectedEvent(event)
    store.setView('detail')
    try {
      const [homeTeam, awayTeam] = await Promise.all([
        event.idHomeTeam ? window.api.sports.getTeamDetails(event.idHomeTeam) : Promise.resolve(null),
        event.idAwayTeam ? window.api.sports.getTeamDetails(event.idAwayTeam) : Promise.resolve(null),
      ])
      store.setHomeTeam(homeTeam)
      store.setAwayTeam(awayTeam)
    } catch {
      // teams are optional
    }
    store.setLoading(false)
  }, [store])

  const handlePlayEvent = useCallback(() => {
    const event = store.selectedEvent
    if (!event) return
    const title = `${event.strHomeTeam} vs ${event.strAwayTeam} - ${event.strEvent || event.strLeague}`
    onPlay(title, parseInt(event.dateEvent?.slice(0, 4)) || undefined)
  }, [store.selectedEvent, onPlay])

  const goBack = useCallback(() => {
    switch (store.view) {
      case 'leagues':
        store.setView('sports')
        store.setSelectedSport(null)
        break
      case 'events':
        store.setView('leagues')
        store.setSelectedLeague(null)
        break
      case 'detail':
        store.setView('events')
        store.setSelectedEvent(null)
        store.setHomeTeam(null)
        store.setAwayTeam(null)
        break
      default:
        onBack()
    }
  }, [store, onBack])

  const getItems = useCallback(() => {
    switch (store.view) {
      case 'sports':
        return store.sportsList
      case 'leagues':
        return store.leagues
      case 'events':
        return [...store.upcomingEvents, ...store.pastEvents]
      case 'detail':
        return []
    }
  }, [store.view, store.sportsList, store.leagues, store.upcomingEvents, store.pastEvents])

  const isFocused = (index: number, focusedIndex: number) => index === focusedIndex

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function handleKeyDown(e: KeyboardEvent) {
      const items = getItems()
      if (store.view === 'detail') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handlePlayEvent()
        }
        return
      }
      if (items.length === 0) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIndex((i) => Math.min(i + 1, items.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'ArrowRight' && store.view === 'sports') {
        e.preventDefault()
        setFocusedIndex((i) => Math.min(i + 1, items.length - 1))
      } else if (e.key === 'ArrowLeft' && store.view === 'sports') {
        e.preventDefault()
        setFocusedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        const item = items[focusedIndex]
        if (!item) return
        if (store.view === 'sports') {
          loadLeagues(item as string)
        } else if (store.view === 'leagues') {
          loadEvents(item)
        } else if (store.view === 'events') {
          loadEventDetail(item)
        }
      } else if (e.key === 'Backspace' || e.key === 'Escape') {
        e.preventDefault()
        goBack()
      }
    }
    el.addEventListener('keydown', handleKeyDown)
    return () => el.removeEventListener('keydown', handleKeyDown)
  }, [store.view, store.sportsList, store.leagues, store.upcomingEvents, store.pastEvents, focusedIndex, loadLeagues, loadEvents, loadEventDetail, goBack, handlePlayEvent, getItems])

  useEffect(() => {
    setFocusedIndex(0)
  }, [store.view, store.sportsList, store.leagues, store.upcomingEvents, store.pastEvents])

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      return dateStr
    }
  }

  const renderContent = () => {
    if (store.loading) {
      return <div className={styles.loading}>Loading...</div>
    }
    if (store.error) {
      return <div className={styles.error}>{store.error}</div>
    }

    switch (store.view) {
      case 'sports':
        return (
          <div>
            {!hasApiKey && (
              <div className={styles.apiKeyNotice}>
                Add a TheSportsDB API key in Settings &gt; Sports for full access (uses test key otherwise)
              </div>
            )}
            <h2 className={styles.sectionTitle}>Choose a Sport</h2>
            <div className={styles.grid}>
              {store.sportsList.map((sport, i) => (
                <div
                  key={sport}
                  className={`${styles.card} ${isFocused(i, focusedIndex) ? styles.cardFocused : ''}`}
                  tabIndex={0}
                  onClick={() => loadLeagues(sport)}
                  onMouseEnter={() => setFocusedIndex(i)}
                >
                  <div className={styles.cardBody} style={{ alignItems: 'center', padding: 24 }}>
                    <div className={styles.sportIcon}>{SPORT_ICONS[sport] || '🏅'}</div>
                    <div className={styles.cardTitle} style={{ marginTop: 8 }}>{sport}</div>
                  </div>
                </div>
              ))}
            </div>
            {store.sportsList.length === 0 && (
              <div className={styles.emptyState}>
                No sports available. Add a TheSportsDB API key in Settings.
              </div>
            )}
          </div>
        )

      case 'leagues':
        return (
          <div>
            <h2 className={styles.sectionTitle}>{store.selectedSport} Leagues</h2>
            <div className={styles.grid}>
              {store.leagues.map((league, i) => (
                <div
                  key={league.idLeague}
                  className={`${styles.card} ${isFocused(i, focusedIndex) ? styles.cardFocused : ''}`}
                  tabIndex={0}
                  onClick={() => loadEvents(league)}
                  onMouseEnter={() => setFocusedIndex(i)}
                >
                  {(league.strBadge || league.strLogo) && (
                    <img
                      className={styles.cardImage}
                      src={league.strBadge || league.strLogo}
                      alt={league.strLeague}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  )}
                  <div className={styles.cardBody}>
                    <div className={styles.cardTitle}>{league.strLeague}</div>
                    <div className={styles.cardSub}>{league.strCountry}{league.strDivision ? ` - ${league.strDivision}` : ''}</div>
                    {league.strCurrentSeason && (
                      <div className={styles.cardSub}>Season: {league.strCurrentSeason}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {store.leagues.length === 0 && (
              <div className={styles.emptyState}>No leagues found for {store.selectedSport}</div>
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
                  {store.upcomingEvents.map((event, i) => (
                    <div
                      key={event.idEvent}
                      className={`${styles.eventCard} ${isFocused(i, focusedIndex) ? styles.eventCardFocused : ''}`}
                      tabIndex={0}
                      onClick={() => loadEventDetail(event)}
                      onMouseEnter={() => setFocusedIndex(i)}
                    >
                      <div className={styles.teamInfo}>
                        <img
                          className={styles.teamBadge}
                          src={event.strHomeTeamBadge}
                          alt={event.strHomeTeam}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                        <div className={styles.teamName}>{event.strHomeTeam}</div>
                      </div>
                      <div className={styles.vs}>VS</div>
                      <div className={styles.teamInfo}>
                        <img
                          className={styles.teamBadge}
                          src={event.strAwayTeamBadge}
                          alt={event.strAwayTeam}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                        <div className={styles.teamName}>{event.strAwayTeam}</div>
                      </div>
                      <div className={styles.eventDate}>
                        {formatDate(event.dateEvent)}
                        {event.strTime ? ` ${event.strTime}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {store.pastEvents.length > 0 && (
              <>
                <h2 className={styles.sectionTitle} style={{ marginTop: 24 }}>Past Results</h2>
                <div className={styles.eventsList}>
                  {store.pastEvents.map((event, i) => (
                    <div
                      key={event.idEvent}
                      className={`${styles.eventCard} ${isFocused(i + store.upcomingEvents.length, focusedIndex) ? styles.eventCardFocused : ''}`}
                      tabIndex={0}
                      onClick={() => loadEventDetail(event)}
                      onMouseEnter={() => setFocusedIndex(i + store.upcomingEvents.length)}
                    >
                      <div className={styles.teamInfo}>
                        <img
                          className={styles.teamBadge}
                          src={event.strHomeTeamBadge}
                          alt={event.strHomeTeam}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                        <div className={styles.teamName}>{event.strHomeTeam}</div>
                        <div className={styles.score}>{event.intHomeScore ?? '-'}</div>
                      </div>
                      <div className={styles.vs}>VS</div>
                      <div className={styles.teamInfo}>
                        <img
                          className={styles.teamBadge}
                          src={event.strAwayTeamBadge}
                          alt={event.strAwayTeam}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                        <div className={styles.teamName}>{event.strAwayTeam}</div>
                        <div className={styles.score}>{event.intAwayScore ?? '-'}</div>
                      </div>
                      <div className={styles.eventDate}>
                        {formatDate(event.dateEvent)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {store.upcomingEvents.length === 0 && store.pastEvents.length === 0 && (
              <div className={styles.emptyState}>No events found</div>
            )}
          </div>
        )

      case 'detail': {
        const event = store.selectedEvent
        if (!event) return <div className={styles.emptyState}>No event selected</div>
        return (
          <div>
            <div className={styles.detailHeader}>
              <div className={styles.detailTeams}>
                <div className={styles.detailTeam}>
                  <img
                    className={styles.detailTeamBadge}
                    src={store.homeTeam?.strTeamBadge || event.strHomeTeamBadge}
                    alt={event.strHomeTeam}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                  <div className={styles.detailTeamName}>{store.homeTeam?.strTeam || event.strHomeTeam}</div>
                  {event.intHomeScore && <div className={styles.detailScore}>{event.intHomeScore}</div>}
                </div>
                <div className={styles.vs} style={{ fontSize: 20 }}>VS</div>
                <div className={styles.detailTeam}>
                  <img
                    className={styles.detailTeamBadge}
                    src={store.awayTeam?.strTeamBadge || event.strAwayTeamBadge}
                    alt={event.strAwayTeam}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                  <div className={styles.detailTeamName}>{store.awayTeam?.strTeam || event.strAwayTeam}</div>
                  {event.intAwayScore && <div className={styles.detailScore}>{event.intAwayScore}</div>}
                </div>
              </div>
              <div className={styles.eventDate}>{formatDate(event.dateEvent)}{event.strTime ? ` at ${event.strTime}` : ''}</div>
            </div>

            <div className={styles.detailInfo}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Event</span>
                <span className={styles.detailValue}>{event.strEvent || event.strEventAlternate || '-'}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>League</span>
                <span className={styles.detailValue}>{event.strLeague || store.selectedLeague?.strLeague || '-'}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Season</span>
                <span className={styles.detailValue}>{event.strSeason || '-'}</span>
              </div>
              {event.strVenue && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Venue</span>
                  <span className={styles.detailValue}>{event.strVenue}</span>
                </div>
              )}
              {event.strCountry && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Country</span>
                  <span className={styles.detailValue}>{event.strCountry}</span>
                </div>
              )}
              {event.intHomeScore !== null && event.intAwayScore !== null && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Score</span>
                  <span className={styles.detailValue}>{event.intHomeScore ?? '-'} - {event.intAwayScore ?? '-'}</span>
                </div>
              )}
            </div>

            {(store.homeTeam?.strDescription || store.awayTeam?.strDescription) && (
              <div className={styles.detailInfo} style={{ marginTop: 12 }}>
                {store.homeTeam?.strDescription && (
                  <div>
                    <div className={styles.detailLabel}>About {store.homeTeam.strTeam}</div>
                    <p className={styles.detailValue} style={{ fontSize: 13, lineHeight: 1.5, marginTop: 4 }}>
                      {store.homeTeam.strDescription.slice(0, 300)}...
                    </p>
                  </div>
                )}
                {store.awayTeam?.strDescription && store.awayTeam.idTeam !== store.homeTeam?.idTeam && (
                  <div style={{ marginTop: 8 }}>
                    <div className={styles.detailLabel}>About {store.awayTeam.strTeam}</div>
                    <p className={styles.detailValue} style={{ fontSize: 13, lineHeight: 1.5, marginTop: 4 }}>
                      {store.awayTeam.strDescription.slice(0, 300)}...
                    </p>
                  </div>
                )}
              </div>
            )}

            <button
              className={styles.playBtn}
              onClick={handlePlayEvent}
              tabIndex={0}
            >
              Search Torrents for {event.strHomeTeam} vs {event.strAwayTeam}
            </button>
          </div>
        )
      }
    }
  }

  return (
    <div className={styles.container} ref={containerRef} tabIndex={-1}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={goBack} tabIndex={0}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className={styles.title}>
          {store.view === 'sports' && 'Sports'}
          {store.view === 'leagues' && store.selectedSport}
          {store.view === 'events' && store.selectedLeague?.strLeague}
          {store.view === 'detail' && `${store.selectedEvent?.strHomeTeam ?? ''} vs ${store.selectedEvent?.strAwayTeam ?? ''}`}
        </h1>
      </div>
      <div className={styles.content}>
        {renderContent()}
      </div>
    </div>
  )
}
