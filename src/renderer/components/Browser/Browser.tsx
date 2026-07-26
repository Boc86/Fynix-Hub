import React, { useEffect, useRef, useCallback, useState } from 'react'
import MediaRow from '../MediaCard/MediaRow'
import HeroBanner from './HeroBanner'
import type { MediaItem } from '../../types'
import type { ContextTarget } from '../ContextMenu/ContextMenu'
import { useMediaStore } from '../../store/mediaStore'
import styles from './Browser.module.css'

interface ContinueInfo {
  mediaType: 'movie' | 'tv'
  progress?: number
  season?: number
  episode?: number
}

interface BrowserProps {
  onSelectMedia: () => void
  onPlay: (resumePosition?: number) => void
  onContextMenu?: (target: ContextTarget) => void
  mediaTypeFilter?: 'movie' | 'tv'
  genreFilter?: number
}

export default function Browser({ onSelectMedia, onPlay, onContextMenu, mediaTypeFilter, genreFilter }: BrowserProps) {
  const {
    trending, popularMovies, popularTvShows, topRatedMovies,
    continueWatching, upNext, isLoading, error, traktWatched,
    watchProviders, selectedProvider,
    setTrending, setPopularMovies, setPopularTvShows,
    setTopRatedMovies, setContinueWatching, setUpNext,
    setTraktWatched, setTraktPlayback,
    setWatchProviders, setSelectedProvider,
    setLoading, setError, refreshVersion, setEpisodeWatched
  } = useMediaStore()

  const loadedRef = useRef(false)
  const browserRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const providerTrackRef = useRef<HTMLDivElement | null>(null)
  const [focusedRow, setFocusedRow] = useState(0)
  const [focusedCard, setFocusedCard] = useState(0)
  const [focusedHeroAction, setFocusedHeroAction] = useState(-1) // -1=rows, 0=Play, 1=More Info
  const [focusedProvider, setFocusedProvider] = useState(-2) // -2=not in provider bar, -1="All", 0+=provider index
  const hasProviderBar = !!mediaTypeFilter && watchProviders.length > 0
  const [genreRows, setGenreRows] = useState<Array<{ label: string; items: MediaItem[] }>>([])
  const [providerRows, setProviderRows] = useState<Array<{ label: string; items: MediaItem[] }>>([])
  const [continueInfo, setContinueInfo] = useState<Map<number, ContinueInfo>>(new Map())

  const continueMovies = continueWatching.filter(item => item.mediaType === 'movie' && !traktWatched.has(item.id))
  const continueTv = continueWatching.filter(item => item.mediaType === 'tv')
  const upNextItems = upNext.map(u => u.item)

  const rowConfig = mediaTypeFilter
    ? [
        ...(mediaTypeFilter === 'movie'
          ? [{ items: continueMovies, label: 'continueMovies' }]
          : [{ items: upNextItems, label: 'upNext' }, { items: continueTv, label: 'continueTv' }]),
        { items: trending, label: 'trending' },
        ...(selectedProvider ? providerRows : genreRows),
      ]
    : [
        { items: upNextItems, label: 'upNext' },
        { items: continueMovies, label: 'continueMovies' },
        { items: continueTv, label: 'continueTv' },
        { items: trending, label: 'trending' },
        { items: popularMovies, label: 'popularMovies' },
        { items: popularTvShows, label: 'popularTv' },
        { items: topRatedMovies, label: 'topRated' },
      ]

  const getVisibleRows = useCallback(() =>
    rowConfig.filter((r) => r.items.length > 0),
    [trending, continueWatching, upNext, popularMovies, popularTvShows, topRatedMovies, genreRows, providerRows, selectedProvider]
  )

  const getRowItemCount = useCallback((rowIdx: number) => {
    const rows = getVisibleRows()
    return rows[rowIdx]?.items.length ?? 0
  }, [getVisibleRows])

  const fetchTraktDataRef = useRef<() => Promise<void>>(async () => {})
  fetchTraktDataRef.current = async () => {
    const authStatus = await window.api.trakt.getAuthStatus()
    console.log('[Browser] Trakt auth:', authStatus.authenticated)
    if (authStatus.authenticated) {
      const [watchedMovies, watchedShows, moviePlayback, episodePlayback] = await Promise.all([
        window.api.trakt.getWatchedMovies().catch((err: any) => { console.log('[Browser] getWatchedMovies failed:', err?.message); return null }),
        window.api.trakt.getWatchedShows().catch((err: any) => { console.log('[Browser] getWatchedShows failed:', err?.message); return null }),
        window.api.trakt.getPlaybackMovies().catch((err: any) => { console.log('[Browser] getPlaybackMovies failed:', err?.message); return null }),
        window.api.trakt.getPlaybackEpisodes().catch((err: any) => { console.log('[Browser] getPlaybackEpisodes failed:', err?.message); return null }),
      ])

      console.log('[Browser] moviePlayback count:', moviePlayback?.length ?? 0)
      console.log('[Browser] episodePlayback count:', episodePlayback?.length ?? 0)

      if (watchedMovies || watchedShows) {
        const ids = new Set<number>()
        if (watchedMovies) watchedMovies.forEach((m: any) => { if (m.movie?.ids?.tmdb) ids.add(m.movie.ids.tmdb) })
        if (watchedShows) watchedShows.forEach((s: any) => { if (s.show?.ids?.tmdb) ids.add(s.show.ids.tmdb) })
        setTraktWatched(ids)

        // Build episode-level watched map from show data
        const epMap = new Map<number, Map<number, Set<number>>>()
        if (watchedShows) {
          for (const s of watchedShows) {
            const tmdbId = s.show?.ids?.tmdb
            if (!tmdbId) continue
            const seasonsMap = new Map<number, Set<number>>()
            for (const season of (s.seasons || [])) {
              if (!season.number || season.number === 0) continue
              const epSet = new Set<number>()
              for (const ep of (season.episodes || [])) {
                if (ep.number && ep.number > 0) epSet.add(ep.number)
              }
              if (epSet.size > 0) seasonsMap.set(season.number, epSet)
            }
            if (seasonsMap.size > 0) epMap.set(tmdbId, seasonsMap)
          }
        }
        setEpisodeWatched(epMap)
      }

      const pbItems: Array<{ tmdbId: number; mediaType: string; progress: number; season?: number; episode?: number }> = []
      const infoMap = new Map<number, ContinueInfo>()

      if (moviePlayback && Array.isArray(moviePlayback)) {
        for (const p of moviePlayback) {
          const tmdbId = p?.movie?.ids?.tmdb
          if (!tmdbId) continue
          const progress = (p.progress ?? 0) / 100
          pbItems.push({ tmdbId, mediaType: 'movie', progress })
          infoMap.set(tmdbId, { mediaType: 'movie', progress })
        }
      }

      let episodeItems = episodePlayback
      if (!episodeItems || !Array.isArray(episodeItems) || episodeItems.length === 0) {
        console.log('[Browser] Falling back to /sync/playback for episodes')
        const fallback = await window.api.trakt.getPlayback().catch((err: any) => { console.log('[Browser] getPlayback fallback failed:', err?.message); return null })
        if (fallback && Array.isArray(fallback)) {
          episodeItems = fallback.filter((p: any) => p.type === 'episode' || (p.show && p.episode))
          console.log('[Browser] fallback episode count:', episodeItems.length)
        }
      }

      if (episodeItems && Array.isArray(episodeItems)) {
        const seenShows = new Map<number, { season: number; episode: number; progress: number; pausedAt?: string }>()
        for (const p of episodeItems) {
          const tmdbId = p?.show?.ids?.tmdb
          if (!tmdbId) continue
          const season = p?.episode?.season
          const episode = p?.episode?.number
          const progress = (p?.progress ?? 0) / 100
          const pausedAt = p?.paused_at
          if (season === undefined || episode === undefined) continue
          const existing = seenShows.get(tmdbId)
          if (!existing || (pausedAt && (!existing.pausedAt || pausedAt > existing.pausedAt))) {
            seenShows.set(tmdbId, { season, episode, progress, pausedAt })
          }
        }
        for (const [tmdbId, ep] of seenShows) {
          pbItems.push({ tmdbId, mediaType: 'tv', progress: ep.progress, season: ep.season, episode: ep.episode })
          infoMap.set(tmdbId, { mediaType: 'tv', progress: ep.progress, season: ep.season, episode: ep.episode })
        }
      }

      setTraktPlayback(pbItems)
      setContinueInfo(infoMap)

      const cwPromises = pbItems.map(async (p) => {
        try {
          const detail = await window.api.tmdb.getDetails(p.mediaType, p.tmdbId)
          if (!detail) return null
          return {
            id: detail.id,
            title: detail.title || detail.name || '',
            overview: detail.overview || '',
            posterPath: detail.posterPath || null,
            backdropPath: detail.backdropPath || null,
            releaseDate: detail.releaseDate || '',
            voteAverage: detail.voteAverage || 0,
            voteCount: detail.voteCount || 0,
            mediaType: p.mediaType as 'movie' | 'tv',
            genreIds: (detail.genres || []).map((g: any) => g.id),
          }
        } catch { return null }
      })
      const cwItems = (await Promise.all(cwPromises)).filter((x): x is MediaItem => x !== null)
      if (cwItems.length > 0) {
        setContinueWatching(cwItems)
      }

      // Fetch Up Next (shows with next episode to watch)
      try {
        const progress = await window.api.trakt.getWatchedProgress()
            if (progress && Array.isArray(progress) && progress.length > 0) {
              const now = Date.now()
              const thirtyDays = 30 * 24 * 60 * 60 * 1000
              const sevenDays = 7 * 24 * 60 * 60 * 1000
              const activeProgress = progress.filter((p: any) => {
                if (!p.next_episode) return false
                if ((p.completion ?? 0) >= 0.99) return false
                const lastWatch = p.last_watched_at ? new Date(p.last_watched_at).getTime() : 0
                if (lastWatch > 0 && now - lastWatch > thirtyDays && (p.completion ?? 0) < 0.3) return false
                if (lastWatch > 0 && now - lastWatch > sevenDays && (p.completion ?? 0) < 0.05) return false
                return true
              })
                const upNextPromises = activeProgress.map(async (p: any) => {
             const tmdbId = p?.show?.ids?.tmdb
             if (!tmdbId || !p?.next_episode) return null
             try {
               const detail = await window.api.tmdb.getDetails('tv', tmdbId)
               if (!detail) return null
               return {
                 item: {
                   id: detail.id,
                   title: detail.title || detail.name || '',
                   overview: detail.overview || '',
                   posterPath: detail.posterPath || null,
                   backdropPath: detail.backdropPath || null,
                  releaseDate: detail.releaseDate || '',
                  voteAverage: detail.voteAverage || 0,
                  voteCount: detail.voteCount || 0,
                  mediaType: 'tv' as const,
                   genreIds: (detail.genres || []).map((g: any) => g.id),
                 },
                 season: p.next_episode.season || 1,
                 episode: p.next_episode.number || 1,
                 episodeTitle: p.next_episode.title || '',
               }
             } catch { return null }
           })
            const upNextItems = (await Promise.all(upNextPromises)).filter((x): x is NonNullable<typeof x> => x !== null)
            setUpNext(upNextItems)
        }
      } catch (err: any) {
        console.log('[Browser] getWatchedProgress failed:', err?.message)
      }
    }
  }

  const fetchTraktData = useCallback(() => fetchTraktDataRef.current!(), [])

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true

    async function loadData() {
      setLoading(true)
      setError(null)
      try {
        const trendType = mediaTypeFilter || 'all'
        const [trend, popMovies, popTv, topMovies] = await Promise.all([
          window.api.tmdb.getTrending(trendType, 'week'),
          window.api.tmdb.getPopular('movie', 1),
          window.api.tmdb.getPopular('tv', 1),
          window.api.tmdb.getTrending('movie', 'week'),
        ])

        if (trend?.results) {
          const items = mediaTypeFilter
            ? trend.results
            : trend.results
          setTrending(items)
        }
        if (popMovies?.results) setPopularMovies(popMovies.results)
        if (popTv?.results) setPopularTvShows(popTv.results)
        if (topMovies?.results) setTopRatedMovies(topMovies.results)

        // Load genre rows for filtered views (fetch pages 1+2 for more items per row)
        if (mediaTypeFilter) {
          try {
            // Fetch watch providers for the provider filter bar
            const providersData = await window.api.tmdb.getWatchProviders(mediaTypeFilter)
            if (providersData?.results) {
              const providers = providersData.results.map((p: any) => ({
                providerId: p.providerId,
                providerName: p.providerName,
                logoPath: p.logoPath,
              })).filter((p: any) => p.logoPath) // only include providers with logos
              setWatchProviders(providers)
            }

            const genreData = mediaTypeFilter === 'movie'
              ? await window.api.tmdb.getMovieGenres()
              : await window.api.tmdb.getTvGenres()
            const genres: Array<{ id: number; name: string }> = genreData?.genres || []
            const rows = await Promise.all(genres.map(async (g) => {
              try {
                // Fetch pages 1 and 2 for ~40 items per genre row
                const [page1, page2] = await Promise.all([
                  window.api.tmdb.discoverByGenre(mediaTypeFilter, g.id, 1),
                  window.api.tmdb.discoverByGenre(mediaTypeFilter, g.id, 2),
                ])
                const allItems = [
                  ...(page1?.results || []),
                  ...(page2?.results || []),
                ]
                return { label: g.name, items: allItems }
              } catch {
                return { label: g.name, items: [] }
              }
            }))
            setGenreRows(rows.filter(r => r.items.length > 0))
          } catch { /* genre rows are optional */ }
        }

        await fetchTraktData()
      } catch (err: any) {
        setError(err?.message || 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [mediaTypeFilter, fetchTraktData])

  useEffect(() => {
    if (!loadedRef.current) return
    fetchTraktData()
  }, [refreshVersion, fetchTraktData])

  // Fetch provider-filtered content when a provider is selected
  useEffect(() => {
    if (!mediaTypeFilter || !selectedProvider) {
      setProviderRows([])
      return
    }
    let cancelled = false
    const type = mediaTypeFilter as 'movie' | 'tv'
    const providerId = selectedProvider as number
    async function fetchProviderContent() {
      try {
        const [page1, page2] = await Promise.all([
          window.api.tmdb.discoverByProvider(type, providerId, 1),
          window.api.tmdb.discoverByProvider(type, providerId, 2),
        ])
        if (cancelled) return
        const allItems = [
          ...(page1?.results || []),
          ...(page2?.results || []),
        ]
        if (allItems.length > 0) {
          setProviderRows([{ label: `provider-${providerId}`, items: allItems }])
        } else {
          setProviderRows([])
        }
      } catch {
        if (!cancelled) setProviderRows([])
      }
    }
    fetchProviderContent()
    return () => { cancelled = true }
  }, [selectedProvider, mediaTypeFilter])

  // Scroll to top when data loads (e.g. navigating back to Browser)
  useEffect(() => {
    if (trending.length > 0 && scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [trending.length])

  // Scroll to show hero when hero buttons are focused
  useEffect(() => {
    if (focusedHeroAction !== -1 && scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [focusedHeroAction])

  useEffect(() => {
    setFocusedRow(0)
    setFocusedCard(0)
    setFocusedHeroAction(-1)
  }, [continueWatching.length, upNext.length, trending.length, popularMovies.length, popularTvShows.length, topRatedMovies.length])

  useEffect(() => {
    if (browserRef.current) {
      browserRef.current.focus()
    }
  }, [continueWatching.length, trending.length])

  useEffect(() => {
    console.log('[Browser] Continue Watching rows:', {
      total: continueWatching.length,
      movies: continueMovies.length,
      tv: continueTv.length,
      watchedIds: traktWatched.size,
    })
  }, [continueWatching.length, continueMovies.length, continueTv.length, traktWatched.size])

  const heroPlayRef = useRef<HTMLButtonElement>(null)
  const heroInfoRef = useRef<HTMLButtonElement>(null)

  const handleKeyDown = useCallback(async (e: React.KeyboardEvent) => {
    const rows = getVisibleRows()
    const inHero = focusedHeroAction >= 0
    const inProviderBar = focusedProvider >= -1 && focusedProvider !== -2 && hasProviderBar
    const providerCount = watchProviders.length + 1 // +1 for "All" button

    switch (e.key) {
      case 'ArrowRight': {
        e.preventDefault()
        if (inProviderBar) {
          if (focusedProvider < providerCount - 1) setFocusedProvider((p) => p + 1)
        } else if (inHero) {
          if (focusedHeroAction < 1) setFocusedHeroAction((a) => a + 1)
        } else {
          const count = getRowItemCount(focusedRow)
          if (focusedCard < count - 1) setFocusedCard((c) => c + 1)
        }
        break
      }
      case 'ArrowLeft': {
        e.preventDefault()
        if (inProviderBar) {
          if (focusedProvider > -1) setFocusedProvider((p) => p - 1)
        } else if (inHero) {
          if (focusedHeroAction > 0) setFocusedHeroAction((a) => a - 1)
        } else {
          if (focusedCard > 0) setFocusedCard((c) => c - 1)
        }
        break
      }
      case 'ArrowDown': {
        e.preventDefault()
        if (inProviderBar) {
          setFocusedProvider(-2)
          setFocusedRow(0)
          setFocusedCard(0)
        } else if (inHero) {
          setFocusedHeroAction(-1)
          if (hasProviderBar) {
            setFocusedProvider(-1)
          } else if (rows.length > 0) {
            setFocusedRow(0)
            setFocusedCard(0)
          }
        } else if (focusedRow < rows.length - 1) {
          setFocusedRow((r) => r + 1)
          setFocusedCard(0)
        }
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        if (inProviderBar) {
          setFocusedProvider(-2)
          setFocusedHeroAction(0)
        } else if (inHero) {
          // already at top, stay
        } else if (focusedRow > 0) {
          setFocusedRow((r) => r - 1)
          setFocusedCard(0)
        } else if (hasProviderBar) {
          setFocusedProvider(-1)
        } else {
          // Move to hero buttons
          setFocusedHeroAction(0)
        }
        break
      }
      case 'Enter': {
        e.preventDefault()
        if (inProviderBar) {
          // -1 = "All", 0+ = provider index
          const provider = focusedProvider === -1 ? null : watchProviders[focusedProvider]?.providerId
          setSelectedProvider(selectedProvider === provider ? null : provider)
          return
        }
        if (inHero) {
          if (focusedHeroAction === 0) {
            heroPlayRef.current?.click()
          } else {
            heroInfoRef.current?.click()
          }
          return
        }
        if (rows.length === 0) return
        const row = rows[focusedRow]
        const item = row.items[focusedCard]
        if (item) {
          try {
            const detail = await window.api.tmdb.getDetails(item.mediaType, item.id)
            useMediaStore.getState().setSelectedMedia(detail)
          } catch {
            useMediaStore.getState().setSelectedMedia(item as any)
          }
          const upNextMatch = upNext.find(u => u.item.id === item.id)
          if (upNextMatch) {
            useMediaStore.getState().setSelectedSeason(upNextMatch.season)
            useMediaStore.getState().setSelectedEpisode(upNextMatch.episode)
          } else {
            const info = continueInfo.get(item.id)
            if (info?.mediaType === 'tv' && info.season !== undefined && info.episode !== undefined) {
              useMediaStore.getState().setSelectedSeason(info.season)
              useMediaStore.getState().setSelectedEpisode(info.episode)
            }
            if (info?.progress && info.progress > 0 && info.progress < 0.95) {
              useMediaStore.getState().setResumeProgress(info.progress)
            }
          }
          onSelectMedia()
        }
        break
      }
      case 'c': {
        e.preventDefault()
        if (inHero || rows.length === 0) return
        const row = rows[focusedRow]
        const item = row.items[focusedCard]
        if (item && onContextMenu) {
          onContextMenu({
            type: item.mediaType,
            tmdbId: item.id,
            title: item.title,
          })
        }
        break
      }
    }
  }, [focusedRow, focusedCard, focusedHeroAction, focusedProvider, hasProviderBar, getVisibleRows, getRowItemCount, onSelectMedia, continueInfo, onContextMenu, watchProviders, selectedProvider, setSelectedProvider])

  // Scroll provider track ref when provider bar disappears
  useEffect(() => {
    if (!hasProviderBar) providerTrackRef.current = null
  }, [hasProviderBar])

  // Scroll focused provider into view
  useEffect(() => {
    if (!hasProviderBar || focusedProvider < -1 || !providerTrackRef.current) return

    const track = providerTrackRef.current
    const btns = track.getElementsByClassName('providerBtn')
    const btn = btns[focusedProvider + 1] // +1 to skip 'All' button at index 0
    if (!btn) return

    btn.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [focusedProvider, hasProviderBar])

  const visibleRows = getVisibleRows()

  return (
    <div ref={browserRef} className={styles.browser} tabIndex={-1} onKeyDown={handleKeyDown}>
      <div ref={scrollRef} className={styles.scrollArea}>
          {trending.length > 0 && (
          <HeroBanner
            item={trending[0]}
            focusedHeroAction={focusedHeroAction}
            playRef={heroPlayRef}
            infoRef={heroInfoRef}
            onPlay={async () => {
              try {
                const detail = await window.api.tmdb.getDetails(trending[0].mediaType, trending[0].id)
                useMediaStore.getState().setSelectedMedia(detail)
              } catch {
                useMediaStore.getState().setSelectedMedia(trending[0] as any)
              }
              onPlay()
            }}
            onInfo={async () => {
              try {
                const detail = await window.api.tmdb.getDetails(trending[0].mediaType, trending[0].id)
                useMediaStore.getState().setSelectedMedia(detail)
              } catch {
                useMediaStore.getState().setSelectedMedia(trending[0] as any)
              }
              onSelectMedia()
            }}
          />
        )}

        {mediaTypeFilter && watchProviders.length > 0 && (
          <div className={styles.providerBar}>
            <div
              ref={providerTrackRef}
              className={styles.providerTrack}
            >
              <button
                tabIndex={-1}
                className={`${styles.providerBtn} ${selectedProvider === null ? styles.providerActive : ''} ${focusedProvider === -1 ? styles.providerFocused : ''}`}
                onClick={() => setSelectedProvider(null)}
              >
                All
              </button>
              {watchProviders.slice(0, 30).map((p, pi) => (
                <button
                  tabIndex={-1}
                  key={p.providerId}
                  className={`${styles.providerBtn} ${selectedProvider === p.providerId ? styles.providerActive : ''} ${focusedProvider === pi ? styles.providerFocused : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedProvider(selectedProvider === p.providerId ? null : p.providerId);
                  }}
                  title={p.providerName}
                >
                  <img
                    src={`https://image.tmdb.org/t/p/original${p.logoPath}`}
                    alt={p.providerName}
                    className={styles.providerLogo}
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={styles.rows} style={mediaTypeFilter && watchProviders.length > 0 ? { marginTop: '-8px' } : undefined}>
          {error && <div className={styles.error}>{error}</div>}

          {visibleRows.map((row, idx) => {
            return (
              <MediaRow
                key={row.label}
                title={
                  row.label === 'upNext' ? 'Up Next' :
                  row.label === 'trending' ? (mediaTypeFilter === 'movie' ? 'Trending Movies' : mediaTypeFilter === 'tv' ? 'Trending TV Shows' : 'Trending Now') :
                  row.label === 'continueMovies' ? 'Continue Watching Movies' :
                  row.label === 'continueTv' ? 'Continue Watching TV Shows' :
                  row.label === 'popularMovies' ? 'Popular Movies' :
                  row.label === 'popularTv' ? 'Popular TV Shows' :
                  row.label === 'topRated' ? 'Top Rated Movies' :
                  row.label
                }
                items={row.items}
                onSelect={async (item) => {
                  try {
                    const detail = await window.api.tmdb.getDetails(item.mediaType, item.id)
                    useMediaStore.getState().setSelectedMedia(detail)
                  } catch {
                    useMediaStore.getState().setSelectedMedia(item as any)
                  }
                  const upNextMatch = upNext.find(u => u.item.id === item.id)
                  if (upNextMatch) {
                    useMediaStore.getState().setSelectedSeason(upNextMatch.season)
                    useMediaStore.getState().setSelectedEpisode(upNextMatch.episode)
                  } else {
                    const info = continueInfo.get(item.id)
                    if (info?.mediaType === 'tv' && info.season !== undefined && info.episode !== undefined) {
                      useMediaStore.getState().setSelectedSeason(info.season)
                      useMediaStore.getState().setSelectedEpisode(info.episode)
                    }
                    if (info?.progress && info.progress > 0 && info.progress < 0.95) {
                      useMediaStore.getState().setResumeProgress(info.progress)
                    }
                  }
                  onSelectMedia()
                }}
                 rowIndex={idx}
                 focusedCardIndex={idx === focusedRow ? focusedCard : undefined}
                 watchedIds={traktWatched}
                 animationDelay={idx * 50}

              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
