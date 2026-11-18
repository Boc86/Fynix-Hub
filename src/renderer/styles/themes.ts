export interface Theme {
  name: string
  colors: {
    bgPrimary: string
    bgSecondary: string
    bgCard: string
    bgHover: string
    textPrimary: string
    textSecondary: string
    textMuted: string
    accent: string
    accentHover: string
    accentGreen: string
    overlay: string
  }
  fonts: {
    primary: string
    mono: string
  }
}

export const themes: Record<string, Theme> = {
  dark: {
    name: 'Dark',
    colors: {
      bgPrimary: '#141414',
      bgSecondary: '#1a1a2e',
      bgCard: '#1f1f1f',
      bgHover: '#2a2a2a',
      textPrimary: '#ffffff',
      textSecondary: '#b3b3b3',
      textMuted: '#808080',
      accent: '#FF6B00',
      accentHover: '#FF6B00',
      accentGreen: '#46d369',
      overlay: 'rgba(0, 0, 0, 0.7)',
    },
    fonts: {
      primary: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      mono: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", monospace',
    },
  },
  light: {
    name: 'Light',
    colors: {
      bgPrimary: '#ffffff',
      bgSecondary: '#f5f5f5',
      bgCard: '#ffffff',
      bgHover: '#e8e8e8',
      textPrimary: '#000000',
      textSecondary: '#666666',
      textMuted: '#999999',
      accent: '#FF6B00',
      accentHover: '#e55a00',
      accentGreen: '#46d369',
      overlay: 'rgba(0, 0, 0, 0.5)',
    },
    fonts: {
      primary: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      mono: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", monospace',
    },
  },
  blue: {
    name: 'Blue',
    colors: {
      bgPrimary: '#0a0e27',
      bgSecondary: '#151937',
      bgCard: '#1a1f3a',
      bgHover: '#232946',
      textPrimary: '#ffffff',
      textSecondary: '#a0a9c9',
      textMuted: '#6b7280',
      accent: '#3b82f6',
      accentHover: '#2563eb',
      accentGreen: '#10b981',
      overlay: 'rgba(0, 0, 0, 0.7)',
    },
    fonts: {
      primary: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      mono: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", monospace',
    },
  },
}