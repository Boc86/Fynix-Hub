import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import type { CustomIndexer } from '../../../main/services/torrent-search.service'
import type { SportarrSport } from '../../types.d'
import Prompt, { Confirm } from '../Prompt/Prompt'
import ChannelSelector from './ChannelSelector'
import NetworkAccessSection from './NetworkAccessSection'
import styles from './Settings.module.css'

interface BuiltInDefinition {
  id: string
  name: string
  type: string
}

interface CatalogEntry {
  id: string
  name: string
  description: string
  url: string
  language: string
  type: string
  protocol: string
}

interface SettingsProps {
  onClose: () => void
  initialOpen?: boolean
}

type SettingsTab = 'general' | 'search' | 'connections' | 'torrents' | 'usenet' | 'youtube' | 'sports' | 'live-tv' | 'profiles' | 'advanced' | 'remote' | 'network'

const TABS: Array<{ id: SettingsTab; label: string; shortcut: string }> = [
  { id: 'general', label: 'General', shortcut: '1' },
  { id: 'search', label: 'Search', shortcut: '2' },
  { id: 'connections', label: 'Connections', shortcut: '3' },
  { id: 'torrents', label: 'Torrents', shortcut: '4' },
  { id: 'usenet', label: 'Usenet', shortcut: '5' },
  { id: 'youtube', label: 'YouTube', shortcut: '6' },
  { id: 'sports', label: 'Sports', shortcut: '7' },
  { id: 'live-tv', label: 'Live TV', shortcut: '8' },
  { id: 'profiles', label: 'Profiles', shortcut: '9' },
  { id: 'advanced', label: 'Advanced', shortcut: '' },
  { id: 'remote', label: 'Remote', shortcut: '' },
  { id: 'network', label: 'Network Access', shortcut: '' },
]

