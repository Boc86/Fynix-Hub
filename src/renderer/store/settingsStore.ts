import { create } from 'zustand'
import type { CustomIndexer } from '../../main/services/torrent-search.service'
import type { UsenetIndexerConfig } from '../../main/services/usenet-search.service'
import { useMediaStore } from './mediaStore'
import { usePlayerStore } from './playerStore'
import { normalizeLogoUrl } from '../utils/logos'

export interface UserProfile {
  id: string
  name: string
  avatarPath?: string
  avatarColor?: string
  mdblistAccessToken?: string
  mdblistRefreshToken?: string
  sportsSelected: string[]
}

const AVATAR_COLORS = ['#E50914', '#FF6B00', '#007AFF', '#7B68EE', '#34C759', '#00B4D8', '#FF9500', '#FF2D55', '#5856D6', '#AF52DE']

function pickAvatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

const DEFAULT_LANGUAGES = ['English']
const DEFAULT_RESOLUTIONS = ['4K', '1080p', '720p']
const DEFAULT_ENABLED_INDEXERS = ['yts', 'eztv', 'thepiratebay', 'nyaa', '1337x', 'torrentio', 'mediafusion', 'kickass', 'magnetdl', 'bitsearch', 'rutor', 'torrentz2', 'showrss']

interface SettingsState {
  tmdbApiKey: string
  fanartApiKey: string
  mdblistConnected: boolean
  realDebridApiKey: string
  realDebridConnected: boolean
  torboxApiKey: string
  torboxConnected: boolean
  premiumizeConnected: boolean
  alldebridConnected: boolean
  preferredDebrid: string | null
  downloadPath: string
  autoPlayNext: boolean
  autoPlayTorrent: boolean
  maxDownloadSize: number
  preferredLanguages: string[]
  preferredResolutions: string[]
  enabledIndexers: string[]
  customIndexers: CustomIndexer[]
  youtubeCookiesPath: string
  sponsorBlockEnabled: boolean
  sponsorBlockCategories: string[]
  youtubePreferredQuality: string
  introDbApiKey: string
  opensubtitlesApiKey: string
  opensubtitlesForcedOnly: boolean
  liveTvUser: string
  liveTvPlan: string
  liveTvServer: 'cdnlive' | 'ondemand' | 'dlhd'
  iptvM3uSourceUrl: string
  iptvM3uUpdateInterval: number
  iptvM3uEnabled: boolean
  preferredAudioLanguage: string
  classificationCountry: string
  accentColor: string
  remoteMapping: Record<string, string>
  sportsEnabled: boolean
  sportsSelected: string[]
  sportsTimezone: string
  liveTvEnabled: boolean
  selectedLiveTvCountries: string[]
  liveTvVisibleChannels: string[]
  /** Channels hidden via the LiveTV context menu (applies to LiveTV + EPG) */
  liveTvHiddenChannels: string[]
  liveTvChannelOrder: string[]
  /** User-supplied logo URLs keyed by channel id (context menu override) */
  liveTvCustomLogos: Record<string, string>
  /** User-supplied display names keyed by channel id (context menu override) */
  liveTvCustomNames: Record<string, string>
  usenetEnabled: boolean
  nzbgetHost: string
  nzbgetPort: number
  nzbgetUsername: string
  nzbgetPassword: string
  nzbgetDownloadDir: string
  autoDeleteUsenet: boolean
  enabledUsenetIndexers: string[]
  customUsenetIndexers: UsenetIndexerConfig[]
  usenetSearchEnabled: boolean
  torrentSearchEnabled: boolean
  vylaSearchEnabled: boolean
  preemptiveSearchTermination: boolean
  vylaSearchLimit: number
  torrentSearchLimit: number
  usenetSearchLimit: number
  profiles: UserProfile[]
  activeProfileId: string | null
  autoLoginProfileId: string | null
  networkEnabled: boolean
  networkPort: number
  networkUsername: string
  networkPassword: string

