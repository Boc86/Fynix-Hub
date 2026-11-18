import React, { useState, useCallback } from 'react'
import Toast from './Toast'
import styles from './ToastContainer.module.css'

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
  action?: { label: string; onClick: () => void }
  duration?: number
}

interface ToastContainerProps {
  id: string
}

export default function ToastContainer({ id }: ToastContainerProps) {
  const [toasts, setToasts] = useState<Toast[]>([])
  
  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9)
    setToasts(prev => [...prev, { ...toast, id }])
    return id
  }, [])
  
  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])
  
  return (
    <div className={styles.container} aria-live="polite" aria-atomic="true">
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          id={toast.id}
          message={toast.message}
          type={toast.type}
          action={toast.action}
          duration={toast.duration}
          onClose={removeToast}
        />
      ))}
    </div>
  )
}