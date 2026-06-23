import React, { useEffect, useRef, useState } from 'react'
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
}

export default function ContextMenu({ target, onClose, onMarkWatched, onMarkUnwatched, onShowSources }: ContextMenuProps) {
  const [highlightedIdx, setHighlightedIdx] = useState(0)
  const btnRefs = useRef<HTMLButtonElement[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  const typeLabel = target.type === 'movie' ? 'Movie' : target.type === 'tv' ? 'TV Show' : target.type === 'season' ? 'Season' : 'Episode'
  const showSourcesItem = target.type === 'movie' || target.type === 'episode'

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    containerRef.current?.focus()
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  function handleKeyDown(e: React.KeyboardEvent) {
    const count = showSourcesItem ? 3 : 2
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
          <button
            ref={(el) => { btnRefs.current[0] = el! }}
            tabIndex={-1}
            className={`${styles.menuBtn} ${highlightedIdx === 0 ? styles.focused : ''}`}
            onClick={() => handleBtn(0, () => onMarkWatched(target))}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            Mark Watched
          </button>
          <button
            ref={(el) => { btnRefs.current[1] = el! }}
            tabIndex={-1}
            className={`${styles.menuBtn} ${highlightedIdx === 1 ? styles.focused : ''}`}
            onClick={() => handleBtn(1, () => onMarkUnwatched(target))}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
            Mark Unwatched
          </button>
          {showSourcesItem && (
            <button
              ref={(el) => { btnRefs.current[2] = el! }}
              tabIndex={-1}
              className={`${styles.menuBtn} ${highlightedIdx === 2 ? styles.focused : ''}`}
              onClick={() => handleBtn(2, () => onShowSources(target))}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
              </svg>
              Show Sources
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