  setTmdbApiKey: (key: string) => void
  setFanartApiKey: (key: string) => void
  setMdblistConnected: (connected: boolean) => void
  setRealDebridApiKey: (key: string) => void
  setRealDebridConnected: (connected: boolean) => void
  setTorboxApiKey: (key: string) => void
  setTorboxConnected: (connected: boolean) => void
  setPremiumizeConnected: (connected: boolean) => void
  setAlldebridConnected: (connected: boolean) => void
  setPreferredDebrid: (service: string | null) => void
  setDownloadPath: (path: string) => void
  setAutoPlayNext: (enabled: boolean) => void
  setAutoPlayTorrent: (enabled: boolean) => void
  setMaxDownloadSize: (size: number) => void
  setPreferredLanguages: (languages: string[]) => void
  setPreferredResolutions: (resolutions: string[]) => void
  setEnabledIndexers: (ids: string[]) => void
  setCustomIndexers: (indexers: CustomIndexer[]) => void
  setYoutubeCookiesPath: (path: string) => void
  setSponsorBlockEnabled: (enabled: boolean) => void
  setSponsorBlockCategories: (categories: string[]) => void
  setYoutubePreferredQuality: (quality: string) => void
  setIntroDbApiKey: (key: string) => void
  setOpensubtitlesApiKey: (key: string) => void
  setOpensubtitlesForcedOnly: (forced: boolean) => void
  setLiveTvUser: (user: string) => void
  setLiveTvPlan: (plan: string) => void
  setLiveTvServer: (server: 'cdnlive' | 'ondemand' | 'dlhd') => void
  setIptvM3uSourceUrl: (url: string) => void
  setIptvM3uUpdateInterval: (interval: number) => void
  setIptvM3uEnabled: (enabled: boolean) => void
  setPreferredAudioLanguage: (lang: string) => void
  setClassificationCountry: (country: string) => void
  setAccentColor: (color: string) => void
  setRemoteMapping: (mapping: Record<string, string>) => void
  setSportsEnabled: (enabled: boolean) => void
  setSportsSelected: (ids: string[]) => void
  setSportsTimezone: (tz: string) => void
  setLiveTvEnabled: (enabled: boolean) => void
  setSelectedLiveTvCountries: (codes: string[]) => void
  setLiveTvVisibleChannels: (ids: string[]) => void
  setLiveTvHiddenChannels: (ids: string[]) => void
  /** Hide a channel from LiveTV + EPG (persisted). */
  hideLiveTvChannel: (channelId: string) => void
  /** Un-hide a previously hidden channel. */
  unhideLiveTvChannel: (channelId: string) => void
  setLiveTvChannelOrder: (ids: string[]) => void
  /** Set a custom logo URL for a channel; empty/whitespace removes it. */
  setLiveTvCustomLogo: (channelId: string, url: string) => void
  /** Set a custom display name for a channel; empty/whitespace removes it. */
  setLiveTvCustomName: (channelId: string, name: string) => void
  setUsenetEnabled: (enabled: boolean) => void
  setNzbgetHost: (host: string) => void
  setNzbgetPort: (port: number) => void
  setNzbgetUsername: (username: string) => void
  setNzbgetPassword: (password: string) => void
  setNzbgetDownloadDir: (dir: string) => void
  setAutoDeleteUsenet: (enabled: boolean) => void
  setEnabledUsenetIndexers: (ids: string[]) => void
  setCustomUsenetIndexers: (indexers: UsenetIndexerConfig[]) => void
  setUsenetSearchEnabled: (enabled: boolean) => void
  setTorrentSearchEnabled: (enabled: boolean) => void
  setVylaSearchEnabled: (enabled: boolean) => void
  setPreemptiveSearchTermination: (enabled: boolean) => void
  setVylaSearchLimit: (limit: number) => void
  setTorrentSearchLimit: (limit: number) => void
  setUsenetSearchLimit: (limit: number) => void
  setNetworkEnabled: (enabled: boolean) => void
  setNetworkPort: (port: number) => void
  setNetworkUsername: (username: string) => void
  setNetworkPassword: (password: string) => void

