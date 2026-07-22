// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSportsStore } from '@/renderer/store/sportsStore'

describe('sportsStore', () => {
  beforeEach(() => {
    useSportsStore.setState({
      sportsList: [],
      leagues: [],
      seasons: [],
      selectedSport: null,
      selectedLeague: null,
      selectedSeason: null,
      upcomingEvents: [],
      pastEvents: [],
      selectedEvent: null,
      homeTeam: null,
      awayTeam: null,
      loading: false,
      error: null,
      view: 'sports',
    })
  })

  it('has correct defaults', () => {
    const state = useSportsStore.getState()
    expect(state.view).toBe('sports')
    expect(state.sportsList).toEqual([])
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
  })

  it('reset returns all fields to initial values', () => {
    useSportsStore.setState({
      sportsList: [{ id: 1, name: 'Football' } as any],
      leagues: [{ id: 1 } as any],
      view: 'events',
      loading: true,
      error: 'some error',
      selectedEvent: { id: 99 } as any,
    })

    useSportsStore.getState().reset()

    const state = useSportsStore.getState()
    expect(state.sportsList).toEqual([])
    expect(state.leagues).toEqual([])
    expect(state.seasons).toEqual([])
    expect(state.view).toBe('sports')
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
    expect(state.selectedEvent).toBeNull()
  })

  it('setView updates view', () => {
    useSportsStore.getState().setView('leagues')
    expect(useSportsStore.getState().view).toBe('leagues')
  })

  it('setLoading updates loading', () => {
    useSportsStore.getState().setLoading(true)
    expect(useSportsStore.getState().loading).toBe(true)
  })

  it('setError updates error', () => {
    useSportsStore.getState().setError('Failed to load')
    expect(useSportsStore.getState().error).toBe('Failed to load')
  })
})
