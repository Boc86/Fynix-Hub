// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { usePlayerStore } from '@/renderer/store/playerStore'

describe('playerStore', () => {
  beforeEach(() => {
    usePlayerStore.setState({
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
    })
  })

  it('has correct defaults', () => {
    const state = usePlayerStore.getState()
    expect(state.isPlaying).toBe(false)
    expect(state.volume).toBe(1)
    expect(state.isMuted).toBe(false)
    expect(state.isFullscreen).toBe(false)
    expect(state.upNextCountdown).toBe(15)
  })

  it('setPlaying updates isPlaying', () => {
    usePlayerStore.getState().setPlaying(true)
    expect(usePlayerStore.getState().isPlaying).toBe(true)
  })

  it('setCurrentTime updates currentTime', () => {
    usePlayerStore.getState().setCurrentTime(120.5)
    expect(usePlayerStore.getState().currentTime).toBe(120.5)
  })

  it('setVolume updates volume', () => {
    usePlayerStore.getState().setVolume(0.5)
    expect(usePlayerStore.getState().volume).toBe(0.5)
  })

  it('setMuted updates isMuted', () => {
    usePlayerStore.getState().setMuted(true)
    expect(usePlayerStore.getState().isMuted).toBe(true)
  })

  it('setFullscreen updates isFullscreen', () => {
    usePlayerStore.getState().setFullscreen(true)
    expect(usePlayerStore.getState().isFullscreen).toBe(true)
  })

  it('setCurrentEpisode updates currentEpisode', () => {
    const ep = { id: 1, name: 'Pilot', episode_number: 1, season_number: 1 } as any
    usePlayerStore.getState().setCurrentEpisode(ep)
    expect(usePlayerStore.getState().currentEpisode).toEqual(ep)
  })

  it('setNextEpisode updates nextEpisode', () => {
    const ep = { id: 2, name: 'Second', episode_number: 2, season_number: 1 } as any
    usePlayerStore.getState().setNextEpisode(ep)
    expect(usePlayerStore.getState().nextEpisode).toEqual(ep)
  })

  it('setIntroSegment updates introSegment', () => {
    const seg = { type: 'intro' as const, startMs: 0, endMs: 90000 }
    usePlayerStore.getState().setIntroSegment(seg)
    expect(usePlayerStore.getState().introSegment).toEqual(seg)
  })

  it('setShowUpNext updates showUpNext', () => {
    usePlayerStore.getState().setShowUpNext(true)
    expect(usePlayerStore.getState().showUpNext).toBe(true)
  })

  it('setUpNextCountdown updates countdown', () => {
    usePlayerStore.getState().setUpNextCountdown(5)
    expect(usePlayerStore.getState().upNextCountdown).toBe(5)
  })
})