export default function Settings({ onClose }: SettingsProps) {
  const store = useSettingsStore()
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [localTmdb, setLocalTmdb] = useState(store.tmdbApiKey)
  const [localFanart, setLocalFanart] = useState(store.fanartApiKey)
  const [localRes, setLocalRes] = useState<string[]>(store.preferredResolutions)
  const [localIntroDb, setLocalIntroDb] = useState(store.introDbApiKey)
  const [localOpensubtitlesApiKey, setLocalOpensubtitlesApiKey] = useState(store.opensubtitlesApiKey)
  const [localRemoteMapping, setLocalRemoteMapping] = useState<Record<string, string>>(store.remoteMapping || {} as Record<string, string>)
  const [localLiveTvCountries, setLocalLiveTvCountries] = useState<string[]>(store.selectedLiveTvCountries)
  const [availableCountries, setAvailableCountries] = useState<{ code: string; name: string; flag: string; count: number }[]>([])
  const [countriesLoading, setCountriesLoading] = useState(false)
  const [localEnableUsenet, setLocalEnableUsenet] = useState(store.usenetEnabled)
  const [localNzbgetHost, setLocalNzbgetHost] = useState(store.nzbgetHost)
  const [localNzbgetPort, setLocalNzbgetPort] = useState(store.nzbgetPort)
  const [localNzbgetUsername, setLocalNzbgetUsername] = useState(store.nzbgetUsername)
  const [localNzbgetPassword, setLocalNzbgetPassword] = useState(store.nzbgetPassword)
  const [localNzbgetDownloadDir, setLocalNzbgetDownloadDir] = useState(store.nzbgetDownloadDir)
  const [localAutoDeleteUsenet, setLocalAutoDeleteUsenet] = useState(store.autoDeleteUsenet)
  const [localEnabledUsenetIndexers, setLocalEnabledUsenetIndexers] = useState<string[]>(store.enabledUsenetIndexers)
  const [localCustomUsenetIndexers, setLocalCustomUsenetIndexers] = useState<any[]>(store.customUsenetIndexers)
  const [newUsenetCustom, setNewUsenetCustom] = useState({ name: '', url: '', apiKey: '' })
  const [capturingKey, setCapturingKey] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [trackerRefreshState, setTrackerRefreshState] = useState<'idle' | 'refreshing' | 'done' | 'error'>('idle')
  const [trackerRefreshCount, setTrackerRefreshCount] = useState(0)
  const [trackerRefreshError, setTrackerRefreshError] = useState('')
  const [clearCacheState, setClearCacheState] = useState<'idle' | 'clearing' | 'done' | 'error'>('idle')
  const [torrentCacheState, setTorrentCacheState] = useState<'idle' | 'clearing' | 'done' | 'error'>('idle')
  const [torrentCacheStatus, setTorrentCacheStatus] = useState<{ count: number; sizeGb: string } | null>(null)
  const [tizentubeVersion, setTizentubeVersion] = useState<string | null>(null)
  const [tizentubeStatus, setTizentubeStatus] = useState<string>('')
  const [tizentubeUpdating, setTizentubeUpdating] = useState(false)

  const [builtInIndexers, setBuiltInIndexers] = useState<BuiltInDefinition[]>([])
  const [localEnabledIndexers, setLocalEnabledIndexers] = useState<string[]>(store.enabledIndexers)
  const [localCustomIndexers, setLocalCustomIndexers] = useState<CustomIndexer[]>(store.customIndexers)
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [catalogLastUpdated, setCatalogLastUpdated] = useState<number | null>(null)
  const [catalogRefreshState, setCatalogRefreshState] = useState<'idle' | 'refreshing' | 'done' | 'error'>('idle')
  const [catalogError, setCatalogError] = useState('')
  const [newCustom, setNewCustom] = useState({ name: '', url: '', apiKey: '' })
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null)
  const [sportsList, setSportsList] = useState<SportarrSport[]>([])
  const [addProfilePromptOpen, setAddProfilePromptOpen] = useState(false)
  const [deleteProfileConfirm, setDeleteProfileConfirm] = useState<string | null>(null)
  const [debridStatuses, setDebridStatuses] = useState<Record<string, { valid: boolean; expiry?: string; error?: string }>>({})
  const [usenetConnStatus, setUsenetConnStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle')
  const [usenetConnError, setUsenetConnError] = useState('')
  const [completedDownloads, setCompletedDownloads] = useState<any[]>([])
  const [completedDownloadsState, setCompletedDownloadsState] = useState<'idle' | 'loading' | 'error'>('idle')

  const resolutions = ['4K', '1080p', '720p', '480p']

  const contentRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)

  // Auto-focus first interactive element (excluding tab bar) on mount
  useEffect(() => {
    setTimeout(() => {
      const all = settingsRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
      )
      if (!all) return
      for (const el of all) {
        if (!el.closest(`.${styles.tabBar}`)) {
          el.focus()
          break
        }
      }
    }, 100)
  }, [])

  // Load TizenTube version on mount
  useEffect(() => {
    window.api.tizentube.getVersion().then(v => {
      if (v) setTizentubeVersion(v)
    }).catch(() => {})
  }, [])

  // Load torrent cache status on mount
  useEffect(() => {
    window.api.localCache.status().then(st => {
      setTorrentCacheStatus(st)
    }).catch(() => {})
  }, [])

  // Load sports list when sports tab is opened
  useEffect(() => {
    if (activeTab === 'connections') {
      window.api.debrid.checkAllAccountStatus().then((s: Record<string, { valid: boolean; expiry?: string; error?: string }>) => {
        setDebridStatuses(s)
      }).catch(() => {})
    }
    if (activeTab === 'sports' && sportsList.length === 0) {
      window.api.sports.getSportsList().then((list: SportarrSport[]) => {
        setSportsList(list)
      }).catch(() => {})
    }
    if (activeTab === 'usenet' && localEnableUsenet) {
      setCompletedDownloadsState('loading')
      window.api.usenet.listDownloads().then(downloads => {
        setCompletedDownloads(downloads.filter((d: any) => d.status === 'completed'))
        setCompletedDownloadsState('idle')
      }).catch(() => {
        setCompletedDownloadsState('error')
      })
    }
  }, [activeTab, localEnableUsenet])

  // Sync localLiveTvCountries with store changes
  useEffect(() => {
    setLocalLiveTvCountries(store.selectedLiveTvCountries)
  }, [store.selectedLiveTvCountries])

  // Fetch available countries from API when Live TV tab opens
  useEffect(() => {
    if (activeTab !== 'live-tv') return
    if (!store.liveTvEnabled) return
    setCountriesLoading(true)
    window.api.damiTv.getAvailableCountries().then(countries => {
      setAvailableCountries(countries || [])
      setCountriesLoading(false)
    }).catch(() => {
      setAvailableCountries([])
      setCountriesLoading(false)
    })
  }, [activeTab, store.liveTvUser, store.liveTvPlan, store.liveTvEnabled])

  const captureKey = (action: string) => {
    setCapturingKey(action)
    setTimeout(() => setCapturingKey(null), 5000)
  }

  useEffect(() => {
    if (!capturingKey) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      setLocalRemoteMapping((prev) => ({ ...prev, [capturingKey]: e.code }))
      setCapturingKey(null)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [capturingKey])

  const toggleRes = (res: string) => {
    setLocalRes(prev => prev.includes(res) ? prev.filter(r => r !== res) : [...prev, res])
  }

  useEffect(() => {
    window.api.indexerCatalog.getBuiltIns().then(setBuiltInIndexers).catch(() => setBuiltInIndexers([]))
    window.api.indexerCatalog.get().then(({ catalog, lastUpdated }) => {
      setCatalog(catalog || [])
      setCatalogLastUpdated(lastUpdated || null)
    }).catch(() => setCatalog([]))
  }, [])

  const toggleBuiltIn = (id: string) => {
    setLocalEnabledIndexers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }

  const addCustomIndexer = () => {
    const { name, url, apiKey } = newCustom
    if (!name.trim() || !url.trim() || !apiKey.trim()) return
    const indexer: CustomIndexer = {
      id: generateId(),
      name: name.trim(),
      url: url.trim(),
      apiKey: apiKey.trim(),
      enabled: true,
    }
    setLocalCustomIndexers(prev => [...prev, indexer])
    setNewCustom({ name: '', url: '', apiKey: '' })
  }

  const updateCustomIndexer = (id: string, patch: Partial<CustomIndexer>) => {
    setLocalCustomIndexers(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
  }

  const removeCustomIndexer = (id: string) => {
    setLocalCustomIndexers(prev => prev.filter(i => i.id !== id))
  }

  const [mdblistAuthState, setMdblistAuthState] = useState<'idle' | 'connecting' | 'waiting' | 'connected' | 'error'>('idle')
  const [mdblistUserCode, setMdblistUserCode] = useState('')
  const [mdblistAuthError, setMdblistAuthError] = useState('')
  const [mdblistUserName, setMdblistUserName] = useState('')

  const [rdAuthState, setRdAuthState] = useState<'idle' | 'waiting' | 'connected' | 'error'>('idle')
  const [rdUserCode, setRdUserCode] = useState('')
  const [rdAuthError, setRdAuthError] = useState('')

  const [tbAuthState, setTbAuthState] = useState<'idle' | 'waiting' | 'connected' | 'error'>('idle')
  const [tbUserCode, setTbUserCode] = useState('')
  const [tbDeviceCode, setTbDeviceCode] = useState('')
  const [tbVerificationUrl, setTbVerificationUrl] = useState('')
  const [tbInterval, setTbInterval] = useState(5)
  const [tbManualKey, setTbManualKey] = useState('')
  const [tbShowManual, setTbShowManual] = useState(false)
  const [tbAuthError, setTbAuthError] = useState('')
  const tbPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [pmAuthState, setPmAuthState] = useState<'idle' | 'waiting' | 'connected' | 'error'>('idle')
  const [pmUserCode, setPmUserCode] = useState('')
  const [pmAuthError, setPmAuthError] = useState('')

  const [adAuthState, setAdAuthState] = useState<'idle' | 'waiting' | 'connected' | 'error'>('idle')
  const [adUserCode, setAdUserCode] = useState('')
  const [adAuthError, setAdAuthError] = useState('')

  useEffect(() => {
    return () => {
      if (tbPollRef.current) {
        clearInterval(tbPollRef.current)
        tbPollRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (store.mdblistConnected) {
      setMdblistAuthState('connected')
      window.api.mdblist.getSettings().then((s: any) => {
        if (s?.username) setMdblistUserName(s.username)
      }).catch(() => {})
    }
  }, [store.mdblistConnected])

  const startMdblistAuth = useCallback(async () => {
    setMdblistAuthState('connecting')
    setMdblistAuthError('')

    try {
      const code = await window.api.mdblist.getDeviceCode()
      setMdblistUserCode(code.user_code)
      setMdblistAuthState('waiting')
      pollMdblistToken(code.device_code, code.interval || 5)
    } catch (err: any) {
      setMdblistAuthError(err.message || 'Failed to connect')
      setMdblistAuthState('error')
    }
  }, [store])

  const pollMdblistToken = useCallback(async (code: string, interval: number) => {
    const maxAttempts = Math.floor(600 / interval)
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, interval * 1000))
      try {
        const result = await window.api.mdblist.pollForToken(code)
        if (result.access_token) {
          await window.api.mdblist.setTokens(result.access_token, result.refresh_token)
          const activeId = useSettingsStore.getState().activeProfileId
          if (activeId) {
            useSettingsStore.getState().updateProfile(activeId, {
              mdblistAccessToken: result.access_token,
              mdblistRefreshToken: result.refresh_token
            })
          }
          store.setMdblistConnected(true)
          setMdblistAuthState('connected')
          window.api.mdblist.getSettings().then((s: any) => {
            if (s?.username) setMdblistUserName(s.username)
          }).catch(() => {})
          return
        }
      } catch (err: any) {
        setMdblistAuthError(err.message || 'Authentication failed')
        setMdblistAuthState('error')
        return
      }
    }
    setMdblistAuthError('Code expired. Try again.')
    setMdblistAuthState('error')
  }, [store])

  const disconnectMdblist = useCallback(async () => {
    await window.api.mdblist.setTokens(null, null)
    const activeId = useSettingsStore.getState().activeProfileId
    if (activeId) {
      useSettingsStore.getState().updateProfile(activeId, {
        mdblistAccessToken: undefined,
        mdblistRefreshToken: undefined
      })
    }
    store.setMdblistConnected(false)
    setMdblistAuthState('idle')
    setMdblistUserCode('')
  }, [store])

  const handleSave = async () => {
      await Promise.all([
        window.api.settings.set('tmdbApiKey', localTmdb),
        window.api.settings.set('fanartApiKey', localFanart),
        window.api.settings.set('preferredResolutions', localRes),
        window.api.settings.set('enabledIndexers', localEnabledIndexers),
        window.api.settings.set('customIndexers', localCustomIndexers),
        window.api.settings.set('introDbApiKey', localIntroDb),
        window.api.settings.set('opensubtitlesApiKey', localOpensubtitlesApiKey),
        window.api.settings.set('usenetEnabled', localEnableUsenet),
        window.api.settings.set('nzbgetHost', localNzbgetHost),
        window.api.settings.set('nzbgetPort', String(localNzbgetPort)),
        window.api.settings.set('nzbgetUsername', localNzbgetUsername),
        window.api.settings.set('nzbgetPassword', localNzbgetPassword),
        window.api.settings.set('enabledUsenetIndexers', localEnabledUsenetIndexers),
        window.api.settings.set('customUsenetIndexers', localCustomUsenetIndexers),
      ])
      store.setTmdbApiKey(localTmdb)
      store.setFanartApiKey(localFanart)
      store.setPreferredResolutions(localRes)
      store.setEnabledIndexers(localEnabledIndexers)
      store.setCustomIndexers(localCustomIndexers)
      store.setIntroDbApiKey(localIntroDb)
      store.setOpensubtitlesApiKey(localOpensubtitlesApiKey)
      store.setUsenetEnabled(localEnableUsenet)
      store.setNzbgetHost(localNzbgetHost)
      store.setNzbgetPort(localNzbgetPort)
      store.setNzbgetUsername(localNzbgetUsername)
      store.setNzbgetPassword(localNzbgetPassword)
      store.setEnabledUsenetIndexers(localEnabledUsenetIndexers)
      store.setCustomUsenetIndexers(localCustomUsenetIndexers)
      await store.saveToDisk()
      store.setRemoteMapping(localRemoteMapping)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // Window-level keydown handler so arrow keys work even when focus is inside inputs
  useEffect(() => {
    function getFocusable() {
      if (!settingsRef.current) return [] as HTMLElement[]
      const all = settingsRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
      )
      // Exclude tab bar buttons from up/down navigation
      return Array.from(all).filter(el => !el.closest(`.${styles.tabBar}`))
    }

    function focusTabBar() {
      settingsRef.current?.querySelector<HTMLElement>(`.${styles.tab}.${styles.active}`)?.focus()
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (addProfilePromptOpen || deleteProfileConfirm) return
      
      const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)

      let newTab: SettingsTab | null = null

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || (e.key >= '0' && e.key <= '9')) {
        if (isTyping) return
        e.preventDefault()
        if (e.key === 'ArrowRight') {
          const currentIndex = TABS.findIndex(t => t.id === activeTab)
          const nextIndex = (currentIndex + 1) % TABS.length
          newTab = TABS[nextIndex].id
        } else if (e.key === 'ArrowLeft') {
          const currentIndex = TABS.findIndex(t => t.id === activeTab)
          const prevIndex = (currentIndex - 1 + TABS.length) % TABS.length
          newTab = TABS[prevIndex].id
        } else {
          const num = parseInt(e.key) - 1
          const tabIndex = num
          if (tabIndex < TABS.length && TABS[tabIndex].shortcut === e.key) {
            newTab = TABS[tabIndex].id
          }
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        const focusable = getFocusable()
        if (focusable.length === 0) return
        // Check if focus is in the tab bar
        const inTabBar = !!settingsRef.current?.querySelector(`.${styles.tabBar}`)?.contains(document.activeElement)
        if (inTabBar) {
          focusable[0]?.focus()
          return
        }
        if (!settingsRef.current?.contains(document.activeElement)) {
          focusable[0]?.focus()
          return
        }
        const current = document.activeElement
        let idx = focusable.indexOf(current as HTMLElement)
        if (idx === -1) idx = focusable.findIndex(el => el.contains(current))
        focusable[(idx + 1) % focusable.length]?.focus()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (!settingsRef.current?.contains(document.activeElement)) return
        const focusable = getFocusable()
        if (focusable.length === 0) return
        const current = document.activeElement
        let idx = focusable.indexOf(current as HTMLElement)
        if (idx === -1) idx = focusable.findIndex(el => el.contains(current))
        if (idx <= 0) {
          focusTabBar()
        } else {
          focusable[(idx - 1 + focusable.length) % focusable.length]?.focus()
        }
      }

      if (newTab) {
        setActiveTab(newTab)
        // Keep focus on the newly activated tab button
        setTimeout(() => {
          settingsRef.current?.querySelector<HTMLElement>(`.${styles.tab}[data-tab="${newTab}"]`)?.focus()
        }, 0)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTab, addProfilePromptOpen, deleteProfileConfirm])

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div className={styles.tabContent}>
            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>TMDB API</h3>
              <p className={styles.settingDesc}>API key for movie and TV metadata</p>
              <input
                type="password"
                className={styles.input}
                placeholder="Enter TMDB API Key"
                value={localTmdb}
                onChange={(e) => setLocalTmdb(e.target.value)}
              />
            </div>

             <div className={styles.settingGroup}>
               <h3 className={styles.settingTitle}>Fanart.tv API</h3>
               <p className={styles.settingDesc}>API key for clearlogo artwork on hero banners and player overlays</p>
               <input
                 type="password"
                 className={styles.input}
                 placeholder="Enter Fanart.tv API Key"
                 value={localFanart}
                 onChange={(e) => setLocalFanart(e.target.value)}
               />
             </div>
 
             <div className={styles.settingGroup}>
               <h3 className={styles.settingTitle}>IntroDB API</h3>
               <p className={styles.settingDesc}>API key for automatically skipping intros and recaps in TV shows</p>
               <input
                 type="password"
                 className={styles.input}
                 placeholder="Enter IntroDB API Key"
                 value={localIntroDb}
                 onChange={(e) => setLocalIntroDb(e.target.value)}
               />
              </div>

               <div className={styles.settingGroup}>
                 <h3 className={styles.settingTitle}>OpenSubtitles API</h3>
                 <p className={styles.settingDesc}>API key for downloading subtitles from OpenSubtitles</p>
                 <input
                   type="password"
                   className={styles.input}
                   placeholder="Enter OpenSubtitles API Key"
                   value={localOpensubtitlesApiKey}
                   onChange={(e) => setLocalOpensubtitlesApiKey(e.target.value)}
                 />
                 <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                   <label className={styles.settingDesc} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                     <input
                       type="checkbox"
                       checked={store.opensubtitlesForcedOnly}
                       onChange={(e) => store.setOpensubtitlesForcedOnly(e.target.checked)}
                     />
                     Forced-only subtitles (only foreign dialogue)
                   </label>
                 </div>
                 </div>

                 <div className={styles.settingGroup}>
                   <h3 className={styles.settingTitle}>Classification Country</h3>
                   <p className={styles.settingDesc}>Country code used for age classification ratings (e.g. US, GB, DE, FR)</p>
                   <input
                     className={styles.input}
                     placeholder="US"
                     value={store.classificationCountry}
                     onChange={(e) => store.setClassificationCountry(e.target.value.toUpperCase().slice(0, 2))}
                     tabIndex={0}
                     maxLength={2}
                     style={{ width: 80, textTransform: 'uppercase' }}
                   />
                 </div>

                  <div className={styles.settingGroup}>
                   <h3 className={styles.settingTitle}>Preferred Resolutions</h3>
               <p className={styles.settingDesc}>Filter torrent results by resolution</p>
              <div className={styles.toggleGrid}>
                {resolutions.map(res => (
                  <button
                    key={res}
                    tabIndex={0}
                    className={`${styles.toggle} ${localRes.includes(res) ? styles.toggleActive : ''}`}
                    onClick={() => toggleRes(res)}
                  >
                    {res}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>Preferred Audio Language</h3>
              <p className={styles.settingDesc}>Auto-select audio track by language</p>
              <div className={styles.toggleGrid}>
                {[
                  { label: 'Default', value: '' },
                  { label: 'English', value: 'eng' },
                  { label: 'Italian', value: 'ita' },
                  { label: 'Spanish', value: 'spa' },
                  { label: 'French', value: 'fra' },
                  { label: 'German', value: 'deu' },
                  { label: 'Portuguese', value: 'por' },
                  { label: 'Japanese', value: 'jpn' },
                  { label: 'Korean', value: 'kor' },
                  { label: 'Chinese', value: 'chi' },
                  { label: 'Russian', value: 'rus' },
                  { label: 'Hindi', value: 'hin' },
                  { label: 'Arabic', value: 'ara' },
                ].map(lang => (
                  <button
                    key={lang.value}
                    tabIndex={0}
                    className={`${styles.toggle} ${store.preferredAudioLanguage === lang.value ? styles.toggleActive : ''}`}
                    onClick={() => store.setPreferredAudioLanguage(lang.value)}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>Accent Color</h3>
              <p className={styles.settingDesc}>Choose your theme accent color</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {['#FF6B00', '#E50914', '#007AFF', '#7B68EE', '#34C759', '#00B4D8', '#FFFFFF', '#FF9500'].map((c) => (
                      <button
                        key={c}
                        tabIndex={0}
                        onClick={() => store.setAccentColor(c)}
                        className={`${styles.colorCircle} ${store.accentColor === c ? styles.colorSelected : ''}`}
                        style={{
                          background: c,
                          cursor: 'pointer',
                          outline: 'none',
                        }}
                        title={c}
                      />
                ))}
              </div>
            </div>

            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>Max Download Size</h3>
              <p className={styles.settingDesc}>Skip downloads larger than this size (0 = unlimited, applies to both torrents and Usenet)</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  className={styles.input}
                  style={{ width: 120, marginBottom: 0 }}
                  placeholder="GB"
                  min={0}
                  value={store.maxDownloadSize || ''}
                  onChange={(e) => store.setMaxDownloadSize(Math.max(0, parseInt(e.target.value) || 0))}
                />
                <span className={styles.settingDesc}>GB</span>
              </div>
            </div>
          </div>
        )

      case 'search':
        return (
          <div className={styles.tabContent}>
            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>Search Providers</h3>
              <p className={styles.settingDesc}>Enable or disable search sources</p>
              <div className={styles.toggleGrid}>
                <button
                  tabIndex={0}
                  className={`${styles.toggle} ${store.vylaSearchEnabled ? styles.toggleActive : ''}`}
                  onClick={() => store.setVylaSearchEnabled(!store.vylaSearchEnabled)}
                >
                  Vyla {store.vylaSearchEnabled ? 'ON' : 'OFF'}
                </button>
                <button
                  tabIndex={0}
                  className={`${styles.toggle} ${store.torrentSearchEnabled ? styles.toggleActive : ''}`}
                  onClick={() => store.setTorrentSearchEnabled(!store.torrentSearchEnabled)}
                >
                  Torrents {store.torrentSearchEnabled ? 'ON' : 'OFF'}
                </button>
                <button
                  tabIndex={0}
                  className={`${styles.toggle} ${store.usenetSearchEnabled ? styles.toggleActive : ''}`}
                  onClick={() => store.setUsenetSearchEnabled(!store.usenetSearchEnabled)}
                >
                  Usenet {store.usenetSearchEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>Auto-Play</h3>
              <p className={styles.settingDesc}>Skip selection and play the best match immediately</p>
              <div className={styles.toggleGrid}>
                <button
                  tabIndex={0}
                  className={`${styles.toggle} ${store.autoPlayTorrent ? styles.toggleActive : ''}`}
                  onClick={() => store.setAutoPlayTorrent(!store.autoPlayTorrent)}
                >
                  Auto-Play {store.autoPlayTorrent ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>Preemptive Search Termination</h3>
              <p className={styles.settingDesc}>Stop searching once a configurable number of results is found</p>
              <div className={styles.toggleGrid}>
                <button
                  tabIndex={0}
                  className={`${styles.toggle} ${store.preemptiveSearchTermination ? styles.toggleActive : ''}`}
                  onClick={() => store.setPreemptiveSearchTermination(!store.preemptiveSearchTermination)}
                >
                  Preemptive Termination {store.preemptiveSearchTermination ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            {store.autoPlayTorrent && store.preemptiveSearchTermination && (
              <>
                <div className={styles.settingGroup}>
                  <h3 className={styles.settingTitle}>Search Limits</h3>
                  <p className={styles.settingDesc} style={{ marginBottom: 4 }}>Max results per provider before stopping</p>
                  <div className={styles.searchLimitRow}>
                    <div className={styles.searchLimitField}>
                      <label className={styles.settingDesc}>Vyla</label>
                      <input
                        tabIndex={0}
                        type="number"
                        className={styles.input}
                        min={1}
                        max={100}
                        value={store.vylaSearchLimit}
                        onChange={(e) => store.setVylaSearchLimit(Math.max(1, parseInt(e.target.value) || 5))}
                      />
                    </div>
                    <div className={styles.searchLimitField}>
                      <label className={styles.settingDesc}>Torrents</label>
                      <input
                        tabIndex={0}
                        type="number"
                        className={styles.input}
                        min={1}
                        max={100}
                        value={store.torrentSearchLimit}
                        onChange={(e) => store.setTorrentSearchLimit(Math.max(1, parseInt(e.target.value) || 10))}
                      />
                    </div>
                    <div className={styles.searchLimitField}>
                      <label className={styles.settingDesc}>Usenet</label>
                      <input
                        tabIndex={0}
                        type="number"
                        className={styles.input}
                        min={1}
                        max={100}
                        value={store.usenetSearchLimit}
                        onChange={(e) => store.setUsenetSearchLimit(Math.max(1, parseInt(e.target.value) || 5))}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )

      case 'connections':
        return (
          <div className={styles.tabContent}>
            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>MDBList</h3>
              <p className={styles.settingDesc}>Scrobble, sync watch history, and get recommendations</p>

              {mdblistAuthState === 'idle' && (
                store.mdblistConnected ? (
                  <div className={styles.connectedInfo}>
                    <p className={styles.connected}>Connected{mdblistUserName ? ` as ${mdblistUserName}` : ''}</p>
                    <button tabIndex={0} className={styles.disconnectBtn} onClick={disconnectMdblist}>
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button tabIndex={0} className={styles.connectBtn} onClick={startMdblistAuth}>
                    Connect to MDBList
                  </button>
                )
              )}

              {mdblistAuthState === 'connecting' && (
                <p className={styles.authInfo}>Connecting to MDBList...</p>
              )}

              {mdblistAuthState === 'waiting' && (
                <div className={styles.deviceAuth}>
                  <p className={styles.authInfo}>
                    Visit{' '}
                    <a href="https://mdblist.com/oauth/device/" target="_blank" rel="noreferrer">
                      mdblist.com/oauth/device
                    </a>{' '}
                    and enter the code below:
                  </p>
                  <div className={styles.userCode}>{mdblistUserCode}</div>
                  <p className={styles.authHint}>Waiting for authorization...</p>
                </div>
              )}

              {mdblistAuthState === 'connected' && (
                <div className={styles.connectedInfo}>
                  <p className={styles.connected}>
                    Connected{mdblistUserName ? ` as ${mdblistUserName}` : ''}
                  </p>
                  <button tabIndex={0} className={styles.disconnectBtn} onClick={disconnectMdblist}>
                    Disconnect
                  </button>
                </div>
              )}

              {mdblistAuthState === 'error' && (
                <div className={styles.errorBox}>
                  <p className={styles.errorText}>{mdblistAuthError}</p>
                  <button tabIndex={0} className={styles.connectBtn} onClick={() => { setMdblistAuthState('idle'); setMdblistAuthError('') }}>
                    Try Again
                  </button>
                </div>
              )}
            </div>

            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>Real-Debrid</h3>
              {rdAuthState === 'waiting' && (
                <div className={styles.deviceAuth}>
                  <p className={styles.authInfo}>
                    Visit{' '}
                    <a href="https://real-debrid.com/device" target="_blank" rel="noreferrer">
                      real-debrid.com/device
                    </a>{' '}
                    and enter the code below:
                  </p>
                  <div className={styles.userCode}>{rdUserCode}</div>
                  <p className={styles.authHint}>Waiting for authorization...</p>
                </div>
              )}
              {rdAuthState === 'error' && (
                <div className={styles.errorBox} style={{ marginBottom: 8 }}>
                  <p className={styles.errorText}>{rdAuthError}</p>
                  <button tabIndex={0} className={styles.connectBtn} onClick={() => setRdAuthState('idle')}>
                    Try Again
                  </button>
                </div>
              )}
              {rdAuthState !== 'waiting' && store.realDebridConnected ? (
                <div className={styles.connectedInfo}>
                  <p className={styles.connected}>
                    Connected{debridStatuses['real-debrid'] ? ` · ${debridStatuses['real-debrid'].valid ? (debridStatuses['real-debrid'].expiry || 'Active') : 'Expired'}` : ''}
                  </p>
                  <button tabIndex={0} className={styles.disconnectBtn} onClick={async () => {
                    await window.api.settings.set('realDebridApiKey', null)
                    await window.api.settings.set('realDebridRefreshToken', null)
                    await window.api.settings.set('realDebridClientId', null)
                    await window.api.settings.set('realDebridClientSecret', null)
                    store.setRealDebridApiKey('')
                    store.setRealDebridConnected(false)
                  }}>
                    Disconnect
                  </button>
                </div>
              ) : rdAuthState === 'idle' && (
                <button tabIndex={0} className={styles.connectBtn} onClick={async () => {
                  try {
                    const code = await window.api.debrid.realDebridGetDeviceCode()
                    setRdUserCode(code.user_code)
                    setRdAuthState('waiting')
                    const maxAttempts = Math.floor(code.expires_in / (code.interval || 5))
                    for (let i = 0; i < maxAttempts; i++) {
                      await new Promise(r => setTimeout(r, (code.interval || 5) * 1000))
                      const accessToken = await window.api.debrid.realDebridPollForCredentials(code.device_code)
                      if (accessToken) {
                        await window.api.settings.set('realDebridApiKey', accessToken)
                        store.setRealDebridApiKey(accessToken)
                        store.setRealDebridConnected(true)
                        setRdAuthState('connected')
                        return
                      }
                    }
                    setRdAuthError('Code expired. Try again.')
                    setRdAuthState('error')
                  } catch (err: any) {
                    setRdAuthError(err.message || 'Failed to connect')
                    setRdAuthState('error')
                  }
                }}>
                  Connect to Real-Debrid
                </button>
              )}
            </div>

            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>TorBox</h3>
              {tbAuthState === 'waiting' && (
                <div className={styles.deviceAuth}>
                  <p className={styles.authInfo}>
                    Visit{' '}
                    <a href={tbVerificationUrl} target="_blank" rel="noreferrer">
                      {tbVerificationUrl || 'torbox.app/oauth/device'}
                    </a>{' '}
                    and enter code:
                  </p>
                  <p className={styles.userCode}>{tbUserCode}</p>
                  <p className={styles.authInfo}>Waiting for authorization...</p>
                  <button tabIndex={0} className={styles.disconnectBtn} onClick={() => {
                    if (tbPollRef.current) {
                      clearInterval(tbPollRef.current)
                      tbPollRef.current = null
                    }
                    setTbAuthState('idle')
                  }}>
                    Cancel
                  </button>
                </div>
              )}
              {tbAuthState === 'error' && (
                <div className={styles.errorBox} style={{ marginBottom: 8 }}>
                  <p className={styles.errorText}>{tbAuthError}</p>
                  <button tabIndex={0} className={styles.connectBtn} onClick={() => setTbAuthState('idle')}>
                    Try Again
                  </button>
                </div>
              )}
              {tbShowManual && tbAuthState !== 'waiting' && (
                <div>
                  <p className={styles.authInfo}>
                    Paste your TorBox API key manually:
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="password"
                      className={styles.input}
                      style={{ marginBottom: 0, flex: 1 }}
                      placeholder="TorBox API Key"
                      value={tbManualKey}
                      onChange={(e) => setTbManualKey(e.target.value)}
                    />
                    <button tabIndex={0} className={styles.connectBtn} onClick={async () => {
                      if (!tbManualKey.trim()) return
                      await window.api.settings.set('torboxApiKey', tbManualKey.trim())
                      store.setTorboxApiKey(tbManualKey.trim())
                      store.setTorboxConnected(true)
                      setTbAuthState('connected')
                      setTbShowManual(false)
                      setTbManualKey('')
                    }}>
                      Save
                    </button>
                  </div>
                  <button tabIndex={0} className={styles.disconnectBtn} style={{ marginTop: 8 }} onClick={() => setTbShowManual(false)}>
                    Cancel
                  </button>
                </div>
              )}
              {tbAuthState !== 'waiting' && store.torboxConnected ? (
                <div className={styles.connectedInfo}>
                  <p className={styles.connected}>
                    Connected{debridStatuses['torbox'] ? ` · ${debridStatuses['torbox'].valid ? (debridStatuses['torbox'].expiry || 'Active') : 'Expired'}` : ''}
                  </p>
                  <button tabIndex={0} className={styles.disconnectBtn} onClick={async () => {
                    if (tbPollRef.current) {
                      clearInterval(tbPollRef.current)
                      tbPollRef.current = null
                    }
                    await window.api.settings.set('torboxApiKey', null)
                    store.setTorboxApiKey('')
                    store.setTorboxConnected(false)
                    setTbAuthState('idle')
                  }}>
                    Disconnect
                  </button>
                </div>
              ) : tbAuthState === 'idle' && !tbShowManual && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                  <button tabIndex={0} className={styles.connectBtn} onClick={async () => {
                    try {
                      const result = await window.api.debrid.torboxGetDeviceCode()
                      setTbDeviceCode(result.device_code)
                      setTbUserCode(result.user_code)
                      setTbVerificationUrl(result.verification_url)
                      setTbInterval(result.interval || 5)
                      setTbAuthState('waiting')
                      // Removed window.open(result.verification_url, '_blank') to prevent unwanted popups
                      const expiresAt = result.expires_at ? new Date(result.expires_at).getTime() : Date.now() + 600000
                      if (tbPollRef.current) clearInterval(tbPollRef.current)
                      tbPollRef.current = setInterval(async () => {
                        try {
                          const token = await window.api.debrid.torboxPollForToken(result.device_code)
                          if (token) {
                            if (tbPollRef.current) clearInterval(tbPollRef.current)
                            tbPollRef.current = null
                            await window.api.settings.set('torboxApiKey', token)
                            store.setTorboxApiKey(token)
                            store.setTorboxConnected(true)
                            setTbAuthState('connected')
                          }
                        } catch (err: any) {
                          if (tbPollRef.current) clearInterval(tbPollRef.current)
                          tbPollRef.current = null
                          setTbAuthError(err.message || 'Failed')
                          setTbAuthState('error')
                        }
                        if (Date.now() > expiresAt) {
                          if (tbPollRef.current) clearInterval(tbPollRef.current)
                          tbPollRef.current = null
                          setTbAuthError('Code expired. Try again.')
                          setTbAuthState('error')
                        }
                      }, (result.interval || 5) * 1000)
                    } catch (err: any) {
                      setTbAuthError(err.message || 'Failed')
                      setTbAuthState('error')
                    }
                  }}>
                    Connect to TorBox
                  </button>
                  <button tabIndex={0} className={styles.linkBtn} onClick={() => setTbShowManual(true)}>
                    Enter API key manually
                  </button>
                </div>
              )}
            </div>

            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>Premiumize</h3>
              {pmAuthState === 'waiting' && (
                <div className={styles.deviceAuth}>
                  <p className={styles.authInfo}>
                    Visit{' '}
                    <a href="https://www.premiumize.me/device" target="_blank" rel="noreferrer">
                      premiumize.me/device
                    </a>{' '}
                    and enter the code below:
                  </p>
                  <div className={styles.userCode}>{pmUserCode}</div>
                  <p className={styles.authHint}>Waiting for authorization...</p>
                </div>
              )}
              {pmAuthState === 'error' && (
                <div className={styles.errorBox} style={{ marginBottom: 8 }}>
                  <p className={styles.errorText}>{pmAuthError}</p>
                  <button tabIndex={0} className={styles.connectBtn} onClick={() => setPmAuthState('idle')}>
                    Try Again
                  </button>
                </div>
              )}
              {pmAuthState !== 'waiting' && store.premiumizeConnected ? (
                <div className={styles.connectedInfo}>
                  <p className={styles.connected}>
                    Connected{debridStatuses['premiumize'] ? ` · ${debridStatuses['premiumize'].valid ? (debridStatuses['premiumize'].expiry || 'Active') : 'Expired'}` : ''}
                  </p>
                  <button tabIndex={0} className={styles.disconnectBtn} onClick={async () => {
                    await window.api.settings.set('premiumizeAccessToken', null)
                    store.setPremiumizeConnected(false)
                  }}>
                    Disconnect
                  </button>
                </div>
              ) : pmAuthState === 'idle' && (
                <button tabIndex={0} className={styles.connectBtn} onClick={async () => {
                  try {
                    const code = await window.api.debrid.premiumizeGetDeviceCode()
                    setPmUserCode(code.user_code)
                    setPmAuthState('waiting')
                    const maxAttempts = Math.floor(code.expires_in / (code.interval || 5))
                    for (let i = 0; i < maxAttempts; i++) {
                      await new Promise(r => setTimeout(r, (code.interval || 5) * 1000))
                      try {
                        const result = await window.api.debrid.premiumizePollForToken(code.device_code)
                        if (result?.access_token) {
                          await window.api.settings.set('premiumizeAccessToken', result.access_token)
                          store.setPremiumizeConnected(true)
                          setPmAuthState('connected')
                          return
                        }
                      } catch {
                        setPmAuthError('Authentication cancelled or expired')
                        setPmAuthState('error')
                        return
                      }
                    }
                    setPmAuthError('Code expired. Try again.')
                    setPmAuthState('error')
                  } catch (err: any) {
                    setPmAuthError(err.message || 'Failed to connect')
                    setPmAuthState('error')
                  }
                }}>
                  Connect to Premiumize
                </button>
              )}
            </div>

            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>AllDebrid</h3>
              {adAuthState === 'waiting' && (
                <div className={styles.deviceAuth}>
                  <p className={styles.authInfo}>
                    Visit{' '}
                    <a href="https://api.alldebrid.com/oauth/device" target="_blank" rel="noreferrer">
                      alldebrid.com/oauth/device
                    </a>{' '}
                    and enter the code below:
                  </p>
                  <div className={styles.userCode}>{adUserCode}</div>
                  <p className={styles.authHint}>Waiting for authorization...</p>
                </div>
              )}
              {adAuthState === 'error' && (
                <div className={styles.errorBox} style={{ marginBottom: 8 }}>
                  <p className={styles.errorText}>{adAuthError}</p>
                  <button tabIndex={0} className={styles.connectBtn} onClick={() => setAdAuthState('idle')}>
                    Try Again
                  </button>
                </div>
              )}
              {adAuthState !== 'waiting' && store.alldebridConnected ? (
                <div className={styles.connectedInfo}>
                  <p className={styles.connected}>
                    Connected{debridStatuses['alldebrid'] ? ` · ${debridStatuses['alldebrid'].valid ? (debridStatuses['alldebrid'].expiry || 'Active') : 'Expired'}` : ''}
                  </p>
                  <button tabIndex={0} className={styles.disconnectBtn} onClick={async () => {
                    await window.api.settings.set('alldebridAccessToken', null)
                    store.setAlldebridConnected(false)
                  }}>
                    Disconnect
                  </button>
                </div>
              ) : adAuthState === 'idle' && (
                <button tabIndex={0} className={styles.connectBtn} onClick={async () => {
                  try {
                    const info = await window.api.debrid.alldebridGetDevicePin()
                    setAdUserCode(info.user_code)
                    setAdAuthState('waiting')
                    const maxAttempts = Math.floor(info.expires_in / (info.interval || 5))
                    for (let i = 0; i < maxAttempts; i++) {
                      await new Promise(r => setTimeout(r, (info.interval || 5) * 1000))
                      try {
                        const result = await window.api.debrid.alldebridPollForToken(info.pin, info.device_id)
                        if (result?.token) {
                          await window.api.settings.set('alldebridAccessToken', result.token)
                          store.setAlldebridConnected(true)
                          setAdAuthState('connected')
                          return
                        }
                      } catch {
                        setAdAuthError('Authentication cancelled or expired')
                        setAdAuthState('error')
                        return
                      }
                    }
                    setAdAuthError('Code expired. Try again.')
                    setAdAuthState('error')
                  } catch (err: any) {
                    setAdAuthError(err.message || 'Failed to connect')
                    setAdAuthState('error')
                  }
                }}>
                  Connect to AllDebrid
                </button>
              )}
            </div>
          </div>
        )

      case 'torrents':
        return (
          <div className={styles.tabContent}>
            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>Built-in Torrent Indexers</h3>
              <p className={styles.settingDesc}>Enable or disable built-in public indexers</p>
              <div className={styles.indexerList}>
                {builtInIndexers.map(idx => (
                  <label key={idx.id} className={styles.indexerRow}>
                    <input
                      tabIndex={0}
                      type="checkbox"
                      checked={localEnabledIndexers.includes(idx.id)}
                      onChange={() => toggleBuiltIn(idx.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleBuiltIn(idx.id);
                        }
                      }}
                    />
                    <span className={styles.indexerName}>{idx.name}</span>
                    <span className={styles.indexerMeta}>{idx.type}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>Custom Torznab Indexers</h3>
              <p className={styles.settingDesc}>Add custom Torznab-compatible indexers</p>
              <div className={styles.customIndexerList}>
                {localCustomIndexers.length === 0 && (
                  <p className={styles.authHint}>No custom indexers added.</p>
                )}
                {localCustomIndexers.map(idx => (
                  <div key={idx.id} className={styles.customIndexerCard}>
                    {editingCustomId === idx.id ? (
                      <div className={styles.customIndexerForm}>
                        <input
                          tabIndex={0}
                          className={styles.input}
                          placeholder="Name"
                          value={idx.name}
                          onChange={(e) => updateCustomIndexer(idx.id, { name: e.target.value })}
                        />
                        <input
                          tabIndex={0}
                          className={styles.input}
                          placeholder="Torznab URL"
                          value={idx.url}
                          onChange={(e) => updateCustomIndexer(idx.id, { url: e.target.value })}
                        />
                        <input
                          tabIndex={0}
                          type="password"
                          className={styles.input}
                          placeholder="API Key"
                          value={idx.apiKey}
                          onChange={(e) => updateCustomIndexer(idx.id, { apiKey: e.target.value })}
                        />
                        <div className={styles.customIndexerActions}>
                          <button tabIndex={0} className={styles.connectBtn} onClick={() => setEditingCustomId(null)}>Done</button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.customIndexerRow}>
                        <label className={styles.indexerRow}>
                          <input
                            tabIndex={0}
                            type="checkbox"
                            checked={idx.enabled}
                            onChange={(e) => updateCustomIndexer(idx.id, { enabled: e.target.checked })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                updateCustomIndexer(idx.id, { enabled: !idx.enabled });
                              }
                            }}
                          />
                          <span className={styles.indexerName}>{idx.name}</span>
                          <span className={styles.indexerMeta}>{idx.url}</span>
                        </label>
                        <div className={styles.customIndexerActions}>
                          <button tabIndex={0} className={styles.linkBtn} onClick={() => setEditingCustomId(idx.id)}>Edit</button>
                          <button tabIndex={0} className={styles.disconnectBtn} onClick={() => removeCustomIndexer(idx.id)}>Remove</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className={styles.customIndexerForm}>
                <input
                  tabIndex={0}
                  className={styles.input}
                  placeholder="Name"
                  value={newCustom.name}
                  onChange={(e) => setNewCustom(prev => ({ ...prev, name: e.target.value }))}
                />
                <input
                  tabIndex={0}
                  className={styles.input}
                  placeholder="Torznab URL"
                  value={newCustom.url}
                  onChange={(e) => setNewCustom(prev => ({ ...prev, url: e.target.value }))}
                />
                <input
                  tabIndex={0}
                  type="password"
                  className={styles.input}
                  placeholder="API Key"
                  value={newCustom.apiKey}
                  onChange={(e) => setNewCustom(prev => ({ ...prev, apiKey: e.target.value }))}
                />
                <button tabIndex={0} className={styles.connectBtn} onClick={addCustomIndexer}>Add Custom Indexer</button>
              </div>
            </div>

            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>Indexer Catalog</h3>
              <p className={styles.settingDesc}>
                Reference list from Prowlarr supported indexers (metadata only).
                {catalogLastUpdated && (
                  <span> Last updated {new Date(catalogLastUpdated).toLocaleString()}.</span>
                )}
              </p>
              {catalogError && <p className={styles.errorText}>{catalogError}</p>}
              {catalogRefreshState === 'done' && <p className={styles.connected}>Catalog refreshed: {catalog.length} indexers</p>}
              <button
                tabIndex={0}
                className={styles.connectBtn}
                disabled={catalogRefreshState === 'refreshing'}
                onClick={async () => {
                  setCatalogRefreshState('refreshing')
                  setCatalogError('')
                  try {
                    const result = await window.api.indexerCatalog.refresh()
                    const { catalog: refreshed } = await window.api.indexerCatalog.get()
                    setCatalog(refreshed || [])
                    setCatalogLastUpdated(Date.now())
                    setCatalogRefreshState('done')
                  } catch (err: any) {
                    setCatalogError(err.message || 'Failed to refresh catalog')
                    setCatalogRefreshState('error')
                  }
                }}
              >
                {catalogRefreshState === 'refreshing' ? 'Refreshing...' : 'Refresh Catalog'}
              </button>
              {catalog.length > 0 && (
                <div className={styles.catalogList}>
                  {catalog.slice(0, 50).map(entry => (
                    <div key={entry.id} className={styles.catalogRow}>
                      <span className={styles.catalogName}>{entry.name}</span>
                      <span className={styles.catalogMeta}>{entry.language}</span>
                      <span className={styles.catalogMeta}>{entry.type}</span>
                      <span className={styles.catalogMeta}>{entry.protocol}</span>
                    </div>
                  ))}
                  {catalog.length > 50 && (
                    <p className={styles.authHint}>...and {catalog.length - 50} more</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )

      case 'usenet': {
        const addUsenetCustomIndexer = () => {
          const { name, url, apiKey } = newUsenetCustom
          if (!name.trim() || !url.trim()) return
          const idx = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: name.trim(),
            url: url.trim(),
            apiKey: apiKey.trim(),
            enabled: true,
            builtIn: false,
          }
          setLocalCustomUsenetIndexers(prev => [...prev, idx])
          setLocalEnabledUsenetIndexers(prev => prev.includes(idx.id) ? prev : [...prev, idx.id])
          setNewUsenetCustom({ name: '', url: '', apiKey: '' })
        }

        const removeUsenetCustomIndexer = (id: string) => {
          setLocalCustomUsenetIndexers(prev => prev.filter(i => i.id !== id))
        }

        const saveUsenetSettings = async () => {
          store.setUsenetEnabled(localEnableUsenet)
          store.setNzbgetHost(localNzbgetHost)
          store.setNzbgetPort(localNzbgetPort)
          store.setNzbgetUsername(localNzbgetUsername)
          store.setNzbgetPassword(localNzbgetPassword)
          store.setNzbgetDownloadDir(localNzbgetDownloadDir)
          store.setAutoDeleteUsenet(localAutoDeleteUsenet)
          store.setEnabledUsenetIndexers(localEnabledUsenetIndexers)
          store.setCustomUsenetIndexers(localCustomUsenetIndexers)
          await store.saveToDisk()
          await window.api.usenet.reloadConfig()
        }

        return (
          <div className={styles.tabContent}>
            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>Usenet</h3>
              <p className={styles.settingDesc}>Search and stream from Usenet newsgroups. Requires a download client.</p>
              <div className={styles.toggleGrid}>
                <button
                  tabIndex={0}
                  className={`${styles.toggle} ${localEnableUsenet ? styles.toggleActive : ''}`}
                  onClick={() => setLocalEnableUsenet(!localEnableUsenet)}
                >
                  Usenet {localEnableUsenet ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>
            </div>

            {localEnableUsenet && (
              <>
                  <div className={styles.settingGroup}>
                    <h3 className={styles.settingTitle}>NZBGet Daemon</h3>
                    <p className={styles.settingDesc}>Connect to NZBGet (running on localhost or a remote server)</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input
                        tabIndex={0}
                        type="text"
                        className={styles.input}
                        placeholder="Host (e.g. localhost)"
                        value={localNzbgetHost}
                        onChange={(e) => setLocalNzbgetHost(e.target.value)}
                      />
                      <input
                        tabIndex={0}
                        type="number"
                        className={styles.input}
                        placeholder="Port (default 6789)"
                        value={localNzbgetPort}
                        onChange={(e) => setLocalNzbgetPort(parseInt(e.target.value) || 6789)}
                      />
                      <input
                        tabIndex={0}
                        type="text"
                        className={styles.input}
                        placeholder="Username (default: nzbget)"
                        value={localNzbgetUsername}
                        onChange={(e) => setLocalNzbgetUsername(e.target.value)}
                      />
                      <input
                        tabIndex={0}
                        type="password"
                        className={styles.input}
                        placeholder="Password (default: tegbzn6789)"
                        value={localNzbgetPassword}
                        onChange={(e) => setLocalNzbgetPassword(e.target.value)}
                      />
                      <input
                        tabIndex={0}
                        type="text"
                        className={styles.input}
                        placeholder="Download directory (e.g. /home/boc/Downloads/completed)"
                        value={localNzbgetDownloadDir}
                        onChange={(e) => setLocalNzbgetDownloadDir(e.target.value)}
                      />
                    </div>

                    <label className={styles.indexerRow} style={{ marginTop: 10 }}>
                      <input
                        tabIndex={0}
                        type="checkbox"
                        checked={localAutoDeleteUsenet}
                        onChange={(e) => setLocalAutoDeleteUsenet(e.target.checked)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            e.stopPropagation()
                            setLocalAutoDeleteUsenet(!localAutoDeleteUsenet)
                          }
                        }}
                      />
                      <span>Automatically delete Usenet download after fully watching</span>
                    </label>

                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      tabIndex={0}
                      className={styles.connectBtn}
                      onClick={async () => {
                        setUsenetConnStatus('checking')
                        setUsenetConnError('')
                        await saveUsenetSettings()
                        try {
                          const result = await window.api.usenet.checkConnection()
                          setUsenetConnStatus(result.connected ? 'connected' : 'error')
                          if (!result.connected) setUsenetConnError(result.error || 'Connection failed')
                        } catch (err: any) {
                          setUsenetConnStatus('error')
                          setUsenetConnError(err?.message || 'Connection failed')
                        }
                      }}
                    >
                      {usenetConnStatus === 'checking' ? 'Testing...' : 'Test Connection'}
                    </button>
                    <button tabIndex={0} className={styles.connectBtn} onClick={saveUsenetSettings}>
                      Save
                    </button>
                  </div>
                  {usenetConnStatus === 'connected' && <p className={styles.connected}>Connected successfully</p>}
                  {usenetConnStatus === 'error' && <p className={styles.errorText}>{usenetConnError}</p>}
                </div>

                <div className={styles.settingGroup}>
                  <h3 className={styles.settingTitle}>Custom NewzNab Indexers</h3>
                  <p className={styles.settingDesc}>Add private Usenet indexers (NewzNab API compatible)</p>
                  <div className={styles.customIndexerList}>
                    {localCustomUsenetIndexers.length === 0 && (
                      <p className={styles.authHint}>No custom indexers added.</p>
                    )}
                    {localCustomUsenetIndexers.map(idx => (
                      <div key={idx.id} className={styles.customIndexerCard}>
                        <div className={styles.customIndexerRow}>
                          <label className={styles.indexerRow}>
                            <input
                              tabIndex={0}
                              type="checkbox"
                              checked={idx.enabled}
                              onChange={(e) => setLocalCustomUsenetIndexers(prev =>
                                prev.map(i => i.id === idx.id ? { ...i, enabled: e.target.checked } : i)
                              )}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setLocalCustomUsenetIndexers(prev =>
                                    prev.map(i => i.id === idx.id ? { ...i, enabled: !i.enabled } : i)
                                  )
                                }
                              }}
                            />
                            <span className={styles.indexerName}>{idx.name}</span>
                            <span className={styles.indexerMeta}>{idx.url}</span>
                          </label>
                          <div className={styles.customIndexerActions}>
                            <button tabIndex={0} className={styles.disconnectBtn} onClick={() => removeUsenetCustomIndexer(idx.id)}>Remove</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className={styles.customIndexerForm}>
                    <input
                      tabIndex={0}
                      className={styles.input}
                      placeholder="Name"
                      value={newUsenetCustom.name}
                      onChange={(e) => setNewUsenetCustom(prev => ({ ...prev, name: e.target.value }))}
                    />
                    <input
                      tabIndex={0}
                      className={styles.input}
                      placeholder="NewzNab URL (e.g. https://indexer.com/api)"
                      value={newUsenetCustom.url}
                      onChange={(e) => setNewUsenetCustom(prev => ({ ...prev, url: e.target.value }))}
                    />
                    <input
                      tabIndex={0}
                      type="password"
                      className={styles.input}
                      placeholder="API Key (optional for free indexers)"
                      value={newUsenetCustom.apiKey}
                      onChange={(e) => setNewUsenetCustom(prev => ({ ...prev, apiKey: e.target.value }))}
                    />
                    <button tabIndex={0} className={styles.connectBtn} onClick={addUsenetCustomIndexer}>Add Custom Indexer</button>
                  </div>
                </div>

                <div className={styles.settingGroup}>
                  <h3 className={styles.settingTitle}>Completed Downloads</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      tabIndex={0}
                      className={styles.connectBtn}
                      disabled={completedDownloadsState === 'loading'}
                      onClick={async () => {
                        setCompletedDownloadsState('loading')
                        try {
                          const downloads = await window.api.usenet.listDownloads()
                          setCompletedDownloads(downloads.filter((d: any) => d.status === 'completed'))
                        } catch {}
                        setCompletedDownloadsState('idle')
                      }}
                    >
                      {completedDownloadsState === 'loading' ? 'Loading...' : 'Refresh'}
                    </button>
                    <button
                      tabIndex={0}
                      className={styles.disconnectBtn}
                      onClick={async () => {
                        try {
                          await window.api.usenet.clearAll()
                        } catch {}
                      }}
                    >
                      Clear Download Cache
                    </button>
                  </div>
                  {completedDownloadsState === 'loading' && (
                    <p className={styles.authHint}>Loading completed downloads...</p>
                  )}
                  {completedDownloadsState === 'error' && (
                    <p className={styles.errorText}>Failed to load downloads</p>
                  )}
                  {completedDownloads.length === 0 && completedDownloadsState === 'idle' && (
                    <p className={styles.authHint}>No completed downloads found.</p>
                  )}
                  <div className={styles.customIndexerList}>
                    {completedDownloads.map((d: any) => (
                      <div key={d.id} className={styles.customIndexerCard}>
                        <div className={styles.customIndexerRow}>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
                            <span className={styles.indexerName}>{d.name}</span>
                            <span className={styles.indexerMeta}>{d.category} · {(d.size / 1073741824).toFixed(1)} GB</span>
                          </div>
                          <div className={styles.customIndexerActions}>
                            <button
                              tabIndex={0}
                              className={styles.disconnectBtn}
                              onClick={async () => {
                                await window.api.usenet.removeDownload(d.id)
                                setCompletedDownloads(prev => prev.filter((x: any) => x.id !== d.id))
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )
      }

      case 'network':
        return (
          <div className={styles.tabContent}>
            <NetworkAccessSection />
          </div>
        )

      case 'youtube':
        return (
          <div className={styles.tabContent}>
            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>TizenTube</h3>
              <p className={styles.settingDesc}>Ad-blocking, SponsorBlock, and enhancements. Click the Settings gear icon inside the YouTube player to configure.</p>
              <div className={styles.toggleGrid}>
                <button
                  tabIndex={0}
                  className={styles.toggle}
                  disabled={tizentubeUpdating}
                  onClick={async () => {
                    setTizentubeUpdating(true)
                    setTizentubeStatus('Checking...')
                    const result = await window.api.tizentube.update()
                    if (result.success) {
                      setTizentubeVersion(result.version || 'unknown')
                      setTizentubeStatus(`Updated to v${result.version}`)
                    } else {
                      setTizentubeStatus(`Failed: ${result.error || 'unknown error'}`)
                    }
                    setTizentubeUpdating(false)
                  }}
                >
                  {tizentubeUpdating ? 'Updating...' : 'Check & Update TizenTube'}
                </button>
              </div>
              {tizentubeVersion && (
                <p className={styles.settingDesc}>Current version: v{tizentubeVersion}</p>
              )}
              {tizentubeStatus && (
                <p className={styles.settingDesc}>{tizentubeStatus}</p>
              )}
            </div>
          </div>
        )

      case 'sports':
        return (
          <div className={styles.tabContent}>
            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>Sports Hub</h3>
              <p className={styles.settingDesc}>Browse sports leagues, events, and scores. Data is provided by the free Sportarr public API — no API key required.</p>
              <div className={styles.toggleGrid}>
                <button
                  tabIndex={0}
                  className={`${styles.toggle} ${store.sportsEnabled ? styles.toggleActive : ''}`}
                  onClick={() => store.setSportsEnabled(!store.sportsEnabled)}
                >
                  Sports Hub {store.sportsEnabled ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>
            </div>

            {store.sportsEnabled && (<div><div className={styles.settingGroup}>
                <h3 className={styles.settingTitle}>Timezone</h3>
                <p className={styles.settingDesc}>Display times in your local timezone. The schedule uses this to show kickoff times.</p>
                <select
                  tabIndex={0}
                  value={store.sportsTimezone || 'GMT'}
                  onChange={(e) => store.setSportsTimezone(e.target.value)}
                  style={{
                    padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 13, width: 240,
                    cursor: 'pointer', outline: 'none',
                  }}
                >
                  <option value="GMT">GMT (London)</option>
                  <option value="Europe/London">Europe/London (BST)</option>
                  <option value="Europe/Paris">Europe/Paris (CET)</option>
                  <option value="Europe/Berlin">Europe/Berlin (CET)</option>
                  <option value="Europe/Athens">Europe/Athens (EET)</option>
                  <option value="Europe/Moscow">Europe/Moscow (MSK)</option>
                  <option value="America/New_York">America/New York (ET)</option>
                  <option value="America/Chicago">America/Chicago (CT)</option>
                  <option value="America/Denver">America/Denver (MT)</option>
                  <option value="America/Los_Angeles">America/Los Angeles (PT)</option>
                  <option value="America/Anchorage">America/Anchorage (AKT)</option>
                  <option value="Pacific/Honolulu">Pacific/Honolulu (HT)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="Asia/Shanghai">Asia/Shanghai (CST)</option>
                  <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                  <option value="Asia/Seoul">Asia/Seoul (KST)</option>
                  <option value="Australia/Sydney">Australia/Sydney (AET)</option>
                  <option value="Pacific/Auckland">Pacific/Auckland (NZST)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
              <div className={styles.settingGroup}>
                <h3 className={styles.settingTitle}>Visible Sports</h3>
                <p className={styles.settingDesc}>Select which sports appear in the Sports section. Leave empty to show all.</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button
                    tabIndex={0}
                    className={styles.connectBtn}
                    onClick={() => store.setSportsSelected(sportsList.map(s => s.id))}
                  >
                    Select All
                  </button>
                  <button
                    tabIndex={0}
                    className={styles.connectBtn}
                    onClick={() => store.setSportsSelected([])}
                  >
                    Clear
                  </button>
                </div>
                <div className={styles.toggleGrid}>
                  {sportsList.map((sport) => {
                    const selected = store.sportsSelected.includes(sport.id)
                    return (
                      <button
                        key={sport.id}
                        tabIndex={0}
                        className={`${styles.toggle} ${selected ? styles.toggleActive : ''}`}
                        onClick={() => {
                          const next = selected
                            ? store.sportsSelected.filter(id => id !== sport.id)
                            : [...store.sportsSelected, sport.id]
                          store.setSportsSelected(next)
                        }}
                      >
                        {sport.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>)}
          </div>
        )

      case 'live-tv': {
        const countries = availableCountries.length > 0 ? availableCountries : []
        return (
          <div className={styles.tabContent}>
            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>Live TV</h3>
              <p className={styles.settingDesc}>Watch live 24/7 TV channels from around the world. Powered by DLHD.</p>
              <div className={styles.toggleGrid}>
                <button
                  tabIndex={0}
                  className={`${styles.toggle} ${store.liveTvEnabled ? styles.toggleActive : ''}`}
                  onClick={() => store.setLiveTvEnabled(!store.liveTvEnabled)}
                >
                  Live TV {store.liveTvEnabled ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>
            </div>

                        {store.liveTvEnabled && (
              <div className={styles.settingGroup}>
                <h3 className={styles.settingTitle}>IPTV M3U</h3>
                <p className={styles.settingDesc}>Add IPTV M3U playlists as an additional Live TV source.</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    tabIndex={0}
                    className={`${styles.toggle} ${store.iptvM3uEnabled ? styles.toggleActive : ''}`}
                    onClick={() => store.setIptvM3uEnabled(!store.iptvM3uEnabled)}
                  >
                    IPTV M3U {store.iptvM3uEnabled ? 'ENABLED' : 'DISABLED'}
                  </button>
                  {store.iptvM3uEnabled && (
                    <>
                      <input
                        type="number"
                        className={styles.input}
                        placeholder="Update interval (hours)"
                        value={store.iptvM3uUpdateInterval}
                        onChange={(e) => store.setIptvM3uUpdateInterval(parseInt(e.target.value) || 4)}
                        min="1"
                        max="168"
                        style={{ width: 80 }}
                      />
                      <span className={styles.settingDesc}>hours</span>
                    </>
                  )}
                </div>
              </div>
            )}


{store.liveTvEnabled && (
              <div className={styles.settingGroup}>
                <h3 className={styles.settingTitle}>Server</h3>
                <p className={styles.settingDesc}>Select the primary channel source. Other servers are used as fallback if the primary fails.</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {([
                    { id: 'cdnlive', label: 'CDNLive' },
                    { id: 'ondemand', label: 'OnDemand' },
                    { id: 'dlhd', label: 'DLHD' },
                  ] as const).map(srv => (
                    <button
                      key={srv.id}
                      tabIndex={0}
                      className={`${styles.toggle} ${store.liveTvServer === srv.id ? styles.toggleActive : ''}`}
                      onClick={() => store.setLiveTvServer(srv.id)}
                      style={{ flex: '1 1 100px', textAlign: 'center' }}
                    >
                      {srv.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {store.liveTvEnabled && (
              <div className={styles.settingGroup}>
                <h3 className={styles.settingTitle}>API Credentials</h3>
                <p className={styles.settingDesc}>LiveTV channel source credentials. Defaults: user=<strong>cdnlivetv</strong>, plan=<strong>free</strong>.</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    className={styles.input}
                    style={{ flex: 1, marginBottom: 0 }}
                    placeholder="User (e.g. cdnlivetv)"
                    value={store.liveTvUser}
                    onChange={(e) => store.setLiveTvUser(e.target.value)}
                  />
                  <input
                    type="text"
                    className={styles.input}
                    style={{ flex: 1, marginBottom: 0 }}
                    placeholder="Plan (e.g. free)"
                    value={store.liveTvPlan}
                    onChange={(e) => store.setLiveTvPlan(e.target.value)}
                  />
                </div>
              </div>
            )}

            {store.liveTvEnabled && (
              <>
              <div className={styles.settingGroup}>
                <h3 className={styles.settingTitle}>Visible Countries</h3>
                <p className={styles.settingDesc}>Select which countries' channels appear in Live TV. Leave empty to show all.</p>
                {countriesLoading ? (
                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: '8px 0' }}>Loading countries...</div>
                ) : countries.length === 0 ? (
                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: '8px 0' }}>No countries available. Check your API credentials.</div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <button
                        tabIndex={0}
                        className={styles.connectBtn}
                        onClick={() => {
                          setLocalLiveTvCountries(countries.map(c => c.code))
                          store.setSelectedLiveTvCountries(countries.map(c => c.code))
                        }}
                      >
                        Select All
                      </button>
                      <button
                        tabIndex={0}
                        className={styles.connectBtn}
                        onClick={() => {
                          setLocalLiveTvCountries([])
                          store.setSelectedLiveTvCountries([])
                        }}
                      >
                        Clear
                      </button>
                    </div>
                    <div className={styles.toggleGrid}>
                      {countries.map((country) => {
                        const selected = localLiveTvCountries.includes(country.code)
                        return (
                          <button
                            key={country.code}
                            tabIndex={0}
                            className={`${styles.toggle} ${selected ? styles.toggleActive : ''}`}
                            onClick={() => {
                              if (localLiveTvCountries.length === 0) {
                                const next = [country.code]
                                setLocalLiveTvCountries(next)
                                store.setSelectedLiveTvCountries(next)
                              } else {
                                const next = selected
                                  ? localLiveTvCountries.filter(c => c !== country.code)
                                  : [...localLiveTvCountries, country.code]
                                setLocalLiveTvCountries(next)
                                store.setSelectedLiveTvCountries(next)
                              }
                            }}
                          >
                            {country.flag} {country.name} <span style={{ opacity: 0.5, fontSize: 11 }}>({country.count})</span>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
              <ChannelSelector selectedCountries={localLiveTvCountries} />
              </>
            )}
          </div>
        )
      }

      case 'remote':
         return (
           <div className={styles.tabContent}>
             <div className={styles.settingGroup}>
               <h3 className={styles.settingTitle}>Remote Control Configuration</h3>
               <p className={styles.settingDesc}>Click 'Capture' for an action, then press the corresponding button on your remote within 5 seconds.</p>
             </div>

             <div className={styles.settingGroup}>
               <h3 className={styles.settingTitle}>Back</h3>
               <p className={styles.settingDesc}>Keycode: {localRemoteMapping['back'] ?? 'Not set'}</p>
               <button tabIndex={0} className={styles.connectBtn} onClick={() => captureKey('back')}>
                 {capturingKey === 'back' ? 'Press button on remote...' : 'Capture Back'}
               </button>
             </div>

             <div className={styles.settingGroup}>
               <h3 className={styles.settingTitle}>Home</h3>
               <p className={styles.settingDesc}>Keycode: {localRemoteMapping['home'] ?? 'Not set'}</p>
               <button tabIndex={0} className={styles.connectBtn} onClick={() => captureKey('home')}>
                 {capturingKey === 'home' ? 'Press button on remote...' : 'Capture Home'}
               </button>
             </div>

             <div className={styles.settingGroup}>
               <h3 className={styles.settingTitle}>Search</h3>
               <p className={styles.settingDesc}>Keycode: {localRemoteMapping['search'] ?? 'Not set'}</p>
               <button tabIndex={0} className={styles.connectBtn} onClick={() => captureKey('search')}>
                 {capturingKey === 'search' ? 'Press button on remote...' : 'Capture Search'}
               </button>
             </div>

             <div className={styles.settingGroup}>
               <h3 className={styles.settingTitle}>Context Menu</h3>
               <p className={styles.settingDesc}>Keycode: {localRemoteMapping['contextMenu'] ?? 'Not set'}</p>
               <button tabIndex={0} className={styles.connectBtn} onClick={() => captureKey('contextMenu')}>
                 {capturingKey === 'contextMenu' ? 'Press button on remote...' : 'Capture Context Menu'}
               </button>
             </div>
           </div>
         )

      case 'advanced':
         return (
           <div className={styles.tabContent}>
             <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>Trackers</h3>
              <p className={styles.settingDesc}>Announce trackers added to magnet links. The list auto-refreshes daily from ngosang/trackerslist.</p>
              {trackerRefreshState === 'error' && (
                <p className={styles.errorText}>{trackerRefreshError}</p>
              )}
              {trackerRefreshState === 'done' && (
                <p className={styles.connected}>Refreshed {trackerRefreshCount} trackers</p>
              )}
              <button
                tabIndex={0}
                className={styles.connectBtn}
                disabled={trackerRefreshState === 'refreshing'}
                onClick={async () => {
                  setTrackerRefreshState('refreshing')
                  setTrackerRefreshError('')
                  try {
                    const result = await window.api.torrent.refreshTrackers()
                    setTrackerRefreshCount(result.count || 0)
                    setTrackerRefreshState('done')
                  } catch (err: any) {
                    setTrackerRefreshError(err.message || 'Failed to refresh trackers')
                    setTrackerRefreshState('error')
                  }
                }}
              >
                {trackerRefreshState === 'refreshing' ? 'Refreshing...' : 'Refresh Tracker List'}
              </button>
            </div>

            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>Cache</h3>
              <p className={styles.settingDesc}>Clear cached artwork and metadata so fresh logos, posters, and details are fetched on next load.</p>
              {clearCacheState === 'done' && (
                <p className={styles.connected}>Image cache cleared</p>
              )}
              {clearCacheState === 'error' && (
                <p className={styles.errorText}>Failed to clear cache</p>
              )}
              <button
                  tabIndex={0}
                  className={styles.connectBtn}
                  disabled={clearCacheState === 'clearing'}
                  onClick={async () => {
                    setClearCacheState('clearing')
                    try {
                      const result = await window.api.clearImageCache()
                      setClearCacheState(result.success ? 'done' : 'error')
                    } catch {
                      setClearCacheState('error')
                    }
                  }}
                >
                  {clearCacheState === 'clearing' ? 'Clearing...' : 'Clear Image Cache'}
                </button>
              </div>

              <div className={styles.settingGroup}>
                <h3 className={styles.settingTitle}>Torrent Cache</h3>
                <p className={styles.settingDesc}>Clear downloaded torrent files from disk to free up space. Torrents are cached locally while streaming.</p>
                {torrentCacheState === 'done' && (
                  <p className={styles.connected}>Torrent cache cleared</p>
                )}
                {torrentCacheState === 'error' && (
                  <p className={styles.errorText}>Failed to clear torrent cache</p>
                )}
                {torrentCacheStatus && (
                  <p className={styles.settingDesc}>
                    {torrentCacheStatus.count} torrent{torrentCacheStatus.count !== 1 ? 's' : ''} cached, {torrentCacheStatus.sizeGb}
                  </p>
                )}
                <button
                    tabIndex={0}
                    className={styles.connectBtn}
                    disabled={torrentCacheState === 'clearing'}
                    onClick={async () => {
                      setTorrentCacheState('clearing')
                      try {
                        await window.api.localCache.clear()
                        setTorrentCacheState('done')
                        const st = await window.api.localCache.status()
                        setTorrentCacheStatus(st)
                      } catch {
                        setTorrentCacheState('error')
                      }
                    }}
                  >
                    {torrentCacheState === 'clearing' ? 'Clearing...' : 'Clear Torrent Cache'}
                  </button>
              </div>
            </div>
        )
      case 'profiles': {
        const profilesArr = store.profiles
        const autoLoginId = store.autoLoginProfileId
        const activeId = store.activeProfileId
        const updateProfile = store.updateProfile
        const removeProfile = store.removeProfile
        const addProfile = store.addProfile
        const setAutoLoginProfile = store.setAutoLoginProfile
        const setActiveProfile = store.setActiveProfile
        return (
          <div className={styles.tabContent}>
            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>Auto-Login</h3>
              <p className={styles.settingDesc}>Skip the profile picker when this profile is selected</p>
              <select
                className={styles.input}
                value={autoLoginId || ''}
                onChange={(e) => setAutoLoginProfile(e.target.value || null)}
                tabIndex={0}
              >
                <option value="">Off</option>
                {profilesArr.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>Profiles ({profilesArr.length}/5)</h3>
            </div>

            {profilesArr.map((profile) => (
              <div key={profile.id} className={styles.settingGroup} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 8,
                  background: profile.avatarColor || '#007AFF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: 18,
                  flexShrink: 0
                }}>
                  {profile.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <input
                    type="text"
                    className={styles.input}
                    value={profile.name}
                    onChange={(e) => updateProfile(profile.id, { name: e.target.value })}
                    tabIndex={0}
                    style={{ fontSize: 16, fontWeight: 600, padding: '6px 8px' }}
                  />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: profile.mdblistAccessToken ? 'var(--accent, #FF6B00)' : 'rgba(255,255,255,0.4)' }}>
                      {profile.mdblistAccessToken ? '● MDBList Logged In' : '○ MDBList Logged Out'}
                    </span>
                    {profile.id === activeId && <span style={{ fontSize: 12, color: 'var(--accent, #FF6B00)' }}>● Active</span>}
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: 8 }}>
                  {profile.id !== activeId && (
                    <button
                      tabIndex={0}
                      style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--accent, #FF6B00)', background: 'transparent', color: 'var(--accent, #FF6B00)', cursor: 'pointer', fontSize: 12 }}
                      onClick={() => setActiveProfile(profile.id)}
                    >
                      Activate
                    </button>
                  )}
                  <button
                    tabIndex={0}
                    style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,80,80,0.4)', background: 'transparent', color: '#ff5050', cursor: 'pointer', fontSize: 12 }}
                    onClick={() => setDeleteProfileConfirm(profile.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {profilesArr.length < 5 && (
              <div className={styles.settingGroup}>
                <button
                  tabIndex={0}
                  className={styles.connectBtn}
                  onClick={() => setAddProfilePromptOpen(true)}
                >
                  Add Profile
                </button>
              </div>
            )}
          </div>
        )
      }
    }
  }

  return (
    <div className={styles.settings} ref={settingsRef}>
      <div className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
      </div>

      <div className={styles.tabBar}>
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            tabIndex={0}
            className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
            data-tab={tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.label}</span>
            <span className={styles.tabShortcut}>{tab.shortcut}</span>
          </button>
        ))}
      </div>

      <div className={styles.content} ref={contentRef}>
        {renderTabContent()}
      </div>

      <div className={styles.footer}>
        <button tabIndex={0} className={styles.saveBtn} onClick={handleSave}>
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      {addProfilePromptOpen && (
        <Prompt
          title="Add Profile"
          placeholder="Profile name"
          confirmLabel="Create"
          onConfirm={(name) => {
            store.addProfile(name)
            setAddProfilePromptOpen(false)
          }}
          onCancel={() => setAddProfilePromptOpen(false)}
        />
      )}

      {deleteProfileConfirm && (() => {
        const prof = store.profiles.find((p) => p.id === deleteProfileConfirm)
        return (
          <Confirm
            title={`Delete "${prof?.name}"?`}
            message="This profile's watch history and settings will be lost."
            confirmLabel="Delete"
            destructive
            onConfirm={() => {
              store.removeProfile(deleteProfileConfirm)
              setDeleteProfileConfirm(null)
            }}
            onCancel={() => setDeleteProfileConfirm(null)}
          />
        )
      })()}
    </div>
  )
}