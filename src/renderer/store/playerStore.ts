import { create } from 'zustand'
import type { Episode, IntroSegment } from '../types'

interface PlayerState {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean
  isFullscreen: boolean
  isLoading: boolean
  currentEpisode: Episode | null
  nextEpisode: Episode | null
  introSegment: IntroSegment | null
  recapSegment: IntroSegment | null
  showUpNext: boolean
  upNextCountdown: number

  setPlaying: (playing: boolean) => void
  setCurrentTime: (time: number) => void
  setDuration: (duration: number) => void
  setVolume: (volume: number) => void
  setMuted: (muted: boolean) => void
  setFullscreen: (fullscreen: boolean) => void
  setLoading: (loading: boolean) => void
  setCurrentEpisode: (episode: Episode | null) => void
  setNextEpisode: (episode: Episode | null) => void
  setIntroSegment: (segment: IntroSegment | null) => void
  setRecapSegment: (segment: IntroSegment | null) => void
  setShowUpNext: (show: boolean) => void
  setUpNextCountdown: (count: number) => void
}

export const usePlayerStore = create<PlayerState>((set) => ({
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  isMuted: false,
  isFullscreen: false,
  isLoading: false,
  currentEpisode: null,
  nextEpisode: null,
  introSegment: null,
  recapSegment: null,
  showUpNext: false,
  upNextCountdown: 15,

  setPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => set({ volume }),
  setMuted: (muted) => set({ isMuted: muted }),
  setFullscreen: (fullscreen) => set({ isFullscreen: fullscreen }),
  setLoading: (loading) => set({ isLoading: loading }),
  setCurrentEpisode: (episode) => set({ currentEpisode: episode }),
  setNextEpisode: (episode) => set({ nextEpisode: episode }),
  setIntroSegment: (segment) => set({ introSegment: segment }),
  setRecapSegment: (segment) => set({ recapSegment: segment }),
  setShowUpNext: (show) => set({ showUpNext: show }),
  setUpNextCountdown: (count) => set({ upNextCountdown: count }),
}))
