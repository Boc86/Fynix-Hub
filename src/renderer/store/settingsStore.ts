import { create } from 'zustand'
import type { CustomIndexer } from '../../main/services/torrent-search.service'
import type { UsenetIndexerConfig } from '../../main/services/usenet-search.service'
import { useMediaStore } from './mediaStore'

export interface UserProfile {
  id: string
  name: string
  avatarPath?: string
  avatarColor?: string
  traktAccessToken?: string
  traktRefreshToken?: string
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
  traktConnected: boolean
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
  keyboardNavEnabled: boolean
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
  sportsApiProKey: string
  liveTvUser: string
  liveTvPlan: string
  preferredAudioLanguage: string
  accentColor: string
  remoteMapping: Record<string, string>
  sportsEnabled: boolean
  sportsSelected: string[]
  liveTvEnabled: boolean
  selectedLiveTvCountries: string[]
  usenetEnabled: boolean
  nzbgetHost: string
  nzbgetPort: number
  nzbgetUsername: string
  nzbgetPassword: string
  nzbgetDownloadDir: string
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

  setTmdbApiKey: (key: string) => void
  setFanartApiKey: (key: string) => void
  setTraktConnected: (connected: boolean) => void
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
  setKeyboardNavEnabled: (enabled: boolean) => void
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
  setSportsApiProKey: (key: string) => void
  setLiveTvUser: (user: string) => void
  setLiveTvPlan: (plan: string) => void
  setPreferredAudioLanguage: (lang: string) => void
  setAccentColor: (color: string) => void
  setRemoteMapping: (mapping: Record<string, string>) => void
  setSportsEnabled: (enabled: boolean) => void
  setSportsSelected: (ids: string[]) => void
  setLiveTvEnabled: (enabled: boolean) => void
  setSelectedLiveTvCountries: (codes: string[]) => void
  setUsenetEnabled: (enabled: boolean) => void
  setNzbgetHost: (host: string) => void
  setNzbgetPort: (port: number) => void
  setNzbgetUsername: (username: string) => void
  setNzbgetPassword: (password: string) => void
  setNzbgetDownloadDir: (dir: string) => void
  setEnabledUsenetIndexers: (ids: string[]) => void
  setCustomUsenetIndexers: (indexers: UsenetIndexerConfig[]) => void
  setUsenetSearchEnabled: (enabled: boolean) => void
  setTorrentSearchEnabled: (enabled: boolean) => void
  setVylaSearchEnabled: (enabled: boolean) => void
  setPreemptiveSearchTermination: (enabled: boolean) => void
  setVylaSearchLimit: (limit: number) => void
  setTorrentSearchLimit: (limit: number) => void
  setUsenetSearchLimit: (limit: number) => void

  // Profile management
  addProfile: (name: string, avatarPath?: string) => void
  updateProfile: (id: string, updates: Partial<UserProfile>) => void
  removeProfile: (id: string) => void
  setActiveProfile: (id: string | null) => Promise<void>
  getActiveProfile: () => UserProfile | undefined
  setAutoLoginProfile: (id: string | null) => void
  loadFromDisk: () => Promise<void>
  saveToDisk: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  tmdbApiKey: '',
  fanartApiKey: '',
  traktConnected: false,
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
  keyboardNavEnabled: true,
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
  sportsApiProKey: '',
  liveTvUser: 'cdnlivetv',
  liveTvPlan: 'free',
  preferredAudioLanguage: '',
  accentColor: '#FF6B00',
  remoteMapping: {} as Record<string, string>,
  sportsEnabled: false,
  sportsSelected: [],
  liveTvEnabled: false,
  selectedLiveTvCountries: [],
  usenetEnabled: false,
  nzbgetHost: '',
  nzbgetPort: 6789,
  nzbgetUsername: '',
  nzbgetPassword: '',
  nzbgetDownloadDir: '',
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