  // Profile management
  addProfile: (name: string, avatarPath?: string) => void
  updateProfile: (id: string, updates: Partial<UserProfile>) => void
  removeProfile: (id: string) => void
  setActiveProfile: (id: string | null) => Promise<void>
  getActiveProfile: () => UserProfile | undefined
  /** Strip dead MDBList tokens from the active profile and flip the connected flag off. */
  clearMdblistAuth: () => void
  setAutoLoginProfile: (id: string | null) => void
  loadFromDisk: () => Promise<void>
  saveToDisk: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  tmdbApiKey: '',
  fanartApiKey: '',
  mdblistConnected: false,
  realDebridApiKey: '',
  realDebridConnected: false,
  torboxApiKey: '',
  torboxConnected: false,
  premiumizeConnected: false,
  alldebridConnected: false,
  preferredDebrid: null,
  downloadPath: '',
  autoPlayNext: true,
  autoPlayTorrent: false,
  maxDownloadSize: 0,
  preferredLanguages: DEFAULT_LANGUAGES,
  preferredResolutions: DEFAULT_RESOLUTIONS,
  enabledIndexers: DEFAULT_ENABLED_INDEXERS,
  customIndexers: [],
  youtubeCookiesPath: '',
  sponsorBlockEnabled: true,
  sponsorBlockCategories: ['sponsor', 'intro', 'outro', 'interaction', 'selfpromo', 'preview', 'music_offtopic', 'poi_highlight'],
  youtubePreferredQuality: '1080p',
  introDbApiKey: '',
  opensubtitlesApiKey: '',
  opensubtitlesForcedOnly: true,
  liveTvUser: 'cdnlivetv',
  liveTvPlan: 'free',
  liveTvServer: 'cdnlive',
  iptvM3uSourceUrl: 'http://magnetic.website/MAD_TITAN_SPORTS/Keep_m3u_json/zone1.txt',
  iptvM3uUpdateInterval: 24,
  iptvM3uEnabled: true,
  preferredAudioLanguage: '',
  classificationCountry: 'US',
  accentColor: '#FF6B00',
  remoteMapping: {} as Record<string, string>,
  sportsEnabled: false,
  sportsSelected: [],
  sportsTimezone: 'GMT',
  liveTvEnabled: false,
  selectedLiveTvCountries: [],
  liveTvVisibleChannels: [],
  liveTvHiddenChannels: [],
  liveTvChannelOrder: [],
  liveTvCustomLogos: {},
  liveTvCustomNames: {},
  usenetEnabled: false,
  nzbgetHost: '',
  nzbgetPort: 6789,
  nzbgetUsername: '',
  nzbgetPassword: '',
  nzbgetDownloadDir: '',
  autoDeleteUsenet: true,
  enabledUsenetIndexers: [],
  customUsenetIndexers: [],
  usenetSearchEnabled: true,
  torrentSearchEnabled: true,
  vylaSearchEnabled: true,
  preemptiveSearchTermination: false,
  vylaSearchLimit: 5,
  torrentSearchLimit: 10,
  usenetSearchLimit: 5,
  profiles: [],
  activeProfileId: null,
  autoLoginProfileId: null,
  networkEnabled: false,
  networkPort: 43862,
  networkUsername: '',
  networkPassword: '',

