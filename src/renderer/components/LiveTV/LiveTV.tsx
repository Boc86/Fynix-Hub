import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import styles from './LiveTV.module.css'

interface Channel {
  id: string
  name: string
  image: string
  logoImage: string
  countryCode: string
  countryName: string
  countryFlag: string
  playerUrl: string
  source: string
  status: string
}

function ChannelLogo({ logoImage, fallbackImage, name }: { logoImage: string; fallbackImage: string; name: string }) {
  const [src, setSrc] = React.useState(logoImage || fallbackImage)
  const [failed, setFailed] = React.useState(false)

  const handleError = React.useCallback(() => {
    if (src === logoImage && fallbackImage) {
      setSrc(fallbackImage)
    } else {
      setFailed(true)
    }
  }, [src, logoImage, fallbackImage])

  if (failed || !src) {
    return null  // The bottom name bar is sufficient
  }

  return <img src={src} alt="" loading="lazy"
    style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', height: 'calc(100% - 40px)', width: 'auto', maxWidth: '90%', objectFit: 'contain' }}
    onError={handleError}
  />
}

interface SourceItem {
  id: string
  label: string
  color: string
  type: 'cdnlive' | 'ondemand' | 'dlhd' | 'm3u'
  m3uUrl?: string
}

// API exposed to parent (App.tsx) via ref for keyboard delegation
export interface LiveTVAPI {
  handleKeyDown: (e: KeyboardEvent) => boolean
}

