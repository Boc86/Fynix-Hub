import React, { useEffect, useRef, useState, useCallback } from 'react'
import styles from './Sidebar.module.css'

export type NavView = 'browser' | 'movies' | 'tv-shows' | 'youtube' | 'settings' | 'sports'

export const SIDEBAR_VIEWS: NavView[] = ['browser', 'movies', 'tv-shows', 'youtube', 'settings', 'sports']

interface SidebarProps {
  open: boolean
  currentView: NavView
  onNavigate: (view: NavView) => void
  onSearch: () => void
  onClose: () => void
}

export default function Sidebar({ open, currentView, onNavigate, onSearch, onClose }: SidebarProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const navItemsRef = useRef<HTMLButtonElement[]>([])

  const navItems = [
    { view: 'browser' as NavView, label: 'Home', shortcut: '' },
    { view: 'movies' as NavView, label: 'Movies', shortcut: '' },
    { view: 'tv-shows' as NavView, label: 'TV Shows', shortcut: '' },
    { view: 'youtube' as NavView, label: 'YouTube', shortcut: '' },
    { view: 'settings' as NavView, label: 'Settings', shortcut: '' },
    { view: 'sports' as NavView, label: 'Sports', shortcut: '' },
    { view: null as NavView | null, label: 'Minimize', shortcut: '', isAction: true, action: 'minimize' as const },
    { view: null as NavView | null, label: 'Exit', shortcut: '', isAction: true, action: 'exit' as const },
  ]

  useEffect(() => {
    if (!open) {
      setFocusedIndex(0)
      return
    }
    const firstItem = navItemsRef.current[0]
    if (firstItem) firstItem.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const totalItems = navItems.length
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex((i) => (i + 1) % totalItems)
      navItemsRef.current[0]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex((i) => (i - 1 + totalItems) % totalItems)
      navItemsRef.current[0]?.focus()
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const item = navItems[focusedIndex]
      if (item) {
        if (item.isAction) {
          if (item.action === 'minimize') window.api.app.minimize()
          else if (item.action === 'exit') window.api.app.quit()
        } else {
          onNavigate(item.view!)
        }
        onClose()
      }
    }
  }, [focusedIndex, onNavigate, onClose])

  const handleNavClick = (view: NavView) => {
    onNavigate(view)
    onClose()
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
        
        {navItems.map((item, index) => (
          <button
            key={item.label}
            ref={(el) => { navItemsRef.current[index] = el! }}
            tabIndex={0}
            className={`${styles.navItem} ${currentView === item.view ? styles.active : ''} ${focusedIndex === index ? styles.focused : ''}`}
            onClick={() => { if (item.isAction) { if (item.action === 'minimize') window.api.app.minimize(); else if (item.action === 'exit') window.api.app.quit() } else { handleNavClick(item.view!) } }}
            onFocus={() => setFocusedIndex(index)}
          >
            <span className={styles.navIcon}>
              {item.view === 'browser' && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              )}
              {item.view === 'movies' && (
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
              )}
              {item.view === 'tv-shows' && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="15" rx="2" ry="2"/>
                  <polyline points="17 2 12 7 7 2"/>
                </svg>
              )}
              {item.view === 'youtube' && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.33 29 29 0 0 0-.46-5.33z"/>
                  <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/>
                </svg>
              )}
              {item.view === 'settings' && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1-2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              )}
              {item.view === 'sports' && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M2 12h20"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              )}
              {item.isAction && item.action === 'minimize' && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              )}
              {item.isAction && item.action === 'exit' && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              )}
            </span>
            <span className={styles.navLabel}>{item.label}</span>
            {item.shortcut && <span className={styles.shortcutBadge}>{item.shortcut}</span>}
          </button>
        ))}


      </nav>
    </>
  )
}