import React, { useRef, useCallback, useState } from 'react'
import type { MediaItem } from '../../types'
import MediaCard from './MediaCard'
import styles from './MediaRow.module.css'

interface MediaRowProps {
  title: string
  items: MediaItem[]
  onSelect: (item: MediaItem) => void
}

export default function MediaRow({ title, items, onSelect }: MediaRowProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  const [showLeftArrow, setShowLeftArrow] = useState(false)
  const [showRightArrow, setShowRightArrow] = useState(true)

  const scroll = useCallback((direction: 'left' | 'right') => {
    if (!rowRef.current) return
    const scrollAmount = rowRef.current.clientWidth * 0.75
    rowRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
  }, [])

  const handleScroll = useCallback(() => {
    if (!rowRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = rowRef.current
    setShowLeftArrow(scrollLeft > 20)
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 20)
  }, [])

  return (
    <div className={styles.row}>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.track}>
        {showLeftArrow && (
          <button className={`${styles.arrow} ${styles.leftArrow}`} onClick={() => scroll('left')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
            </svg>
          </button>
        )}
        <div className={styles.container} ref={rowRef} onScroll={handleScroll}>
          {items.map((item) => (
            <MediaCard key={item.id} item={item} onSelect={onSelect} />
          ))}
        </div>
        {showRightArrow && (
          <button className={`${styles.arrow} ${styles.rightArrow}`} onClick={() => scroll('right')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
