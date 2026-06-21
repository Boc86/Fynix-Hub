import React, { createContext, useContext, useCallback, useRef, useEffect } from 'react'

interface KeyboardNavContextType {
  register: (id: string, element: HTMLElement | null) => void
  unregister: (id: string) => void
  focusNext: () => void
  focusPrev: () => void
}

const KeyboardNavContext = createContext<KeyboardNavContextType | null>(null)

export function useKeyboardNav() {
  const ctx = useContext(KeyboardNavContext)
  if (!ctx) throw new Error('useKeyboardNav must be used within KeyboardNavProvider')
  return ctx
}

export function KeyboardNavProvider({ children }: { children: React.ReactNode }) {
  const elementsRef = useRef<Map<string, HTMLElement>>(new Map())
  const orderRef = useRef<string[]>([])

  const register = useCallback((id: string, element: HTMLElement | null) => {
    if (element) {
      elementsRef.current.set(id, element)
      if (!orderRef.current.includes(id)) {
        orderRef.current.push(id)
      }
    }
  }, [])

  const unregister = useCallback((id: string) => {
    elementsRef.current.delete(id)
    orderRef.current = orderRef.current.filter((k) => k !== id)
  }, [])

  const getCurrentIndex = useCallback(() => {
    const activeEl = document.activeElement
    if (!activeEl) return -1
    return orderRef.current.findIndex((id) => elementsRef.current.get(id) === activeEl)
  }, [])

  const focusNext = useCallback(() => {
    const idx = getCurrentIndex()
    if (idx < orderRef.current.length - 1) {
      const next = elementsRef.current.get(orderRef.current[idx + 1])
      next?.focus()
    }
  }, [getCurrentIndex])

  const focusPrev = useCallback(() => {
    const idx = getCurrentIndex()
    if (idx > 0) {
      const prev = elementsRef.current.get(orderRef.current[idx - 1])
      prev?.focus()
    }
  }, [getCurrentIndex])

  return (
    <KeyboardNavContext.Provider value={{ register, unregister, focusNext, focusPrev }}>
      {children}
    </KeyboardNavContext.Provider>
  )
}
