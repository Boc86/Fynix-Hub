import React, { useState, useEffect, useRef } from 'react'
import type { MediaItem, Genre } from '../../types'
import { useSettingsStore } from '../../store/settingsStore'
import { formatRuntime, getClassification } from '../../utils/format'
import styles from './HeroBanner.module.css'

// Enriched detail fields fetched on top of the list item (via cached tmdb:get-details)
export interface HeroDetails {
  title?: string
  overview?: string
  tagline?: string
  runtime?: number
  genres?: Genre[]
  releaseDates?: unknown
  contentRatings?: unknown
}

interface HeroBannerProps {
  item: MediaItem
  details?: HeroDetails | null
}

export default function HeroBanner({ item, details }: HeroBannerProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [clearlogo, setClearlogo] = useState<string | null>(null)

  const classificationCountry = useSettingsStore((s) => s.classificationCountry)

  const backdropPath = item.backdropPath || item.posterPath
  const backdropUrl = backdropPath
    ? `https://image.tmdb.org/t/p/original${backdropPath}`
    : null

  const title = details?.title || item.title
  const overview = (details?.overview || item.overview || '').slice(0, 350)
  const certification = details ? getClassification(details, classificationCountry) : null

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
          <h1 className={styles.title}>{title}</h1>
        )}
        <p className={styles.overview}>{overview}</p>
        {details && (
          <div className={styles.meta}>
            {details.tagline && <p className={styles.tagline}>{details.tagline}</p>}
            <div className={styles.metaLine}>
              {details.runtime ? <span className={styles.metaItem}>{formatRuntime(details.runtime)}</span> : null}
              {details.genres?.slice(0, 3).map((g) => (
                <span key={g.id} className={styles.metaItem}>{g.name}</span>
              ))}
              {certification && <span className={styles.cert}>{certification}</span>}
            </div>
          </div>
        )}
        <div className={styles.rating}>
          {item.voteAverage > 0 && (
            <span className={styles.vote}>{item.voteAverage.toFixed(1)} Rating</span>
          )}
          <span className={styles.year}>{item.releaseDate?.slice(0, 4)}</span>
          <span className={styles.type}>{item.mediaType === 'movie' ? 'Movie' : 'TV'}</span>
        </div>
      </div>
    </div>
  )
}
