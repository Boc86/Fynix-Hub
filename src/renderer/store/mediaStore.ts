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
  upNext: Array<{ item: MediaItem; season: number; episode: number; episodeTitle?: string }>
  resumeProgress: number | null
  watchedIds: Set<number>
  playback: Array<{ tmdbId: number; mediaType: string; progress: number; season?: number; episode?: number }>
  droppedFromPlayback: Set<number>
  episodeWatched: Map<number, Map<number, Set<number>>>
  isLoading: boolean
  error: string | null
  refreshVersion: number
  watchProviders: Array<{ providerId: number; providerName: string; logoPath: string }>
  selectedProvider: number | null
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
  setUpNext: (items: Array<{ item: MediaItem; season: number; episode: number; episodeTitle?: string }>) => void
  setResumeProgress: (progress: number | null) => void
  setWatchedIds: (ids: Set<number>) => void
  setPlayback: (items: Array<{ tmdbId: number; mediaType: string; progress: number; season?: number; episode?: number }>) => void
  markDroppedFromPlayback: (tmdbId: number) => void
  setEpisodeWatched: (data: Map<number, Map<number, Set<number>>>) => void
  setWatchProviders: (providers: Array<{ providerId: number; providerName: string; logoPath: string }>) => void
  setSelectedProvider: (providerId: number | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearWatchData: () => void
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
  upNext: [],
  resumeProgress: null,
  watchedIds: new Set<number>(),
  playback: [],
  droppedFromPlayback: new Set<number>(),
  episodeWatched: new Map<number, Map<number, Set<number>>>(),
  isLoading: false,
  error: null,
  refreshVersion: 0,
  watchProviders: [],
  selectedProvider: null,

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
  setUpNext: (items) => set({ upNext: items }),
  setResumeProgress: (progress) => set({ resumeProgress: progress }),
  setWatchedIds: (ids) => set({ watchedIds: ids }),
  setPlayback: (items) => set({ playback: items }),
  markDroppedFromPlayback: (tmdbId) => set((state) => {
    const next = new Set(state.droppedFromPlayback)
    next.add(tmdbId)
    return { droppedFromPlayback: next }
  }),
  setEpisodeWatched: (data) => set({ episodeWatched: data }),
  setWatchProviders: (providers) => set({ watchProviders: providers }),
  setSelectedProvider: (providerId) => set({ selectedProvider: providerId }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  clearWatchData: () => set({
    continueWatching: [],
    upNext: [],
    watchedIds: new Set<number>(),
    playback: [],
    droppedFromPlayback: new Set<number>(),
    episodeWatched: new Map<number, Map<number, Set<number>>>(),
    resumeProgress: null,
  }),
  triggerRefresh: () => set((state) => ({ refreshVersion: state.refreshVersion + 1 })),
}))
