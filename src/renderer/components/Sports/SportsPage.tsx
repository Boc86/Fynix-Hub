import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import styles from './SportsPage.module.css'

interface Sport {
  id: number
  name: string
  slug: string
}

interface Country {
  id: number
  name: string
  slug: string
  code?: string
  flagUrl?: string
}

interface Competition {
  id: number
  name: string
  slug: string
  countryId?: number
  countryName?: string
  sportSlug: string
}

interface Season {
  id: number
  name: string
  year?: string
}

interface Fixture {
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

interface Team {
  id: number
  name: string
  slug?: string
  country?: string
  countryCode?: string
}

type Screen = 'sports' | 'countries' | 'competitions' | 'competition' | 'seasons' | 'fixtures' | 'teams' | 'team'

interface SportsPageProps {
  onSearchTorrent: (title: string, year?: number) => void
}

function formatFixtureTitle(fixture: Fixture): string {
  if (fixture.name && fixture.name !== `${fixture.homeTeam} vs ${fixture.awayTeam}`) return fixture.name
  if (fixture.homeTeam && fixture.awayTeam) return `${fixture.homeTeam} vs ${fixture.awayTeam}`
  return fixture.name || 'Unknown Event'
}

function fixtureYear(fixture: Fixture): number | undefined {
  if (fixture.startTimestamp) {
    const d = new Date(fixture.startTimestamp * 1000)
    if (!isNaN(d.getTime())) return d.getFullYear()
  }
  return undefined
}

function formatFixtureMeta(fixture: Fixture): string {
  const parts: string[] = []
  if (fixture.startTimestamp) {
    const d = new Date(fixture.startTimestamp * 1000)
    if (!isNaN(d.getTime())) {
      parts.push(d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))
    }
  }
  if (fixture.statusType) parts.push(fixture.statusType)
  if (fixture.homeScore != null && fixture.awayScore != null) {
    parts.push(`${fixture.homeScore} - ${fixture.awayScore}`)
  }
  if (fixture.tournament) parts.push(fixture.tournament)
  return parts.join(' • ')
}

