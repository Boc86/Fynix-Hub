import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useSettingsStore } from '../../store/settingsStore'

interface Channel {
  id: string
  name: string
  image: string
  countryCode: string
  countryName: string
  countryFlag: string
  brand: string
  qualities: { name: string; url: string }[]
  defaultUrl: string
  defaultQuality: string
}

const QUALITY_COLORS: Record<string, string> = {
  '4K': '#e8471b',
  'FHD': '#22c55e',
  'HD': '#3b82f6',
  'SD': '#888',
}

function qualityBadge(q: string) {
  const c = QUALITY_COLORS[q.toUpperCase()] || '#888'
  return (
    <span key={q} style={{
      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
      background: c, color: '#fff', letterSpacing: 0.5,
    }}>{q.toUpperCase()}</span>
  )
}

export default function LiveTV({ onPlayUrl, onBack }: { onPlayUrl: (url: string) => Promise<void>; onBack: () => void }) {
  const settingsStore = useSettingsStore()
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [focusedChannelIdx, setFocusedChannelIdx] = useState(0)
  const [playing, setPlaying] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
    window.api.damiTv.getChannels().then(ch => {
      setChannels(ch)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => { containerRef.current?.focus() }, [loading])

  const filteredChannels = useMemo(() => {
    let result = channels
    if (settingsStore.selectedLiveTvCountries.length > 0) {
      result = result.filter(c => settingsStore.selectedLiveTvCountries.includes(c.countryCode))
    }
    return result.sort((a, b) => {
      if (a.countryCode !== b.countryCode) return a.countryCode.localeCompare(b.countryCode)
      return a.name.localeCompare(b.name)
    })
  }, [channels, settingsStore.selectedLiveTvCountries])

  const groupedChannels = useMemo(() => {
    const map = new Map<string, Channel[]>()
    for (const ch of filteredChannels) {
      const arr = map.get(ch.countryCode) || []
      arr.push(ch)
      map.set(ch.countryCode, arr)
    }
    return Array.from(map.entries())
  }, [filteredChannels])

  const channelGridCols = useMemo(() => {
    return Math.max(2, Math.min(6, Math.floor((containerRef.current?.offsetWidth || 1200) / 220)))
  }, [containerRef.current?.offsetWidth])

  const isChannelFocused = (idx: number) => idx === focusedChannelIdx

  const playChannel = useCallback(async (ch: Channel) => {
    setPlaying(ch.id)
    try {
      const result = await window.api.damiTv.extractUrl(ch.id)
      if (result?.hlsUrl) {
        await onPlayUrl(result.hlsUrl)
      } else if (ch.defaultUrl) {
        await onPlayUrl(ch.defaultUrl)
      } else {
        console.warn('[LiveTV] No playable URL for channel:', ch.name)
      }
    } catch (err) {
      console.error('[LiveTV] Failed to play channel:', err)
    }
    setPlaying(null)
  }, [onPlayUrl])

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape' || e.key === 'Backspace') { onBack(); return }
    if (filteredChannels.length === 0) return

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      setFocusedChannelIdx(i => Math.min(i + 1, filteredChannels.length - 1))
      return
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setFocusedChannelIdx(i => Math.max(i - 1, 0))
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = focusedChannelIdx + channelGridCols
      if (next < filteredChannels.length) {
        setFocusedChannelIdx(next)
      }
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = focusedChannelIdx - channelGridCols
      if (prev >= 0) {
        setFocusedChannelIdx(prev)
      }
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const ch = filteredChannels[focusedChannelIdx]
      if (ch) playChannel(ch)
      return
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
        <div style={{ width: 20, height: 20, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.6s linear infinite', marginRight: 12 }} />
        Loading channels...
      </div>
    )
  }

  return (
    <div ref={containerRef} tabIndex={0} onKeyDown={handleKey}
      style={{ padding: '16px 24px', outline: 'none', height: '100%', overflow: 'auto' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: '0 0 12px 0' }}>
        Live TV {!settingsStore.liveTvEnabled && (
          <span style={{ fontSize: 12, color: '#888', fontWeight: 400, marginLeft: 8 }}>
            (Enable in Settings)
          </span>
        )}
      </h2>

      {settingsStore.liveTvEnabled && (
        <>
          {filteredChannels.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
              No channels found for selected countries
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {groupedChannels.map(([countryCode, chs]) => (
              <div key={countryCode}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                  {chs[0]?.countryFlag} {chs[0]?.countryName || countryCode}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(200px, 1fr))`, gap: 10 }}>
                  {chs.map((ch, ci) => {
                    const globalIdx = filteredChannels.indexOf(ch)
                    const focused = isChannelFocused(globalIdx)
                    return (
                      <div key={ch.id}
                        data-channel-idx={globalIdx}
                        onClick={() => playChannel(ch)}
                        onMouseEnter={() => setFocusedChannelIdx(globalIdx)}
                        style={{
                          background: focused ? 'rgba(var(--accent-rgb, 255, 107, 0), 0.18)' : 'rgba(255,255,255,0.04)',
                          borderRadius: 10, border: '2px solid transparent',
                          borderColor: focused ? 'var(--accent, #FF6B00)' : 'transparent',
                          cursor: 'pointer', overflow: 'hidden', transition: 'background 0.15s',
                          display: 'flex', flexDirection: 'column',
                          opacity: playing === ch.id ? 0.5 : 1,
                        }}
                      >
                        <div style={{
                          aspectRatio: '16/9', background: '#111', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', position: 'relative',
                        }}>
                          {ch.image ? (
                            <img src={ch.image} alt={ch.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                          ) : (
                            <div style={{ fontSize: 28, fontWeight: 800, color: 'rgba(255,255,255,0.15)' }}>
                              {ch.name.charAt(0)}
                            </div>
                          )}
                          {playing === ch.id && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
                              <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                            </div>
                          )}
                        </div>
                        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ch.name}
                          </div>
                          {ch.brand && (
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{ch.brand}</div>
                          )}
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {qualityBadge(ch.defaultQuality)}
                            {ch.qualities.filter(q => q.name.toUpperCase() !== ch.defaultQuality.toUpperCase()).slice(0, 2).map(q => qualityBadge(q.name))}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