export default function LiveTV({ onPlayUrl, onBack, apiRef }: {
  onPlayUrl: (url: string) => Promise<void>
  onBack: () => void
  apiRef?: React.MutableRefObject<LiveTVAPI | null>
}) {
  const settingsStore = useSettingsStore()
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [focusedChannelIdx, setFocusedChannelIdx] = useState(0)
  const [playing, setPlaying] = useState<string | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)

  // Source selection modal state
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null)
  const [sourceLoading, setSourceLoading] = useState(false)
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [focusedSourceIndex, setFocusedSourceIndex] = useState(0)
  const [m3uSources, setM3uSources] = useState<SourceItem[]>([])

  const containerRef = useRef<HTMLDivElement>(null)

  // Load channels from cdnlive only
  useEffect(() => {
    setLoading(true)
    window.api.damiTv.getChannels('cdnlive').then(ch => {
      window.api.log(`[LiveTV] ${ch.length} channels loaded from cdnlive`)
      setChannels(ch)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // When a channel is selected, fetch matching M3U sources
  useEffect(() => {
    if (!selectedChannel) { setM3uSources([]); return }
    let cancelled = false
    const iptvApi = window.api.iptvM3u
    if (!iptvApi) return

    iptvApi.findChannel(selectedChannel.name).then((matches: any[]) => {
      if (cancelled) return
      setM3uSources(matches.map((m: any) => ({
        id: `m3u:${m.source.url}`,
        label: m.source.label,
        color: styles['iptv-m3u'],
        type: 'm3u' as const,
        m3uUrl: m.channel.url,
      })))
    }).catch(() => { if (!cancelled) setM3uSources([]) })

    return () => { cancelled = true }
  }, [selectedChannel?.id])

  // Auto-focus container when loading completes
  useEffect(() => {
    if (!loading && containerRef.current) {
      containerRef.current.focus()
    }
  }, [loading])

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

  const flatItems = useMemo(() => {
    const map = new Map<string, Channel[]>()
    for (const ch of filteredChannels) {
      const arr = map.get(ch.countryCode) || []
      arr.push(ch)
      map.set(ch.countryCode, arr)
    }
    const groups = Array.from(map.entries())
    const items: Array<{ type: 'header'; countryCode: string; countryName: string; countryFlag: string } | { type: 'channel'; channel: Channel; flatIdx: number }> = []
    let flatIdx = 0
    for (const [countryCode, chs] of groups) {
      items.push({ type: 'header', countryCode, countryName: chs[0]?.countryName || countryCode, countryFlag: chs[0]?.countryFlag })
      for (const ch of chs) {
        items.push({ type: 'channel', channel: ch, flatIdx })
        flatIdx++
      }
    }
    return items
  }, [filteredChannels])

  const gridRef = useRef<HTMLDivElement>(null)
  const [actualCols, setActualCols] = useState(4)
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const cols = getComputedStyle(el).gridTemplateColumns.split(' ').length
      setActualCols(cols)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [loading])

  const { channelPos, rowChannels } = useMemo(() => {
    const pos = new Map<number, { row: number; col: number }>()
    const rows = new Map<number, number[]>()
    let visualRow = 0
    let col = 0
    for (const item of flatItems) {
      if (item.type === 'header') {
        visualRow++;
        col = 0
      } else {
        pos.set(item.flatIdx, { row: visualRow, col })
        let arr = rows.get(visualRow)
        if (!arr) { arr = []; rows.set(visualRow, arr) }
        arr.push(item.flatIdx)
        col++
        if (col >= actualCols) { visualRow++; col = 0 }
      }
    }
    return { channelPos: pos, rowChannels: rows }
  }, [flatItems, actualCols])
  const allRows = useMemo(() => [...rowChannels.keys()].sort((a, b) => a - b), [rowChannels])

  const isChannelFocused = (idx: number) => idx === focusedChannelIdx

  const channelRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const ignoreNextClick = useRef(false)
  useEffect(() => {
    const el = channelRefs.current.get(focusedChannelIdx)
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focusedChannelIdx])

  const getSources = useCallback((): SourceItem[] => {
    const defaults: SourceItem[] = [
      { id: 'cdnlive', label: 'CDNLive', color: styles.cdnlive, type: 'cdnlive' },
      { id: 'ondemand', label: 'OnDemand', color: styles.ondemand, type: 'ondemand' },
      { id: 'dlhd', label: 'DLHD', color: styles.dlhd, type: 'dlhd' },
    ]
    return [...defaults, ...m3uSources]
  }, [m3uSources])

  const playChannelWithSource = useCallback(async (ch: Channel, source: SourceItem) => {
    setSourceLoading(true)
    setSourceError(null)
    try {
      if (source.type === 'm3u') {
        if (!source.m3uUrl) throw new Error('No play URL for this M3U source')
        window.api.log(`[LiveTV M3U] Playing "${ch.name}" from ${source.label}`)
        await onPlayUrl(source.m3uUrl)
      } else if (source.type === 'ondemand') {
        const result = await window.api.damiTv.extractUrl(
          { id: ch.id, name: ch.name, countryCode: ch.countryCode, playerUrl: ch.playerUrl },
          'cdnlive'
        )
        if (!result?.hlsUrl) {
          window.api.log(`[LiveTV OnDemand] CDNLive extraction failed, trying ondemand.st`)
          const src = encodeURIComponent(ch.playerUrl || ch.id)
          const streamUrl = await window.api.onDemand.extractStream(`https://ondemand.st/embed/channel/?id=${src}`)
          if (!streamUrl) throw new Error('OnDemand: no stream URL could be extracted')
          await onPlayUrl(streamUrl)
        } else {
          await onPlayUrl(result.hlsUrl)
        }
      } else {
        const result = await window.api.damiTv.extractUrl(
          { id: ch.id, name: ch.name, countryCode: ch.countryCode, playerUrl: ch.playerUrl },
          source.id
        )
        if (!result?.hlsUrl) throw new Error('No URL extracted')
        await onPlayUrl(result.hlsUrl)
      }
      setSelectedChannel(null); setSourceLoading(false); setFocusedSourceIndex(0)
    } catch (err: any) {
      setSourceError(err?.message || 'Unknown error'); setSourceLoading(false)
    }
  }, [onPlayUrl])

  // ── Export keyboard handler via ref (used by App.tsx's global handler) ──
  const handleKeyDown = useCallback((e: KeyboardEvent): boolean => {
    if (selectedChannel) {
      // Modal is open — navigate sources
      const sources = getSources()
      if (sources.length === 0) return false

      if (e.key === 'ArrowDown') {
        e.preventDefault(); setFocusedSourceIndex(i => (i + 1) % sources.length); return true
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault(); setFocusedSourceIndex(i => (i - 1 + sources.length) % sources.length); return true
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (focusedSourceIndex < sources.length) {
          playChannelWithSource(selectedChannel!, sources[focusedSourceIndex])
        }
        return true
      }
      if (e.key === 'Backspace' || e.key === 'Escape') {
        e.preventDefault()
        setSelectedChannel(null); setSourceLoading(false); setSourceError(null); setFocusedSourceIndex(0)
        return true
      }
      return false
    }

    // Grid navigation (modal closed)
    if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); onBack(); return true }
    if (filteredChannels.length === 0) return false

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      setFocusedChannelIdx(i => {
        const p = channelPos.get(i); if (!p) return i
        const rowItems = rowChannels.get(p.row) || []; const nextCol = p.col + 1
        if (nextCol < rowItems.length) return rowItems[nextCol]
        const curRowIdx = allRows.indexOf(p.row)
        if (curRowIdx < allRows.length - 1) { const nr = rowChannels.get(allRows[curRowIdx + 1]) || []; if (nr.length > 0) return nr[0] }
        return i
      })
      return true
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setFocusedChannelIdx(i => {
        const p = channelPos.get(i); if (!p) return i
        const rowItems = rowChannels.get(p.row) || []; const prevCol = p.col - 1
        if (prevCol >= 0) return rowItems[prevCol]
        const curRowIdx = allRows.indexOf(p.row)
        if (curRowIdx > 0) { const pr = rowChannels.get(allRows[curRowIdx - 1]) || []; if (pr.length > 0) return pr[pr.length - 1] }
        return i
      })
      return true
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedChannelIdx(i => {
        const p = channelPos.get(i); if (!p) return i
        const curRowIdx = allRows.indexOf(p.row)
        for (let r = curRowIdx + 1; r < allRows.length; r++) { const items = rowChannels.get(allRows[r]) || []; const same = items.find(idx => channelPos.get(idx)?.col === p.col); if (same !== undefined) return same }
        return i
      })
      return true
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedChannelIdx(i => {
        const p = channelPos.get(i); if (!p) return i
        const curRowIdx = allRows.indexOf(p.row)
        for (let r = curRowIdx - 1; r >= 0; r--) { const items = rowChannels.get(allRows[r]) || []; const same = items.find(idx => channelPos.get(idx)?.col === p.col); if (same !== undefined) return same }
        return i
      })
      return true
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const ch = filteredChannels[focusedChannelIdx]
      if (ch) { setSelectedChannel(ch); setFocusedSourceIndex(0) }
      return true
    }
    return false
  }, [selectedChannel, focusedSourceIndex, getSources, playChannelWithSource, filteredChannels, focusedChannelIdx, channelPos, rowChannels, allRows, onBack])

  // Expose keyboard handler to parent via ref
  useEffect(() => {
    if (apiRef) {
      apiRef.current = { handleKeyDown }
      return () => { apiRef.current = null }
    }
  })

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
        <div style={{ width: 20, height: 20, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.6s linear infinite', marginRight: 12 }} />
        Loading channels...
      </div>
    )
  }

  const sources = selectedChannel ? getSources() : []

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      style={{ padding: '16px 24px', outline: 'none', height: '100%', overflow: 'auto' }}
    >
      {/* Source Selection Modal */}
      {selectedChannel && (
        <div className={styles.overlay} onClick={() => {
          setSelectedChannel(null); setSourceLoading(false); setSourceError(null); setFocusedSourceIndex(0)
        }}>
          <div className={`${styles.sourceModal} animate-scale`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Select Source</h2>
              <button onClick={() => { setSelectedChannel(null); setSourceLoading(false); setSourceError(null); setFocusedSourceIndex(0) }} className={styles.closeButton}>×</button>
            </div>
            <div className={styles.channelName}>{selectedChannel?.name}</div>
            <div className={styles.torrentList}>
              {sources.map((source, index) => (
                <div
                  key={source.id}
                  className={`${styles.sourceItem} ${focusedSourceIndex === index ? styles['source-item-focused'] : ''}`}
                  tabIndex={-1}
                  onClick={() => { if (!sourceLoading) playChannelWithSource(selectedChannel, source) }}
                >
                  <div className={`${styles.sourceDot} ${source.color}`}></div>
                  <span className={styles.sourceLabel}>{source.label}</span>
                </div>
              ))}
            </div>
            {sourceLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                <div style={{ width: 20, height: 20, border: '2px solid #fff', borderTopColor: '#aaa', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
              </div>
            ) : sourceError ? (
              <div style={{ background: 'rgba(255,60,60,0.15)', borderRadius: 8, padding: 16, color: '#ff6b6b', textAlign: 'center', margin: '16px 0' }}>
                <p>{sourceError}</p>
                <button onClick={() => { setSourceLoading(false); setSourceError(null) }} style={{ marginTop: 8, fontSize: 13, color: '#4da6ff', background: 'none', border: 'none', cursor: 'pointer' }}>Retry</button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {settingsStore.liveTvEnabled && (
        <>
          {playError && (
            <div style={{ padding: '8px 14px', marginBottom: 12, background: 'rgba(255,60,60,0.15)', borderRadius: 8, fontSize: 13, color: '#ff6b6b' }}>
              {playError}
            </div>
          )}
          {filteredChannels.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
              No channels found for selected countries
            </div>
          )}
          <div ref={gridRef} style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(200px, 1fr))`, gap: 10 }}>
            {flatItems.map((item) => {
              if (item.type === 'header') {
                return (
                  <div key={`hdr-${item.countryCode}`}
                    style={{ gridColumn: '1 / -1', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 }}>
                    {item.countryFlag} {item.countryName}
                  </div>
                )
              }
              const ch = item.channel
              const focused = isChannelFocused(item.flatIdx)
              return (
                <div
                  key={ch.id}
                  ref={el => { if (el) channelRefs.current.set(item.flatIdx, el) }}
                  data-focus-index={item.flatIdx}
                  tabIndex={0}
                  onClick={() => {
                    if (ignoreNextClick.current) { ignoreNextClick.current = false; return }
                    setSelectedChannel(ch); setFocusedSourceIndex(0)
                  }}
                  onMouseEnter={() => setFocusedChannelIdx(item.flatIdx)}
                  style={{
                    position: 'relative', aspectRatio: '16/9',
                    background: focused ? 'rgba(255,255,255,0.05)' : '#111',
                    border: focused ? '2px solid var(--accent)' : '1px solid var(--border)',
                    borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                    transition: 'all 0.15s ease', padding: 0
                  }}
                >
                  <ChannelLogo logoImage={ch.logoImage} fallbackImage={ch.image} name={ch.name} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '6px 8px', fontSize: 12, fontWeight: 500, background: 'rgba(0,0,0,0.7)', color: '#fff', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ch.name}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
