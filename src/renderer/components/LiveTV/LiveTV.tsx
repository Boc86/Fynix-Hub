import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useSettingsStore } from '../../store/settingsStore'

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
    return <div data-ltv-letter style={{ fontSize: 28, fontWeight: 800, color: 'rgba(255,255,255,0.15)' }}>
      {name.charAt(0).toUpperCase()}
    </div>
  }

  return <>
    <img src={src} alt="" loading="lazy"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', padding: 12, zIndex: 1 }}
      onLoad={e => {
        window.api.log(`[LiveTV] OK ${(e.target as HTMLImageElement).src.slice(0, 120)}`)
        const letter = e.currentTarget.parentElement?.querySelector('[data-ltv-letter]')
        if (letter) (letter as HTMLElement).style.display = 'none'
      }}
      onError={handleError}
    />
    <div data-ltv-letter style={{ fontSize: 28, fontWeight: 800, color: 'rgba(255,255,255,0.15)' }}>
      {name.charAt(0).toUpperCase()}
    </div>
  </>
}



export default function LiveTV({ onPlayUrl, onBack }: { onPlayUrl: (url: string) => Promise<void>; onBack: () => void }) {
  const settingsStore = useSettingsStore()
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [focusedChannelIdx, setFocusedChannelIdx] = useState(0)
  const [playing, setPlaying] = useState<string | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
    window.api.damiTv.getChannels().then(ch => {
      window.api.log(`[LiveTV] ${ch.length} channels loaded, ${ch.filter((c: any) => c.image).length} have images`)
      setChannels(ch)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

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
        visualRow++
        col = 0
      } else {
        pos.set(item.flatIdx, { row: visualRow, col })
        let arr = rows.get(visualRow)
        if (!arr) { arr = []; rows.set(visualRow, arr) }
        arr.push(item.flatIdx)
        col++
        if (col >= actualCols) {
          visualRow++
          col = 0
        }
      }
    }
    return { channelPos: pos, rowChannels: rows }
  }, [flatItems, actualCols])
  const allRows = useMemo(() => [...rowChannels.keys()].sort((a, b) => a - b), [rowChannels])

  const isChannelFocused = (idx: number) => idx === focusedChannelIdx

  const channelRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  useEffect(() => {
    const el = channelRefs.current.get(focusedChannelIdx)
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focusedChannelIdx])

  const playChannel = useCallback(async (ch: Channel) => {
    setPlaying(ch.id)
    setPlayError(null)
    try {
      const result = await window.api.damiTv.extractUrl({ id: ch.id, name: ch.name, countryCode: ch.countryCode, playerUrl: ch.playerUrl })
      if (result?.hlsUrl) {
        await onPlayUrl(result.hlsUrl)
      } else {
        setPlayError(`No playable source for ${ch.name}.`)
      }
    } catch (err: any) {
      setPlayError(`Failed to play ${ch.name}: ${err?.message || 'Unknown error'}`)
    }
    setPlaying(null)
  }, [onPlayUrl])

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape' || e.key === 'Backspace') { onBack(); return }
    if (filteredChannels.length === 0) return

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      setFocusedChannelIdx(i => {
        const p = channelPos.get(i)
        if (!p) return i
        const rowItems = rowChannels.get(p.row) || []
        const nextCol = p.col + 1
        if (nextCol < rowItems.length) return rowItems[nextCol]
        const curRowIdx = allRows.indexOf(p.row)
        if (curRowIdx < allRows.length - 1) {
          const nextRow = rowChannels.get(allRows[curRowIdx + 1]) || []
          if (nextRow.length > 0) return nextRow[0]
        }
        return i
      })
      return
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setFocusedChannelIdx(i => {
        const p = channelPos.get(i)
        if (!p) return i
        const rowItems = rowChannels.get(p.row) || []
        const prevCol = p.col - 1
        if (prevCol >= 0) return rowItems[prevCol]
        const curRowIdx = allRows.indexOf(p.row)
        if (curRowIdx > 0) {
          const prevRow = rowChannels.get(allRows[curRowIdx - 1]) || []
          if (prevRow.length > 0) return prevRow[prevRow.length - 1]
        }
        return i
      })
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedChannelIdx(i => {
        const p = channelPos.get(i)
        if (!p) return i
        const curRowIdx = allRows.indexOf(p.row)
        for (let r = curRowIdx + 1; r < allRows.length; r++) {
          const items = rowChannels.get(allRows[r]) || []
          const same = items.find(idx => channelPos.get(idx)?.col === p.col)
          if (same !== undefined) return same
        }
        return i
      })
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedChannelIdx(i => {
        const p = channelPos.get(i)
        if (!p) return i
        const curRowIdx = allRows.indexOf(p.row)
        for (let r = curRowIdx - 1; r >= 0; r--) {
          const items = rowChannels.get(allRows[r]) || []
          const same = items.find(idx => channelPos.get(idx)?.col === p.col)
          if (same !== undefined) return same
        }
        return i
      })
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
                <div key={ch.id}
                  ref={el => { if (el) channelRefs.current.set(item.flatIdx, el) }}
                  data-focus-index={item.flatIdx}
                  tabIndex={0}
                  onClick={() => playChannel(ch)}
                  onMouseEnter={() => setFocusedChannelIdx(item.flatIdx)}
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
                    alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden',
                  }}>
                    <ChannelLogo
                      logoImage={ch.logoImage}
                      fallbackImage={ch.image}
                      name={ch.name}
                    />
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
                    {ch.source && (
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{ch.source}</div>
                    )}
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
