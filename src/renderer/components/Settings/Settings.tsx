import React, { useState, useEffect } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import styles from './Settings.module.css'

interface SettingsProps {
  onClose: () => void
  initialOpen?: boolean
}

export default function Settings({ onClose, initialOpen }: SettingsProps) {
  const store = useSettingsStore()
  const [localTmdb, setLocalTmdb] = useState(store.tmdbApiKey)
  const [localTraktId, setLocalTraktId] = useState(store.traktClientId)
  const [localTraktSecret, setLocalTraktSecret] = useState(store.traktClientSecret)
  const [localRd, setLocalRd] = useState(store.realDebridApiKey)
  const [localTb, setLocalTb] = useState(store.torboxApiKey)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    store.setTmdbApiKey(localTmdb)
    store.setTraktClientId(localTraktId)
    store.setTraktClientSecret(localTraktSecret)
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
          <p className={styles.desc}>For scrobbling and watch history sync</p>
          <input
            type="text"
            className={styles.input}
            placeholder="Client ID"
            value={localTraktId}
            onChange={(e) => setLocalTraktId(e.target.value)}
          />
          <input
            type="password"
            className={styles.input}
            placeholder="Client Secret"
            value={localTraktSecret}
            onChange={(e) => setLocalTraktSecret(e.target.value)}
          />
          {store.traktConnected && (
            <span className={styles.connected}>Connected</span>
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
