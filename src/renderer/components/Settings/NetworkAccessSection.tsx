import { useState, useEffect } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import styles from './Settings.module.css'

/**
 * Network Access (Android TV) settings section.
 *
 * Persists settings keys and shows live server status.
 */
export default function NetworkAccessSection() {
  const store = useSettingsStore()
  const [enabled, setEnabled] = useState(store.networkEnabled)
  const [port, setPort] = useState(store.networkPort)
  const [username, setUsername] = useState(store.networkUsername)
  const [password, setPassword] = useState(store.networkPassword)
  const [showPassword, setShowPassword] = useState(false)
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState<{ running: boolean; port: number; error?: string; lanIps: string[] }>({
    running: false,
    port: 0,
    lanIps: [],
  })

  const refreshStatus = async () => {
    try {
      const s = await window.api.network.getStatus()
      setStatus(s)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    refreshStatus()
  }, [])

  const handleSave = async () => {
    store.setNetworkEnabled(enabled)
    store.setNetworkPort(port)
    store.setNetworkUsername(username)
    store.setNetworkPassword(password)
    await store.saveToDisk()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    await refreshStatus()
  }

  let statusText = 'Disabled'
  if (status.running) {
    const lanIp = status.lanIps[0] || '127.0.0.1'
    statusText = `http://${lanIp}:${status.port}`
  } else if (status.error) {
    statusText = `Error: ${status.error}`
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.settingGroup}>
        <h3 className={styles.settingTitle}>Network Access (Android TV)</h3>
        <p className={styles.settingDesc}>
          Allow an Android TV device on your home network to browse and play channels through this PC.
        </p>
        <div className={styles.toggleGrid}>
          <button
            tabIndex={0}
            className={`${styles.toggle} ${enabled ? styles.toggleActive : ''}`}
            onClick={() => setEnabled(!enabled)}
          >
            Network Access {enabled ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>
        <p className={styles.settingDesc}>Status: {statusText}</p>
      </div>

      <div className={styles.settingGroup}>
        <h3 className={styles.settingTitle}>Connection</h3>
        <p className={styles.settingDesc}>The Android TV app connects to http://&lt;this PC&apos;s IP&gt;:{port}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            tabIndex={0}
            type="number"
            className={styles.input}
            placeholder="Port (default 43862)"
            value={port}
            onChange={(e) => setPort(parseInt(e.target.value) || 43862)}
          />
          <input
            tabIndex={0}
            type="text"
            className={styles.input}
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              tabIndex={0}
              type={showPassword ? 'text' : 'password'}
              className={styles.input}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              tabIndex={0}
              className={styles.connectBtn}
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? 'Hide password' : 'Show password'}
              style={{ minWidth: 42 }}
            >
              {showPassword ? '🙈' : '👁'}
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button tabIndex={0} className={styles.connectBtn} onClick={handleSave}>
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