  setTmdbApiKey: (key) => set({ tmdbApiKey: key }),
  setFanartApiKey: (key) => set({ fanartApiKey: key }),
  setMdblistConnected: (connected) => { set({ mdblistConnected: connected }); get().saveToDisk() },
  setRealDebridApiKey: (key) => set({ realDebridApiKey: key }),
  setRealDebridConnected: (connected) => set({ realDebridConnected: connected }),
  setTorboxApiKey: (key) => set({ torboxApiKey: key }),
  setTorboxConnected: (connected) => set({ torboxConnected: connected }),
  setPremiumizeConnected: (connected) => set({ premiumizeConnected: connected }),
  setAlldebridConnected: (connected) => set({ alldebridConnected: connected }),
  setPreferredDebrid: (service) => set({ preferredDebrid: service }),
  setDownloadPath: (path) => set({ downloadPath: path }),
  setAutoPlayNext: (enabled) => { set({ autoPlayNext: enabled }); get().saveToDisk() },
  setAutoPlayTorrent: (enabled) => { set({ autoPlayTorrent: enabled }); get().saveToDisk() },
  setMaxDownloadSize: (size) => { set({ maxDownloadSize: size }); get().saveToDisk() },
  setPreferredLanguages: (languages) => set({ preferredLanguages: languages }),
  setPreferredResolutions: (resolutions) => set({ preferredResolutions: resolutions }),
  setEnabledIndexers: (ids) => { set({ enabledIndexers: ids }); get().saveToDisk() },
  setCustomIndexers: (indexers) => { set({ customIndexers: indexers }); get().saveToDisk() },
  setYoutubeCookiesPath: (path) => { set({ youtubeCookiesPath: path }); get().saveToDisk() },
  setSponsorBlockEnabled: (enabled) => { set({ sponsorBlockEnabled: enabled }); get().saveToDisk() },
  setSponsorBlockCategories: (categories) => { set({ sponsorBlockCategories: categories }); get().saveToDisk() },
  setYoutubePreferredQuality: (quality) => { set({ youtubePreferredQuality: quality }); get().saveToDisk() },
  setIntroDbApiKey: (key) => { set({ introDbApiKey: key }); get().saveToDisk() },
  setOpensubtitlesApiKey: (key) => { set({ opensubtitlesApiKey: key }); get().saveToDisk() },
  setOpensubtitlesForcedOnly: (forced) => { set({ opensubtitlesForcedOnly: forced }); get().saveToDisk() },
  setLiveTvUser: (user) => { set({ liveTvUser: user }); get().saveToDisk() },
  setLiveTvPlan: (plan) => { set({ liveTvPlan: plan }); get().saveToDisk() },
  setLiveTvServer: (server) => { set({ liveTvServer: server }); get().saveToDisk() },
  setIptvM3uSourceUrl: (url) => { set({ iptvM3uSourceUrl: url }); get().saveToDisk() },
  setIptvM3uUpdateInterval: (interval) => { set({ iptvM3uUpdateInterval: interval }); get().saveToDisk() },
  setIptvM3uEnabled: (enabled) => { set({ iptvM3uEnabled: enabled }); get().saveToDisk() },
  setPreferredAudioLanguage: (lang) => { set({ preferredAudioLanguage: lang }); get().saveToDisk() },
  setClassificationCountry: (country) => { set({ classificationCountry: country }); get().saveToDisk() },
  setAccentColor: (color) => { set({ accentColor: color }); get().saveToDisk() },
  setRemoteMapping: (mapping: Record<string, string>) => { set({ remoteMapping: mapping }); get().saveToDisk() },
  setSportsEnabled: async (enabled) => { 
    set({ sportsEnabled: enabled }); 
    try { await window.api.settings.set('sportsEnabled', enabled); } catch {}
    get().saveToDisk() 
  },
  setSportsSelected: async (ids) => {
    set((state) => {
      // Also update the active profile's sportsSelected so it doesn't get stale
      if (state.activeProfileId) {
        return {
          sportsSelected: ids,
          profiles: state.profiles.map(p =>
            p.id === state.activeProfileId ? { ...p, sportsSelected: ids } : p
          )
        }
      }
      return { sportsSelected: ids }
    });
    // Persist immediately so data isn't lost on app close
    try { await window.api.settings.set('sportsSelected', ids); } catch {}
    get().saveToDisk()
  },
  setSportsTimezone: async (tz) => {
    set({ sportsTimezone: tz });
    try { await window.api.settings.set('sportsTimezone', tz); } catch {}
    get().saveToDisk()
  },
  setLiveTvEnabled: (enabled) => { set({ liveTvEnabled: enabled }); get().saveToDisk() },
  setSelectedLiveTvCountries: (codes) => { set({ selectedLiveTvCountries: codes }); get().saveToDisk() },
  setLiveTvVisibleChannels: (ids) => { set({ liveTvVisibleChannels: ids }); get().saveToDisk() },
  setLiveTvHiddenChannels: (ids) => { set({ liveTvHiddenChannels: ids }); get().saveToDisk() },
  hideLiveTvChannel: (channelId) => {
    set((state) => {
      if (state.liveTvHiddenChannels.includes(channelId)) return state
      return { liveTvHiddenChannels: [...state.liveTvHiddenChannels, channelId] }
    })
    get().saveToDisk()
  },
  unhideLiveTvChannel: (channelId) => {
    set((state) => ({
      liveTvHiddenChannels: state.liveTvHiddenChannels.filter((id) => id !== channelId)
    }))
    get().saveToDisk()
  },
  setLiveTvChannelOrder: (ids) => { set({ liveTvChannelOrder: ids }); get().saveToDisk() },
  setLiveTvCustomLogo: (channelId, url) => {
    const urlTrimmed = normalizeLogoUrl(url)
    set((state) => {
      const logos = { ...state.liveTvCustomLogos }
      if (urlTrimmed) logos[channelId] = urlTrimmed
      else delete logos[channelId]
      return { liveTvCustomLogos: logos }
    })
    get().saveToDisk()
  },
  setLiveTvCustomName: (channelId, name) => {
    const nameTrimmed = name.trim()
    set((state) => {
      const names = { ...state.liveTvCustomNames }
      if (nameTrimmed) names[channelId] = nameTrimmed
      else delete names[channelId]
      return { liveTvCustomNames: names }
    })
    get().saveToDisk()
  },
  setUsenetEnabled: (enabled) => { set({ usenetEnabled: enabled }); get().saveToDisk() },
  setNzbgetHost: (host) => { set({ nzbgetHost: host }); get().saveToDisk() },
  setNzbgetPort: (port) => { set({ nzbgetPort: port }); get().saveToDisk() },
  setNzbgetUsername: (username) => { set({ nzbgetUsername: username }); get().saveToDisk() },
  setNzbgetPassword: (password) => { set({ nzbgetPassword: password }); get().saveToDisk() },
  setNzbgetDownloadDir: (dir) => { set({ nzbgetDownloadDir: dir }); get().saveToDisk() },
  setAutoDeleteUsenet: (enabled) => { set({ autoDeleteUsenet: enabled }); get().saveToDisk() },
  setEnabledUsenetIndexers: (ids) => { set({ enabledUsenetIndexers: ids }); get().saveToDisk() },
  setCustomUsenetIndexers: (indexers) => { set({ customUsenetIndexers: indexers }); get().saveToDisk() },
  setUsenetSearchEnabled: (enabled) => { set({ usenetSearchEnabled: enabled }); get().saveToDisk() },
  setTorrentSearchEnabled: (enabled) => { set({ torrentSearchEnabled: enabled }); get().saveToDisk() },
  setVylaSearchEnabled: (enabled) => { set({ vylaSearchEnabled: enabled }); get().saveToDisk() },
  setPreemptiveSearchTermination: (enabled) => { set({ preemptiveSearchTermination: enabled }); get().saveToDisk() },
  setVylaSearchLimit: (limit) => { set({ vylaSearchLimit: limit }); get().saveToDisk() },
  setTorrentSearchLimit: (limit) => { set({ torrentSearchLimit: limit }); get().saveToDisk() },
  setUsenetSearchLimit: (limit) => { set({ usenetSearchLimit: limit }); get().saveToDisk() },
  setNetworkEnabled: (enabled) => { set({ networkEnabled: enabled }); get().saveToDisk() },
  setNetworkPort: (port) => { set({ networkPort: port }); get().saveToDisk() },
  setNetworkUsername: (username) => { set({ networkUsername: username }); get().saveToDisk() },
  setNetworkPassword: (password) => { set({ networkPassword: password }); get().saveToDisk() },

