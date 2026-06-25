import React, { useEffect, useRef, useMemo, useState } from 'react'
import styles from './ContextMenu.module.css'

export interface ContextTarget {
  type: 'movie' | 'tv' | 'episode' | 'season'
  tmdbId: number
  title: string
  season?: number
  episode?: number
}

interface ContextMenuProps {
  target: ContextTarget
  onClose: () => void
  onMarkWatched: (target: ContextTarget) => void
  onMarkUnwatched: (target: ContextTarget) => void
  onShowSources: (target: ContextTarget) => void
  onResetProgress: (target: ContextTarget) => void
  onDropShow: (target: ContextTarget) => void
}

interface MenuItem {
  label: string
  icon: string
  action: () => void
}

export default function ContextMenu({ target, onClose, onMarkWatched, onMarkUnwatched, onShowSources, onResetProgress, onDropShow }: ContextMenuProps) {
  const [highlightedIdx, setHighlightedIdx] = useState(0)
  const btnRefs = useRef<HTMLButtonElement[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  const typeLabel = target.type === 'movie' ? 'Movie' : target.type === 'tv' ? 'TV Show' : target.type === 'season' ? 'Season' : 'Episode'

  const items = useMemo(() => {
    const result: MenuItem[] = [
      {
        label: 'Mark Watched',
        icon: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
        action: () => onMarkWatched(target),
      },
      {
        label: 'Mark Unwatched',
        icon: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
        action: () => onMarkUnwatched(target),
      },
      {
        label: 'Reset Progress',
        icon: 'M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z',
        action: () => onResetProgress(target),
      },
    ]
    if (target.type === 'tv') {
      result.push({
        label: 'Drop Show',
        icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
        action: () => onDropShow(target),
      })
    }
    if (target.type === 'movie' || target.type === 'episode') {
      result.push({
        label: 'Show Sources',
        icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
        action: () => onShowSources(target),
      })
    }
    return result
  }, [target, onMarkWatched, onMarkUnwatched, onResetProgress, onDropShow, onShowSources])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    containerRef.current?.focus()
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  function handleKeyDown(e: React.KeyboardEvent) {
    const count = items.length
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault()
      setHighlightedIdx((prev) => (prev + 1) % count)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault()
      setHighlightedIdx((prev) => (prev - 1 + count) % count)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      btnRefs.current[highlightedIdx]?.click()
    }
  }

  function handleBtn(idx: number, action: () => void) {
    setHighlightedIdx(idx)
    action()
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div ref={containerRef} className={styles.menu} onClick={(e) => e.stopPropagation()} tabIndex={0} onKeyDown={handleKeyDown}>
        <div className={styles.header}>
          <span className={styles.typeLabel}>{typeLabel}</span>
          <span className={styles.title}>{target.title}</span>
          {target.season !== undefined && (
            <span className={styles.meta}>
              S{String(target.season).padStart(2, '0')}
              {target.episode !== undefined ? `E${String(target.episode).padStart(2, '0')}` : ''}
            </span>
          )}
        </div>
        <div className={styles.actions}>
          {items.map((item, idx) => (
            <button
              key={item.label}
              ref={(el) => { btnRefs.current[idx] = el! }}
              tabIndex={-1}
              className={`${styles.menuBtn} ${highlightedIdx === idx ? styles.focused : ''}`}
              onClick={() => handleBtn(idx, item.action)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d={item.icon}/>
              </svg>
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
