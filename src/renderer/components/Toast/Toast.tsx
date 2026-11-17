import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import styles from './Toast.module.css'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastProps {
  id: string
  message: string
  type: ToastType
  action?: { label: string; onClick: () => void }
  duration?: number
  onClose: (id: string) => void
}

export default function Toast({ id, message, type, action, duration = 5000, onClose }: ToastProps) {
  const timerRef = useRef<NodeJS.Timeout>()
  const containerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(containerRef, false) // No focus trap for toasts
  
  useEffect(() => {
    if (duration > 0) {
      timerRef.current = setTimeout(() => onClose(id), duration)
    }
    return () => clearTimeout(timerRef.current)
  }, [id, duration, onClose])
  
  const getIcon = () => {
    switch (type) {
      case 'success': return '✓'
      case 'error': return '✕'
      case 'warning': return '⚠'
      case 'info': return 'ℹ'
    }
  }
  
  return createPortal(
    <div ref={containerRef} className={`${styles.toast} ${styles[type]}`} role="alert" aria-live="assertive">
      <span className={styles.icon}>{getIcon()}</span>
      <span className={styles.message}>{message}</span>
      {action && (
        <button className={styles.action} onClick={action.onClick}>
          {action.label}
        </button>
      )}
      <button 
        className={styles.close} 
        onClick={() => onClose(id)} 
        aria-label="Close"
      >
        ×
      </button>
    </div>,
    document.body
  )
}