import React from 'react'
import styles from './Layout.module.css'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className={styles.layout}>
      <div className={styles.content}>
        {children}
      </div>
    </div>
  )
}
