import React, { useEffect, useRef, useState, useMemo } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import { useChannelLogo } from '../../utils/useChannelLogo'
import { normalizeLogoUrl } from '../../utils/logos'

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
const MENU_WIDTH = 220
const MENU_HEIGHT = 120

/**
 * EPG channel row with logo fallback.
 * Calls useChannelLogo so it's a proper hook user.
 *
 * Priority: CDN/M3U logo -> EPG icon -> HEAD-checked tv-logos URL -> text label.
 */
function EPGChannelRow({
  ch,
  focused,
  selected,
  onClick,
  onDoubleClick,
  onMouseEnter,
}: {
  ch: MappedChannel
  focused: boolean
  selected: boolean
  onClick: () => void
  onDoubleClick: () => void
  onMouseEnter: () => void
}) {
  const customLogo = useSettingsStore((s) => s.liveTvCustomLogos?.[ch.liveTvChannelId] || '')
  const customName = useSettingsStore((s) => s.liveTvCustomNames?.[ch.liveTvChannelId] || '')
  const displayName = customName || ch.liveTvName
  const primary = normalizeLogoUrl(customLogo) || ch.liveTvLogo || ''
  // 4-tier chain: custom/LiveTV logo (as cdnLogo) -> EPG icon -> HEAD-checked
  // GitHub fallback. The fuzzy GitHub match uses the custom name when the
  // channel was renamed (the slug is derived from the display name).
  const verified = useChannelLogo(displayName, primary, ch.liveTvCountryCode, ch.icon)
  const [src, setSrc] = useState(primary || verified)
  useEffect(() => {
    setSrc(primary || verified)
  }, [primary, verified])
  return (
    <div
      key={`${ch.liveTvChannelId}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={onMouseEnter}
      style={{
        height: ROW_HEIGHT, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', cursor: 'pointer',
        background: focused ? 'rgba(var(--accent-rgb), 0.18)' : (selected ? 'rgba(255,255,255,0.06)' : 'transparent'),
        borderLeft: focused ? '3px solid var(--accent)' : '3px solid transparent',
        transition: 'background 0.1s',
      }}
    >
      {src
        ? <img src={src} alt="" style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 6 }} onError={() => { if (src !== verified) setSrc(verified) }} />
        : <span style={{ fontSize: 12, fontWeight: 500, color: focused ? 'var(--accent)' : 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
      }
      <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: focused ? 'var(--accent)' : 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
    </div>
  )
}

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
  const [focusedProgrammeIdx, setFocusedProgrammeIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [playError, setPlayError] = useState<string | null>(null)
  const [nowNextMap, setNowNextMap] = useState<Record<string, { now: EPGProgramme | null; next: EPGProgramme | null }>>({})
  const [gridData, setGridData] = useState<Record<string, EPGProgramme[]>>({})
  const gridRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const channelListRef = useRef<HTMLDivElement>(null)

  // Lazy loading — only render rows visible in the viewport + a small buffer.
  // Channels list scrolls at the same rate as the grid; track both.
  const [visibleRowStart, setVisibleRowStart] = useState(0)
  const [visibleRowEnd, setVisibleRowEnd] = useState(50)
  const ROW_BUFFER = 10

  // Context-menu state — opened by 'C' key or remote contextMenu button.
  // Position is fixed (centred on screen), not anchored to a grid cell.
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; prog: EPGProgramme; ch: MappedChannel } | null>(null)

  // Source selection modal state
  const [selectedChannel, setSelectedChannel] = useState<MappedChannel | null>(null)
  const [sourceLoading, setSourceLoading] = useState(false)
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [focusedSourceIndex, setFocusedSourceIndex] = useState(0)
  const [m3uSources, setM3uSources] = useState<SourceItem[]>([])

  // Recording state
  const [recordMsg, setRecordMsg] = useState<{ text: string; error?: boolean } | null>(null)
  const [recordedKeys, setRecordedKeys] = useState<Set<string>>(new Set())
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null)
  const [activeRecordingChannel, setActiveRecordingChannel] = useState<string | null>(null)

  // Check for an in-progress recording on mount + every 15s
  useEffect(() => {
    const checkActive = async () => {
      try {
        const list = await window.api.recordings.list()
        const active = list.find((r: any) => r.status === 'recording' || r.status === 'scheduled')
        if (active) {
          setActiveRecordingId(active.id)
          setActiveRecordingChannel(active.channelName)
        } else {
          setActiveRecordingId(null); setActiveRecordingChannel(null)
        }
        // Rebuild recordedKeys from persisted list
        const keys = new Set<string>()
        for (const r of list) {
          if (r.channelName && r.startTime) keys.add(`${r.channelName}:${r.startTime}`)
        }
        setRecordedKeys(keys)
      } catch { /* ignore */ }
    }
    checkActive()
    const iv = setInterval(checkActive, 15000)
    return () => clearInterval(iv)
  }, [])

  const today = new Date()
  // Local calendar date (toISOString is UTC — wrong day between midnight and
  // 1am in UTC+ timezones like the UK in summer).
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const [refreshNonce, setRefreshNonce] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      // Re-check staleness every time the EPG opens. The provider's window is
      // only ~2-3 days, so a long-running app or a day rollover can leave the
      // cache without today's data even inside the 24h startup TTL.
      try { await window.api.epg.ensureLoaded() } catch { /* keep cached */ }
      if (cancelled) return
      try {
        const chs: MappedChannel[] = await window.api.epg.getChannels(liveTvChannels)
        if (cancelled) return
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
        if (cancelled) return
        setNowNextMap(Object.fromEntries(nnMap))
        setGridData(Object.fromEntries(schedMap))
        setLoading(false)
      } catch {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [liveTvChannels, dateStr, refreshNonce])

  useEffect(() => { containerRef.current?.focus() }, [loading])

  // Manual re-fetch: pull fresh data from the provider, then reload the grid.
  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const codes = useSettingsStore.getState().selectedLiveTvCountries
      await window.api.epg.refresh(codes && codes.length > 0 ? codes : undefined)
    } catch (err: any) {
      setRecordMsg({ text: `EPG refresh failed: ${err?.message || err}`, error: true })
      setTimeout(() => setRecordMsg(null), 4000)
    } finally {
      setRefreshing(false)
      setRefreshNonce((n) => n + 1)
    }
  }

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
  // Local midnight (matches getSchedule's local-day parse in main).
  const [y, m, d] = dateStr.split('-').map(Number)
  const dayStart = Math.floor(new Date(y, m - 1, d).getTime() / 1000)
  const dayEnd = dayStart + 86400

  const timeSlots = useMemo(() => {
    const slots: number[] = []
    for (let t = dayStart; t < dayEnd; t += HOUR_MS) slots.push(t)
    return slots
  }, [dayStart])

  // Apply channel visibility filter (matches LiveTV behavior).
  // If the user has selected specific channels in Settings, only those are shown.
  const visibleChannels = useSettingsStore((s) => s.liveTvVisibleChannels)
  const hiddenChannels = useSettingsStore((s) => s.liveTvHiddenChannels)
  const channelOrder = useSettingsStore((s) => s.liveTvChannelOrder)
  const customNames = useSettingsStore((s) => s.liveTvCustomNames)
  const filteredChannels = useMemo(() => {
    let result = channels
    if (visibleChannels.length > 0) {
      result = result.filter(c => visibleChannels.includes(c.liveTvChannelId))
    }
    // Hide channels the user hid via the LiveTV context menu
    if (hiddenChannels.length > 0) {
      result = result.filter(c => !hiddenChannels.includes(c.liveTvChannelId))
    }
    if (channelOrder.length > 0) {
      const orderMap = new Map(channelOrder.map((id, i) => [id, i]))
      const ordered = result.filter(c => orderMap.has(c.liveTvChannelId))
      ordered.sort((a, b) => (orderMap.get(a.liveTvChannelId) ?? 999) - (orderMap.get(b.liveTvChannelId) ?? 999))
      const unordered = result.filter(c => !orderMap.has(c.liveTvChannelId))
      result = [...ordered, ...unordered]
    }
    return result
  }, [channels, visibleChannels, hiddenChannels, channelOrder])

  // Lazy row loading — recompute visible range on scroll. Track whichever
  // container is currently scrolled (grid or channel list).
  useEffect(() => {
    const updateRange = () => {
      const total = filteredChannels.length
      if (total === 0) return
      const rowH = ROW_HEIGHT
      const gridEl = gridRef.current
      const listEl = channelListRef.current
      let first = 0
      let last = Math.min(total - 1, 49)
      if (gridEl) {
        const top = gridEl.scrollTop
        const h = gridEl.clientHeight
        first = Math.max(0, Math.floor(top / rowH) - ROW_BUFFER)
        last = Math.min(total - 1, Math.ceil((top + h) / rowH) + ROW_BUFFER)
      } else if (listEl) {
        const top = listEl.scrollTop
        const h = listEl.clientHeight
        first = Math.max(0, Math.floor(top / rowH) - ROW_BUFFER)
        last = Math.min(total - 1, Math.ceil((top + h) / rowH) + ROW_BUFFER)
      }
      setVisibleRowStart(prev => prev !== first ? first : prev)
      setVisibleRowEnd(prev => prev !== last ? last : prev)
    }
    updateRange()
    const gridEl = gridRef.current
    const listEl = channelListRef.current
    gridEl?.addEventListener('scroll', updateRange, { passive: true })
    listEl?.addEventListener('scroll', updateRange, { passive: true })
    window.addEventListener('resize', updateRange)
    return () => {
      gridEl?.removeEventListener('scroll', updateRange)
      listEl?.removeEventListener('scroll', updateRange)
      window.removeEventListener('resize', updateRange)
    }
  }, [filteredChannels.length])

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

  // Programmes for a channel as rendered in the grid: non-overlapping, with
  // each cell's visible end clamped to the next programme's start. This is
  // the single source of truth for rendering AND for focus/menu indexing, so
  // focusedProgrammeIdx always matches the highlighted cell.
  const getRowProgs = (ch: MappedChannel): { p: EPGProgramme; clampedStop: number }[] => {
    const raw = (gridData[ch.liveTvChannelId] || []).slice().sort((a, b) => a.start - b.start)
    const out: { p: EPGProgramme; clampedStop: number }[] = []
    let lastEnd = 0
    for (let ri = 0; ri < raw.length; ri++) {
      const p = raw[ri]
      if (p.start < lastEnd) continue
      const nextStart = ri < raw.length - 1 ? raw[ri + 1].start : dayEnd
      const clampedStop = Math.min(p.stop, nextStart)
      out.push({ p, clampedStop })
      lastEnd = clampedStop
    }
    return out
  }

  // Open the context menu centred on screen (fixed position — never anchored
  // to a cell that may be scrolled off-screen). Triggered by 'C' key or the
  // remote contextMenu button. Programmes that already ended can't be
  // recorded, so no menu for them.
  const openContextMenu = () => {
    const ch = filteredChannels[focusedChannelIdx]
    if (!ch) return
    const row = getRowProgs(ch)
    const prog = row[focusedProgrammeIdx]?.p
    if (!prog) return
    if (prog.stop * 1000 <= Date.now()) return
    setContextMenu({
      x: Math.max(0, (window.innerWidth - MENU_WIDTH) / 2),
      y: Math.max(0, (window.innerHeight - MENU_HEIGHT) / 2),
      prog, ch,
    })
  }

  // Move focus between programme cells in the focused channel's row,
  // scrolling the grid so the focused programme stays visible.
  const navigateProgramme = (dir: -1 | 1) => {
    const ch = filteredChannels[focusedChannelIdx]
    if (!ch) return
    const row = getRowProgs(ch)
    if (row.length === 0) return
    setFocusedProgrammeIdx(prev => {
      const next = Math.max(0, Math.min(prev + dir, row.length - 1))
      const p = row[next]?.p
      if (p && gridRef.current) {
        const offset = programmeLeft(p) - 200
        const maxScroll = gridRef.current.scrollWidth - gridRef.current.clientWidth
        gridRef.current.scrollTo({ left: Math.max(0, Math.min(offset, maxScroll)), behavior: 'smooth' })
      }
      return next
    })
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

  // ── PVR: schedule a recording for a programme on a channel ──
  const recordProgramme = async (ch: MappedChannel, programme: EPGProgramme) => {
    const key = `${ch.liveTvChannelId}:${programme.start}`
    setRecordMsg(null)
    try {
      // Only M3U sources are recordable — CDNLive/OnDemand/DLHD use P2P HLS
      // whose tokens are consumed by the browser tracker and expire too fast
      // for FFmpeg to grab. M3U URLs are stable direct HTTP streams.
      const m3uSources: { type: 'm3u'; url: string }[] = []
      const iptvApi = window.api.iptvM3u
      if (iptvApi) {
        const matches: any[] = await iptvApi.findChannel(ch.liveTvName).catch(() => [])
        for (const m of matches) {
          if (m?.channel?.url) m3uSources.push({ type: 'm3u', url: m.channel.url })
        }
      }

      if (m3uSources.length === 0) {
        setRecordMsg({
          text: `Cannot record ${ch.liveTvName}: no M3U source found. Add one in Settings → IPTV/M3U.`,
          error: true,
        })
        setTimeout(() => setRecordMsg(null), 6000)
        return
      }

      await window.api.recordings.schedule({
        title: programme.title,
        channelName: ch.liveTvName,
        startTime: programme.start * 1000,
        endTime: programme.stop * 1000,
        channel: {
          id: ch.liveTvChannelId,
          name: ch.liveTvName,
          countryCode: ch.liveTvCountryCode,
          playerUrl: ch.liveTvPlayerUrl,
        },
        sources: m3uSources,
      })

      setRecordedKeys(prev => new Set(prev).add(key))
      setRecordMsg({ text: `Recording scheduled: ${programme.title}` })
      setTimeout(() => setRecordMsg(null), 5000)
    } catch (err: any) {
      setRecordMsg({ text: `Failed to schedule recording: ${err?.message || err}`, error: true })
      setTimeout(() => setRecordMsg(null), 5000)
    }
  }

  const isRecorded = (ch: MappedChannel, p: EPGProgramme) =>
    recordedKeys.has(`${ch.liveTvChannelId}:${p.start}`)

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
      if (contextMenu) {
        if (e.key === 'Escape') { e.preventDefault(); setContextMenu(null); return }
        return // ignore other keys while menu is open
      }
      if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); onBack(); return }
      // C/ContextMenu works on button focus too — opens EPG context menu
      if (e.key === 'c' || e.key === 'C' || e.code === 'ContextMenu') {
        // let the C handler below open the menu
      } else if ((e.target as HTMLElement)?.tagName === 'BUTTON') return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = Math.min(focusedChannelIdx + 1, channels.length - 1)
        setFocusedChannelIdx(next)
        setSelectedChannelIdx(next)
        setFocusedProgrammeIdx(0)
        if (next > visibleRowEnd - 2) {
          // Scroll the range forward so the new focused row stays mounted
          setVisibleRowStart(prev => prev + 1)
          setVisibleRowEnd(prev => prev + 1)
        }
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const next = Math.max(focusedChannelIdx - 1, 0)
        setFocusedChannelIdx(next)
        setSelectedChannelIdx(next)
        setFocusedProgrammeIdx(0)
        if (next < visibleRowStart + 2) {
          setVisibleRowStart(prev => Math.max(0, prev - 1))
          setVisibleRowEnd(prev => Math.max(0, prev - 1))
        }
      }
      if (e.key === 'ArrowLeft') { e.preventDefault(); navigateProgramme(-1) }
      if (e.key === 'ArrowRight') { e.preventDefault(); navigateProgramme(+1) }
      // Stop active recording with 'S' key
      if ((e.key === 's' || e.key === 'S') && activeRecordingId) {
        e.preventDefault()
        window.api.recordings.cancelCurrent().then(() => {
          setActiveRecordingId(null); setActiveRecordingChannel(null)
        })
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const ch = filteredChannels[focusedChannelIdx]
        if (!ch) return
        // If a programme is focused in the grid, record it (live or future).
        const row = getRowProgs(ch)
        const focusedProg = row[focusedProgrammeIdx]?.p
        if (focusedProg) {
          // Don't schedule recordings for programmes that already ended.
          if (focusedProg.stop * 1000 > Date.now()) recordProgramme(ch, focusedProg)
        } else {
          setSelectedChannel(ch); setFocusedSourceIndex(0)
        }
      }
      // 'C' / ContextMenu code opens the context menu on the focused programme
      if (e.key === 'c' || e.key === 'C' || e.code === 'ContextMenu') {
        e.preventDefault()
        openContextMenu()
      }
      // Record current focus with 'R'
      if (e.key === 'r' || e.key === 'R') {
        const ch = filteredChannels[focusedChannelIdx]
        if (ch) {
          e.preventDefault()
          const row = getRowProgs(ch)
          const focusedProg = row[focusedProgrammeIdx]?.p || row.find((x) => isLive(x.p))?.p
          // Skip programmes that already ended — nothing to record.
          if (focusedProg && focusedProg.stop * 1000 > Date.now()) recordProgramme(ch, focusedProg)
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectedChannel, focusedSourceIndex, focusedChannelIdx, focusedProgrammeIdx, channels, activeRecordingId, gridData, contextMenu, visibleRowStart, visibleRowEnd])

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
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setLoading(true); window.api.epg.refresh(undefined, { includeAll: false }).then(() => window.location.reload()).catch(() => setLoading(false)) }}
            style={{ padding: '8px 20px', borderRadius: 20, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600 }}
          >Refresh Selected Countries</button>
          <button onClick={() => { setLoading(true); window.api.epg.refresh(undefined, { includeAll: true }).then(() => window.location.reload()).catch(() => setLoading(false)) }}
            style={{ padding: '8px 20px', borderRadius: 20, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, fontWeight: 600 }}
          >Refresh All Countries (EPG.pw)</button>
        </div>
      </div>
    )
  }

  const selCh = filteredChannels[selectedChannelIdx]
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
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: 12 }}>{customNames?.[selectedChannel.liveTvChannelId] || selectedChannel.liveTvName}</div>
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

      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border, #2a2a4a)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: 0 }}>TV Guide</h2>
        <button
          tabIndex={0}
          onClick={handleRefresh}
          disabled={refreshing}
          title="Re-fetch today's schedule from the EPG provider"
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6,
            cursor: refreshing ? 'wait' : 'pointer', fontSize: 12, fontWeight: 600,
            background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border, #2a2a4a)',
            color: refreshing ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.75)',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={refreshing ? { animation: 'spin 0.8s linear infinite' } : undefined}>
            <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {playError && (
        <div style={{ padding: '8px 16px', background: 'rgba(255,59,48,0.15)', color: '#ff3b30', fontSize: 12 }}>
          {playError}
        </div>
      )}

      {recordMsg && (
        <div style={{ padding: '8px 16px', background: recordMsg.error ? 'rgba(255,59,48,0.15)' : 'rgba(52,199,89,0.15)', color: recordMsg.error ? '#ff3b30' : '#34c759', fontSize: 12 }}>
          {recordMsg.text}
        </div>
      )}

      {selNN && (selNN.now || selNN.next) && (
        <div style={{ display: 'flex', gap: 12, padding: 12, background: 'var(--bg-primary, #0d0d1a)', borderBottom: '1px solid var(--border, #2a2a4a)', position: 'sticky', top: 0, zIndex: 10 }}>
          {selNN.now && selCh && (
            <div style={{ flex: 1, background: 'rgba(var(--accent-rgb, 255, 107, 0), 0.12)', borderRadius: 8, padding: 12, border: '1px solid var(--accent)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 10, background: 'var(--accent)', color: '#fff', padding: '2px 6px', borderRadius: 3, fontWeight: 700 }}>NOW</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{formatTime(selNN.now.start)} - {formatTime(selNN.now.stop)}</span>
                {activeRecordingChannel === selCh.liveTvName && activeRecordingId && (
                  <button
                    tabIndex={0}
                    title="Stop current recording"
                    onClick={async () => {
                      try {
                        await window.api.recordings.cancelCurrent()
                        setActiveRecordingId(null); setActiveRecordingChannel(null)
                        setRecordMsg({ text: `Recording stopped: ${selNN?.now?.title || ''}` })
                        setTimeout(() => setRecordMsg(null), 4000)
                      } catch (err: any) {
                        setRecordMsg({ text: `Failed to stop: ${err?.message || err}`, error: true })
                        setTimeout(() => setRecordMsg(null), 4000)
                      }
                    }}
                    style={{
                      marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
                      padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                      background: 'rgba(255,59,48,0.2)', border: '1px solid rgba(255,59,48,0.5)', color: '#ff6b6b',
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="12" height="14" rx="1"/></svg>
                    STOP REC
                  </button>
                )}
                <button
                  tabIndex={0}
                  onClick={() => recordProgramme(selCh, selNN.now!)}
                  style={{
                    marginLeft: activeRecordingChannel === selCh.liveTvName && activeRecordingId ? 0 : 'auto',
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                    background: isRecorded(selCh, selNN.now!) ? 'rgba(255,59,48,0.25)' : 'rgba(255,59,48,0.15)',
                    border: '1px solid rgba(255,59,48,0.5)', color: '#ff6b6b',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,59,48,0.3)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = isRecorded(selCh, selNN.now!) ? 'rgba(255,59,48,0.25)' : 'rgba(255,59,48,0.15)' }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="7"/></svg>
                  {isRecorded(selCh, selNN.now!) ? 'RECORDED' : 'RECORD'}
                </button>
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
            {/* Top spacer — keeps scrollbar accurate while lazy rows are mounted */}
            <div style={{ height: visibleRowStart * ROW_HEIGHT }} />
            {filteredChannels.slice(visibleRowStart, visibleRowEnd + 1).map((ch, sliceIdx) => {
              const i = visibleRowStart + sliceIdx
              return (
                <div key={`${ch.liveTvChannelId ?? i}`} data-ch-row={i}>
                  <EPGChannelRow
                    ch={ch}
                    focused={i === focusedChannelIdx}
                    selected={i === selectedChannelIdx}
                    onClick={() => { setFocusedChannelIdx(i); setSelectedChannelIdx(i) }}
                    onDoubleClick={() => { setSelectedChannel(ch); setFocusedSourceIndex(0) }}
                    onMouseEnter={() => setFocusedChannelIdx(i)}
                  />
                </div>
              )
            })}
            {/* Bottom spacer */}
            <div style={{ height: (filteredChannels.length - visibleRowEnd - 1) * ROW_HEIGHT }} />
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

          {/* Top spacer */}
          <div style={{ height: visibleRowStart * ROW_HEIGHT }} />
          {filteredChannels.slice(visibleRowStart, visibleRowEnd + 1).map((ch, sliceIdx) => {
            const ci = visibleRowStart + sliceIdx
            const progs = getRowProgs(ch)
            const totalWidth = timeSlots.length * SLOT_WIDTH
            return (
              <div key={`${ch.liveTvChannelId ?? ci}`} data-epg-row={ci} style={{ height: ROW_HEIGHT, position: 'relative', minWidth: totalWidth, borderBottom: '1px solid rgba(255,255,255,0.04)', background: ci === focusedChannelIdx ? 'rgba(var(--accent-rgb), 0.06)' : 'transparent' }}>
                {progs.map(({ p, clampedStop }, pi) => {
                  const dur = clampedStop - p.start
                  const w = (dur / HOUR_MS) * SLOT_WIDTH
                  const left = programmeLeft(p)
                  const live = isLive(p)
                  const recorded = isRecorded(ch, p)
                  const isFocusedProg = ci === focusedChannelIdx && pi === focusedProgrammeIdx
                  return (
                    <div key={`${p.start}-${pi}`}
                      data-prog-start={p.start}
                      style={{
                        position: 'absolute', top: 4, left, width: w - 2, height: ROW_HEIGHT - 8, borderRadius: 6,
                        boxSizing: 'border-box',
                        background: live ? 'rgba(var(--accent-rgb), 0.2)' : (isFocusedProg ? 'rgba(var(--accent-rgb), 0.12)' : 'rgba(255,255,255,0.06)'),
                        border: isFocusedProg
                          ? '2px solid var(--accent)'
                          : (live ? '1px solid var(--accent)' : (recorded ? '1px solid rgba(255,59,48,0.6)' : '1px solid rgba(255,255,255,0.08)')),
                        padding: '4px 8px', cursor: 'pointer', overflow: 'hidden',
                        display: 'flex', flexDirection: 'column',
                        outline: isFocusedProg ? '2px solid rgba(var(--accent-rgb), 0.4)' : 'none',
                        outlineOffset: isFocusedProg ? 1 : 0,
                      }}
                      onClick={() => {
                        setFocusedChannelIdx(ci)
                        setSelectedChannelIdx(ci)
                        setFocusedProgrammeIdx(pi)
                      }}
                      onDoubleClick={() => recordProgramme(ch, p)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                        <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: live ? 'var(--accent)' : '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                        <button
                          tabIndex={-1}
                          title={recorded ? 'Recording scheduled' : 'Schedule recording'}
                          onClick={(e) => { e.stopPropagation(); recordProgramme(ch, p) }}
                          style={{
                            flexShrink: 0, width: 16, height: 16, borderRadius: '50%', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: recorded ? 'rgba(255,59,48,0.5)' : 'rgba(255,59,48,0.2)',
                            border: '1px solid rgba(255,59,48,0.7)', padding: 0, opacity: recorded ? 1 : 0.55,
                          }}
                        >
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="#ff6b6b"><circle cx="12" cy="12" r="7"/></svg>
                        </button>
                      </div>
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
          {/* Bottom spacer */}
          <div style={{ height: (filteredChannels.length - visibleRowEnd - 1) * ROW_HEIGHT }} />
        </div>
      </div>

      {contextMenu && (
        <div
          role="menu"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            width: MENU_WIDTH,
            background: 'var(--bg-primary, #1a1a2e)',
            border: '1px solid var(--accent)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            padding: 4,
            zIndex: 100,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {customNames?.[contextMenu.ch.liveTvChannelId] || contextMenu.ch.liveTvName || contextMenu.ch.displayName}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {contextMenu.prog.title} • {formatTime(contextMenu.prog.start)} – {formatTime(contextMenu.prog.stop)}
            </div>
          </div>
          <button
            tabIndex={0}
            autoFocus
            role="menuitem"
            onClick={() => {
              const { prog, ch } = contextMenu
              setContextMenu(null)
              recordProgramme(ch, prog)
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '10px 12px', border: 'none',
              background: 'transparent', color: '#ff6b6b', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, borderRadius: 6,
              textAlign: 'left',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,59,48,0.15)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="7"/></svg>
            {isRecorded(contextMenu.ch, contextMenu.prog) ? 'Already Recorded' : 'Record Programme'}
          </button>
        </div>
      )}
    </div>
  )
}
