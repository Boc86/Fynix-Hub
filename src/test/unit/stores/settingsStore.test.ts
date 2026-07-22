// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSettingsStore } from '@/renderer/store/settingsStore'

// Mock window.api for the store
const mockSet = vi.fn().mockResolvedValue(undefined)
const mockGetAll = vi.fn().mockResolvedValue({})
const mockGet = vi.fn().mockResolvedValue(null)
const mockSetTokens = vi.fn().mockResolvedValue(undefined)
const mockClearCache = vi.fn().mockResolvedValue(undefined)

Object.defineProperty(globalThis, 'window', {
  value: {
    api: {
      settings: { set: mockSet, getAll: mockGetAll, get: mockGet },
      trakt: { setTokens: mockSetTokens, clearCache: mockClearCache },
    },
  },
  writable: true,
})

let profileCounter = 0

describe('settingsStore — profile management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    profileCounter = 0
    useSettingsStore.setState({
      profiles: [],
      activeProfileId: null,
      autoLoginProfileId: null,
      sportsSelected: [],
      traktConnected: false,
    })
  })

  it('addProfile creates a profile and sets it active', async () => {
    useSettingsStore.getState().addProfile('User 1')
    const state = useSettingsStore.getState()
    expect(state.profiles).toHaveLength(1)
    expect(state.profiles[0].name).toBe('User 1')
    expect(state.activeProfileId).toBe(state.profiles[0].id)
    expect(state.profiles[0].avatarColor).toBeDefined()
  })

  it('addProfile caps at 5 profiles', async () => {
    for (let i = 0; i < 6; i++) {
      // Ensure unique ids by stubbing Date.now
      vi.spyOn(Date, 'now').mockReturnValue(1000 + i)
      useSettingsStore.getState().addProfile(`User ${i}`)
    }
    expect(useSettingsStore.getState().profiles).toHaveLength(5)
    vi.restoreAllMocks()
  })

  it('removeProfile clears activeProfileId if it matched', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    useSettingsStore.getState().addProfile('User 1')
    const id = useSettingsStore.getState().profiles[0].id
    useSettingsStore.getState().removeProfile(id)
    expect(useSettingsStore.getState().activeProfileId).toBeNull()
    vi.restoreAllMocks()
  })

  it('removeProfile preserves activeProfileId if different', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    useSettingsStore.getState().addProfile('User 1')
    vi.spyOn(Date, 'now').mockReturnValue(2000)
    useSettingsStore.getState().addProfile('User 2')
    vi.restoreAllMocks()

    const profiles = useSettingsStore.getState().profiles
    expect(profiles).toHaveLength(2)
    const id1 = profiles[0].id
    const id2 = profiles[1].id
    expect(id1).not.toBe(id2)

    // activeProfileId should be User 2 (the last one added)
    expect(useSettingsStore.getState().activeProfileId).toBe(id2)

    useSettingsStore.getState().removeProfile(id1)
    expect(useSettingsStore.getState().activeProfileId).toBe(id2)
    expect(useSettingsStore.getState().profiles).toHaveLength(1)
    expect(useSettingsStore.getState().profiles[0].id).toBe(id2)
  })

  it('removeProfile clears autoLoginProfileId if it matched', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    useSettingsStore.getState().addProfile('User 1')
    const id = useSettingsStore.getState().profiles[0].id
    useSettingsStore.setState({ autoLoginProfileId: id })
    useSettingsStore.getState().removeProfile(id)
    expect(useSettingsStore.getState().autoLoginProfileId).toBeNull()
    vi.restoreAllMocks()
  })

  it('getActiveProfile returns the active profile', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    useSettingsStore.getState().addProfile('User 1')
    const profile = useSettingsStore.getState().getActiveProfile()
    expect(profile).toBeDefined()
    expect(profile!.name).toBe('User 1')
    vi.restoreAllMocks()
  })

  it('getActiveProfile returns undefined when no active', () => {
    expect(useSettingsStore.getState().getActiveProfile()).toBeUndefined()
  })

  it('updateProfile updates profile fields', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    useSettingsStore.getState().addProfile('User 1')
    const id = useSettingsStore.getState().profiles[0].id
    useSettingsStore.getState().updateProfile(id, { name: 'Renamed' })
    expect(useSettingsStore.getState().profiles[0].name).toBe('Renamed')
    vi.restoreAllMocks()
  })

  it('setAutoLoginProfile stores the id', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    useSettingsStore.getState().addProfile('User 1')
    const id = useSettingsStore.getState().profiles[0].id
    useSettingsStore.getState().setAutoLoginProfile(id)
    expect(useSettingsStore.getState().autoLoginProfileId).toBe(id)
    vi.restoreAllMocks()
  })

  it('setActiveProfile saves sportsSelected to previous profile', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    useSettingsStore.getState().addProfile('User 1')
    const id1 = useSettingsStore.getState().profiles[0].id
    vi.spyOn(Date, 'now').mockReturnValue(2000)
    useSettingsStore.getState().addProfile('User 2')
    const id2 = useSettingsStore.getState().profiles[1].id
    vi.restoreAllMocks()

    // Set active to User 1 first, so User 2 is the "next" profile
    useSettingsStore.setState({ activeProfileId: id1, sportsSelected: ['football'] })
    useSettingsStore.getState().setActiveProfile(id2)

    const prevProfile = useSettingsStore.getState().profiles.find(p => p.id === id1)
    expect(prevProfile!.sportsSelected).toEqual(['football'])
  })

  it('setActiveProfile restores sportsSelected from new profile', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    useSettingsStore.getState().addProfile('User 1')
    const id1 = useSettingsStore.getState().profiles[0].id
    vi.spyOn(Date, 'now').mockReturnValue(2000)
    useSettingsStore.getState().addProfile('User 2')
    const id2 = useSettingsStore.getState().profiles[1].id
    vi.restoreAllMocks()

    // User 1 currently active with football. Set User 2's sports to basketball.
    useSettingsStore.setState({
      sportsSelected: ['football'],
      activeProfileId: id1,
      profiles: useSettingsStore.getState().profiles.map(p =>
        p.id === id2 ? { ...p, sportsSelected: ['basketball'] } : p
      ),
    })

    await useSettingsStore.getState().setActiveProfile(id2)
    expect(useSettingsStore.getState().sportsSelected).toEqual(['basketball'])
  })
})

describe('settingsStore — setters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({
      autoPlayNext: true,
      autoPlayTorrent: false,
      maxDownloadSize: 0,
    })
  })

  it('setAutoPlayNext updates and triggers saveToDisk', async () => {
    useSettingsStore.getState().setAutoPlayNext(false)
    expect(useSettingsStore.getState().autoPlayNext).toBe(false)
    await new Promise(r => setTimeout(r, 10))
    expect(mockSet).toHaveBeenCalled()
  })

  it('setMaxDownloadSize updates and saves', async () => {
    useSettingsStore.getState().setMaxDownloadSize(10)
    expect(useSettingsStore.getState().maxDownloadSize).toBe(10)
  })
})
