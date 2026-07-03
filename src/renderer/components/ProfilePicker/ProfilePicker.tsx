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

function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!

    let animId: number
    const particles: { x: number; y: number; vx: number; vy: number; r: number; alpha: number }[] = []
    const COUNT = 80

    function resize() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.5 + 0.1,
      })
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy

        if (p.x < 0) p.x = canvas.width
        if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height
        if (p.y > canvas.height) p.y = 0

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(229, 9, 20, ${p.alpha})`
        ctx.fill()
      }

      // Draw connections between nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 150) {
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(229, 9, 20, ${0.06 * (1 - dist / 150)})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }

      animId = requestAnimationFrame(draw)
    }

    animId = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className={styles.canvas} />
}

export default function ProfilePicker({ profiles, onSelect, onAdd }: ProfilePickerProps) {
  const [focusedIndex, setFocusedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef<HTMLButtonElement[]>([])

  useEffect(() => {
    itemsRef.current[focusedIndex]?.focus()
  }, [focusedIndex])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const total = profiles.length + 1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      setFocusedIndex((i) => (i + 1) % total)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      setFocusedIndex((i) => (i - 1 + total) % total)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      if (focusedIndex < profiles.length) {
        onSelect(profiles[focusedIndex])
      } else {
        onAdd()
      }
    } else if (e.key === 'Backspace' || e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  return (
    <div className={styles.container} ref={containerRef} tabIndex={0} onKeyDown={handleKeyDown}>
      <Particles />
      <div className={styles.content}>
        <div className={styles.brand}>
          <span className={styles.brandPrimary}>FYNIX</span>
          <span className={styles.brandSecondary}>Media Hub</span>
        </div>
        <span className={styles.subtitle}>Choose your profile</span>
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
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <span className={styles.name}>Add Profile</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
