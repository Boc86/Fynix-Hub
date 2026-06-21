import { create } from 'zustand'
import type { MediaItem, MovieDetails, TvDetails, Genre } from '../types'

interface MediaState {
  trending: MediaItem[]
  popularMovies: MediaItem[]
  popularTvShows: MediaItem[]
  topRatedMovies: MediaItem[]
  genres: Genre[]
  selectedMedia: (MovieDetails | TvDetails) | null
  continueWatching: MediaItem[]
  isLoading: boolean
  error: string | null
  setTrending: (items: MediaItem[]) => void
  setPopularMovies: (items: MediaItem[]) => void
  setPopularTvShows: (items: MediaItem[]) => void
  setTopRatedMovies: (items: MediaItem[]) => void
  setGenres: (genres: Genre[]) => void
  setSelectedMedia: (media: (MovieDetails | TvDetails) | null) => void
  setContinueWatching: (items: MediaItem[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useMediaStore = create<MediaState>((set) => ({
  trending: [],
  popularMovies: [],
  popularTvShows: [],
  topRatedMovies: [],
  genres: [],
  selectedMedia: null,
  continueWatching: [],
  isLoading: false,
  error: null,

  setTrending: (items) => set({ trending: items }),
  setPopularMovies: (items) => set({ popularMovies: items }),
  setPopularTvShows: (items) => set({ popularTvShows: items }),
  setTopRatedMovies: (items) => set({ topRatedMovies: items }),
  setGenres: (genres) => set({ genres }),
  setSelectedMedia: (media) => set({ selectedMedia: media }),
  setContinueWatching: (items) => set({ continueWatching: items }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
}))