  // --- Profile Management Actions ---
  addProfile: (name, avatarPath) => {
    set((state) => {
      if (state.profiles.length >= 5) return state; // Max 5 profiles
      const id = Date.now().toString();
      return {
        profiles: [...state.profiles, {
          id,
          name,
          avatarPath,
          avatarColor: pickAvatarColor(id),
          sportsSelected: state.sportsSelected || []
        }],
        activeProfileId: id,
      };
    });
    get().saveToDisk();
  },

  updateProfile: (id, updates) => {
    set((state) => ({
      profiles: state.profiles.map((p) => p.id === id ? { ...p, ...updates } : p)
    }));
    get().saveToDisk();
  },

  removeProfile: (id) => {
    set((state) => ({
      profiles: state.profiles.filter((p) => p.id !== id),
      activeProfileId: state.activeProfileId === id ? null : state.activeProfileId,
      autoLoginProfileId: state.autoLoginProfileId === id ? null : state.autoLoginProfileId
    }));
    get().saveToDisk();
  },

  setActiveProfile: async (id) => {
    const previousId = get().activeProfileId
    // Save current profile's sportsSelected to the previously active profile
    if (previousId) {
      set((s) => ({
        profiles: s.profiles.map((p) =>
          p.id === previousId ? { ...p, sportsSelected: s.sportsSelected } : p
        )
      }))
    }

    set({ activeProfileId: id })

    // Restore sportsSelected from the newly active profile
    if (id) {
      const profile = get().getActiveProfile()
      if (profile) {
        set({ sportsSelected: profile.sportsSelected || [] })
        // Sync MDBList connection state with the new active profile
        if (profile.mdblistAccessToken) {
          try {
            await window.api.mdblist.setTokens(profile.mdblistAccessToken, profile.mdblistRefreshToken || null)
          } catch { /* ignore */ }
          set({ mdblistConnected: true })
        } else {
          try {
            await window.api.mdblist.setTokens(null, null)
          } catch { /* ignore */ }
          set({ mdblistConnected: false })
        }
        // Drop the previous profile's cached watch data so the homescreen
        // (Up Next / Continue Watching / progress) reloads for this profile.
        try { await window.api.mdblist.clearCache() } catch {}
        // Reset profile-specific store data so stale content never flashes
        useMediaStore.getState().clearWatchData()
        usePlayerStore.getState().setCurrentEpisode(null)
        usePlayerStore.getState().setNextEpisode(null)
        usePlayerStore.getState().setIntroSegment(null)
        usePlayerStore.getState().setRecapSegment(null)
        // Force homescreen refresh (up next, continue watching, etc)
        useMediaStore.getState().triggerRefresh()
      }
    }
    get().saveToDisk();
  },

