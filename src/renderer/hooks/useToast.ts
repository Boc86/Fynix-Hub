import { useCallback } from 'react'
import ToastContainer from '@/renderer/components/Toast/ToastContainer'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastOptions {
  message: string
  type: ToastType
  action?: { label: string; onClick: () => void }
  duration?: number
}

// Hook for adding and removing toasts
export function useToast() {
  const addToast = useCallback((options: ToastOptions) => {
    // This will be implemented when we add the ToastContainer to the app
    // For now, we'll create a simple implementation
    const container = document.querySelector('#toast-container') as HTMLElement
    if (container) {
      const toast = document.createElement('div')
      toast.className = `toast ${options.type}`
      toast.innerHTML = `
        <span class="icon">${getIcon(options.type)}</span>
        <span class="message">${options.message}</span>
        ${options.action ? `<button class="action" onclick="(${options.action.onClick.toString()})()">${options.action.label}</button>` : ''}
        <button class="close" onclick="this.parentElement.remove()">×</button>
      `
      container.appendChild(toast)
      
      if (options.duration && options.duration > 0) {
        setTimeout(() => {
          toast.remove()
        }, options.duration)
      }
    }
  }, [])
  
  return { addToast }
}

function getIcon(type: ToastType): string {
  switch (type) {
    case 'success': return '✓'
    case 'error': return '✕'
    case 'warning': return '⚠'
    case 'info': return 'ℹ'
  }
}

// Convenience functions for common toast types
export function showToast(message: string, type: ToastType = 'info', duration = 5000) {
  const container = document.querySelector('#toast-container') as HTMLElement
  if (container) {
    const toast = document.createElement('div')
    toast.className = `toast ${type}`
    toast.innerHTML = `
      <span class="icon">${getIcon(type)}</span>
      <span class="message">${message}</span>
      <button class="close" onclick="this.parentElement.remove()">×</button>
    `
    container.appendChild(toast)
    
    setTimeout(() => {
      toast.remove()
    }, duration)
  }
}

export function showSuccess(message: string, duration?: number) {
  showToast(message, 'success', duration)
}

export function showError(message: string, duration?: number) {
  showToast(message, 'error', duration)
}

export function showWarning(message: string, duration?: number) {
  showToast(message, 'warning', duration)
}

export function showInfo(message: string, duration?: number) {
  showToast(message, 'info', duration)
}