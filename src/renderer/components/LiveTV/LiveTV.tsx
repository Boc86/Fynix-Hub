import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useSettingsStore } from '../../store/settingsStore'
import { loadMergedChannels } from '../../utils/channels'
import { useChannelLogo, prewarmLogos } from '../../utils/useChannelLogo'
import { normalizeLogoUrl } from '../../utils/logos'
import Prompt from '../Prompt/Prompt'
import LogoPickerModal from '../LogoPickerModal'
import styles from './LiveTV.module.css'

interface Channel {
  id: string
  name: string
  image: string
  logoImage: string
  /** EPG guide icon — same tier as the EPG screen uses, so both screens agree */
  epgIcon?: string
  countryCode: string
  countryName: string
  countryFlag: string
  playerUrl: string
  source: string
  sources: string[]
  status: string
}

function ChannelLogo({ logoImage, fallbackImage, name }: { logoImage: string; fallbackImage: string; name: string }) {
  const [src, setSrc] = React.useState(logoImage || fallbackImage)
  const [failed, setFailed] = React.useState(false)

  // Sync when the props change (e.g. a custom logo is set via the context
  // menu) — useState's initializer only runs once, so without this the tile
  // keeps the old logo until the component remounts (exit/re-enter LiveTV).
  React.useEffect(() => {
    setSrc(logoImage || fallbackImage)
    setFailed(false)
  }, [logoImage, fallbackImage])

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

/**
 * Channel tile with logo fallback.
 * Calls useChannelLogo so it's a proper hook user.
 *
 * Priority: user-set custom logo -> real CDN image -> HEAD-checked
 * tv-logos URL -> unverified tv-logos guess (main-process lookupLogo)
 * -> nothing.
 */
function ChannelTile({ ch }: { ch: Channel }) {
  const customLogo = useSettingsStore((s) => s.liveTvCustomLogos?.[ch.id] || '')
  const customName = useSettingsStore((s) => s.liveTvCustomNames?.[ch.id] || '')
  // Normalize at read time too: URLs saved before normalization existed
  // (e.g. github.com/.../blob/... pages) must still render.
  const primary = normalizeLogoUrl(customLogo) || ch.image || ''
  // Fuzzy-match the logo using the custom name when the user renamed the
  // channel (the GitHub slug is derived from the display name).
  const logoName = customName || ch.name
  // Same 4-tier chain as the EPG screen: CDN/M3U (primary) → EPG guide icon →
  // HEAD-checked GitHub fallback. cdnLogo='' forces the fallback lookup; the
  // icon tier keeps LiveTV and EPG showing the same logos for the same channel.
  const verified = useChannelLogo(logoName, '', ch.countryCode, ch.epgIcon)
  const fallback = verified
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ChannelLogo logoImage={primary} fallbackImage={fallback} name={logoName} />
    </div>
  )
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

  // Channel context menu (right-click) state
  const [menuChannel, setMenuChannel] = useState<Channel | null>(null)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [menuCentered, setMenuCentered] = useState(false)
  const [menuFocusedIdx, setMenuFocusedIdx] = useState(0)
  const [logoPromptChannel, setLogoPromptChannel] = useState<Channel | null>(null)
  const [renameChannel, setRenameChannel] = useState<Channel | null>(null)
  // Pick-up-and-place reordering: the channel being moved + the full visible
  // id order at move start (restored on Escape/cancel).
  const [moveMode, setMoveMode] = useState<{ channelId: string; originalOrder: string[] } | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)

  // Load merged channels (CDN + M3U) so M3U-only selections from Settings
  // are visible here. CDN channels keep their images/playerUrl; M3U-only
  // channels are playable via the M3U source modal.
  useEffect(() => {
    setLoading(true)
    loadMergedChannels()
      .then(merged => {
        const liveTvChannels: Channel[] = merged.map(ch => ({
          id: ch.id,
          name: ch.name,
          image: ch.logo || '',
          logoImage: ch.logoImage || ch.logo || '',
          epgIcon: ch.epgIcon || '',
          countryCode: ch.countryCode,
          countryName: ch.countryName,
          countryFlag: '',
          playerUrl: '',
          source: ch.sources.includes('cdnlive') ? 'cdnlive' : 'm3u',
          sources: ch.sources,
          status: '',
        }))
        window.api.log(`[LiveTV] ${liveTvChannels.length} channels loaded (${merged.filter(c => c.sources.includes('cdnlive')).length} CDN, ${merged.filter(c => c.sources.length === 1).length} M3U-only)`)
        setChannels(liveTvChannels)
        setLoading(false)
        // Pre-warm fallback logos in the background
        prewarmLogos(liveTvChannels.map(c => ({ name: c.name, countryCode: c.countryCode })))
      })
      .catch(() => setLoading(false))
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
    // Apply country filter
    if (settingsStore.selectedLiveTvCountries.length > 0) {
      result = result.filter(c => settingsStore.selectedLiveTvCountries.includes(c.countryCode))
    }
    // Apply channel visibility filter (A5)
    if (settingsStore.liveTvVisibleChannels.length > 0) {
      result = result.filter(c => settingsStore.liveTvVisibleChannels.includes(c.id))
    }
    // Apply hidden-channel filter (context menu Hide Channel)
    if (settingsStore.liveTvHiddenChannels.length > 0) {
      result = result.filter(c => !settingsStore.liveTvHiddenChannels.includes(c.id))
    }
    // Apply custom channel order (A5)
    if (settingsStore.liveTvChannelOrder.length > 0) {
      const orderMap = new Map(settingsStore.liveTvChannelOrder.map((id, i) => [id, i]))
      const ordered: typeof result = []
      const unordered: typeof result = []
      for (const ch of result) {
        if (orderMap.has(ch.id)) {
          ordered.push(ch)
        } else {
          unordered.push(ch)
        }
      }
      ordered.sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999))
      // Unordered channels go after ordered ones, sorted by country+name
      unordered.sort((a, b) => {
        if (a.countryCode !== b.countryCode) return a.countryCode.localeCompare(b.countryCode)
        return a.name.localeCompare(b.name)
      })
      result = [...ordered, ...unordered]
    } else {
      result = result.sort((a, b) => {
        if (a.countryCode !== b.countryCode) return a.countryCode.localeCompare(b.countryCode)
        return a.name.localeCompare(b.name)
      })
    }
    return result
  }, [channels, settingsStore.selectedLiveTvCountries, settingsStore.liveTvVisibleChannels, settingsStore.liveTvHiddenChannels, settingsStore.liveTvChannelOrder])

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
    // C1: For channels with only M3U sources (no CDN source), hide default servers
    const hasCdnSource = selectedChannel?.sources?.some(s => s !== 'm3u') || false
    const defaults: SourceItem[] = hasCdnSource ? [
      { id: 'cdnlive', label: 'CDNLive', color: styles.cdnlive, type: 'cdnlive' },
      { id: 'ondemand', label: 'OnDemand', color: styles.ondemand, type: 'ondemand' },
      { id: 'dlhd', label: 'DLHD', color: styles.dlhd, type: 'dlhd' },
    ] : []
    return [...defaults, ...m3uSources]
  }, [selectedChannel, m3uSources])

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

  // Context menu items — keyboard-navigable (ArrowUp/Down + Enter in handleKeyDown)
  const menuItems = useMemo(() => {
    if (!menuChannel) return [] as Array<{ label: string; action: () => void; danger?: boolean }>
    const items: Array<{ label: string; action: () => void; danger?: boolean }> = [
      {
        label: 'Set Logo URL…',
        action: () => { setLogoPromptChannel(menuChannel); setMenuChannel(null); setMenuPos(null); setMenuFocusedIdx(0) },
      },
      {
        label: 'Move Channel…',
        action: () => {
          // Work on the FULL visible id list so the swap survives the
          // ordered/unordered merge in filteredChannels.
          setMoveMode({ channelId: menuChannel.id, originalOrder: filteredChannels.map(c => c.id) })
          setMenuChannel(null); setMenuPos(null); setMenuFocusedIdx(0)
        },
      },
      {
        label: 'Rename Channel…',
        action: () => { setRenameChannel(menuChannel); setMenuChannel(null); setMenuPos(null); setMenuFocusedIdx(0) },
      },
      {
        label: 'Hide Channel',
        danger: true,
        action: () => {
          settingsStore.hideLiveTvChannel(menuChannel.id)
          setMenuChannel(null); setMenuPos(null); setMenuFocusedIdx(0)
        },
      },
    ]
    if (settingsStore.liveTvCustomLogos?.[menuChannel.id]) {
      items.push({
        label: 'Clear Logo',
        danger: true,
        action: () => {
          settingsStore.setLiveTvCustomLogo(menuChannel.id, '')
          setMenuChannel(null); setMenuPos(null); setMenuFocusedIdx(0)
        },
      })
    }
    return items
  }, [menuChannel, filteredChannels, settingsStore.liveTvCustomLogos])

  // ── Export keyboard handler via ref (used by App.tsx's global handler) ──
  const handleKeyDown = useCallback((e: KeyboardEvent): boolean => {
    // Logo URL / Rename prompts open — swallow ALL keys at the window level.
    // The Prompt input itself handles Enter (confirm) and Escape (cancel)
    // at the target phase, and Backspace must keep working as normal text
    // editing. Swallowing here stops the grid-navigation handlers below
    // (arrows move focus, Enter opens the source modal, Backspace/Escape
    // navigate back) from hijacking keystrokes meant for the input.
    if (logoPromptChannel || renameChannel) {
      return true
    }
    // Context menu open — navigate items with arrows, activate with Enter,
    // Escape/Backspace closes it before anything else
    if (menuChannel) {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault(); setMenuChannel(null); setMenuPos(null); return true
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault(); setMenuFocusedIdx(i => Math.min(i + 1, menuItems.length - 1)); return true
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault(); setMenuFocusedIdx(i => Math.max(i - 1, 0)); return true
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const item = menuItems[menuFocusedIdx]
        if (item) item.action()
        return true
      }
      return true
    }
    // Move mode — pick up & place reordering (grid navigation is suspended)
    if (moveMode) {
      const ids = filteredChannels.map(c => c.id)
      const idx = ids.indexOf(moveMode.channelId)
      if (e.key === 'ArrowDown' && idx >= 0 && idx < ids.length - 1) {
        e.preventDefault()
        const next = [...ids]
        ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
        settingsStore.setLiveTvChannelOrder(next)
        setFocusedChannelIdx(idx + 1)
        return true
      }
      if (e.key === 'ArrowUp' && idx > 0) {
        e.preventDefault()
        const next = [...ids]
        ;[next[idx], next[idx - 1]] = [next[idx - 1], next[idx]]
        settingsStore.setLiveTvChannelOrder(next)
        setFocusedChannelIdx(idx - 1)
        return true
      }
      if (e.key === 'Enter') {
        e.preventDefault(); setMoveMode(null); return true
      }
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault()
        settingsStore.setLiveTvChannelOrder(moveMode.originalOrder)
        setMoveMode(null)
        return true
      }
      return true
    }
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

    // 'C' key or the keyboard ContextMenu key opens the channel context menu
    if (e.key === 'c' || e.key === 'C' || e.code === 'KeyC' || e.code === 'ContextMenu') {
      const t = e.target as HTMLElement
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return false
      e.preventDefault()
      const ch = filteredChannels[focusedChannelIdx]
      if (ch) {
        setMenuChannel(ch)
        setMenuFocusedIdx(0)
        // Explicit viewport pixels (like the EPG menu): percentage top/left on a
        // position:fixed child resolves against a transformed ancestor's content
        // box (the .animate-fade wrapper animates transform), so 50% lands in the
        // middle of the full scroll area — off the visible screen.
        setMenuPos({ x: Math.max(0, (window.innerWidth - 220) / 2), y: Math.max(0, (window.innerHeight - 130) / 2) })
        setMenuCentered(true)
      }
      return true
    }

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
  }, [menuChannel, logoPromptChannel, renameChannel, moveMode, menuItems, menuFocusedIdx, selectedChannel, focusedSourceIndex, getSources, playChannelWithSource, filteredChannels, focusedChannelIdx, channelPos, rowChannels, allRows, onBack])

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
      {/* Source Selection Modal — portaled to document.body: the .animate-fade
          wrapper keeps an identity transform after its entrance animation, and
          ANY non-none transform on an ancestor makes it the containing block
          for position:fixed descendants (the modal would center in the full
          scroll area, not the visible viewport). */}
      {selectedChannel && createPortal(
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
        </div>,
        document.body,
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
          {moveMode && (
            <div style={{
              position: 'sticky', top: 0, zIndex: 5, marginBottom: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '8px 14px', borderRadius: 8,
              background: '#1f1f1f', border: '1px solid var(--accent)',
              color: '#fff', fontSize: 13, fontWeight: 600, letterSpacing: 0.3,
            }}>
              <span style={{ background: 'var(--accent)', color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: 0.8, padding: '2px 8px', borderRadius: 4 }}>MOVING</span>
              Move with ↑/↓, Enter to place, Escape to cancel
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
              const isMoving = moveMode?.channelId === ch.id
              return (
                <div
                  key={ch.id}
                  ref={el => { if (el) channelRefs.current.set(item.flatIdx, el) }}
                  data-focus-index={item.flatIdx}
                  tabIndex={0}
                  onClick={() => {
                    if (moveMode) return
                    if (ignoreNextClick.current) { ignoreNextClick.current = false; return }
                    setSelectedChannel(ch); setFocusedSourceIndex(0)
                  }}
                  onMouseEnter={() => setFocusedChannelIdx(item.flatIdx)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setFocusedChannelIdx(item.flatIdx)
                    setMenuChannel(ch)
                    setMenuFocusedIdx(0)
                    setMenuPos({ x: e.clientX, y: e.clientY })
                    setMenuCentered(false)
                  }}
                  style={{
                    position: 'relative', aspectRatio: '16/9',
                    background: focused ? 'rgba(255,255,255,0.05)' : '#111',
                    border: isMoving ? '2px solid var(--accent)' : (focused ? '2px solid var(--accent)' : '1px solid var(--border)'),
                    borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                    transition: 'all 0.15s ease', padding: 0
                  }}
                >
                  <ChannelTile ch={ch} />
                  {isMoving && (
                    <div style={{
                      position: 'absolute', top: 6, left: 6, zIndex: 2,
                      background: 'var(--accent)', color: '#fff',
                      fontSize: 10, fontWeight: 700, letterSpacing: 0.8,
                      padding: '2px 8px', borderRadius: 4,
                    }}>
                      MOVING
                    </div>
                  )}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '6px 8px', fontSize: 12, fontWeight: 500, background: 'rgba(0,0,0,0.7)', color: '#fff', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {settingsStore.liveTvCustomNames?.[ch.id] || ch.name}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Channel context menu (right-click or C/ContextMenu key) */}
      {/* Portal to document.body: the .animate-fade wrapper keeps an identity
          transform after its entrance animation, and ANY non-none transform on
          an ancestor turns it into the containing block for position:fixed
          descendants — the menu would be positioned against the full scroll
          area and land off-screen. Rendering at the body root restores true
          viewport anchoring. */}
      {menuChannel && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
          onClick={() => { setMenuChannel(null); setMenuPos(null) }}
          onContextMenu={(e) => { e.preventDefault(); setMenuChannel(null); setMenuPos(null) }}
        >
          <div
            style={{
              position: 'fixed',
              left: Math.min(menuPos?.x ?? 0, window.innerWidth - 220),
              top: Math.min(menuPos?.y ?? 0, window.innerHeight - 130),
              // Keyboard launch centers the menu on the computed point; the
              // right-click path anchors its top-left at the cursor.
              transform: menuCentered ? 'translate(-50%, -50%)' : 'none',
              background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 10, padding: 6, minWidth: 220,
              boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>
              {settingsStore.liveTvCustomNames?.[menuChannel.id] || menuChannel.name}
            </div>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
            {menuItems.map((item, i) => (
              <button
                key={item.label}
                tabIndex={0}
                onClick={item.action}
                onMouseEnter={() => setMenuFocusedIdx(i)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px',
                  background: menuFocusedIdx === i ? 'rgba(255,255,255,0.08)' : 'none',
                  border: 'none', borderRadius: 6,
                  color: item.danger ? '#ff6b6b' : '#fff',
                  fontSize: 13, cursor: 'pointer',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}

      {/* Set Logo dialog (GitHub candidates + custom URL) */}
      {logoPromptChannel && (
        <LogoPickerModal
          // Fuzzy-match candidates on the custom name when the channel was renamed
          channel={{ id: logoPromptChannel.id, name: settingsStore.liveTvCustomNames?.[logoPromptChannel.id] || logoPromptChannel.name, countryCode: logoPromptChannel.countryCode }}
          currentUrl={settingsStore.liveTvCustomLogos?.[logoPromptChannel.id] || ''}
          onConfirm={(url) => {
            settingsStore.setLiveTvCustomLogo(logoPromptChannel.id, url)
            setLogoPromptChannel(null)
          }}
          onCancel={() => setLogoPromptChannel(null)}
        />
      )}

      {/* Rename channel prompt */}
      {renameChannel && (
        <Prompt
          title={`Rename Channel — ${renameChannel.name}`}
          message="Enter a custom display name for this channel. It replaces the original name in the Live TV grid and TV Guide. Re-enter the original name to restore it."
          placeholder={renameChannel.name}
          defaultValue={settingsStore.liveTvCustomNames?.[renameChannel.id] || renameChannel.name}
          confirmLabel="Rename"
          onConfirm={(name) => {
            settingsStore.setLiveTvCustomName(renameChannel.id, name)
            setRenameChannel(null)
          }}
          onCancel={() => setRenameChannel(null)}
        />
      )}
    </div>
  )
}
