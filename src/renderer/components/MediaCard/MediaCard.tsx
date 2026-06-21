import React, { useState, useCallback } from 'react'
import type { MediaItem } from '../../types'
import styles from './MediaCard.module.css'

interface MediaCardProps {
  item: MediaItem
  onSelect: (item: MediaItem) => void
}

export default function MediaCard({ item, onSelect }: MediaCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const posterUrl = item.posterPath
    ? `https://image.tmdb.org/t/p/w342${item.posterPath}`
    : null

  const handleClick = useCallback(() => {
    onSelect(item)
  }, [item, onSelect])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(item)
    }
  }, [item, onSelect])

  return (
    <div
      className={styles.card}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
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
      </div>
      <div className={styles.info}>
        <h3 className={styles.cardTitle}>{item.title}</h3>
        <div className={styles.meta}>
          {item.voteAverage > 0 && (
            <span className={styles.rating}>{item.voteAverage.toFixed(1)}</span>
          )}
          <span className={styles.year}>{item.releaseDate?.slice(0, 4)}</span>
        </div>
      </div>
    </div>
  )
}