  getActiveProfile: () => {
    const { profiles, activeProfileId } = get()
    return profiles.find((p) => p.id === activeProfileId)
  },

  clearMdblistAuth: () => {
    const activeId = get().activeProfileId
    set((state) => {
      const profiles = activeId
        ? state.profiles.map((p) => {
            if (p.id !== activeId) return p
            const next = { ...p }
            delete next.mdblistAccessToken
            delete next.mdblistRefreshToken
            return next
          })
        : state.profiles
      return {
        profiles,
        mdblistConnected: false,
      }
    })
    get().saveToDisk()
  },

  setAutoLoginProfile: (id) => {
    set({ autoLoginProfileId: id })
    get().saveToDisk()
  },

  // --- /Profile Management Actions ---

  loadFromDisk: async () => {
    try {
      const settings = await window.api.settings.getAll()
      if (settings) {
      if (!settings.profiles) {
        const id = Date.now().toString()
        set({
          profiles: [{
            id,
            name: 'Default',
            avatarPath: undefined,
            avatarColor: pickAvatarColor(id),
            sportsSelected: settings.sportsSelected || []
          }],
          activeProfileId: id,
        });
      } else {
        // Backfill missing fields on stored profiles
        settings.profiles = (settings.profiles as any[]).map((p) => ({
          ...p,
          avatarColor: p.avatarColor || pickAvatarColor(p.id),
          sportsSelected: p.sportsSelected || settings.sportsSelected || []
        }))
        // Migrate old maxTorrentSize -> maxDownloadSize
        if (!(settings as any).maxDownloadSize && (settings as any).maxTorrentSize) {
          (settings as any).maxDownloadSize = (settings as any).maxTorrentSize
        }
        set(settings as Partial<SettingsState>);
      }
    }

    // Handle auto-login: if autologin profile is set, resolve to it
    const { activeProfileId, autoLoginProfileId } = get()
    if (autoLoginProfileId) {
      if (activeProfileId !== autoLoginProfileId) {
        set({ activeProfileId: autoLoginProfileId });
      }
    } else {
      // Auto-login is off - don't restore last active profile
      set({ activeProfileId: null });
    }

    // Sync MDBList state with active profile
    const activeProfile = get().getActiveProfile();
    if (activeProfile && activeProfile.mdblistAccessToken) {
      try {
        await window.api.mdblist.setTokens(
          activeProfile.mdblistAccessToken,
          activeProfile.mdblistRefreshToken || null
        );
      } catch { /* ignore */ }
      set({ mdblistConnected: true });
    } else {
      // No token for this profile — make sure main doesn't keep a stale
      // in-memory token (from a previous profile/boot) that would report
      // authenticated and hammer the API with 401s.
      try { await window.api.mdblist.setTokens(null, null) } catch { /* ignore */ }
      set({ mdblistConnected: false });
    }

      const rdKey = await window.api.settings.get('realDebridApiKey');
      if (rdKey) set({ realDebridConnected: true });
      const tbKey = await window.api.settings.get('torboxApiKey');
      if (tbKey) set({ torboxConnected: true });
      const pmToken = await window.api.settings.get('premiumizeAccessToken');
      if (pmToken) set({ premiumizeConnected: true });
      const adToken = await window.api.settings.get('alldebridAccessToken');
      if (adToken) set({ alldebridConnected: true });
      const enabled = await window.api.settings.get('enabledIndexers');
      if (!Array.isArray(enabled)) set({ enabledIndexers: DEFAULT_ENABLED_INDEXERS });

      // Explicitly restore sports settings from top-level DB keys (unconditional)
      const savedSportsSelected = await window.api.settings.get('sportsSelected');
      if (Array.isArray(savedSportsSelected)) {
        console.log(`[Settings] Restored ${savedSportsSelected.length} selected sports: ${JSON.stringify(savedSportsSelected)}`);
        set({ sportsSelected: savedSportsSelected });
      }
      const savedSportsEnabled = await window.api.settings.get('sportsEnabled');
      if (typeof savedSportsEnabled === 'boolean') {
        console.log(`[Settings] Restored sportsEnabled: ${savedSportsEnabled}`);
        set({ sportsEnabled: savedSportsEnabled });
      }
      const savedSportsTz = await window.api.settings.get('sportsTimezone');
      if (typeof savedSportsTz === 'string') {
        set({ sportsTimezone: savedSportsTz });
      }

      // Restore network access (Android TV bridge) settings from top-level DB keys
      const savedNetworkEnabled = await window.api.settings.get('networkEnabled');
      if (typeof savedNetworkEnabled === 'boolean') {
        set({ networkEnabled: savedNetworkEnabled });
      }
      const savedNetworkPort = await window.api.settings.get('networkPort');
      if (typeof savedNetworkPort === 'number') {
        set({ networkPort: savedNetworkPort });
      }
      const savedNetworkUsername = await window.api.settings.get('networkUsername');
      if (typeof savedNetworkUsername === 'string') {
        set({ networkUsername: savedNetworkUsername });
      }
      const savedNetworkPassword = await window.api.settings.get('networkPassword');
      if (typeof savedNetworkPassword === 'string') {
        set({ networkPassword: savedNetworkPassword });
      }
    } catch { /* ignore */ }
  },

