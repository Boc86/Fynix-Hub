import React, { useState, useCallback, useEffect, useRef } from 'react'
import type { MediaItem } from '../../types'
import styles from './MediaCard.module.css'

interface MediaCardProps {
  item: MediaItem
  onSelect: (item: MediaItem) => void
  isFocused?: boolean
  isWatched?: boolean
}

export default function MediaCard({ item, onSelect, isFocused, isWatched }: MediaCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const posterUrl = item.posterPath
    ? `https://image.tmdb.org/t/p/w342${item.posterPath}`
    : null

  useEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.focus()
    }
  }, [isFocused])

  const handleClick = useCallback(() => {
    onSelect(item)
  }, [item, onSelect])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.defaultPrevented) {
      e.preventDefault()
      onSelect(item)
    }
  }, [item, onSelect])

  return (
    <div
      ref={cardRef}
      className={`${styles.card} ${isFocused ? styles.focused : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      role="button"
      aria-label={item.title}
    >
      <div className={styles.posterWrap}>
        {posterUrl ? (
          <>
            {!imageLoaded && <div className={styles.skeleton} />}
            <img
              src={posterUrl}
              alt={item.title}
              className={`${styles.poster} ${imageLoaded ? styles.loaded : ''}`}
              loading="lazy"
              onLoad={() => setImageLoaded(true)}
            />
          </>
        ) : (
          <div className={styles.placeholder}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 3v2h-2V3H8v2H6V3H4v18h2v-2h2v2h8v-2h2v2h2V3h-2zM8 17H6v-2h2v2zm0-4H6v-2h2v2zm0-4H6V7h2v2zm10 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"/>
            </svg>
          </div>
        )}
        <div className={styles.overlay}>
          {item.voteAverage > 0 && (
            <span className={`${styles.ratingBadge} ${
              item.voteAverage >= 7 ? styles.ratingGreen :
              item.voteAverage >= 5 ? styles.ratingYellow :
              styles.ratingRed
            }`}>
              {item.voteAverage.toFixed(1)}
            </span>
          )}
          {isWatched && (
            <span className={styles.watchedBadge}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
