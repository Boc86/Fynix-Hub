import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import type { CustomIndexer } from '../../../main/services/torrent-search.service'
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

type SettingsTab = 'general' | 'connections' | 'indexers' | 'youtube' | 'sports' | 'advanced'

const TABS: Array<{ id: SettingsTab; label: string; shortcut: string }> = [
  { id: 'general', label: 'General', shortcut: '1' },
  { id: 'connections', label: 'Connections', shortcut: '2' },
  { id: 'indexers', label: 'Indexers', shortcut: '3' },
  { id: 'youtube', label: 'YouTube', shortcut: '4' },
  // { id: 'sports', label: 'Sports', shortcut: '5' }, // hidden until API available
  { id: 'advanced', label: 'Advanced', shortcut: '6' },
]

export default function Settings({ onClose }: SettingsProps) {
  const store = useSettingsStore()
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [localTmdb, setLocalTmdb] = useState(store.tmdbApiKey)
  const [localFanart, setLocalFanart] = useState(store.fanartApiKey)
  const [localLangs, setLocalLangs] = useState<string[]>(store.preferredLanguages)
  const [localRes, setLocalRes] = useState<string[]>(store.preferredResolutions)
  const [localSportsEnabled, setLocalSportsEnabled] = useState(store.sportsEnabled)
  const [localSportsKey, setLocalSportsKey] = useState(store.sportsDbApiKey)
  const [localSportsSelected, setLocalSportsSelected] = useState<string[]>(store.sportsSelected)
  const [availableSports, setAvailableSports] = useState<Array<{ id: string; name: string }>>([])
  const [saved, setSaved] = useState(false)
  const [trackerRefreshState, setTrackerRefreshState] = useState<'idle' | 'refreshing' | 'done' | 'error'>('idle')
  const [trackerRefreshCount, setTrackerRefreshCount] = useState(0)
  const [trackerRefreshError, setTrackerRefreshError] = useState('')
  const [clearCacheState, setClearCacheState] = useState<'idle' | 'clearing' | 'done' | 'error'>('idle')
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

  const languages = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Japanese', 'Korean', 'Chinese', 'Russian', 'Hindi', 'Arabic']
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

  const toggleLang = (lang: string) => {
    setLocalLangs(prev => prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang])
  }

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

  useEffect(() => {
    window.api.sportsdb.getSports()
      .then((sports) => {
        setAvailableSports(sports.map((s: any) => ({ id: s.id || s.slug, name: s.name })))
      })
      .catch(() => setAvailableSports([]))
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

  const [traktAuthState, setTraktAuthState] = useState<'idle' | 'connecting' | 'waiting' | 'connected' | 'error'>('idle')
  const [traktUserCode, setTraktUserCode] = useState('')
  const [traktAuthError, setTraktAuthError] = useState('')
  const [userName, setUserName] = useState('')

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
    if (store.traktConnected) {
      setTraktAuthState('connected')
    }
  }, [store.traktConnected])

  useEffect(() => {
    return () => {
      if (tbPollRef.current) {
        clearInterval(tbPollRef.current)
        tbPollRef.current = null
      }
    }
  }, [])

  const startDeviceAuth = useCallback(async () => {
    setTraktAuthState('connecting')
    setTraktAuthError('')

    try {
      const code = await window.api.trakt.getDeviceCode()
      setTraktUserCode(code.user_code)
      setTraktAuthState('waiting')
      pollForToken(code.device_code, code.interval || 5)
    } catch (err: any) {
      setTraktAuthError(err.message || 'Failed to connect')
      setTraktAuthState('error')
    }
  }, [])

  const pollForToken = useCallback(async (code: string, interval: number) => {
    const maxAttempts = Math.floor(600 / interval)
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, interval * 1000))
      try {
        const result = await window.api.trakt.pollForToken(code)
        if (result.access_token) {
          await window.api.trakt.setTokens(result.access_token, result.refresh_token)
          await window.api.settings.set('traktConnected', true)
          store.setTraktConnected(true)
          setTraktAuthState('connected')
          setUserName(result.user?.username || '')
          return
        }
      } catch (err: any) {
        setTraktAuthError(err.message || 'Authentication failed')
        setTraktAuthState('error')
        return
      }
    }
    setTraktAuthError('Code expired. Try again.')
    setTraktAuthState('error')
  }, [store])

  const disconnect = useCallback(async () => {
    await window.api.trakt.setTokens(null, null)
    await window.api.settings.set('traktConnected', false)
    store.setTraktConnected(false)
    setTraktAuthState('idle')
    setTraktUserCode('')
  }, [store])

  const handleSave = async () => {
    await Promise.all([
      window.api.settings.set('tmdbApiKey', localTmdb),
      window.api.settings.set('fanartApiKey', localFanart),
      window.api.settings.set('preferredLanguages', localLangs),
      window.api.settings.set('preferredResolutions', localRes),
      window.api.settings.set('enabledIndexers', localEnabledIndexers),
      window.api.settings.set('customIndexers', localCustomIndexers),
      window.api.settings.set('sportsEnabled', localSportsEnabled),
      window.api.settings.set('sportsDbApiKey', localSportsKey),
      window.api.settings.set('sportsSelected', localSportsSelected),
    ])
    store.setTmdbApiKey(localTmdb)
    store.setFanartApiKey(localFanart)
    store.setPreferredLanguages(localLangs)
    store.setPreferredResolutions(localRes)
    store.setEnabledIndexers(localEnabledIndexers)
    store.setCustomIndexers(localCustomIndexers)
    store.setSportsEnabled(localSportsEnabled)
    store.setSportsDbApiKey(localSportsKey)
    store.setSportsSelected(localSportsSelected)
    await store.saveToDisk()
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
      const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)

      let newTab: SettingsTab | null = null

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || (e.key >= '1' && e.key <= '5')) {
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
          const tabIndex = parseInt(e.key) - 1
          if (tabIndex < TABS.length) {
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
        // Focus first element in the new tab's content after render
        setTimeout(() => {
          const focusable = getFocusable()
          if (focusable.length > 0) focusable[0]?.focus()
        }, 0)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTab])

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
              <h3 className={styles.settingTitle}>Preferred Languages</h3>
              <p className={styles.settingDesc}>Filter torrent results by language</p>
              <div className={styles.toggleGrid}>
                {languages.map(lang => (
                  <button
                    key={lang}
                    tabIndex={0}
                    className={`${styles.toggle} ${localLangs.includes(lang) ? styles.toggleActive : ''}`}
                    onClick={() => toggleLang(lang)}
                  >
                    {lang}
                  </button>
                ))}
              </div>
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
              <h3 className={styles.settingTitle}>Playback</h3>
              <p className={styles.settingDesc}>Auto-play: skip torrent selection and play the best match immediately</p>
              <div className={styles.toggleGrid}>
                <button
                  tabIndex={0}
                  className={`${styles.toggle} ${store.autoPlayTorrent ? styles.toggleActive : ''}`}
                  onClick={() => store.setAutoPlayTorrent(!store.autoPlayTorrent)}
                >
                  Auto-Play {store.autoPlayTorrent ? 'ON' : 'OFF'}
                </button>
              </div>
              <p className={styles.settingDesc} style={{ marginTop: 12 }}>Skip torrents larger than this size (0 = unlimited)</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  className={styles.input}
                  style={{ width: 120, marginBottom: 0 }}
                  placeholder="GB"
                  min={0}
                  value={store.maxTorrentSize || ''}
                  onChange={(e) => store.setMaxTorrentSize(Math.max(0, parseInt(e.target.value) || 0))}
                />
                <span className={styles.settingDesc}>GB</span>
              </div>
            </div>
          </div>
        )

      case 'connections':
        return (
          <div className={styles.tabContent}>
            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>Trakt</h3>
              <p className={styles.settingDesc}>Scrobble, sync watch history, and get recommendations</p>

              {traktAuthState === 'idle' && (
                store.traktConnected ? (
                  <div className={styles.connectedInfo}>
                    <p className={styles.connected}>Connected</p>
                    <button tabIndex={0} className={styles.disconnectBtn} onClick={disconnect}>
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button tabIndex={0} className={styles.connectBtn} onClick={startDeviceAuth}>
                    Connect to Trakt
                  </button>
                )
              )}

              {traktAuthState === 'connecting' && (
                <p className={styles.authInfo}>Connecting to Trakt...</p>
              )}

              {traktAuthState === 'waiting' && (
                <div className={styles.deviceAuth}>
                  <p className={styles.authInfo}>
                    Visit{' '}
                    <a href="https://trakt.tv/activate" target="_blank" rel="noreferrer">
                      trakt.tv/activate
                    </a>{' '}
                    and enter the code below:
                  </p>
                  <div className={styles.userCode}>{traktUserCode}</div>
                  <p className={styles.authHint}>Waiting for authorization...</p>
                </div>
              )}

              {traktAuthState === 'connected' && (
                <div className={styles.connectedInfo}>
                  <p className={styles.connected}>
                    Connected{userName ? ` as ${userName}` : ''}
                  </p>
                  <button tabIndex={0} className={styles.disconnectBtn} onClick={disconnect}>
                    Disconnect
                  </button>
                </div>
              )}

              {traktAuthState === 'error' && (
                <div className={styles.errorBox}>
                  <p className={styles.errorText}>{traktAuthError}</p>
                  <button tabIndex={0} className={styles.connectBtn} onClick={() => { setTraktAuthState('idle'); setTraktAuthError('') }}>
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
                  <p className={styles.connected}>Connected</p>
                  <button tabIndex={0} className={styles.disconnectBtn} onClick={async () => {
                    await window.api.settings.set('realDebridApiKey', null)
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
                  <p className={styles.connected}>Connected</p>
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
                      if (result.verification_url) window.open(result.verification_url, '_blank')
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
                  <p className={styles.connected}>Connected</p>
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
                  <p className={styles.connected}>Connected</p>
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

      case 'indexers':
        return (
          <div className={styles.tabContent}>
            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>Built-in Indexers</h3>
              <p className={styles.settingDesc}>Enable or disable built-in public indexers</p>
              <div className={styles.indexerList}>
                {builtInIndexers.map(idx => (
                  <label key={idx.id} className={styles.indexerRow}>
                    <input
                      tabIndex={0}
                      type="checkbox"
                      checked={localEnabledIndexers.includes(idx.id)}
                      onChange={() => toggleBuiltIn(idx.id)}
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
              <h3 className={styles.settingTitle}>Enable Sports Section</h3>
              <p className={styles.settingDesc}>Show a Sports tab in the sidebar and navigation</p>
              <div className={styles.toggleGrid}>
                <button
                  tabIndex={0}
                  className={`${styles.toggle} ${localSportsEnabled ? styles.toggleActive : ''}`}
                  onClick={() => setLocalSportsEnabled((v) => !v)}
                >
                  Sports {localSportsEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>SportsAPI Pro Key</h3>
              <p className={styles.settingDesc}>
                API key from sportsapipro.com. Used for competitions, seasons, fixtures, and team search across 25+ sports.
              </p>
              <input
                type="password"
                className={styles.input}
                placeholder="Enter SportsAPI Pro API Key"
                value={localSportsKey}
                onChange={(e) => setLocalSportsKey(e.target.value)}
              />
            </div>

            <div className={styles.settingGroup}>
              <h3 className={styles.settingTitle}>Displayed Sports</h3>
              <p className={styles.settingDesc}>Choose which sports appear on the Sports page</p>
              {availableSports.length === 0 && localSportsKey.trim() && (
                <p className={styles.authHint}>Could not load sports. Check the API key.</p>
              )}
              {availableSports.length === 0 && !localSportsKey.trim() && (
                <p className={styles.authHint}>Enter an API key above to load available sports.</p>
              )}
              <div className={styles.toggleGrid}>
                {availableSports.map((sport) => (
                  <button
                    key={sport.id}
                    tabIndex={0}
                    className={`${styles.toggle} ${localSportsSelected.includes(sport.name) ? styles.toggleActive : ''}`}
                    onClick={() => {
                      setLocalSportsSelected((prev) =>
                        prev.includes(sport.name) ? prev.filter((s) => s !== sport.name) : [...prev, sport.name]
                      )
                    }}
                  >
                    {sport.name}
                  </button>
                ))}
              </div>
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
          </div>
        )
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
    </div>
  )
}