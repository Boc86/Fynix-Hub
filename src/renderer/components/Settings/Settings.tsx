import React, { useState, useEffect, useCallback } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import styles from './Settings.module.css'

interface SettingsProps {
  onClose: () => void
  initialOpen?: boolean
}

export default function Settings({ onClose }: SettingsProps) {
  const store = useSettingsStore()
  const [localTmdb, setLocalTmdb] = useState(store.tmdbApiKey)
  const [localRd, setLocalRd] = useState(store.realDebridApiKey)
  const [localTb, setLocalTb] = useState(store.torboxApiKey)
  const [saved, setSaved] = useState(false)

  const [authState, setAuthState] = useState<'idle' | 'connecting' | 'waiting' | 'connected' | 'error'>('idle')
  const [userCode, setUserCode] = useState('')
  const [authError, setAuthError] = useState('')
  const [userName, setUserName] = useState('')

  useEffect(() => {
    if (store.traktConnected) {
      setAuthState('connected')
    }
  }, [store.traktConnected])

  const startDeviceAuth = useCallback(async () => {
    setAuthState('connecting')
    setAuthError('')

    try {
      const code = await window.api.trakt.getDeviceCode()
      setUserCode(code.user_code)
      setAuthState('waiting')
      pollForToken(code.device_code, code.interval || 5)
    } catch (err: any) {
      setAuthError(err.message || 'Failed to connect')
      setAuthState('error')
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
          store.setTraktConnected(true)
          setAuthState('connected')
          setUserName(result.user?.username || '')
          return
        }
      } catch (err: any) {
        setAuthError(err.message || 'Authentication failed')
        setAuthState('error')
        return
      }
    }
    setAuthError('Code expired. Try again.')
    setAuthState('error')
  }, [store])

  const disconnect = useCallback(async () => {
    await window.api.trakt.setTokens(null, null)
    store.setTraktConnected(false)
    setAuthState('idle')
    setUserCode('')
  }, [store])

  const handleSave = async () => {
    store.setTmdbApiKey(localTmdb)
    store.setRealDebridApiKey(localRd)
    store.setTorboxApiKey(localTb)
    await store.saveToDisk()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className={styles.settings}>
      <div className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
        <button className={styles.closeBtn} onClick={onClose}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      <div className={styles.content}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>TMDB</h2>
          <p className={styles.desc}>API key for movie and TV metadata</p>
          <input
            type="password"
            className={styles.input}
            placeholder="TMDB API Key"
            value={localTmdb}
            onChange={(e) => setLocalTmdb(e.target.value)}
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Trakt</h2>
          <p className={styles.desc}>Scrobble, sync watch history, and get recommendations</p>

          {authState === 'idle' && (
            store.traktConnected ? (
              <div className={styles.connectedInfo}>
                <p className={styles.connected}>Connected</p>
                <button className={styles.disconnectBtn} onClick={disconnect}>
                  Disconnect
                </button>
              </div>
            ) : (
              <button className={styles.connectBtn} onClick={startDeviceAuth}>
                Connect to Trakt
              </button>
            )
          )}

          {authState === 'connecting' && (
            <p className={styles.authInfo}>Connecting to Trakt...</p>
          )}

          {authState === 'waiting' && (
            <div className={styles.deviceAuth}>
              <p className={styles.authInfo}>
                Visit{' '}
                <a href="https://trakt.tv/activate" target="_blank" rel="noreferrer">
                  trakt.tv/activate
                </a>{' '}
                and enter the code below:
              </p>
              <div className={styles.userCode}>{userCode}</div>
              <p className={styles.authHint}>Waiting for authorization...</p>
            </div>
          )}

          {authState === 'connected' && (
            <div className={styles.connectedInfo}>
              <p className={styles.connected}>
                Connected{userName ? ` as ${userName}` : ''}
              </p>
              <button className={styles.disconnectBtn} onClick={disconnect}>
                Disconnect
              </button>
            </div>
          )}

          {authState === 'error' && (
            <div className={styles.errorBox}>
              <p className={styles.errorText}>{authError}</p>
              <button className={styles.connectBtn} onClick={() => { setAuthState('idle'); setAuthError('') }}>
                Try Again
              </button>
            </div>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Debrid Services</h2>
          <p className={styles.desc}>Premium torrent caching for faster streaming</p>
          <input
            type="password"
            className={styles.input}
            placeholder="Real-Debrid API Key"
            value={localRd}
            onChange={(e) => setLocalRd(e.target.value)}
          />
          <input
            type="password"
            className={styles.input}
            placeholder="TorBox API Key"
            value={localTb}
            onChange={(e) => setLocalTb(e.target.value)}
          />
        </section>

        <button className={styles.saveBtn} onClick={handleSave}>
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
