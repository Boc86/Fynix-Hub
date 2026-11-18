import React from 'react'

interface AccessibilityProps {
  children: React.ReactNode
  id?: string
  role?: string
  ariaLabel?: string
  ariaDescribedBy?: string
  tabIndex?: number
}

export function useAccessibility() {
  const announceToScreenReader = (message: string) => {
    const announcement = document.createElement('div')
    announcement.setAttribute('aria-live', 'polite')
    announcement.setAttribute('aria-atomic', 'true')
    announcement.setAttribute('class', 'sr-only')
    announcement.textContent = message
    
    document.body.appendChild(announcement)
    setTimeout(() => {
      document.body.removeChild(announcement)
    }, 1000)
  }

  const announceChange = (elementId: string, message: string) => {
    const element = document.getElementById(elementId)
    if (element) {
      element.setAttribute('aria-live', 'polite')
      setTimeout(() => {
        element.setAttribute('aria-live', 'off')
      }, 1000)
    }
    announceToScreenReader(message)
  }

  return {
    announceToScreenReader,
    announceChange
  }
}

export function AccessibleElement({ 
  children, 
  id, 
  role, 
  ariaLabel, 
  ariaDescribedBy,
  tabIndex = 0 
}: AccessibilityProps) {
  return React.createElement('div', {
    id,
    role,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
    tabIndex,
  }, children)
}

export function ScreenReaderOnly({ children }: { children: React.ReactNode }) {
  return React.createElement('div', {
    className: 'sr-only',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  }, children)
}