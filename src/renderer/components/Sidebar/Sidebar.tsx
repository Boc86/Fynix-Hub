import React, { useEffect, useRef, useState, useCallback } from 'react'
import styles from './Sidebar.module.css'
import { useSettingsStore } from '../../store/settingsStore'

export type NavView = 'browser' | 'movies' | 'tv-shows' | 'youtube' | 'sports' | 'settings'

export const SIDEBAR_VIEWS: NavView[] = ['browser', 'movies', 'tv-shows', 'youtube', 'sports', 'settings']

interface SidebarProps {
  open: boolean
  currentView: NavView
  onNavigate: (view: NavView) => void
  onSearch: () => void
  onClose: () => void
}

const AVATAR_COLORS = [
  '#E50914', '#FF6B00', '#007AFF', '#7B68EE', '#34C759',
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

export default function Sidebar({ open, currentView, onNavigate, onSearch, onClose }: SidebarProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const navItemsRef = useRef<HTMLButtonElement[]>([])

  const profiles = useSettingsStore((s) => s.profiles)
  const activeProfileId = useSettingsStore((s) => s.activeProfileId)
  const setActiveProfile = useSettingsStore((s) => s.setActiveProfile)
  const activeProfile = profiles.find((p) => p.id === activeProfileId)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [profileMenuFocused, setProfileMenuFocused] = useState(0)
  const profileMenuItemsRef = useRef<HTMLButtonElement[]>([])
  const profileRowRef = useRef<HTMLButtonElement>(null)

  const navItems = [
    { view: 'browser' as NavView, label: 'Home', icon: 'browser' },
    { view: 'movies' as NavView, label: 'Movies', icon: 'movies' },
    { view: 'tv-shows' as NavView, label: 'TV Shows', icon: 'tv-shows' },
    { view: 'youtube' as NavView, label: 'YouTube', icon: 'youtube' },
    { view: 'sports' as NavView, label: 'Sports', icon: 'sports' },
  ]

  const bottomItems = [
    { action: 'settings' as const, label: 'Settings', icon: 'settings' },
    { action: 'minimize' as const, label: 'Minimize', icon: 'minimize' },
    { action: 'exit' as const, label: 'Exit', icon: 'exit' },
  ]

  const totalNavItems = navItems.length + 1 + bottomItems.length

  useEffect(() => {
    if (!open) {
      setFocusedIndex(0)
      setProfileMenuOpen(false)
      return
    }
    const firstItem = navItemsRef.current[0]
    if (firstItem) firstItem.focus()
  }, [open])

  // Focus first menu item when profile menu opens; refocus profile row when it closes
  useEffect(() => {
    if (profileMenuOpen) {
      setProfileMenuFocused(0)
      setTimeout(() => profileMenuItemsRef.current[0]?.focus(), 0)
    } else {
      profileRowRef.current?.focus()
    }
  }, [profileMenuOpen])

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && profileMenuOpen) {
        e.preventDefault()
        setProfileMenuOpen(false)
        return
      }
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose, profileMenuOpen])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (profileMenuOpen) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = (focusedIndex + 1) % totalNavItems
      setFocusedIndex(next)
      navItemsRef.current[next]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = (focusedIndex - 1 + totalNavItems) % totalNavItems
      setFocusedIndex(prev)
      navItemsRef.current[prev]?.focus()
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const idx = focusedIndex
      if (idx < navItems.length) {
        onNavigate(navItems[idx].view)
        onClose()
      } else if (idx === navItems.length) {
        setProfileMenuOpen(true)
      } else {
        const bottomIdx = idx - navItems.length - 1
        const item = bottomItems[bottomIdx]
        if (item) {
          if (item.action === 'settings') { onNavigate('settings'); onClose() }
          else if (item.action === 'minimize') window.api.app.minimize()
          else if (item.action === 'exit') window.api.app.quit()
        }
      }
    }
  }, [focusedIndex, onNavigate, onClose, profileMenuOpen, totalNavItems, navItems.length, bottomItems])

  const handleNavClick = (view: NavView) => {
    onNavigate(view)
    onClose()
  }

  const renderIcon = (icon: string) => {
    if (icon === 'browser') return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    )
    if (icon === 'movies') return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
        <line x1="7" y1="2" x2="7" y2="22"/>
        <line x1="17" y1="2" x2="17" y2="22"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <line x1="2" y1="7" x2="7" y2="7"/>
        <line x1="2" y1="17" x2="7" y2="17"/>
        <line x1="17" y1="7" x2="22" y2="7"/>
        <line x1="17" y1="17" x2="22" y2="17"/>
      </svg>
    )
    if (icon === 'tv-shows') return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="15" rx="2" ry="2"/>
        <polyline points="17 2 12 7 7 2"/>
      </svg>
    )
    if (icon === 'youtube') return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.33 29 29 0 0 0-.46-5.33z"/>
        <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/>
      </svg>
    )
    if (icon === 'sports') return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M2 12h20"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    )
    if (icon === 'live-tv') return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="14" rx="2"/>
        <line x1="8" y1="22" x2="16" y2="22"/>
        <line x1="12" y1="18" x2="12" y2="22"/>
        <polygon points="10 9 10 15 15 12 10 9"/>
      </svg>
    )
    if (icon === 'epg') return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
        <line x1="8" y1="14" x2="12" y2="14"/>
        <line x1="8" y1="18" x2="14" y2="18"/>
      </svg>
    )
    if (icon === 'settings') return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    )
    if (icon === 'minimize') return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    )
    if (icon === 'exit') return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <polyline points="16 17 21 12 16 7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
    )
    return null
  }

  return (
    <>
      {open && <div className={styles.overlay} onClick={onClose} />}
      <nav ref={ref} className={`${styles.sidebar} ${open ? styles.open : ''}`} onKeyDown={handleKeyDown}>
        <div className={styles.brand}>
          <span className={styles.brandPrimary}>FYNIX</span>
          <span className={styles.brandSecondary}>HUB</span>
        </div>
        <div className={styles.divider} />

        <div className={styles.navSection}>
          {navItems.map((item, index) => (
            <button
              key={item.view}
              ref={(el) => { navItemsRef.current[index] = el! }}
              tabIndex={0}
              className={`${styles.navItem} ${currentView === item.view ? styles.active : ''} ${focusedIndex === index ? styles.focused : ''}`}
              onClick={() => handleNavClick(item.view)}
              onFocus={() => setFocusedIndex(index)}
            >
              <span className={styles.navIcon}>{renderIcon(item.icon)}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </button>
          ))}
        </div>

        <div className={styles.spacer} />

        {/* Profile row at bottom */}
        <button
          ref={(el) => { navItemsRef.current[navItems.length] = el!; (profileRowRef as React.MutableRefObject<HTMLButtonElement | null>).current = el }}
          tabIndex={0}
          className={`${styles.profileRow} ${focusedIndex === navItems.length ? styles.focused : ''}`}
          onClick={() => setProfileMenuOpen((o) => !o)}
          onFocus={() => setFocusedIndex(navItems.length)}
        >
          {activeProfile?.avatarPath ? (
            <img src={activeProfile.avatarPath} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />
          ) : (
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: activeProfile ? getAvatarColor(activeProfile.id) : '#666',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 12, flexShrink: 0
            }}>
              {activeProfile ? getInitials(activeProfile.name) : '?'}
            </div>
          )}
          <span style={{ flex: 1, fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeProfile ? activeProfile.name : 'Select Profile'}
          </span>
        </button>

        {/* Bottom row: Settings, Minimize, Exit */}
        <div className={styles.bottomControls}>
          {bottomItems.map((item, index) => {
            const idx = navItems.length + 1 + index
            return (
              <button
                key={item.action}
                ref={(el) => { navItemsRef.current[idx] = el! }}
                tabIndex={0}
                className={`${styles.controlBtn} ${focusedIndex === idx ? styles.focused : ''}`}
                onClick={() => {
                  if (item.action === 'settings') { onNavigate('settings'); onClose() }
                  else if (item.action === 'minimize') window.api.app.minimize()
                  else if (item.action === 'exit') window.api.app.quit()
                }}
                onFocus={() => setFocusedIndex(idx)}
                title={item.label}
              >
                {renderIcon(item.icon)}
              </button>
            )
          })}
        </div>

        {/* Profile Dropdown */}
        {profileMenuOpen && (
          <div className={styles.profileMenu}>
            <div className={styles.profileMenuHeader}>Switch Profile</div>
            {profiles.map((p, i) => (
              <button
                key={p.id}
                ref={(el) => { profileMenuItemsRef.current[i] = el! }}
                tabIndex={0}
                onClick={() => {
                  setActiveProfile(p.id)
                  setProfileMenuOpen(false)
                  onClose()
                }}
                onFocus={() => setProfileMenuFocused(i)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    const next = (i + 1) % profiles.length
                    setProfileMenuFocused(next)
                    profileMenuItemsRef.current[next]?.focus()
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    const prev = (i - 1 + profiles.length) % profiles.length
                    setProfileMenuFocused(prev)
                    profileMenuItemsRef.current[prev]?.focus()
                  } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setActiveProfile(p.id)
                    setProfileMenuOpen(false)
                    onClose()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setProfileMenuOpen(false)
                  }
                }}
                className={`${styles.profileMenuItem} ${profileMenuFocused === i ? styles.profileMenuFocused : ''}`}
              >
                {p.avatarPath ? (
                  <img src={p.avatarPath} alt={p.name} style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover' }} />
                ) : (
                  <div style={{
                    width: 24, height: 24, borderRadius: 4,
                    background: getAvatarColor(p.id),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 700, fontSize: 11, flexShrink: 0
                  }}>
                    {getInitials(p.name)}
                  </div>
                )}
                <span style={{ flex: 1 }}>{p.name}</span>
                {p.id === activeProfileId && <span style={{ color: 'var(--accent)' }}>●</span>}
              </button>
            ))}
          </div>
        )}
      </nav>
    </>
  )
}
