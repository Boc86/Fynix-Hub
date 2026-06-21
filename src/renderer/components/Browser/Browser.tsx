import React, { useEffect, useRef, useCallback } from 'react'
import MediaRow from '../MediaCard/MediaRow'
import HeroBanner from './HeroBanner'
import { useMediaStore } from '../../store/mediaStore'
import styles from './Browser.module.css'

interface BrowserProps {
  onSelectMedia: () => void
  onPlay: () => void
}

export default function Browser({ onSelectMedia, onPlay }: BrowserProps) {
  const {
    trending, popularMovies, popularTvShows, topRatedMovies,
    continueWatching, isLoading, error,
    setTrending, setPopularMovies, setPopularTvShows,
    setTopRatedMovies, setContinueWatching,
    setLoading, setError
  } = useMediaStore()

  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true

    async function loadData() {
      setLoading(true)
      setError(null)
      try {
        const [trend, popMovies, popTv, topMovies] = await Promise.all([
          window.api.tmdb.getTrending('all', 'week'),
          window.api.tmdb.getPopular('movie', 1),
          window.api.tmdb.getPopular('tv', 1),
          window.api.tmdb.getTrending('movie', 'week'),
        ])

        if (trend?.results) setTrending(trend.results)
        if (popMovies?.results) setPopularMovies(popMovies.results)
        if (popTv?.results) setPopularTvShows(popTv.results)
        if (topMovies?.results) setTopRatedMovies(topMovies.results)
      } catch (err: any) {
        setError(err?.message || 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  return (
    <div className={styles.browser}>
      <div className={styles.scrollArea}>
        {trending.length > 0 && (
          <HeroBanner item={trending[0]} onPlay={() => {
            useMediaStore.getState().setSelectedMedia(trending[0] as any)
            onPlay()
          }} onInfo={() => {
            useMediaStore.getState().setSelectedMedia(trending[0] as any)
            onSelectMedia()
          }} />
        )}

        <div className={styles.rows}>
          {error && <div className={styles.error}>{error}</div>}

          <MediaRow
            title="Trending Now"
            items={trending}
            onSelect={(item) => {
              useMediaStore.getState().setSelectedMedia(item as any)
              onSelectMedia()
            }}
          />

          {continueWatching.length > 0 && (
            <MediaRow
              title="Continue Watching"
              items={continueWatching}
              onSelect={(item) => {
                useMediaStore.getState().setSelectedMedia(item as any)
                onPlay()
              }}
            />
          )}

          <MediaRow
            title="Popular Movies"
            items={popularMovies}
            onSelect={(item) => {
              useMediaStore.getState().setSelectedMedia(item as any)
              onSelectMedia()
            }}
          />

          <MediaRow
            title="Popular TV Shows"
            items={popularTvShows}
            onSelect={(item) => {
              useMediaStore.getState().setSelectedMedia(item as any)
              onSelectMedia()
            }}
          />

          <MediaRow
            title="Top Rated Movies"
            items={topRatedMovies}
            onSelect={(item) => {
              useMediaStore.getState().setSelectedMedia(item as any)
              onSelectMedia()
            }}
          />
        </div>
      </div>
    </div>
  )
}
