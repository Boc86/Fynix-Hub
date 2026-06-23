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
    continueWatching, isLoading, error, traktWatched,
    setTrending, setPopularMovies, setPopularTvShows,
    setTopRatedMovies, setContinueWatching,
    setTraktWatched, setTraktPlayback,
    setLoading, setError
  } = useMediaStore()

  const loadedRef = useRef(false)
  const browserRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [focusedRow, setFocusedRow] = useState(0)
  const [focusedCard, setFocusedCard] = useState(0)
  const [focusedHeroAction, setFocusedHeroAction] = useState(-1) // -1=rows, 0=Play, 1=More Info
  const [genreRows, setGenreRows] = useState<Array<{ label: string; items: MediaItem[] }>>([])
  const [continueInfo, setContinueInfo] = useState<Map<number, ContinueInfo>>(new Map())

  const continueMovies = continueWatching.filter(item => item.mediaType === 'movie' && !traktWatched.has(item.id))
  // TV playback items are specific in-progress episodes; filtering by show-level watched IDs
  // would incorrectly remove a show from Continue Watching just because some episodes were watched.
  const continueTv = continueWatching.filter(item => item.mediaType === 'tv')

  const rowConfig = mediaTypeFilter
    ? [
        ...(mediaTypeFilter === 'movie'
          ? [{ items: continueMovies, label: 'continueMovies' }]
          : [{ items: continueTv, label: 'continueTv' }]),
        { items: trending, label: 'trending' },
        ...genreRows,
      ]
    : [
        { items: continueMovies, label: 'continueMovies' },
        { items: continueTv, label: 'continueTv' },
        { items: trending, label: 'trending' },
        { items: popularMovies, label: 'popularMovies' },
        { items: popularTvShows, label: 'popularTv' },
        { items: topRatedMovies, label: 'topRated' },
      ]

  const getVisibleRows = useCallback(() =>
    rowConfig.filter((r) => r.items.length > 0),
    [trending, continueWatching, popularMovies, popularTvShows, topRatedMovies, genreRows]
  )

  const getRowItemCount = useCallback((rowIdx: number) => {
    const rows = getVisibleRows()
    return rows[rowIdx]?.items.length ?? 0
  }, [getVisibleRows])

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

        // Load genre rows for filtered views
        if (mediaTypeFilter) {
          try {
            const genreData = mediaTypeFilter === 'movie'
              ? await window.api.tmdb.getMovieGenres()
              : await window.api.tmdb.getTvGenres()
            const genres: Array<{ id: number; name: string }> = genreData?.genres || []
            const rows = await Promise.all(genres.map(async (g) => {
              try {
                const result = await window.api.tmdb.discoverByGenre(mediaTypeFilter, g.id, 1)
                return { label: g.name, items: result?.results || [] }
              } catch {
                return { label: g.name, items: [] }
              }
            }))
            setGenreRows(rows.filter(r => r.items.length > 0))
          } catch { /* genre rows are optional */ }
        }

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
                mediaType: p.mediaType as 'movie' | 'tv',
                genreIds: (detail.genres || []).map((g: any) => g.id),
              }
            } catch { return null }
          })
          const cwItems = (await Promise.all(cwPromises)).filter((x): x is MediaItem => x !== null)
          if (cwItems.length > 0) {
            setContinueWatching(cwItems)
          }
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [mediaTypeFilter])

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
  }, [continueWatching.length, trending.length, popularMovies.length, popularTvShows.length, topRatedMovies.length])

  useEffect(() => {
    if ((continueWatching.length > 0 || trending.length > 0) && browserRef.current) {
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

    switch (e.key) {
      case 'ArrowRight': {
        e.preventDefault()
        if (inHero) {
          if (focusedHeroAction < 1) setFocusedHeroAction((a) => a + 1)
        } else {
          const count = getRowItemCount(focusedRow)
          if (focusedCard < count - 1) setFocusedCard((c) => c + 1)
        }
        break
      }
      case 'ArrowLeft': {
        e.preventDefault()
        if (inHero) {
          if (focusedHeroAction > 0) setFocusedHeroAction((a) => a - 1)
        } else {
          if (focusedCard > 0) setFocusedCard((c) => c - 1)
        }
        break
      }
      case 'ArrowDown': {
        e.preventDefault()
        if (inHero) {
          setFocusedHeroAction(-1)
          if (rows.length > 0) {
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
        if (inHero) {
          // already at top, stay
        } else if (focusedRow > 0) {
          setFocusedRow((r) => r - 1)
          setFocusedCard(0)
        } else {
          // Move to hero buttons
          setFocusedHeroAction(0)
        }
        break
      }
      case 'Enter': {
        e.preventDefault()
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
          const info = continueInfo.get(item.id)
          if (info?.mediaType === 'tv' && info.season !== undefined && info.episode !== undefined) {
            useMediaStore.getState().setSelectedSeason(info.season)
            useMediaStore.getState().setSelectedEpisode(info.episode)
          }
          if (info?.progress && info.progress > 0 && info.progress < 0.95) {
            useMediaStore.getState().setResumeProgress(info.progress)
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
  }, [focusedRow, focusedCard, focusedHeroAction, getVisibleRows, getRowItemCount, onSelectMedia, continueInfo, onContextMenu])

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
            onPlay={() => {
              useMediaStore.getState().setSelectedMedia(trending[0] as any)
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

        <div className={styles.rows}>
          {error && <div className={styles.error}>{error}</div>}

          {visibleRows.map((row, idx) => {
            return (
              <MediaRow
                key={row.label}
                title={
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
                  const info = continueInfo.get(item.id)
                  if (info?.mediaType === 'tv' && info.season !== undefined && info.episode !== undefined) {
                    useMediaStore.getState().setSelectedSeason(info.season)
                    useMediaStore.getState().setSelectedEpisode(info.episode)
                  }
                  if (info?.progress && info.progress > 0 && info.progress < 0.95) {
                    useMediaStore.getState().setResumeProgress(info.progress)
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
