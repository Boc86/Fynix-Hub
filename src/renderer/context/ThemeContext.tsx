import React, { createContext, useContext, useEffect, useState } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { themes, type Theme } from '../styles/themes'

type ThemeContextType = {
  currentTheme: Theme
  setTheme: (themeName: string) => void
  availableThemes: Theme[]
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme: themeName, setTheme: setThemeSetting } = useSettingsStore()
  const [currentTheme, setCurrentTheme] = useState<Theme>(themes.dark)

  useEffect(() => {
    const theme = themes[themeName] || themes.dark
    setCurrentTheme(theme)
    
    // Apply theme to document
    const root = document.documentElement
    Object.entries(theme.colors).forEach(([key, value]) => {
      const cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`
      root.style.setProperty(cssVar, value)
    })
    
    // Set font family
    root.style.setProperty('--font-family', theme.fonts.primary)
    root.style.setProperty('--font-mono', theme.fonts.mono)
    
    // Set accent RGB for transparency effects
    const accentRgb = theme.colors.accent.replace('#', '')
    const r = parseInt(accentRgb.substr(0, 2), 16)
    const g = parseInt(accentRgb.substr(2, 2), 16)
    const b = parseInt(accentRgb.substr(4, 2), 16)
    root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`)
  }, [themeName])

  const handleSetTheme = (newThemeName: string) => {
    setThemeSetting(newThemeName)
  }

  const value = {
    currentTheme,
    setTheme: handleSetTheme,
    availableThemes: Object.values(themes),
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}