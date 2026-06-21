import React, { useState, useEffect } from 'react'
import type { MediaItem } from '../../types'
import styles from './HeroBanner.module.css'

interface HeroBannerProps {
  item: MediaItem
  onPlay: () => void
  onInfo: () => void
}

export default function HeroBanner({ item, onPlay, onInfo }: HeroBannerProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const backdropUrl = item.backdropPath
    ? `https://image.tmdb.org/t/p/original${item.backdropPath}`
    : null

  return (
    <div className={styles.banner}>
      {backdropUrl && (
        <div
          className={`${styles.bgImage} ${imageLoaded ? styles.loaded : ''}`}
          style={{ backgroundImage: `url(${backdropUrl})` }}
          onLoad={() => setImageLoaded(true)}
        />
      )}
      <div className={styles.gradient} />
      <div className={styles.content}>
        <h1 className={styles.title}>{item.title}</h1>
        <p className={styles.overview}>{item.overview?.slice(0, 250)}</p>
        <div className={styles.rating}>
          {item.voteAverage > 0 && (
            <span className={styles.vote}>{item.voteAverage.toFixed(1)} Rating</span>
          )}
          <span className={styles.year}>{item.releaseDate?.slice(0, 4)}</span>
          <span className={styles.type}>{item.mediaType === 'movie' ? 'Movie' : 'TV'}</span>
        </div>
        <div className={styles.actions}>
          <button className={styles.playBtn} onClick={onPlay}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
            Play
          </button>
          <button className={styles.infoBtn} onClick={onInfo}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
            </svg>
            More Info
          </button>
        </div>
      </div>
    </div>
  )
}
