// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { useMediaStore } from '@/renderer/store/mediaStore'

describe('mediaStore', () => {
  beforeEach(() => {
    useMediaStore.setState({
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
      watchedIds: new Set(),
      playback: [],
      episodeWatched: new Map(),
      isLoading: false,
      error: null,
      refreshVersion: 0,
    })
  })

  it('has correct defaults', () => {
    const state = useMediaStore.getState()
    expect(state.selectedSeason).toBe(1)
    expect(state.selectedEpisode).toBeNull()
    expect(state.seasonEpisodes).toEqual([])
    expect(state.refreshVersion).toBe(0)
  })

  it('setSelectedMedia resets season/episode/progress', () => {
    useMediaStore.setState({ selectedEpisode: 5, seasonEpisodes: [{ id: 1 } as any], resumeProgress: 50 })
    useMediaStore.getState().setSelectedMedia({ id: 1, seasons: [] } as any)

    const state = useMediaStore.getState()
    expect(state.selectedSeason).toBe(1)
    expect(state.selectedEpisode).toBeNull()
    expect(state.seasonEpisodes).toEqual([])
    expect(state.resumeProgress).toBeNull()
  })

  it('setSelectedSeason resets episode and episodes', () => {
    useMediaStore.setState({ selectedEpisode: 3, seasonEpisodes: [{ id: 1 } as any] })
    useMediaStore.getState().setSelectedSeason(2)

    const state = useMediaStore.getState()
    expect(state.selectedSeason).toBe(2)
    expect(state.selectedEpisode).toBeNull()
    expect(state.seasonEpisodes).toEqual([])
  })

  it('clearWatchData clears only watch-related fields', () => {
    useMediaStore.setState({
      continueWatching: [{ id: 1 } as any],
      upNext: [{ item: { id: 2 } as any, season: 1, episode: 1 }],
      watchedIds: new Set([1, 2, 3]),
      playback: [{ tmdbId: 1, mediaType: 'movie', progress: 0.5 }],
      episodeWatched: new Map([[1, new Map([[1, new Set([1, 2])]])]]),
      resumeProgress: 50,
      // These should NOT be cleared
      trending: [{ id: 99 } as any],
      selectedMedia: { id: 99 } as any,
    })

    useMediaStore.getState().clearWatchData()

    const state = useMediaStore.getState()
    expect(state.continueWatching).toEqual([])
    expect(state.upNext).toEqual([])
    expect(state.watchedIds.size).toBe(0)
    expect(state.playback).toEqual([])
    expect(state.episodeWatched.size).toBe(0)
    expect(state.resumeProgress).toBeNull()
    // Non-watch data preserved
    expect(state.trending).toHaveLength(1)
    expect(state.selectedMedia).not.toBeNull()
  })

  it('triggerRefresh increments monotonically', () => {
    useMediaStore.getState().triggerRefresh()
    useMediaStore.getState().triggerRefresh()
    useMediaStore.getState().triggerRefresh()
    expect(useMediaStore.getState().refreshVersion).toBe(3)
  })

  it('setTrending updates trending', () => {
    useMediaStore.getState().setTrending([{ id: 1 } as any])
    expect(useMediaStore.getState().trending).toHaveLength(1)
  })
})
