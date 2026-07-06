import React, { useEffect, useRef, useState, useMemo } from 'react'

interface DamiStream {
  id: string
  name: string
  poster: string
  startsAt: number
  endsAt: number
  status: 'live' | 'upcoming' | 'finished'
  league: string
  categoryName: string
  viewers: number
  homeTeam: string
  awayTeam: string
  homeBadge: string
  awayBadge: string
  embedUrl: string
  sources: { name: string; embed: string }[]
}

interface DamiCategory {
  name: string
  streams: DamiStream[]
}

export default function LiveTV({ onPlayUrl, onBack }: { onPlayUrl: (url: string) => Promise<void>; onBack: () => void }) {
  const [categories, setCategories] = useState<DamiCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCat, setSelectedCat] = useState<string>('')
  const [focusedIdx, setFocusedIdx] = useState(0)
  const [focusedSection, setFocusedSection] = useState<'categories' | 'streams'>('categories')
  const [focusedCatIdx, setFocusedCatIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const gridContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
    window.api.damiTv.getStreams().then((data: DamiCategory[]) => {
      setCategories(data)
      if (data.length > 0) setSelectedCat(data[0].name)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => { containerRef.current?.focus() }, [loading, selectedCat])

  useEffect(() => {
    const sel = `[data-live-idx="${focusedIdx}"]`
    const el = containerRef.current?.querySelector(sel)
    if (el && focusedSection === 'streams') el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focusedIdx, focusedSection])

  const filteredStreams = useMemo(() => {
    const cat = categories.find(c => c.name === selectedCat)
    return cat?.streams || []
  }, [categories, selectedCat])

  const gridCols = useMemo(() => {
    if (!gridContainerRef.current) return 2
    const w = gridContainerRef.current.offsetWidth
    return Math.max(1, Math.floor(w / 316))
  }, [filteredStreams.length])

  const statusLabel = (s: DamiStream) => {
    if (s.status === 'live') return '🔴 LIVE'
    if (s.status === 'finished') return '✅ Finished'
    return '🕒 Upcoming'
  }

  const timeStr = (ts: number) => {
    if (!ts) return ''
    const d = new Date(ts * 1000)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const isFocused = (idx: number) => idx === focusedIdx && focusedSection === 'streams'
  const isCatFocused = (idx: number) => idx === focusedCatIdx && focusedSection === 'categories'

  const cardStyle = (focused: boolean) => ({
    background: focused ? 'rgba(var(--accent-rgb, 255, 107, 0), 0.18)' : 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    border: '2px solid transparent',
    borderColor: focused ? 'var(--accent, #FF6B00)' : 'transparent',
    outline: focused ? 'none' : undefined,
    overflow: 'hidden',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column' as const,
    transition: 'background 0.15s',
  })

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape' || e.key === 'Backspace') { onBack(); return }

    if (focusedSection === 'categories') {
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setFocusedCatIdx(i => Math.min(i + 1, categories.length - 1))
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setFocusedCatIdx(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (filteredStreams.length > 0) {
          setFocusedSection('streams')
          setFocusedIdx(0)
        }
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedCatIdx(Math.max(focusedCatIdx - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const cat = categories[focusedCatIdx]
        if (cat) {
          setSelectedCat(cat.name)
          setFocusedIdx(0)
          setFocusedSection('streams')
        }
        return
      }
    }

    if (focusedSection === 'streams') {
      if (filteredStreams.length === 0) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setFocusedIdx(i => Math.min(i + 1, filteredStreams.length - 1))
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIdx(i => Math.min(i + gridCols, filteredStreams.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const next = focusedIdx - gridCols
        if (next < 0) {
          setFocusedSection('categories')
        } else {
          setFocusedIdx(next)
        }
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (focusedIdx === 0) {
          setFocusedSection('categories')
        } else {
          setFocusedIdx(i => Math.max(i - 1, 0))
        }
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const s = filteredStreams[focusedIdx]
        if (s?.embedUrl) onPlayUrl(s.embedUrl)
        return
      }
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
        <div style={{ width: 20, height: 20, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.6s linear infinite', marginRight: 12 }} />
        Loading live streams...
      </div>
    )
  }

  return (
    <div ref={containerRef} tabIndex={0} onKeyDown={handleKey} style={{ padding: 24, outline: 'none', height: '100%', overflow: 'auto' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: '0 0 16px 0' }}>Live TV</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {categories.map((cat, ci) => (
          <button key={cat.name} data-cat-idx={ci}
            onClick={() => { setSelectedCat(cat.name); setFocusedIdx(0); setFocusedSection('streams') }}
            onMouseEnter={() => { setFocusedCatIdx(ci); setFocusedSection('categories') }}
            style={{
              padding: '6px 14px', borderRadius: 20, border: isCatFocused(ci) ? '2px solid var(--accent)' : 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
              background: selectedCat === cat.name ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
              color: selectedCat === cat.name ? '#fff' : 'rgba(255,255,255,0.7)',
            }}
          >{cat.name}</button>
        ))}
      </div>

      {filteredStreams.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
          No streams in this category
        </div>
      )}

      <div ref={gridContainerRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {filteredStreams.map((s, i) => (
          <div key={s.id} data-live-idx={i} style={cardStyle(isFocused(i))}
            onClick={() => { if (s.embedUrl) onPlayUrl(s.embedUrl) }}
            onMouseEnter={() => setFocusedIdx(i)}
          >
            {s.poster && (
              <img src={s.poster} alt={s.name}
                style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            )}
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11 }}>{statusLabel(s)}</span>
                {s.viewers > 0 && (
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>👁 {s.viewers}</span>
                )}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{s.name}</div>
              {s.league && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{s.league}</div>}
              {s.homeTeam || s.awayTeam ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                  {s.homeBadge ? <img src={s.homeBadge} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} /> : null}
                  <span>{s.homeTeam}</span>
                  <span style={{ color: 'rgba(255,255,255,0.3)' }}>vs</span>
                  {s.awayBadge ? <img src={s.awayBadge} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} /> : null}
                  <span>{s.awayTeam}</span>
                </div>
              ) : null}
              {s.startsAt > 0 && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                  {s.status === 'live' ? `Started ${timeStr(s.startsAt)}` : `Starts ${timeStr(s.startsAt)}`}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