  saveToDisk: async () => {
    try {
      const state = get()
      console.log(`[Settings] Saving sports: enabled=${state.sportsEnabled}, selected=${JSON.stringify(state.sportsSelected)}`);
      await Promise.all([
        window.api.settings.set('tmdbApiKey', state.tmdbApiKey),
        window.api.settings.set('fanartApiKey', state.fanartApiKey),
        window.api.settings.set('mdblistConnected', state.mdblistConnected),
        window.api.settings.set('realDebridApiKey', state.realDebridApiKey),
        window.api.settings.set('realDebridConnected', state.realDebridConnected),
        window.api.settings.set('torboxApiKey', state.torboxApiKey),
        window.api.settings.set('torboxConnected', state.torboxConnected),
        window.api.settings.set('premiumizeConnected', state.premiumizeConnected),
        window.api.settings.set('alldebridConnected', state.alldebridConnected),
        window.api.settings.set('preferredDebrid', state.preferredDebrid),
        window.api.settings.set('downloadPath', state.downloadPath),
        window.api.settings.set('autoPlayNext', state.autoPlayNext),
        window.api.settings.set('autoPlayTorrent', state.autoPlayTorrent),
        window.api.settings.set('maxDownloadSize', state.maxDownloadSize),
        window.api.settings.set('maxTorrentSize', state.maxDownloadSize),
        window.api.settings.set('preferredLanguages', state.preferredLanguages),
        window.api.settings.set('preferredResolutions', state.preferredResolutions),
        window.api.settings.set('enabledIndexers', state.enabledIndexers),
        window.api.settings.set('customIndexers', state.customIndexers),
        window.api.settings.set('youtubeCookiesPath', state.youtubeCookiesPath),
        window.api.settings.set('sponsorBlockEnabled', state.sponsorBlockEnabled),
        window.api.settings.set('sponsorBlockCategories', state.sponsorBlockCategories),
        window.api.settings.set('youtubePreferredQuality', state.youtubePreferredQuality),
        window.api.settings.set('introDbApiKey', state.introDbApiKey),
        window.api.settings.set('opensubtitlesApiKey', state.opensubtitlesApiKey),
        window.api.settings.set('opensubtitlesForcedOnly', state.opensubtitlesForcedOnly),
        window.api.settings.set('liveTvUser', state.liveTvUser),
        window.api.settings.set('liveTvPlan', state.liveTvPlan),
        window.api.settings.set('liveTvServer', state.liveTvServer),
        window.api.settings.set('iptvM3uSourceUrl', state.iptvM3uSourceUrl),
        window.api.settings.set('iptvM3uUpdateInterval', state.iptvM3uUpdateInterval),
        window.api.settings.set('iptvM3uEnabled', state.iptvM3uEnabled),
        window.api.settings.set('preferredAudioLanguage', state.preferredAudioLanguage),
        window.api.settings.set('classificationCountry', state.classificationCountry),
        window.api.settings.set('accentColor', state.accentColor),
        window.api.settings.set('remoteMapping', state.remoteMapping),

        window.api.settings.set('sportsEnabled', state.sportsEnabled),
        window.api.settings.set('sportsSelected', state.sportsSelected),
        window.api.settings.set('sportsTimezone', state.sportsTimezone),
        window.api.settings.set('liveTvEnabled', state.liveTvEnabled),
        window.api.settings.set('selectedLiveTvCountries', state.selectedLiveTvCountries),
        window.api.settings.set('liveTvVisibleChannels', state.liveTvVisibleChannels),
        window.api.settings.set('liveTvHiddenChannels', state.liveTvHiddenChannels),
        window.api.settings.set('liveTvChannelOrder', state.liveTvChannelOrder),
        window.api.settings.set('liveTvCustomLogos', state.liveTvCustomLogos),
        window.api.settings.set('liveTvCustomNames', state.liveTvCustomNames),
        window.api.settings.set('usenetEnabled', state.usenetEnabled),
        window.api.settings.set('nzbgetHost', state.nzbgetHost),
        window.api.settings.set('nzbgetPort', String(state.nzbgetPort)),
        window.api.settings.set('nzbgetUsername', state.nzbgetUsername),
        window.api.settings.set('nzbgetPassword', state.nzbgetPassword),
        window.api.settings.set('nzbgetDownloadDir', state.nzbgetDownloadDir),
        window.api.settings.set('autoDeleteUsenet', state.autoDeleteUsenet),
        window.api.settings.set('enabledUsenetIndexers', state.enabledUsenetIndexers),
        window.api.settings.set('customUsenetIndexers', state.customUsenetIndexers),
        window.api.settings.set('usenetSearchEnabled', state.usenetSearchEnabled),
        window.api.settings.set('torrentSearchEnabled', state.torrentSearchEnabled),
        window.api.settings.set('vtylaSearchEnabled', state.vylaSearchEnabled),
        window.api.settings.set('preemptiveSearchTermination', state.preemptiveSearchTermination),
        window.api.settings.set('vtylaSearchLimit', state.vylaSearchLimit),
        window.api.settings.set('torrentSearchLimit', state.torrentSearchLimit),
        window.api.settings.set('usenetSearchLimit', state.usenetSearchLimit),
        window.api.settings.set('profiles', state.profiles),
        window.api.settings.set('activeProfileId', state.activeProfileId),
        window.api.settings.set('autoLoginProfileId', state.autoLoginProfileId),
        window.api.settings.set('networkEnabled', state.networkEnabled),
        window.api.settings.set('networkPort', state.networkPort),
        window.api.settings.set('networkUsername', state.networkUsername),
        window.api.settings.set('networkPassword', state.networkPassword),
      ]);
    } catch (error) {
      console.error('Failed to save settings to disk:', error);
    }
  }
}));