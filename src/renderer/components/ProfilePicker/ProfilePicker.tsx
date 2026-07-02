import React, { useRef, useEffect, useState } from 'react'
import styles from './ProfilePicker.module.css'
import type { UserProfile } from '../../store/settingsStore'

const AVATAR_COLORS = [
  '#E50914', '#FF6B00', '#007AFF', '#7B68EE', '#34C759',
  '#00B4D8', '#FF9500', '#FF2D55', '#5856D6', '#AF52DE',
]

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function getAvatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

interface ProfilePickerProps {
  profiles: UserProfile[]
  onSelect: (profile: UserProfile) => void
  onAdd: () => void
}

export default function ProfilePicker({ profiles, onSelect, onAdd }: ProfilePickerProps) {
  const [focusedIndex, setFocusedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef<HTMLButtonElement[]>([])

  useEffect(() => {
    if (containerRef.current) containerRef.current.focus()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const total = profiles.length + 1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex((i) => (i + 1) % total)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex((i) => (i - 1 + total) % total)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (focusedIndex < profiles.length) {
        onSelect(profiles[focusedIndex])
      } else {
        onAdd()
      }
    }
  }

  return (
    <div className={styles.container} ref={containerRef} tabIndex={0} onKeyDown={handleKeyDown}>
      <h1 className={styles.brand}>
        <span className={styles.brandPrimary}>FYNIX</span>
        <span className={styles.brandSecondary}> HUB</span>
      </h1>
      <div className={styles.grid}>
        {profiles.map((profile, i) => (
          <button
            key={profile.id}
            ref={(el) => { itemsRef.current[i] = el! }}
            className={`${styles.profileCard} ${focusedIndex === i ? styles.focused : ''}`}
            onClick={() => onSelect(profile)}
            onMouseEnter={() => setFocusedIndex(i)}
            tabIndex={0}
          >
            <div className={styles.avatar}>
              {profile.avatarPath ? (
                <img src={profile.avatarPath} alt={profile.name} className={styles.avatarImage} />
              ) : (
                <div className={styles.avatarFallback} style={{ background: getAvatarColor(profile.id) }}>
                  {getInitials(profile.name)}
                </div>
              )}
            </div>
            <span className={styles.name}>{profile.name}</span>
          </button>
        ))}
        {profiles.length < 5 && (
          <button
            ref={(el) => { itemsRef.current[profiles.length] = el! }}
            className={`${styles.profileCard} ${styles.addCard} ${focusedIndex === profiles.length ? styles.focused : ''}`}
            onClick={onAdd}
            onMouseEnter={() => setFocusedIndex(profiles.length)}
            tabIndex={0}
          >
            <div className={`${styles.avatar} ${styles.addAvatar}`}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <span className={styles.name}>Add Profile</span>
          </button>
        )}
      </div>
    </div>
  )
}