  setTmdbApiKey: (key) => set({ tmdbApiKey: key }),
  setFanartApiKey: (key) => set({ fanartApiKey: key }),
  setTraktConnected: (connected) => set({ traktConnected: connected }),
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
  setKeyboardNavEnabled: (enabled) => set({ keyboardNavEnabled: enabled }),
  setPreferredLanguages: (languages) => set({ preferredLanguages: languages }),
  setPreferredResolutions: (resolutions) => set({ preferredResolutions: resolutions }),
  setEnabledIndexers: (ids) => { set({ enabledIndexers: ids }); get().saveToDisk() },
  setCustomIndexers: (indexers) => { set({ customIndexers: indexers }); get().saveToDisk() },
  setYoutubeCookiesPath: (path) => { set({ youtubeCookiesPath: path }); get().saveToDisk() },
  setSponsorBlockEnabled: (enabled) => { set({ sponsorBlockEnabled: enabled }); get().saveToDisk() },
  setSponsorBlockCategories: (categories) => { set({ sponsorBlockCategories: categories }); get().saveToDisk() },
  setYoutubePreferredQuality: (quality) => { set({ youtubePreferredQuality: quality }); get().saveToDisk() },
  setIntroDbApiKey: (key: string) => { set({ introDbApiKey: key }); get().saveToDisk() },
  setOpensubtitlesApiKey: (key) => { set({ opensubtitlesApiKey: key }); get().saveToDisk() },
  setOpensubtitlesForcedOnly: (forced) => { set({ opensubtitlesForcedOnly: forced }); get().saveToDisk() },
  setSportsApiProKey: (key) => { set({ sportsApiProKey: key }); get().saveToDisk() },
  setLiveTvUser: (user) => { set({ liveTvUser: user }); get().saveToDisk() },
  setLiveTvPlan: (plan) => { set({ liveTvPlan: plan }); get().saveToDisk() },
  setPreferredAudioLanguage: (lang) => { set({ preferredAudioLanguage: lang }); get().saveToDisk() },
  setAccentColor: (color) => { set({ accentColor: color }); get().saveToDisk() },
  setRemoteMapping: (mapping: Record<string, string>) => { set({ remoteMapping: mapping }); get().saveToDisk() },
  setSportsEnabled: (enabled) => { set({ sportsEnabled: enabled }); get().saveToDisk() },
  setSportsSelected: (ids) => { set({ sportsSelected: ids }); get().saveToDisk() },
  setLiveTvEnabled: (enabled) => { set({ liveTvEnabled: enabled }); get().saveToDisk() },
  setSelectedLiveTvCountries: (codes) => { set({ selectedLiveTvCountries: codes }); get().saveToDisk() },
  setUsenetEnabled: (enabled) => { set({ usenetEnabled: enabled }); get().saveToDisk() },
  setNzbgetHost: (host) => { set({ nzbgetHost: host }); get().saveToDisk() },
  setNzbgetPort: (port) => { set({ nzbgetPort: port }); get().saveToDisk() },
  setNzbgetUsername: (username) => { set({ nzbgetUsername: username }); get().saveToDisk() },
  setNzbgetPassword: (password) => { set({ nzbgetPassword: password }); get().saveToDisk() },
  setNzbgetDownloadDir: (dir) => { set({ nzbgetDownloadDir: dir }); get().saveToDisk() },
  setEnabledUsenetIndexers: (ids) => { set({ enabledUsenetIndexers: ids }); get().saveToDisk() },
  setCustomUsenetIndexers: (indexers) => { set({ customUsenetIndexers: indexers }); get().saveToDisk() },
  setUsenetSearchEnabled: (enabled) => { set({ usenetSearchEnabled: enabled }); get().saveToDisk() },
  setTorrentSearchEnabled: (enabled) => { set({ torrentSearchEnabled: enabled }); get().saveToDisk() },
  setVylaSearchEnabled: (enabled) => { set({ vylaSearchEnabled: enabled }); get().saveToDisk() },
  setPreemptiveSearchTermination: (enabled) => { set({ preemptiveSearchTermination: enabled }); get().saveToDisk() },
  setVylaSearchLimit: (limit) => { set({ vylaSearchLimit: limit }); get().saveToDisk() },
  setTorrentSearchLimit: (limit) => { set({ torrentSearchLimit: limit }); get().saveToDisk() },
  setUsenetSearchLimit: (limit) => { set({ usenetSearchLimit: limit }); get().saveToDisk() },

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
    get().saveToDisk()
  },

  updateProfile: (id, updates) => {
    set((state) => ({
      profiles: state.profiles.map((p) => p.id === id ? { ...p, ...updates } : p)
    }));
    get().saveToDisk()
  },

  removeProfile: (id) => {
    set((state) => ({
      profiles: state.profiles.filter((p) => p.id !== id),
      activeProfileId: state.activeProfileId === id ? null : state.activeProfileId,
      autoLoginProfileId: state.autoLoginProfileId === id ? null : state.autoLoginProfileId
    }));
    get().saveToDisk()
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
        // Sync Trakt connection state with the new active profile
        if (profile.traktAccessToken) {
          try {
            await window.api.trakt.setTokens(profile.traktAccessToken, profile.traktRefreshToken || null)
          } catch { /* ignore */ }
          set({ traktConnected: true })
        } else {
          try {
            await window.api.trakt.setTokens(null, null)
          } catch { /* ignore */ }
          set({ traktConnected: false })
        }
        // Force homescreen refresh (up next, continue watching, etc)
        useMediaStore.getState().triggerRefresh()
      }
    }
    get().saveToDisk()
  },

  getActiveProfile: () => {
    const { profiles, activeProfileId } = get();
    return profiles.find((p) => p.id === activeProfileId);
  },

  setAutoLoginProfile: (id) => {
    set({ autoLoginProfileId: id });
    get().saveToDisk()
  },

  // --- /Profile Management Actions ---

  loadFromDisk: async () => {
    try {
      const settings = await window.api.settings.getAll()
      if (settings) {
        // Migrate from old trakt tokens on first load
        if (!settings.profiles && settings.traktAccessToken) {
          const id = Date.now().toString();
          set({
            profiles: [{
              id,
              name: 'Default',
              avatarPath: undefined,
              avatarColor: pickAvatarColor(id),
              traktAccessToken: settings.traktAccessToken,
              traktRefreshToken: settings.traktRefreshToken,
              sportsSelected: settings.sportsSelected || []
            }],
            activeProfileId: id,
          });
        } else {
          // Backfill missing fields on stored profiles
          if (settings.profiles) {
            settings.profiles = (settings.profiles as any[]).map((p) => ({
              ...p,
              avatarColor: p.avatarColor || pickAvatarColor(p.id),
              sportsSelected: p.sportsSelected || settings.sportsSelected || []
            }))
          }
          // Migrate old maxTorrentSize → maxDownloadSize
          if (!(settings as any).maxDownloadSize && (settings as any).maxTorrentSize) {
            (settings as any).maxDownloadSize = (settings as any).maxTorrentSize
          }
          set(settings as Partial<SettingsState>);
        }
      }

      // Handle auto-login: if autologin profile is set, resolve to it
      const { activeProfileId, autoLoginProfileId } = get();
      if (autoLoginProfileId) {
        if (activeProfileId !== autoLoginProfileId) {
          set({ activeProfileId: autoLoginProfileId });
        }
      } else {
        // Auto-login is off - don't restore last active profile
        set({ activeProfileId: null });
      }

      // Sync trakt state with active profile
      const activeProfile = get().getActiveProfile();
      if (activeProfile && activeProfile.traktAccessToken) {
        try {
          await window.api.trakt.setTokens(
            activeProfile.traktAccessToken,
            activeProfile.traktRefreshToken || null
          );
        } catch { /* ignore */ }
        set({ traktConnected: true });
      } else {
        set({ traktConnected: false });
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
    } catch { /* ignore */ }
  },

  saveToDisk: async () => {
    try {
      const state = get()
      await Promise.all([
        window.api.settings.set('tmdbApiKey', state.tmdbApiKey),
        window.api.settings.set('fanartApiKey', state.fanartApiKey),
        window.api.settings.set('traktConnected', state.traktConnected),
        window.api.settings.set('realDebridApiKey', state.realDebridApiKey),
        window.api.settings.set('torboxApiKey', state.torboxApiKey),
        window.api.settings.set('preferredDebrid', state.preferredDebrid),
        window.api.settings.set('downloadPath', state.downloadPath),
        window.api.settings.set('autoPlayNext', state.autoPlayNext),
        window.api.settings.set('autoPlayTorrent', state.autoPlayTorrent),
        window.api.settings.set('maxDownloadSize', state.maxDownloadSize),
        window.api.settings.set('maxTorrentSize', state.maxDownloadSize),
        window.api.settings.set('keyboardNavEnabled', state.keyboardNavEnabled),
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
        window.api.settings.set('sportsApiProKey', state.sportsApiProKey),
        window.api.settings.set('liveTvUser', state.liveTvUser),
        window.api.settings.set('liveTvPlan', state.liveTvPlan),
        window.api.settings.set('preferredAudioLanguage', state.preferredAudioLanguage),
        window.api.settings.set('accentColor', state.accentColor),
        window.api.settings.set('remoteMapping', state.remoteMapping),

        window.api.settings.set('sportsEnabled', state.sportsEnabled),
        window.api.settings.set('sportsSelected', state.sportsSelected),
        window.api.settings.set('liveTvEnabled', state.liveTvEnabled),
        window.api.settings.set('selectedLiveTvCountries', state.selectedLiveTvCountries),
        window.api.settings.set('usenetEnabled', state.usenetEnabled),
        window.api.settings.set('nzbgetHost', state.nzbgetHost),
        window.api.settings.set('nzbgetPort', String(state.nzbgetPort)),
        window.api.settings.set('nzbgetUsername', state.nzbgetUsername),
        window.api.settings.set('nzbgetPassword', state.nzbgetPassword),
        window.api.settings.set('nzbgetDownloadDir', state.nzbgetDownloadDir),
        window.api.settings.set('enabledUsenetIndexers', state.enabledUsenetIndexers),
        window.api.settings.set('customUsenetIndexers', state.customUsenetIndexers),
        window.api.settings.set('usenetSearchEnabled', state.usenetSearchEnabled),
        window.api.settings.set('torrentSearchEnabled', state.torrentSearchEnabled),
        window.api.settings.set('vylaSearchEnabled', state.vylaSearchEnabled),
        window.api.settings.set('preemptiveSearchTermination', state.preemptiveSearchTermination),
        window.api.settings.set('vylaSearchLimit', state.vylaSearchLimit),
        window.api.settings.set('torrentSearchLimit', state.torrentSearchLimit),
        window.api.settings.set('usenetSearchLimit', state.usenetSearchLimit),
        window.api.settings.set('profiles', state.profiles),
        window.api.settings.set('activeProfileId', state.activeProfileId),
        window.api.settings.set('autoLoginProfileId', state.autoLoginProfileId),
      ])
    } catch { /* ignore */ }
  },
}))
