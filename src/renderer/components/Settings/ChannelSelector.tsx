import React, { useState, useEffect, useMemo } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import { COUNTRY_NAMES } from '../../utils/countryCode'
import { loadMergedChannels, MergedChannel } from '../../utils/channels'
import styles from './Settings.module.css'

export default function ChannelSelector({ selectedCountries }: { selectedCountries: string[] }) {
  const store = useSettingsStore()
  const [allChannels, setAllChannels] = useState<MergedChannel[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [visibleChannels, setVisibleChannels] = useState<string[]>(store.liveTvVisibleChannels)

  useEffect(() => {
    setLoading(true)
    loadMergedChannels()
      .then(setAllChannels)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const grouped = useMemo(() => {
    const filterByCountry = selectedCountries.length > 0
    const filtered = allChannels
      .filter(ch => !filterByCountry || selectedCountries.includes(ch.countryCode))
      .filter(ch => !search || ch.name.toLowerCase().includes(search.toLowerCase()))
    const map = new Map<string, MergedChannel[]>()
    for (const ch of filtered) {
      const key = ch.countryCode || '__none__'
      const arr = map.get(key) || []
      arr.push(ch)
      map.set(key, arr)
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === '__none__') return 1
      if (b[0] === '__none__') return -1
      return a[0].localeCompare(b[0])
    })
  }, [allChannels, selectedCountries, search])

  const toggleChannel = (id: string) => {
    const next = visibleChannels.includes(id)
      ? visibleChannels.filter(x => x !== id)
      : [...visibleChannels, id]
    setVisibleChannels(next)
    store.setLiveTvVisibleChannels(next)
  }

  const selectAllVisible = () => {
    const ids: string[] = []
    for (const [, chs] of grouped) for (const ch of chs) ids.push(ch.id)
    setVisibleChannels(ids)
    store.setLiveTvVisibleChannels(ids)
  }

  const clearAll = () => {
    setVisibleChannels([])
    store.setLiveTvVisibleChannels([])
  }

  return (
    <div className={styles.settingGroup}>
      <h3 className={styles.settingTitle}>Visible Channels</h3>
      <p className={styles.settingDesc}>Select which channels appear in Live TV & EPG. Only channels from selected countries are listed.</p>

      <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
        <button tabIndex={0} className={styles.connectBtn} onClick={selectAllVisible}>
          Select All Visible
        </button>
        <button tabIndex={0} className={styles.connectBtn} onClick={clearAll}>
          Clear Selection
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.5)', padding: '8px 0' }}>Loading channels...</div>
      ) : (
        <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: 8 }}>
          <input
            type="text"
            placeholder="Search channels..."
            className={styles.input}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', marginBottom: 8 }}
          />
          {allChannels.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.4)', padding: '8px 0', fontSize: 13 }}>No channels available.</div>
          ) : grouped.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.4)', padding: '8px 0', fontSize: 13 }}>No channels match your filter.</div>
          ) : (
            <div>
              {grouped.map(([cc, chs]) => (
                <div key={cc} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, padding: '2px 0' }}>
                    {cc === '__none__' ? 'Other' : (COUNTRY_NAMES[cc] || cc.toUpperCase())} ({chs.length})
                  </div>
                  {chs.map(ch => {
                    const isVisible = visibleChannels.includes(ch.id)
                    return (
                      <label
                        key={ch.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '4px 8px',
                          cursor: 'pointer',
                          borderRadius: 3,
                          background: isVisible ? 'rgba(255,255,255,0.04)' : 'transparent',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isVisible}
                          tabIndex={0}
                          onChange={() => toggleChannel(ch.id)}
                        />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, color: isVisible ? '#fff' : 'rgba(255,255,255,0.5)' }}>
                          {ch.name}
                        </span>
                        {ch.sources.map(src => (
                          <span key={src} style={{
                            fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 600, letterSpacing: 0.3,
                            background: src === 'm3u' ? 'rgba(168,85,247,0.2)' : 'rgba(59,130,246,0.2)',
                            color: src === 'm3u' ? '#a855f7' : '#60a5fa',
                          }}>
                            {src.toUpperCase()}
                          </span>
                        ))}
                      </label>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
