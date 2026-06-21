import React from 'react'
import styles from './Layout.module.css'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className={styles.layout}>
      <div className={styles.titlebar} data-tauri-drag-region>
        <div className={styles.titlebarTitle}>Fynix Hub</div>
        <div className={styles.titlebarControls}>
          <button className={styles.controlBtn} onClick={() => window.api.window.minimize()}>
            <svg width="12" height="12" viewBox="0 0 12 12"><rect y="5" width="12" height="2" fill="currentColor"/></svg>
          </button>
          <button className={styles.controlBtn} onClick={() => window.api.window.maximize()}>
            <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" stroke="currentColor" strokeWidth="2" fill="none"/></svg>
          </button>
          <button className={`${styles.controlBtn} ${styles.closeBtn}`} onClick={() => window.api.window.close()}>
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="2"/></svg>
          </button>
        </div>
      </div>
      <div className={styles.content}>
        {children}
      </div>
    </div>
  )
}
