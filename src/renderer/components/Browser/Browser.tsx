import React, { useEffect, useRef, useCallback, useState } from 'react'
import MediaRow from '../MediaCard/MediaRow'
import HeroBanner from './HeroBanner'
import type { HeroDetails } from './HeroBanner'
import type { MediaItem } from '../../types'
import type { ContextTarget } from '../ContextMenu/ContextMenu'
import { useMediaStore } from '../../store/mediaStore'
import { useSettingsStore } from '../../store/settingsStore'
import styles from './Browser.module.css'

interface ContinueInfo {
  mediaType: 'movie' | 'tv'
  progress?: number
  season?: number
  episode?: number
}

interface BrowserProps {
  onSelectMedia: () => void
  onContextMenu?: (target: ContextTarget) => void
  mediaTypeFilter?: 'movie' | 'tv'
  genreFilter?: number
}

export default function Browser({ onSelectMedia, onContextMenu, mediaTypeFilter, genreFilter }: BrowserProps) {
  const {
    trending, popularMovies, popularTvShows, topRatedMovies,
    continueWatching, watchlist, upNext, isLoading, error, watchedIds,
    watchProviders, selectedProvider,
    setTrending, setPopularMovies, setPopularTvShows,
    setTopRatedMovies, setContinueWatching, setWatchlist, setUpNext,
    setWatchedIds, setPlayback,
    setWatchProviders, setSelectedProvider,
    setLoading, setError, refreshVersion, setEpisodeWatched,
    droppedFromPlayback
  } = useMediaStore()

  const loadedRef = useRef(false)
  const browserRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const providerTrackRef = useRef<HTMLDivElement | null>(null)
  const [focusedRow, setFocusedRow] = useState(0)
  const [focusedCard, setFocusedCard] = useState(0)
  const [scrolled, setScrolled] = useState(false)
  const [focusedProvider, setFocusedProvider] = useState(-2) // -2=not in provider bar, -1="All", 0+=provider index
  const hasProviderBar = !!mediaTypeFilter && ((watchProviders ?? [])).length > 0
  const [discoveryRows, setDiscoveryRows] = useState<Array<{ label: string; items: MediaItem[] }>>([])
  const [continueInfo, setContinueInfo] = useState<Map<number, ContinueInfo>>(new Map())
  const [heroDetails, setHeroDetails] = useState<HeroDetails | null>(null)
  const heroDetailsCache = useRef(new Map<number, HeroDetails>())
  const lastFocusedItemRef = useRef<MediaItem | null>(null)
  const currentHeroIdRef = useRef<number | null>(null)

  const mdblistConnected = useSettingsStore((s) => s.mdblistConnected)

  const continueMovies = (continueWatching ?? []).filter(item => item.mediaType === 'movie' && !(watchedIds ?? new Set()).has(item.id))
  const upNextItems = (upNext ?? []).map(u => u.item)

  const rowConfig = mediaTypeFilter
    ? [
        ...(mediaTypeFilter === 'movie'
          ? [{ items: continueMovies, label: 'continueMovies' }]
          : [{ items: upNextItems, label: 'upNext' }, { items: watchlist, label: 'watchlist' }]),
        // Trending can't be provider-filtered (no with_watch_providers on /trending),
        // so hide it while a provider filter is active — Popular becomes the curated row.
        ...(selectedProvider ? [] : [{ items: trending, label: 'trending' }]),
        ...discoveryRows,
      ]
    : [
        { items: upNextItems, label: 'upNext' },
        { items: continueMovies, label: 'continueMovies' },
        { items: watchlist, label: 'watchlist' },
        { items: trending, label: 'trending' },
        { items: popularMovies, label: 'popularMovies' },
        { items: popularTvShows, label: 'popularTv' },
        { items: topRatedMovies, label: 'topRated' },
      ]

  const getVisibleRows = useCallback(() => {
          return (rowConfig ?? []).filter((r) => (r.items ?? []).length > 0);
      }, [trending, continueWatching, watchlist, upNext, popularMovies, popularTvShows, topRatedMovies, discoveryRows, selectedProvider]);
  const getRowItemCount = useCallback((rowIdx: number) => {
    const rows = getVisibleRows()
    return rows[rowIdx]?.items.length ?? 0
  }, [getVisibleRows])

  const fetchWatchDataRef = useRef<() => Promise<void>>(async () => {})
  fetchWatchDataRef.current = async () => {
    const authStatus = await window.api.mdblist.getAuthStatus()
    console.log('[Browser] Watch provider auth:', authStatus.authenticated)
    if (authStatus.authenticated) {
      const [watchedMovies, watchedShows, moviePlayback, episodePlayback] = await Promise.all([
        window.api.mdblist.getWatchedMovies().catch((err: any) => { console.log('[Browser] getWatchedMovies failed:', err?.message); return null }),
        window.api.mdblist.getWatchedShows().catch((err: any) => { console.log('[Browser] getWatchedShows failed:', err?.message); return null }),
        window.api.mdblist.getPlaybackMovies().catch((err: any) => { console.log('[Browser] getPlaybackMovies failed:', err?.message); return null }),
        window.api.mdblist.getPlaybackEpisodes().catch((err: any) => { console.log('[Browser] getPlaybackEpisodes failed:', err?.message); return null }),
      ])

      console.log('[Browser] moviePlayback count:', moviePlayback?.length ?? 0)
      console.log('[Browser] episodePlayback count:', episodePlayback?.length ?? 0)

      if (watchedMovies || watchedShows) {
        const ids = new Set<number>()
        if (watchedMovies) watchedMovies.forEach((m: any) => { if (m.movie?.ids?.tmdb) ids.add(m.movie.ids.tmdb) })
        if (watchedShows) watchedShows.forEach((s: any) => { if (s.show?.ids?.tmdb) ids.add(s.show.ids.tmdb) })
        setWatchedIds(ids)

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

      const isDropped = (tmdbId: number) => droppedFromPlayback.has(tmdbId)

      if (moviePlayback && Array.isArray(moviePlayback)) {
        for (const p of moviePlayback) {
          const tmdbId = p?.movie?.ids?.tmdb
          if (!tmdbId) continue
          if (isDropped(tmdbId)) continue
          const progress = (p.progress ?? 0) / 100
          pbItems.push({ tmdbId, mediaType: 'movie', progress })
          infoMap.set(tmdbId, { mediaType: 'movie', progress })
        }
      }

      let episodeItems = episodePlayback
      if (!episodeItems || !Array.isArray(episodeItems) || episodeItems.length === 0) {
        console.log('[Browser] Falling back to /sync/playback for episodes')
        const fallback = await window.api.mdblist.getPlayback().catch((err: any) => { console.log('[Browser] getPlayback fallback failed:', err?.message); return null })
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
          if (isDropped(tmdbId)) continue
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

      setPlayback(pbItems)
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

      // Fetch Watchlist from MDBList
      try {
        const watchlistItems = await window.api.mdblist.getWatchlist().catch((err: any) => { console.log('[Browser] getWatchlist failed:', err?.message); return null })
        if (watchlistItems && Array.isArray(watchlistItems) && watchlistItems.length > 0) {
          const wlPromises = watchlistItems.map(async (w: any) => {
            const tmdbId = w.tmdb_id
            const mediaType = w.media_type === 'movie' ? 'movie' : 'tv'
            try {
              const detail = await window.api.tmdb.getDetails(mediaType, tmdbId)
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
                mediaType: mediaType as 'movie' | 'tv',
                genreIds: (detail.genres || []).map((g: any) => g.id),
              } as MediaItem
            } catch { return null }
          })
          const wlResolved = (await Promise.all(wlPromises)).filter((x): x is MediaItem => x !== null)
          if (wlResolved.length > 0) {
            setWatchlist(wlResolved)
            console.log('[Browser] Watchlist items:', wlResolved.length)
          }
        }
      } catch (err: any) {
        console.log('[Browser] getWatchlist error:', err?.message)
      }

      // Fetch Up Next (shows with next episode to watch)
      try {
        const progress = await window.api.mdblist.getWatchedProgress()
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

  const fetchWatchData = useCallback(() => fetchWatchDataRef.current!(), [])

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true

    async function loadData() {
      setLoading(true)
      setError(null)
      try {
        const trendType = mediaTypeFilter || 'all'
        const trend = await window.api.tmdb.getTrending(trendType, 'week')
        if (trend?.results) setTrending(trend.results)

        if (!mediaTypeFilter) {
          const [popMovies, popTv, topMovies] = await Promise.all([
            window.api.tmdb.getPopular('movie', 1),
            window.api.tmdb.getPopular('tv', 1),
            window.api.tmdb.getTrending('movie', 'week'),
          ])
          if (popMovies?.results) setPopularMovies(popMovies.results)
          if (popTv?.results) setPopularTvShows(popTv.results)
          if (topMovies?.results) setTopRatedMovies(topMovies.results)
        } else {
          // Provider bar logos only; the discovery rows are built by the
          // provider-aware effect below (so the filter can thread through every row).
          try {
            const providersData = await window.api.tmdb.getWatchProviders(mediaTypeFilter)
            if (providersData?.results) {
              const providers = providersData.results.map((p: any) => ({
                providerId: p.providerId,
                providerName: p.providerName,
                logoPath: p.logoPath,
              })).filter((p: any) => p.logoPath) // only include providers with logos
              setWatchProviders(providers)
            }
          } catch { /* providers are optional */ }
        }

        await fetchWatchData()
      } catch (err: any) {
        setError(err?.message || 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [mediaTypeFilter, fetchWatchData])

  useEffect(() => {
    if (!loadedRef.current) return
    fetchWatchData()
  }, [refreshVersion, fetchWatchData, mdblistConnected])

  // Build the discovery hub rows (Popular, Top Rated, all genre rows). When a
  // provider is selected, EVERY row is refetched with with_watch_providers so
  // the filter applies to the whole view — not a single provider list.
  useEffect(() => {
    if (!mediaTypeFilter) return
    let cancelled = false
    const type = mediaTypeFilter as 'movie' | 'tv'
    const providerId = selectedProvider as number | null

    async function buildDiscoveryRows() {
      try {
        const genreData = type === 'movie'
          ? await window.api.tmdb.getMovieGenres()
          : await window.api.tmdb.getTvGenres()
        if (cancelled) return
        const genres: Array<{ id: number; name: string }> = genreData?.genres || []

        async function fetchPaginatedResults(fetchFn: (page: number) => Promise<any>) {
          try {
            const [page1, page2] = await Promise.all([fetchFn(1), fetchFn(2)])
            return [...(page1?.results || []), ...(page2?.results || [])]
          } catch {
            return []
          }
        }

        const opts = providerId ? { providerId } : {}
        const [popularItems, topRatedItems, genreRowsData] = await Promise.all([
          fetchPaginatedResults((page) => window.api.tmdb.discoverFiltered(type, { ...opts, sortBy: 'popularity.desc' }, page)),
          fetchPaginatedResults((page) => window.api.tmdb.discoverFiltered(type, { ...opts, sortBy: 'vote_average.desc' }, page)),
          Promise.all(genres.map(async (g) => {
            try {
              const [page1, page2] = await Promise.all([
                window.api.tmdb.discoverFiltered(type, { ...opts, genreId: g.id }, 1),
                window.api.tmdb.discoverFiltered(type, { ...opts, genreId: g.id }, 2),
              ])
              return { label: g.name, items: [...(page1?.results || []), ...(page2?.results || [])] }
            } catch {
              return { label: g.name, items: [] }
            }
          })),
        ])
        if (cancelled) return

        const rows: Array<{ label: string; items: MediaItem[] }> = []
        if (popularItems.length > 0) rows.push({ label: 'Popular', items: popularItems })
        if (topRatedItems.length > 0) rows.push({ label: 'Top Rated', items: topRatedItems })
        genreRowsData.forEach((genreRow) => {
          if (genreRow.items.length > 0) rows.push(genreRow)
        })
        setDiscoveryRows(rows)
      } catch { /* discovery rows are optional */ }
    }

    buildDiscoveryRows()
    return () => { cancelled = true }
  }, [selectedProvider, mediaTypeFilter])

  // Scroll to top when data loads (e.g. navigating back to Browser)
  useEffect(() => {
    if ((trending ?? []).length > 0 && scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' })
      setScrolled(false)
    }
  }, [(trending ?? []).length])

  useEffect(() => {
    setFocusedRow(0)
    setFocusedCard(0)
  }, [(continueWatching ?? []).length, (watchlist ?? []).length, (upNext ?? []).length, (trending ?? []).length, (popularMovies ?? []).length, (popularTvShows ?? []).length, (topRatedMovies ?? []).length, (discoveryRows ?? []).length])

  useEffect(() => {
    if (browserRef.current) {
      browserRef.current.focus()
    }
  }, [(continueWatching ?? []).length, (watchlist ?? []).length, (trending ?? []).length])

  useEffect(() => {
    console.log('[Browser] Continue Watching rows:', {
      total: (continueWatching ?? []).length,
      movies: (continueMovies ?? []).length,
      watchedIds: (watchedIds ?? new Set()).size,
      watchlist: (watchlist ?? []).length,
    })
  }, [(continueWatching ?? []).length, (continueMovies ?? []).length, (watchedIds ?? new Set()).size, (watchlist ?? []).length])

  const handleKeyDown = useCallback(async (e: React.KeyboardEvent) => {
    const rows = getVisibleRows()
    const inProviderBar = focusedProvider >= -1 && focusedProvider !== -2 && hasProviderBar
    const providerCount = (watchProviders ?? []).length + 1 // +1 for "All" button

    switch (e.key) {
      case 'ArrowRight': {
        e.preventDefault()
        if (inProviderBar) {
          if (focusedProvider < providerCount - 1) setFocusedProvider((p) => p + 1)
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
        } else if (focusedRow > 0) {
          setFocusedRow((r) => r - 1)
          setFocusedCard(0)
        } else if (hasProviderBar) {
          setFocusedProvider(-1)
        }
        // else: already at top, stay
        break
      }
      case 'Enter': {
        // If a real <button> is the event target (e.g. the user mouse-clicked a
        // provider button, leaving DOM focus on it), let the browser
        // fire the button's native click — never fall through to the row/detail
        // path with stale focus state.
        if ((e.target as HTMLElement)?.closest?.('button')) return
        e.preventDefault()
        if (inProviderBar) {
          // -1 = "All", 0+ = provider index
          const provider = focusedProvider === -1 ? null : watchProviders[focusedProvider]?.providerId
          setSelectedProvider(selectedProvider === provider ? null : provider)
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
        if (rows.length === 0) return
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
  }, [focusedRow, focusedCard, focusedProvider, hasProviderBar, getVisibleRows, getRowItemCount, onSelectMedia, continueInfo, onContextMenu, watchProviders, selectedProvider, setSelectedProvider])

  // Scroll provider track ref when provider bar disappears
  useEffect(() => {
    if (!hasProviderBar) providerTrackRef.current = null
  }, [hasProviderBar])

  // Scroll focused provider into view
  // Scroll focused provider into view
    useEffect(() => {
      // Don't scroll if not in provider bar or ref not available
      if (focusedProvider < -1 || !providerTrackRef.current) return

      const index = focusedProvider + 1
      const btn = providerTrackRef.current?.children[index] as HTMLElement | undefined
    
      if (btn) {
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      }
    }, [focusedProvider, providerTrackRef])

  const visibleRows = getVisibleRows()

  // Dynamic hero: show the currently highlighted item. While focus is on the
  // hero actions / provider bar, keep the last highlighted card (ref snapshot).
  const focusedItem = focusedRow >= 0 && visibleRows[focusedRow]
    ? visibleRows[focusedRow].items[focusedCard]
    : undefined
  useEffect(() => {
    if (focusedItem) lastFocusedItemRef.current = focusedItem
  }, [focusedItem])
  const heroItem = focusedItem ?? lastFocusedItemRef.current ?? visibleRows[0]?.items[0] ?? null

  useEffect(() => {
    currentHeroIdRef.current = heroItem?.id ?? null
  }, [heroItem?.id])

  // Enrich hero with details: renderer Map + main-process cache make repeats
  // free; debounce so arrow-keying through cards fires once; stale-id guard
  // so a slow response can't overwrite a newer item.
  useEffect(() => {
    if (!heroItem) { setHeroDetails(null); return }
    const cached = heroDetailsCache.current.get(heroItem.id)
    if (cached) { setHeroDetails(cached); return }
    const { id, mediaType } = heroItem
    const t = setTimeout(async () => {
      try {
        const d = await window.api.tmdb.getDetails(mediaType, id)
        heroDetailsCache.current.set(id, d as HeroDetails)
        if (currentHeroIdRef.current === id) setHeroDetails(d as HeroDetails)
      } catch {
        if (currentHeroIdRef.current === id) setHeroDetails(null)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [heroItem?.id, heroItem?.mediaType])

  return (
    <div ref={browserRef} className={styles.browser} tabIndex={-1} onKeyDown={handleKeyDown}>
      {heroItem && (
        <div className={`${styles.heroLayer} ${scrolled ? styles.scrolled : ''}`}>
          <HeroBanner
            item={heroItem}
            details={heroDetails}
          />
        </div>
      )}

      <div
        ref={scrollRef}
        className={styles.scrollArea}
        onScroll={() => setScrolled((scrollRef.current?.scrollTop ?? 0) > 12)}
      >
        {mediaTypeFilter && (watchProviders ?? []).length > 0 && (
          <div className={styles.providerBar}>
            <div
              ref={providerTrackRef}
              className={styles.providerTrack}
            >
              <button
                tabIndex={-1}
                className={`${styles.providerBtn} ${selectedProvider === null ? styles.providerActive : ''} ${focusedProvider === -1 ? styles.providerFocused : ''}`}
                onClick={(e) => {
                  browserRef.current?.focus() // keep DOM focus on the app's key handler, not the button
                  setSelectedProvider(null)
                  setFocusedProvider(-1)
                }}
              >
                All
              </button>
              {(watchProviders ?? []).slice(0, 30).map((p, pi) => (
                <button
                  tabIndex={-1}
                  key={p.providerId}
                  className={`${styles.providerBtn} ${selectedProvider === p.providerId ? styles.providerActive : ''} ${focusedProvider === pi ? styles.providerFocused : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    browserRef.current?.focus() // keep DOM focus on the app's key handler, not the button
                    setSelectedProvider(selectedProvider === p.providerId ? null : p.providerId)
                    setFocusedProvider(selectedProvider === p.providerId ? -1 : pi)
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

        <div className={styles.rows} style={mediaTypeFilter && (watchProviders ?? []).length > 0 ? { marginTop: '-8px' } : undefined}>
          {error && <div className={styles.error}>{error}</div>}

          {visibleRows.map((row, idx) => {
            return (
              <MediaRow
                key={row.label}
                title={
                  row.label === 'upNext' ? 'Up Next' :
                  row.label === 'trending' ? (mediaTypeFilter === 'movie' ? 'Trending Movies' : mediaTypeFilter === 'tv' ? 'Trending TV Shows' : 'Trending Now') :
                  row.label === 'continueMovies' ? 'Continue Watching Movies' :
                  row.label === 'watchlist' ? 'Watchlist' :
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
                 rowFocused={idx === focusedRow}
                 watchedIds={watchedIds}
                 animationDelay={idx * 50}

              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
