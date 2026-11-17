import { createContext, useContext, useCallback, useRef, useState } from 'react'

interface NavigationState {
  view: string
  scrollPosition?: number
  searchQuery?: string
  focusedItem?: { type: string; id: number; index: number }
  filter?: string
  timestamp: number
}

interface NavigationContextType {
  navigate: (view: string, options?: { scrollPosition?: number; searchQuery?: string; focusedItem?: NavigationState['focusedItem']; filter?: string }) => void
  goBack: () => void
  canGoBack: boolean
  currentHistory: NavigationState[]
}

const NavigationContext = createContext<NavigationContextType | null>(null)

export function useNavigation() {
  const context = useContext(NavigationContext)
  if (!context) throw new Error('useNavigation must be used within NavigationProvider')
  return context
}

interface NavigationProviderProps {
  children: React.ReactNode
  onNavigate: (view: string) => void
}

export function NavigationProvider({ children, onNavigate }: NavigationProviderProps) {
  const [history, setHistory] = useState<NavigationState[]>([{ view: 'browser', timestamp: Date.now() }])
  
  const navigate = useCallback((view: string, options?: { scrollPosition?: number; searchQuery?: string; focusedItem?: NavigationState['focusedItem']; filter?: string }) => {
    setHistory(prev => [...prev, { 
      view, 
      timestamp: Date.now(),
      ...options 
    }])
    onNavigate(view)
  }, [onNavigate])
  
  const goBack = useCallback(() => {
    if (history.length > 1) {
      const newHistory = history.slice(0, -1)
      const prev = newHistory[newHistory.length - 1]
      setHistory(newHistory)
      onNavigate(prev.view)
      // Return the previous state for restoration
      return prev
    }
    return null
  }, [history, onNavigate])
  
  return (
    <NavigationContext.Provider value={{
      navigate,
      goBack,
      canGoBack: history.length > 1,
      currentHistory: history
    }}>
      {children}
    </NavigationContext.Provider>
  )
}