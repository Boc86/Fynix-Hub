import { create } from 'zustand'

interface SettingsState {
  tmdbApiKey: string
  traktClientId: string
  traktClientSecret: string
  traktAccessToken: string | null
  traktRefreshToken: string | null
  traktConnected: boolean
  realDebridApiKey: string
  torboxApiKey: string
  preferredDebrid: string | null
  downloadPath: string
  autoPlayNext: boolean
  keyboardNavEnabled: boolean

  setTmdbApiKey: (key: string) => void
  setTraktClientId: (id: string) => void
  setTraktClientSecret: (secret: string) => void
  setTraktTokens: (access: string | null, refresh: string | null) => void
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
  traktClientId: '',
  traktClientSecret: '',
  traktAccessToken: null,
  traktRefreshToken: null,
  traktConnected: false,
  realDebridApiKey: '',
  torboxApiKey: '',
  preferredDebrid: null,
  downloadPath: '',
  autoPlayNext: true,
  keyboardNavEnabled: true,

  setTmdbApiKey: (key) => set({ tmdbApiKey: key }),
  setTraktClientId: (id) => set({ traktClientId: id }),
  setTraktClientSecret: (secret) => set({ traktClientSecret: secret }),
  setTraktTokens: (access, refresh) => set({ traktAccessToken: access, traktRefreshToken: refresh }),
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
      if (settings) set(settings as SettingsState)
    } catch { /* ignore */ }
  },

  saveToDisk: async () => {
    try {
      const state = get()
      await window.api.settings.set('all', state)
    } catch { /* ignore */ }
  },
}))
