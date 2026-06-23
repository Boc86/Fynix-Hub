import React, { useRef, useCallback, useEffect } from 'react'
import type { MediaItem } from '../../types'
import MediaCard from './MediaCard'
import styles from './MediaRow.module.css'

interface MediaRowProps {
  title: string
  items: MediaItem[]
  onSelect: (item: MediaItem) => void
  rowIndex: number
  focusedCardIndex?: number
  watchedIds?: Set<number>
  animationDelay?: number
}

export default function MediaRow({ title, items, onSelect, rowIndex, focusedCardIndex, watchedIds, animationDelay }: MediaRowProps) {
  const rowRef = useRef<HTMLDivElement>(null)

  const handleScroll = useCallback(() => {
    // no-op: scrolling is handled natively; arrows removed for clean UI
  }, [])

  useEffect(() => {
    if (focusedCardIndex !== undefined && rowRef.current) {
      const child = rowRef.current.children[focusedCardIndex] as HTMLElement | undefined
      if (child) {
        child.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      }
    }
  }, [focusedCardIndex])

  return (
    <div
      className={`${styles.row} animate-fade`}
      style={animationDelay !== undefined ? { animationDelay: `${animationDelay}ms`, opacity: 0 } : undefined}
    >
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.track}>
        <div className={styles.container} ref={rowRef} onScroll={handleScroll}>
          {items.map((item, idx) => (
            <MediaCard
              key={item.id}
              item={item}
              onSelect={onSelect}
              isFocused={focusedCardIndex === idx}
              isWatched={watchedIds?.has(item.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
