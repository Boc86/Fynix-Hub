import React from 'react'
import { useMediaStore } from '../../store/mediaStore'
import styles from './DetailView.module.css'

interface DetailViewProps {
  onBack: () => void
  onPlay: () => void
}

export default function DetailView({ onBack, onPlay }: DetailViewProps) {
  const { selectedMedia } = useMediaStore()

  if (!selectedMedia) {
    return (
      <div className={styles.empty}>
        <button className={styles.backBtn} onClick={onBack}>Back</button>
        <p>Select media to view details</p>
      </div>
    )
  }

  const backdropUrl = selectedMedia.backdropPath
    ? `https://image.tmdb.org/t/p/original${selectedMedia.backdropPath}`
    : null

  const posterUrl = selectedMedia.posterPath
    ? `https://image.tmdb.org/t/p/w342${selectedMedia.posterPath}`
    : null

  return (
    <div className={styles.detail}>
      {backdropUrl && (
        <div
          className={styles.backdrop}
          style={{ backgroundImage: `url(${backdropUrl})` }}
        />
      )}
      <div className={styles.gradient} />
      <button className={styles.backBtn} onClick={onBack}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
        Back
      </button>

      <div className={styles.content}>
        {posterUrl && (
          <img src={posterUrl} alt={selectedMedia.title} className={styles.poster} />
        )}
        <div className={styles.info}>
          <h1 className={styles.title}>{selectedMedia.title}</h1>
          <div className={styles.meta}>
            <span className={styles.rating}>{selectedMedia.voteAverage.toFixed(1)}</span>
            <span>{selectedMedia.releaseDate?.slice(0, 4)}</span>
            {'genres' in selectedMedia && selectedMedia.genres?.map((g) => (
              <span key={g.id} className={styles.genre}>{g.name}</span>
            ))}
          </div>
          <p className={styles.overview}>{selectedMedia.overview}</p>
          <button className={styles.playBtn} onClick={onPlay}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
            Play
          </button>
        </div>
      </div>
    </div>
  )
}
