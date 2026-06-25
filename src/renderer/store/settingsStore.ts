import { create } from 'zustand'
import type { CustomIndexer } from '../../main/services/torrent-search.service'

const DEFAULT_LANGUAGES = ['English']
const DEFAULT_RESOLUTIONS = ['4K', '1080p', '720p']
const DEFAULT_ENABLED_INDEXERS = ['yts', 'eztv', 'thepiratebay', 'nyaa', '1337x']

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
  maxTorrentSize: number
  keyboardNavEnabled: boolean
  preferredLanguages: string[]
  preferredResolutions: string[]
  enabledIndexers: string[]
  customIndexers: CustomIndexer[]
  youtubeCookiesPath: string
  sponsorBlockEnabled: boolean
  sponsorBlockCategories: string[]
  youtubePreferredQuality: string
  sportsEnabled: boolean
  sportsDbApiKey: string
  sportsSelected: string[]
  introDbApiKey: string
  remoteMapping: Record<string, string>
 
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
  setMaxTorrentSize: (size: number) => void
  setKeyboardNavEnabled: (enabled: boolean) => void
  setPreferredLanguages: (languages: string[]) => void
  setPreferredResolutions: (resolutions: string[]) => void
  setEnabledIndexers: (ids: string[]) => void
  setCustomIndexers: (indexers: CustomIndexer[]) => void
  setYoutubeCookiesPath: (path: string) => void
  setSponsorBlockEnabled: (enabled: boolean) => void
  setSponsorBlockCategories: (categories: string[]) => void
  setYoutubePreferredQuality: (quality: string) => void
  setSportsEnabled: (enabled: boolean) => void
  setSportsDbApiKey: (key: string) => void
  setSportsSelected: (sports: string[]) => void
  setIntroDbApiKey: (key: string) => void
  setRemoteMapping: (mapping: Record<string, string>) => void
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
  maxTorrentSize: 0,
  keyboardNavEnabled: true,
  preferredLanguages: DEFAULT_LANGUAGES,
  preferredResolutions: DEFAULT_RESOLUTIONS,
  enabledIndexers: DEFAULT_ENABLED_INDEXERS,
  customIndexers: [],
  youtubeCookiesPath: '',
  sponsorBlockEnabled: true,
  sponsorBlockCategories: ['sponsor', 'intro', 'outro', 'interaction', 'selfpromo', 'preview', 'music_offtopic', 'poi_highlight'],
  youtubePreferredQuality: '1080p',
  sportsEnabled: false,
  sportsDbApiKey: '',
  sportsSelected: [],
  introDbApiKey: '',
  remoteMapping: {} as Record<string, string>,

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
  setMaxTorrentSize: (size) => { set({ maxTorrentSize: size }); get().saveToDisk() },
  setKeyboardNavEnabled: (enabled) => set({ keyboardNavEnabled: enabled }),
  setPreferredLanguages: (languages) => set({ preferredLanguages: languages }),
  setPreferredResolutions: (resolutions) => set({ preferredResolutions: resolutions }),
  setEnabledIndexers: (ids) => { set({ enabledIndexers: ids }); get().saveToDisk() },
  setCustomIndexers: (indexers) => { set({ customIndexers: indexers }); get().saveToDisk() },
  setYoutubeCookiesPath: (path) => { set({ youtubeCookiesPath: path }); get().saveToDisk() },
  setSponsorBlockEnabled: (enabled) => { set({ sponsorBlockEnabled: enabled }); get().saveToDisk() },
  setSponsorBlockCategories: (categories) => { set({ sponsorBlockCategories: categories }); get().saveToDisk() },
  setYoutubePreferredQuality: (quality) => { set({ youtubePreferredQuality: quality }); get().saveToDisk() },
  setSportsEnabled: (enabled) => { set({ sportsEnabled: enabled }); get().saveToDisk() },
  setSportsDbApiKey: (key) => { set({ sportsDbApiKey: key }); get().saveToDisk() },
  setSportsSelected: (sports) => { set({ sportsSelected: sports }); get().saveToDisk() },
  setIntroDbApiKey: (key: string) => { set({ introDbApiKey: key }); get().saveToDisk() },
  setRemoteMapping: (mapping: Record<string, string>) => { set({ remoteMapping: mapping }); get().saveToDisk() },

  loadFromDisk: async () => {
    try {
      const settings = await window.api.settings.getAll()
      if (settings) set(settings as Partial<SettingsState>)
      const tokens = await window.api.trakt.getTokens()
      if (tokens?.accessToken) set({ traktConnected: true })
      const rdKey = await window.api.settings.get('realDebridApiKey')
      if (rdKey) set({ realDebridConnected: true })
      const tbKey = await window.api.settings.get('torboxApiKey')
      if (tbKey) set({ torboxConnected: true })
      const pmToken = await window.api.settings.get('premiumizeAccessToken')
      if (pmToken) set({ premiumizeConnected: true })
      const adToken = await window.api.settings.get('alldebridAccessToken')
      if (adToken) set({ alldebridConnected: true })
      const enabled = await window.api.settings.get('enabledIndexers')
      if (!Array.isArray(enabled)) set({ enabledIndexers: DEFAULT_ENABLED_INDEXERS })
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
        window.api.settings.set('maxTorrentSize', state.maxTorrentSize),
        window.api.settings.set('keyboardNavEnabled', state.keyboardNavEnabled),
        window.api.settings.set('preferredLanguages', state.preferredLanguages),
        window.api.settings.set('preferredResolutions', state.preferredResolutions),
        window.api.settings.set('enabledIndexers', state.enabledIndexers),
        window.api.settings.set('customIndexers', state.customIndexers),
        window.api.settings.set('youtubeCookiesPath', state.youtubeCookiesPath),
        window.api.settings.set('sponsorBlockEnabled', state.sponsorBlockEnabled),
        window.api.settings.set('sponsorBlockCategories', state.sponsorBlockCategories),
        window.api.settings.set('youtubePreferredQuality', state.youtubePreferredQuality),
        window.api.settings.set('sportsEnabled', state.sportsEnabled),
        window.api.settings.set('sportsDbApiKey', state.sportsDbApiKey),
        window.api.settings.set('sportsSelected', state.sportsSelected),
        window.api.settings.set('introDbApiKey', state.introDbApiKey),
        window.api.settings.set('remoteMapping', state.remoteMapping),
      ])
    } catch { /* ignore */ }
  },
}))