export default function SportsPage({ onSearchTorrent }: SportsPageProps) {
  const { sportsSelected, sportsDbApiKey } = useSettingsStore()
  const [screen, setScreen] = useState<Screen>('sports')
  const [sports, setSports] = useState<Sport[]>([])
  const [countries, setCountries] = useState<Country[]>([])
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [fixturePage, setFixturePage] = useState(0)
  const [fixtureDirection, setFixtureDirection] = useState<'last' | 'next'>('last')
  const [hasMoreFixtures, setHasMoreFixtures] = useState(false)
  const [teams, setTeams] = useState<Team[]>([])
  const [teamSearch, setTeamSearch] = useState('')
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [teamFixtures, setTeamFixtures] = useState<Fixture[]>([])
  const [teamFixturePage, setTeamFixturePage] = useState(0)
  const [hasMoreTeamFixtures, setHasMoreTeamFixtures] = useState(false)
  const [selectedSport, setSelectedSport] = useState<Sport | null>(null)
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null)
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null)
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const itemsRef = useRef<HTMLButtonElement[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    pageRef.current?.focus()
  }, [])

  useEffect(() => {
    setSports([])
    if (!sportsDbApiKey.trim()) {
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    window.api.sportsdb.getSports()
      .then((data: Sport[]) => {
        setSports(data)
        setLoading(false)
      })
      .catch((err: any) => {
        setError(err?.message || 'Failed to load sports')
        setLoading(false)
      })
  }, [sportsDbApiKey])

  useEffect(() => {
    setFocusedIndex(0)
    itemsRef.current = []
  }, [screen, sports, countries, competitions, seasons, fixtures, teams, teamFixtures, teamSearch])

  useEffect(() => {
    const el = itemsRef.current[focusedIndex]
    if (el && screen !== 'teams') {
      el.focus()
    }
  }, [focusedIndex, screen])

  const handleBack = useCallback(() => {
    if (screen === 'countries') {
      setScreen('sports')
      setSelectedSport(null)
    } else if (screen === 'competitions') {
      setScreen('countries')
      setSelectedCountry(null)
    } else if (screen === 'competition') {
      setScreen('competitions')
      setSelectedCompetition(null)
    } else if (screen === 'seasons') {
      setScreen('competition')
      setSelectedSeason(null)
    } else if (screen === 'fixtures') {
      setScreen('seasons')
      setFixtures([])
      setFixturePage(0)
      setHasMoreFixtures(false)
    } else if (screen === 'teams') {
      setScreen('competition')
      setTeams([])
      setTeamSearch('')
    } else if (screen === 'team') {
      setScreen('teams')
      setSelectedTeam(null)
      setTeamFixtures([])
      setTeamFixturePage(0)
      setHasMoreTeamFixtures(false)
    }
    setFocusedIndex(0)
  }, [screen])

  const loadCountries = async (sport: Sport) => {
    setSelectedSport(sport)
    setLoading(true)
    setError(null)
    try {
      const data = await window.api.sportsdb.getCountries(sport.slug)
      setCountries(data)
      setScreen('countries')
    } catch (err: any) {
      setError(err?.message || 'Failed to load countries')
    } finally {
      setLoading(false)
    }
  }

  const loadCompetitions = async (country: Country) => {
    if (!selectedSport) return
    setSelectedCountry(country)
    setLoading(true)
    setError(null)
    try {
        const data = await window.api.sportsdb.getCompetitions(selectedSport.slug, selectedSport.id, country.slug)
      setCompetitions(data)
      setScreen('competitions')
    } catch (err: any) {
      setError(err?.message || 'Failed to load competitions')
    } finally {
      setLoading(false)
    }
  }

  const loadSeasons = async (competition: Competition) => {
    if (!selectedSport) return
    setSelectedCompetition(competition)
    setLoading(true)
    setError(null)
    try {
      const data = await window.api.sportsdb.getSeasons(selectedSport.slug, competition.id)
      setSeasons(data)
      setScreen('seasons')
    } catch (err: any) {
      setError(err?.message || 'Failed to load seasons')
    } finally {
      setLoading(false)
    }
  }

  const loadFixtures = async (season: Season, direction: 'last' | 'next' = 'last', page = 0) => {
    if (!selectedSport || !selectedCompetition) return
    setSelectedSeason(season)
    setLoading(true)
    setError(null)
    try {
      const { fixtures: data, hasMore } = await window.api.sportsdb.getFixtures(
        selectedSport.slug,
        selectedCompetition.id,
        season.id,
        page,
        direction
      )
      setFixtureDirection(direction)
      setFixturePage(page)
      setFixtures(data)
      setHasMoreFixtures(hasMore)
      setScreen('fixtures')
    } catch (err: any) {
      setError(err?.message || 'Failed to load fixtures')
    } finally {
      setLoading(false)
    }
  }

  const loadMoreFixtures = async () => {
    if (!selectedSport || !selectedCompetition || !selectedSeason) return
    setLoading(true)
    try {
      const nextPage = fixturePage + 1
      const { fixtures: data, hasMore } = await window.api.sportsdb.getFixtures(
        selectedSport.slug,
        selectedCompetition.id,
        selectedSeason.id,
        nextPage,
        fixtureDirection
      )
      setFixtures((prev) => [...prev, ...data])
      setFixturePage(nextPage)
      setHasMoreFixtures(hasMore)
    } catch (err: any) {
      setError(err?.message || 'Failed to load more fixtures')
    } finally {
      setLoading(false)
    }
  }

  const searchTeams = async () => {
    if (!selectedSport || !teamSearch.trim()) return
    setLoading(true)
    setError(null)
    try {
      const data = await window.api.sportsdb.searchClubs(selectedSport.slug, teamSearch.trim())
      setTeams(data)
    } catch (err: any) {
      setError(err?.message || 'Failed to search teams')
    } finally {
      setLoading(false)
    }
  }

  const loadTeam = async (team: Team) => {
    if (!selectedSport) return
    setSelectedTeam(team)
    setLoading(true)
    setError(null)
    try {
      await window.api.sportsdb.getClub(selectedSport.slug, team.id)
      const { fixtures: data, hasMore } = await window.api.sportsdb.getClubFixtures(selectedSport.slug, team.id, 0, 'last')
      setTeamFixtures(data)
      setTeamFixturePage(0)
      setHasMoreTeamFixtures(hasMore)
      setScreen('team')
    } catch (err: any) {
      setError(err?.message || 'Failed to load team fixtures')
    } finally {
      setLoading(false)
    }
  }

  const loadMoreTeamFixtures = async () => {
    if (!selectedSport || !selectedTeam) return
    setLoading(true)
    try {
      const nextPage = teamFixturePage + 1
      const { fixtures: data, hasMore } = await window.api.sportsdb.getClubFixtures(
        selectedSport.slug,
        selectedTeam.id,
        nextPage,
        'last'
      )
      setTeamFixtures((prev) => [...prev, ...data])
      setTeamFixturePage(nextPage)
      setHasMoreTeamFixtures(hasMore)
    } catch (err: any) {
      setError(err?.message || 'Failed to load more team fixtures')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const itemCount = itemsRef.current.length
    if (screen === 'teams' && inputRef.current && document.activeElement === inputRef.current) {
      if (e.key === 'Enter') {
        e.preventDefault()
        searchTeams()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        itemsRef.current[0]?.focus()
        setFocusedIndex(0)
        return
      }
      if (e.key === 'Backspace' || e.key === 'Escape') {
        if ((e.target as HTMLInputElement).value) return
      }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex((i) => (i + 1) % itemCount)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex((i) => (i - 1 + itemCount) % itemCount)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      itemsRef.current[focusedIndex]?.click()
    } else if (e.key === 'Backspace' || e.key === 'Escape') {
      if (screen === 'sports') return
      e.preventDefault()
      e.stopPropagation()
      handleBack()
    }
  }, [focusedIndex, screen, handleBack, teamSearch])

  const displayedSports = sportsSelected.length > 0
    ? sports.filter((s) => sportsSelected.includes(s.name))
    : sports

  const renderBreadcrumb = () => {
    const parts: string[] = ['Sports']
    if (selectedSport) parts.push(selectedSport.name)
    if (selectedCountry) parts.push(selectedCountry.name)
    if (selectedCompetition) parts.push(selectedCompetition.name)
    if (selectedSeason) parts.push(selectedSeason.name)
    if (selectedTeam) parts.push(selectedTeam.name)
    return <div className={styles.breadcrumb}>{parts.join(' / ')}</div>
  }

  const renderContent = () => {
    if (loading && screen === 'sports') return <div className={styles.message}>Loading sports...</div>
    if (error) return <div className={styles.error}>{error}</div>

    if (screen === 'sports') {
      if (!sportsDbApiKey.trim()) {
        return <div className={styles.message}>SportsAPI Pro key not configured. Add it in Settings → Sports.</div>
      }
      if (displayedSports.length === 0) {
        return <div className={styles.message}>No sports selected. Choose sports in Settings → Sports.</div>
      }
      return (
        <div className={styles.grid}>
          {displayedSports.map((sport, index) => (
            <button
              key={sport.id}
              ref={(el) => { if (el) itemsRef.current[index] = el }}
              className={`${styles.card} ${focusedIndex === index ? styles.focused : ''}`}
              onClick={() => loadCountries(sport)}
              onFocus={() => setFocusedIndex(index)}
            >
              <div className={styles.cardPlaceholder}>{sport.name[0]}</div>
              <span className={styles.cardLabel}>{sport.name}</span>
            </button>
          ))}
        </div>
      )
    }

    if (screen === 'countries') {
      if (countries.length === 0) return <div className={styles.message}>No countries found for {selectedSport?.name}.</div>
      return (
        <div className={styles.list}>
          {countries.map((country, index) => (
            <button
              key={country.id}
              ref={(el) => { if (el) itemsRef.current[index] = el }}
              className={`${styles.listItem} ${focusedIndex === index ? styles.focused : ''}`}
              onClick={() => loadCompetitions(country)}
              onFocus={() => setFocusedIndex(index)}
            >
              <span className={styles.listTitle}>{country.name}</span>
            </button>
          ))}
        </div>
      )
    }

    if (screen === 'competitions') {
      if (competitions.length === 0) return <div className={styles.message}>No competitions found for {selectedCountry?.name}.</div>
      return (
        <div className={styles.list}>
          {competitions.map((competition, index) => (
            <button
              key={competition.id}
              ref={(el) => { if (el) itemsRef.current[index] = el }}
              className={`${styles.listItem} ${focusedIndex === index ? styles.focused : ''}`}
              onClick={() => { setSelectedCompetition(competition); setScreen('competition') }}
              onFocus={() => setFocusedIndex(index)}
            >
              <span className={styles.listTitle}>{competition.name}</span>
            </button>
          ))}
        </div>
      )
    }

    if (screen === 'competition') {
      const options = [
        { label: 'Seasons', action: () => selectedCompetition && loadSeasons(selectedCompetition) },
        { label: 'Teams', action: () => setScreen('teams') },
      ]
      return (
        <div className={styles.list}>
          {options.map((opt, index) => (
            <button
              key={opt.label}
              ref={(el) => { if (el) itemsRef.current[index] = el }}
              className={`${styles.listItem} ${focusedIndex === index ? styles.focused : ''}`}
              onClick={opt.action}
              onFocus={() => setFocusedIndex(index)}
            >
              <span className={styles.listTitle}>{opt.label}</span>
            </button>
          ))}
        </div>
      )
    }

    if (screen === 'seasons') {
      if (seasons.length === 0) return <div className={styles.message}>No seasons found for {selectedCompetition?.name}.</div>
      return (
        <div className={styles.list}>
          {seasons.map((season, index) => (
            <button
              key={season.id}
              ref={(el) => { if (el) itemsRef.current[index] = el }}
              className={`${styles.listItem} ${focusedIndex === index ? styles.focused : ''}`}
              onClick={() => loadFixtures(season, 'last', 0)}
              onFocus={() => setFocusedIndex(index)}
            >
              <span className={styles.listTitle}>{season.name}</span>
            </button>
          ))}
        </div>
      )
    }

    if (screen === 'fixtures') {
      const controlsIndex = 0
      const loadMoreIndex = hasMoreFixtures ? 1 : -1
      const itemIndex = (i: number) => (hasMoreFixtures ? i + 2 : i + 1)
      return (
        <div className={styles.fixturesWrapper}>
          <div className={styles.directionRow}>
            <button
              ref={(el) => { if (el) itemsRef.current[controlsIndex] = el }}
              className={`${styles.toggle} ${fixtureDirection === 'last' ? styles.toggleActive : ''} ${focusedIndex === controlsIndex ? styles.focused : ''}`}
              onClick={() => selectedSeason && loadFixtures(selectedSeason, 'last', 0)}
              onFocus={() => setFocusedIndex(controlsIndex)}
            >
              Last Results
            </button>
            <button
              ref={(el) => { if (el) itemsRef.current[controlsIndex + 1] = el }}
              className={`${styles.toggle} ${fixtureDirection === 'next' ? styles.toggleActive : ''} ${focusedIndex === controlsIndex + 1 ? styles.focused : ''}`}
              onClick={() => selectedSeason && loadFixtures(selectedSeason, 'next', 0)}
              onFocus={() => setFocusedIndex(controlsIndex + 1)}
            >
              Upcoming
            </button>
          </div>
          {fixtures.length === 0 && <div className={styles.message}>No {fixtureDirection} fixtures found.</div>}
          <div className={styles.list}>
            {fixtures.map((fixture, index) => (
              <button
                key={fixture.id}
                ref={(el) => { if (el) itemsRef.current[itemIndex(index)] = el }}
                className={`${styles.listItem} ${focusedIndex === itemIndex(index) ? styles.focused : ''}`}
                onClick={() => onSearchTorrent(formatFixtureTitle(fixture), fixtureYear(fixture))}
                onFocus={() => setFocusedIndex(itemIndex(index))}
              >
                <span className={styles.listTitle}>{formatFixtureTitle(fixture)}</span>
                <span className={styles.listMeta}>{formatFixtureMeta(fixture)}</span>
              </button>
            ))}
          </div>
          {hasMoreFixtures && (
            <button
              ref={(el) => { if (el) itemsRef.current[loadMoreIndex] = el }}
              className={`${styles.listItem} ${focusedIndex === loadMoreIndex ? styles.focused : ''}`}
              onClick={loadMoreFixtures}
              onFocus={() => setFocusedIndex(loadMoreIndex)}
            >
              <span className={styles.listTitle}>Load more</span>
            </button>
          )}
        </div>
      )
    }

    if (screen === 'teams') {
      return (
        <div className={styles.clubSearchWrapper}>
          <div className={styles.searchRow}>
            <input
              ref={inputRef}
              className={styles.searchInput}
              placeholder="Search teams (e.g. Manchester United)..."
              value={teamSearch}
              onChange={(e) => setTeamSearch(e.target.value)}
            />
            <button
              className={styles.searchButton}
              onClick={searchTeams}
              ref={(el) => { if (el) itemsRef.current[0] = el }}
            >
              Search
            </button>
          </div>
          {teams.length === 0 && !loading && teamSearch.trim() && (
            <div className={styles.message}>No teams found. Try a different search.</div>
          )}
          {teams.length > 0 && (
            <div className={styles.list} style={{ marginTop: 16 }}>
              {teams.map((team, index) => (
                <button
                  key={team.id}
                  ref={(el) => { if (el) itemsRef.current[index + 1] = el }}
                  className={`${styles.listItem} ${focusedIndex === index + 1 ? styles.focused : ''}`}
                  onClick={() => loadTeam(team)}
                  onFocus={() => setFocusedIndex(index + 1)}
                >
                  <span className={styles.listTitle}>{team.name}</span>
                  <span className={styles.listMeta}>{team.country || ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )
    }

    if (screen === 'team') {
      if (!selectedTeam) return <div className={styles.message}>No team selected.</div>
      return (
        <div className={styles.clubProfile}>
          <h2 className={styles.clubName}>{selectedTeam.name}</h2>
          {selectedTeam.country && <p className={styles.clubMeta}>{selectedTeam.country}</p>}
          <button
            ref={(el) => { if (el) itemsRef.current[0] = el }}
            className={`${styles.listItem} ${focusedIndex === 0 ? styles.focused : ''}`}
            onClick={() => onSearchTorrent(selectedTeam.name, undefined)}
            onFocus={() => setFocusedIndex(0)}
          >
            <span className={styles.listTitle}>Search torrents for {selectedTeam.name}</span>
          </button>
          {teamFixtures.length > 0 && (
            <>
              <h3 className={styles.clubSectionTitle}>Recent Fixtures</h3>
              <div className={styles.list}>
                {teamFixtures.map((fixture, index) => (
                  <button
                    key={fixture.id}
                    ref={(el) => { if (el) itemsRef.current[index + 1] = el }}
                    className={`${styles.listItem} ${focusedIndex === index + 1 ? styles.focused : ''}`}
                    onClick={() => onSearchTorrent(formatFixtureTitle(fixture), fixtureYear(fixture))}
                    onFocus={() => setFocusedIndex(index + 1)}
                  >
                    <span className={styles.listTitle}>{formatFixtureTitle(fixture)}</span>
                    <span className={styles.listMeta}>{formatFixtureMeta(fixture)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {hasMoreTeamFixtures && (
            <button
              ref={(el) => { if (el) itemsRef.current[teamFixtures.length + 1] = el }}
              className={`${styles.listItem} ${focusedIndex === teamFixtures.length + 1 ? styles.focused : ''}`}
              onClick={loadMoreTeamFixtures}
              onFocus={() => setFocusedIndex(teamFixtures.length + 1)}
            >
              <span className={styles.listTitle}>Load more</span>
            </button>
          )}
        </div>
      )
    }

    return null
  }

  return (
    <div ref={pageRef} className={styles.page} onKeyDown={handleKeyDown} tabIndex={-1}>
      {renderBreadcrumb()}
      {renderContent()}
    </div>
  )
}
