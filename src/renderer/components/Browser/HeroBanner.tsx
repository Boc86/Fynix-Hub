import React, { useState, useEffect, useRef } from 'react'
import type { MediaItem } from '../../types'
import styles from './HeroBanner.module.css'

interface HeroBannerProps {
  item: MediaItem
  focusedHeroAction?: number // -1=unfocused, 0=Play, 1=More Info
  playRef?: React.RefObject<HTMLButtonElement | null>
  infoRef?: React.RefObject<HTMLButtonElement | null>
  onPlay: () => void
  onInfo: () => void
}

export default function HeroBanner({ item, focusedHeroAction, playRef, infoRef, onPlay, onInfo }: HeroBannerProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [clearlogo, setClearlogo] = useState<string | null>(null)

  const backdropPath = item.backdropPath || item.posterPath
  const backdropUrl = backdropPath
    ? `https://image.tmdb.org/t/p/original${backdropPath}`
    : null

  useEffect(() => {
    if (!backdropUrl) return
    const img = new Image()
    imgRef.current = img
    img.onload = () => setImageLoaded(true)
    img.src = backdropUrl
    return () => {
      img.onload = null
      imgRef.current = null
    }
  }, [backdropUrl])

  useEffect(() => {
    window.api.fanart.getImages(item.id, item.mediaType).then((res) => {
      setClearlogo(res.clearlogo || res.clearart || null)
    }).catch(() => {})
  }, [item.id, item.mediaType])

  return (
    <div className={styles.banner}>
      {backdropUrl && (
        <div
          className={`${styles.bgImage} ${imageLoaded ? styles.loaded : ''}`}
          style={{ backgroundImage: `url(${backdropUrl})` }}
        />
      )}
      <div className={styles.gradient} />
      <div className={styles.content}>
        {clearlogo ? (
          <img src={clearlogo} alt="" className={styles.clearlogo} onError={() => setClearlogo(null)} />
        ) : (
          <h1 className={styles.title}>{item.title}</h1>
        )}
        <p className={styles.overview}>{item.overview?.slice(0, 250)}</p>
        <div className={styles.rating}>
          {item.voteAverage > 0 && (
            <span className={styles.vote}>{item.voteAverage.toFixed(1)} Rating</span>
          )}
          <span className={styles.year}>{item.releaseDate?.slice(0, 4)}</span>
          <span className={styles.type}>{item.mediaType === 'movie' ? 'Movie' : 'TV'}</span>
        </div>
        <div className={styles.actions}>
          <button
            ref={playRef}
            className={`${styles.playBtn} ${focusedHeroAction === 0 ? styles.focused : ''}`}
            onClick={onPlay}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
            Play
          </button>
          <button
            ref={infoRef}
            className={`${styles.infoBtn} ${focusedHeroAction === 1 ? styles.focused : ''}`}
            onClick={onInfo}
          >
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
