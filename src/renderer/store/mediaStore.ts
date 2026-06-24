import { create } from 'zustand'
import type { MediaItem, MovieDetails, TvDetails, Genre, Episode } from '../types'

interface MediaState {
  trending: MediaItem[]
  popularMovies: MediaItem[]
  popularTvShows: MediaItem[]
  topRatedMovies: MediaItem[]
  genres: Genre[]
  selectedMedia: (MovieDetails | TvDetails) | null
  selectedSeason: number
  selectedEpisode: number | null
  seasonEpisodes: Episode[]
  continueWatching: MediaItem[]
  resumeProgress: number | null
  traktWatched: Set<number>
  traktPlayback: Array<{ tmdbId: number; mediaType: string; progress: number; season?: number; episode?: number }>
  isLoading: boolean
  error: string | null
  refreshVersion: number
  setTrending: (items: MediaItem[]) => void
  setPopularMovies: (items: MediaItem[]) => void
  setPopularTvShows: (items: MediaItem[]) => void
  setTopRatedMovies: (items: MediaItem[]) => void
  setGenres: (genres: Genre[]) => void
  setSelectedMedia: (media: (MovieDetails | TvDetails) | null) => void
  setSelectedSeason: (season: number) => void
  setSelectedEpisode: (episode: number | null) => void
  setSeasonEpisodes: (episodes: Episode[]) => void
  setContinueWatching: (items: MediaItem[]) => void
  setResumeProgress: (progress: number | null) => void
  setTraktWatched: (ids: Set<number>) => void
  setTraktPlayback: (items: Array<{ tmdbId: number; mediaType: string; progress: number; season?: number; episode?: number }>) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  triggerRefresh: () => void
}

export const useMediaStore = create<MediaState>((set) => ({
  trending: [],
  popularMovies: [],
  popularTvShows: [],
  topRatedMovies: [],
  genres: [],
  selectedMedia: null,
  selectedSeason: 1,
  selectedEpisode: null,
  seasonEpisodes: [],
  continueWatching: [],
  resumeProgress: null,
  traktWatched: new Set<number>(),
  traktPlayback: [],
  isLoading: false,
  error: null,
  refreshVersion: 0,

  setTrending: (items) => set({ trending: items }),
  setPopularMovies: (items) => set({ popularMovies: items }),
  setPopularTvShows: (items) => set({ popularTvShows: items }),
  setTopRatedMovies: (items) => set({ topRatedMovies: items }),
  setGenres: (genres) => set({ genres }),
  setSelectedMedia: (media) => set({
    selectedMedia: media,
    selectedSeason: media && 'seasons' in media ? 1 : 1,
    selectedEpisode: null,
    seasonEpisodes: [],
    resumeProgress: null,
  }),
  setSelectedSeason: (season) => set({ selectedSeason: season, selectedEpisode: null, seasonEpisodes: [] }),
  setSelectedEpisode: (episode) => set({ selectedEpisode: episode }),
  setSeasonEpisodes: (episodes) => set({ seasonEpisodes: episodes }),
  setContinueWatching: (items) => set({ continueWatching: items }),
  setResumeProgress: (progress) => set({ resumeProgress: progress }),
  setTraktWatched: (ids) => set({ traktWatched: ids }),
  setTraktPlayback: (items) => set({ traktPlayback: items }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  triggerRefresh: () => set((state) => ({ refreshVersion: state.refreshVersion + 1 })),
}))
