import React from 'react'
import type { Episode } from '../../types'
import styles from './UpNext.module.css'

interface UpNextProps {
  episode: Episode
  showTitle: string
  countdown: number
  onCancel: () => void
  onPlayNow: () => void
}

export default function UpNext({ episode, showTitle, countdown, onCancel, onPlayNow }: UpNextProps) {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.badge}>Up Next</span>
          <span className={styles.countdown}>{countdown}s</span>
        </div>
        <div className={styles.body}>
          <div className={styles.info}>
            <p className={styles.showTitle}>{showTitle}</p>
            <p className={styles.episodeTitle}>
              S{String(episode.seasonNumber).padStart(2, '0')} E{String(episode.episodeNumber).padStart(2, '0')} - {episode.name}
            </p>
            <p className={styles.overview}>{episode.overview?.slice(0, 120)}</p>
          </div>
        </div>
        <div className={styles.actions}>
          <button className={styles.playBtn} onClick={onPlayNow}>Play Now</button>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
