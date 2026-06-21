import { create } from 'zustand'

interface SettingsState {
  tmdbApiKey: string
  traktConnected: boolean
  realDebridApiKey: string
  torboxApiKey: string
  preferredDebrid: string | null
  downloadPath: string
  autoPlayNext: boolean
  keyboardNavEnabled: boolean

  setTmdbApiKey: (key: string) => void
  setTraktConnected: (connected: boolean) => void
  setRealDebridApiKey: (key: string) => void
  setTorboxApiKey: (key: string) => void
  setPreferredDebrid: (service: string | null) => void
  setDownloadPath: (path: string) => void
  setAutoPlayNext: (enabled: boolean) => void
  setKeyboardNavEnabled: (enabled: boolean) => void
  loadFromDisk: () => Promise<void>
  saveToDisk: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  tmdbApiKey: '',
  traktConnected: false,
  realDebridApiKey: '',
  torboxApiKey: '',
  preferredDebrid: null,
  downloadPath: '',
  autoPlayNext: true,
  keyboardNavEnabled: true,

  setTmdbApiKey: (key) => set({ tmdbApiKey: key }),
  setTraktConnected: (connected) => set({ traktConnected: connected }),
  setRealDebridApiKey: (key) => set({ realDebridApiKey: key }),
  setTorboxApiKey: (key) => set({ torboxApiKey: key }),
  setPreferredDebrid: (service) => set({ preferredDebrid: service }),
  setDownloadPath: (path) => set({ downloadPath: path }),
  setAutoPlayNext: (enabled) => set({ autoPlayNext: enabled }),
  setKeyboardNavEnabled: (enabled) => set({ keyboardNavEnabled: enabled }),

  loadFromDisk: async () => {
    try {
      const settings = await window.api.settings.getAll()
      if (settings) set(settings as Partial<SettingsState>)
    } catch { /* ignore */ }
  },

  saveToDisk: async () => {
    try {
      const state = get()
      await Promise.all([
        window.api.settings.set('tmdbApiKey', state.tmdbApiKey),
        window.api.settings.set('traktConnected', state.traktConnected),
        window.api.settings.set('realDebridApiKey', state.realDebridApiKey),
        window.api.settings.set('torboxApiKey', state.torboxApiKey),
        window.api.settings.set('preferredDebrid', state.preferredDebrid),
        window.api.settings.set('downloadPath', state.downloadPath),
        window.api.settings.set('autoPlayNext', state.autoPlayNext),
        window.api.settings.set('keyboardNavEnabled', state.keyboardNavEnabled),
      ])
    } catch { /* ignore */ }
  },
}))
