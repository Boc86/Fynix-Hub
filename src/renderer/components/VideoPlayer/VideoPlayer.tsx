import React from 'react'
import styles from './VideoPlayer.module.css'

interface VideoPlayerProps {
  onBack: () => void
  onNextEpisode: () => void
}

export default function VideoPlayer({ onBack, onNextEpisode }: VideoPlayerProps) {
  return (
    <div className={styles.player}>
      <div className={styles.placeholder}>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
        <p>Video player will be implemented in Phase 5</p>
        <button className={styles.backBtn} onClick={onBack}>
          Back to Details
        </button>
      </div>
    </div>
  )
}
