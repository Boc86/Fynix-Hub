import React, { useEffect, useRef, useState, useMemo } from 'react'
import { useSettingsStore } from '../../store/settingsStore'

interface EPGChannel {
  id: string
  displayName: string
  icon: string
}

interface EPGProgramme {
  channelId: string
  start: number
  stop: number
  title: string
  description: string
  category: string
  episode: string
  image: string
}

interface MappedChannel {
  epgChannelId: string
  liveTvChannelId: string
  displayName: string
  icon: string
  liveTvName: string
  liveTvLogo: string
  liveTvCountryCode: string
  liveTvCountryName: string
  liveTvCountryFlag: string
  liveTvPlayerUrl: string
}

interface LiveTvChannel {
  id: string
  name: string
  image: string
  logoImage: string
  countryCode: string
  countryName: string
  countryFlag: string
  playerUrl: string
}

const HOUR_MS = 3600
const SLOT_WIDTH = 120
const ROW_HEIGHT = 80
const CHANNEL_WIDTH = 200
const HEADER_HEIGHT = 50
const SCROLL_AMOUNT = 300

interface SourceItem {
  id: string
  label: string
  color: string
  type?: 'default' | 'm3u'
  m3uUrl?: string
}

export default function EPG({ onPlayUrl, onBack, liveTvChannels }: { onPlayUrl: (url: string) => Promise<void>; onBack: () => void; liveTvChannels?: LiveTvChannel[] }) {
  const [channels, setChannels] = useState<MappedChannel[]>([])
  const [selectedChannelIdx, setSelectedChannelIdx] = useState(0)
  const [focusedChannelIdx, setFocusedChannelIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [playError, setPlayError] = useState<string | null>(null)
  const [nowNextMap, setNowNextMap] = useState<Record<string, { now: EPGProgramme | null; next: EPGProgramme | null }>>({})
  const [gridData, setGridData] = useState<Record<string, EPGProgramme[]>>({})
  const gridRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const channelListRef = useRef<HTMLDivElement>(null)

  // Source selection modal state
  const [selectedChannel, setSelectedChannel] = useState<MappedChannel | null>(null)
  const [sourceLoading, setSourceLoading] = useState(false)
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [focusedSourceIndex, setFocusedSourceIndex] = useState(0)
  const [m3uSources, setM3uSources] = useState<SourceItem[]>([])

  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10)

  useEffect(() => {
    setLoading(true)
    window.api.epg.getChannels(liveTvChannels).then(async (chs: MappedChannel[]) => {
      setChannels(chs)
      if (chs.length === 0) { setLoading(false); return }

      const [nnMap, schedMap] = await Promise.all([
        Promise.all(chs.map(async (ch) => {
          try {
            const nn = await window.api.epg.getNowNext(ch.epgChannelId)
            return [ch.liveTvChannelId, nn] as const
          } catch { return [ch.liveTvChannelId, { now: null, next: null }] as const }
        })),
        Promise.all(chs.map(async (ch) => {
          try {
            const sched = await window.api.epg.getSchedule(ch.epgChannelId, dateStr)
            return [ch.liveTvChannelId, sched] as const
          } catch { return [ch.liveTvChannelId, [] as EPGProgramme[]] as const }
        })),
      ])

      setNowNextMap(Object.fromEntries(nnMap))
      setGridData(Object.fromEntries(schedMap))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [liveTvChannels])

  useEffect(() => { containerRef.current?.focus() }, [loading])

  useEffect(() => {
    if (loading || !gridRef.current) return
    const now = Date.now() / 1000
    const offset = Math.max(0, ((now - dayStart) / HOUR_MS) * SLOT_WIDTH - window.innerWidth / 3)
    gridRef.current.scrollLeft = offset
  }, [loading])

  useEffect(() => {
    const el = gridRef.current?.querySelector(`[data-epg-row="${focusedChannelIdx}"]`)
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    const chEl = channelListRef.current?.querySelector(`[data-ch-row="${focusedChannelIdx}"]`)
    if (chEl) chEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focusedChannelIdx])

  const now = Math.floor(Date.now() / 1000)
  const dayStart = Math.floor(new Date(dateStr).getTime() / 1000)
  const dayEnd = dayStart + 86400

  const timeSlots = useMemo(() => {
    const slots: number[] = []
    for (let t = dayStart; t < dayEnd; t += HOUR_MS) slots.push(t)
    return slots
  }, [dayStart])

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const isLive = (p: EPGProgramme) => p.start <= now && p.stop > now

  const getProgress = (p: EPGProgramme) => {
    if (!isLive(p)) return 0
    const total = p.stop - p.start
    if (total <= 0) return 0
    return ((now - p.start) / total) * 100
  }

  const programmeLeft = (p: EPGProgramme) => {
    return ((p.start - dayStart) / HOUR_MS) * SLOT_WIDTH
  }

  const scrollGrid = (dir: 'left' | 'right') => {
    if (!gridRef.current) return
    gridRef.current.scrollBy({ left: dir === 'left' ? -SCROLL_AMOUNT : SCROLL_AMOUNT, behavior: 'smooth' })
  }

  // When a channel is selected, fetch matching M3U sources
  useEffect(() => {
    if (!selectedChannel) { setM3uSources([]); return }
    let cancelled = false
    const iptvApi = window.api.iptvM3u
    if (!iptvApi) return

    iptvApi.findChannel(selectedChannel.liveTvName).then((matches: any[]) => {
      if (cancelled) return
      setM3uSources(matches.map((m: any) => ({
        id: `m3u:${m.source.url}`,
        label: m.source.label,
        color: '#a855f7',
        type: 'm3u' as const,
        m3uUrl: m.channel.url,
      })))
    }).catch(() => { if (!cancelled) setM3uSources([]) })

    return () => { cancelled = true }
  }, [selectedChannel?.liveTvChannelId])

  const getSources = (): SourceItem[] => {
    const defaults: SourceItem[] = [
      { id: 'cdnlive', label: 'CDNLive', color: '#f97316' },
      { id: 'ondemand', label: 'OnDemand', color: '#3b82f6' },
      { id: 'dlhd', label: 'DLHD', color: '#22c55e' },
    ]
    return [...defaults, ...m3uSources]
  }

  const playChannelWithSource = async (ch: MappedChannel, source: SourceItem) => {
    setSourceLoading(true)
    setSourceError(null)
    try {
      if (source.type === 'm3u') {
        if (!source.m3uUrl) throw new Error('No play URL for this M3U source')
        window.api.log(`[EPG M3U] Playing "${ch.liveTvName}" from ${source.label}`)
        await onPlayUrl(source.m3uUrl)
      } else {
        const result = await window.api.damiTv.extractUrl({
          id: ch.liveTvChannelId,
          name: ch.liveTvName,
          countryCode: ch.liveTvCountryCode,
          playerUrl: ch.liveTvPlayerUrl,
        }, source.id)
        if (!result?.hlsUrl) throw new Error('No URL extracted')
        await onPlayUrl(result.hlsUrl)
      }
      setSelectedChannel(null); setSourceLoading(false); setFocusedSourceIndex(0)
    } catch (err: any) {
      setSourceError(err?.message || 'Unknown error'); setSourceLoading(false)
    }
  }

  // ── Window-level keyboard handler for source modal ──
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (selectedChannel) {
        // Modal navigation
        const sources = getSources()
        if (sources.length === 0) return
        if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedSourceIndex(i => (i + 1) % sources.length) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedSourceIndex(i => (i - 1 + sources.length) % sources.length) }
        else if (e.key === 'Enter') {
          e.preventDefault()
          if (focusedSourceIndex < sources.length) playChannelWithSource(selectedChannel, sources[focusedSourceIndex])
        } else if (e.key === 'Backspace' || e.key === 'Escape') {
          e.preventDefault()
          setSelectedChannel(null); setSourceLoading(false); setSourceError(null); setFocusedSourceIndex(0)
        }
        return
      }

      // Grid navigation (modal closed)
      if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); onBack(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedChannelIdx(i => Math.min(i + 1, channels.length - 1)); setSelectedChannelIdx(i => Math.min(i + 1, channels.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedChannelIdx(i => Math.max(i - 1, 0)); setSelectedChannelIdx(i => Math.max(i - 1, 0)) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); scrollGrid('left') }
      if (e.key === 'ArrowRight') { e.preventDefault(); scrollGrid('right') }
      if (e.key === 'Enter') {
        e.preventDefault()
        const ch = channels[focusedChannelIdx]
        if (ch) { setSelectedChannel(ch); setFocusedSourceIndex(0) }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectedChannel, focusedSourceIndex, focusedChannelIdx, channels])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
        <div style={{ width: 20, height: 20, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.6s linear infinite', marginRight: 12 }} />
        Loading EPG...
      </div>
    )
  }

  if (channels.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>No EPG data available for your visible channels</div>
        <button onClick={() => { setLoading(true); window.api.epg.refresh().then(() => window.location.reload()).catch(() => setLoading(false)) }}
          style={{ padding: '8px 20px', borderRadius: 20, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600 }}
        >Refresh EPG</button>
      </div>
    )
  }

  const selCh = channels[selectedChannelIdx]
  const selNN = selCh ? nowNextMap[selCh.liveTvChannelId] : null

  return (
    <div ref={containerRef} tabIndex={0} style={{ display: 'flex', flexDirection: 'column', height: '100%', outline: 'none' }}>
      {/* Source Selection Modal */}
      {selectedChannel && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={() => {
          setSelectedChannel(null); setSourceLoading(false); setSourceError(null); setFocusedSourceIndex(0)
        }}>
          <div style={{
            width: 400, maxWidth: '90vw', background: 'var(--bg-secondary)', borderRadius: 8, padding: 24,
            display: 'flex', flexDirection: 'column', gap: 16
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>Select Source</h2>
              <button onClick={() => { setSelectedChannel(null); setSourceLoading(false); setSourceError(null); setFocusedSourceIndex(0) }}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '1.5rem', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: 12 }}>{selectedChannel.liveTvName}</div>
            {getSources().map((source, index) => (
              <div key={source.id}
                style={{
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', borderRadius: 8, transition: 'background 0.15s',
                  background: focusedSourceIndex === index ? 'rgba(var(--accent-rgb), 0.15)' : 'transparent',
                  outline: focusedSourceIndex === index ? '2px solid var(--accent)' : 'none',
                  outlineOffset: -1,
                }}
                onClick={() => { if (!sourceLoading) playChannelWithSource(selectedChannel, source) }}
                onMouseEnter={() => setFocusedSourceIndex(index)}
              >
                <div style={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0, background: source.color }}></div>
                <span style={{ color: '#fff', fontWeight: 500, fontSize: '0.95rem' }}>{source.label}</span>
              </div>
            ))}
            {sourceLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                <div style={{ width: 20, height: 20, border: '2px solid #fff', borderTopColor: '#aaa', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
              </div>
            ) : sourceError ? (
              <div style={{ background: 'rgba(255,60,60,0.15)', borderRadius: 8, padding: 16, color: '#ff6b6b', textAlign: 'center' }}>
                <p style={{ margin: 0 }}>{sourceError}</p>
                <button onClick={() => { setSourceLoading(false); setSourceError(null) }}
                  style={{ marginTop: 8, fontSize: 13, color: '#4da6ff', background: 'none', border: 'none', cursor: 'pointer' }}>Retry</button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border, #2a2a4a)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: 0 }}>TV Guide</h2>
      </div>

      {playError && (
        <div style={{ padding: '8px 16px', background: 'rgba(255,59,48,0.15)', color: '#ff3b30', fontSize: 12 }}>
          {playError}
        </div>
      )}

      {selNN && (selNN.now || selNN.next) && (
        <div style={{ display: 'flex', gap: 12, padding: 12, background: 'var(--bg-primary, #0d0d1a)', borderBottom: '1px solid var(--border, #2a2a4a)', position: 'sticky', top: 0, zIndex: 10 }}>
          {selNN.now && (
            <div style={{ flex: 1, background: 'rgba(var(--accent-rgb, 255, 107, 0), 0.12)', borderRadius: 8, padding: 12, border: '1px solid var(--accent)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 10, background: 'var(--accent)', color: '#fff', padding: '2px 6px', borderRadius: 3, fontWeight: 700 }}>NOW</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{formatTime(selNN.now.start)} - {formatTime(selNN.now.stop)}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{selNN.now.title}</div>
              {selNN.now.description && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selNN.now.description}</div>}
              <div style={{ marginTop: 6, height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${getProgress(selNN.now)}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 30s linear' }} />
              </div>
            </div>
          )}
          {selNN.next && (
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', padding: '2px 6px', borderRadius: 3, fontWeight: 700 }}>NEXT</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{formatTime(selNN.next.start)} - {formatTime(selNN.next.stop)}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{selNN.next.title}</div>
              {selNN.next.description && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selNN.next.description}</div>}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ width: CHANNEL_WIDTH, flexShrink: 0, overflow: 'hidden', borderRight: '1px solid var(--border, #2a2a4a)', position: 'sticky', left: 0, zIndex: 5, background: 'var(--bg-primary, #0d0d1a)' }}>
          <div style={{ height: HEADER_HEIGHT, borderBottom: '1px solid var(--border, #2a2a4a)', padding: '0 12px', display: 'flex', alignItems: 'center', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>CHANNELS</div>
          <div ref={channelListRef} style={{ overflow: 'auto', height: `calc(100% - ${HEADER_HEIGHT}px)` }}>
            {channels.map((ch, i) => (
              <div key={`${ch.liveTvChannelId ?? i}`} data-ch-row={i}
                onClick={() => { setFocusedChannelIdx(i); setSelectedChannelIdx(i) }}
                onDoubleClick={() => { setSelectedChannel(ch); setFocusedSourceIndex(0) }}
                style={{
                  height: ROW_HEIGHT, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', cursor: 'pointer',
                  background: i === focusedChannelIdx ? 'rgba(var(--accent-rgb), 0.18)' : (i === selectedChannelIdx ? 'rgba(255,255,255,0.06)' : 'transparent'),
                  borderLeft: i === focusedChannelIdx ? '3px solid var(--accent)' : '3px solid transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={() => setFocusedChannelIdx(i)}
              >
                {ch.liveTvLogo
                  ? <img src={ch.liveTvLogo} alt="" style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 6 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  : <span style={{ fontSize: 12, fontWeight: 500, color: i === focusedChannelIdx ? 'var(--accent)' : 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.liveTvName}</span>
                }
              </div>
            ))}
          </div>
        </div>

        <div ref={gridRef} style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ height: HEADER_HEIGHT, borderBottom: '1px solid var(--border, #2a2a4a)', display: 'flex', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 2, minWidth: timeSlots.length * SLOT_WIDTH }}>
            {timeSlots.map((ts, i) => (
              <div key={i} style={{ width: SLOT_WIDTH, flexShrink: 0, textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                {formatTime(ts)}
              </div>
            ))}
          </div>

          {channels.map((ch, ci) => {
            const raw = (gridData[ch.liveTvChannelId] || []).slice().sort((a, b) => a.start - b.start)
            const progs: { p: EPGProgramme; clampedStop: number }[] = []
            let lastEnd = 0
            for (let ri = 0; ri < raw.length; ri++) {
              const p = raw[ri]
              if (p.start < lastEnd) continue
              const nextStart = ri < raw.length - 1 ? raw[ri + 1].start : dayEnd
              const clampedStop = Math.min(p.stop, nextStart)
              progs.push({ p, clampedStop })
              lastEnd = clampedStop
            }
            const totalWidth = timeSlots.length * SLOT_WIDTH
            return (
              <div key={`${ch.liveTvChannelId ?? ci}`} data-epg-row={ci} style={{ height: ROW_HEIGHT, position: 'relative', minWidth: totalWidth, borderBottom: '1px solid rgba(255,255,255,0.04)', background: ci === focusedChannelIdx ? 'rgba(var(--accent-rgb), 0.06)' : 'transparent' }}>
                {progs.map(({ p, clampedStop }, pi) => {
                  const dur = clampedStop - p.start
                  const w = (dur / HOUR_MS) * SLOT_WIDTH
                  const left = programmeLeft(p)
                  const live = isLive(p)
                  return (
                    <div key={`${p.start}-${pi}`}
                      style={{
                        position: 'absolute', top: 4, left, width: w - 2, height: ROW_HEIGHT - 8, borderRadius: 6,
                        boxSizing: 'border-box',
                        background: live ? 'rgba(var(--accent-rgb), 0.2)' : 'rgba(255,255,255,0.06)',
                        border: live ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.08)',
                        padding: '4px 8px', cursor: 'pointer', overflow: 'hidden',
                        display: 'flex', flexDirection: 'column',
                      }}
                      onClick={() => {
                        setFocusedChannelIdx(ci)
                        setSelectedChannelIdx(ci)
                      }}
                      onDoubleClick={() => { setSelectedChannel(ch); setFocusedSourceIndex(0) }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 600, color: live ? 'var(--accent)' : '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{formatTime(p.start)}</div>
                      {live && (
                        <div style={{ marginTop: 'auto', height: 2, background: 'rgba(255,255,255,0.15)', borderRadius: 1, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${getProgress(p)}%`, background: 'var(--accent)', borderRadius: 1 }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
