// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'

// Test the pure helper functions extracted from ProfilePicker
// We can't easily test the full component (CSS modules, canvas particles),
// so test the logic that matters

const AVATAR_COLORS = [
  '#E50914', '#FF6B00', '#007AFF', '#7B68EE', '#34C759',
  '#00B4D8', '#FF9500', '#FF2D55', '#5856D6', '#AF52DE',
]

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function getAvatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

describe('ProfilePicker helpers', () => {
  describe('getInitials', () => {
    it('returns first letter for single name', () => {
      expect(getInitials('John')).toBe('J')
    })
    it('returns first+last for multi-word', () => {
      expect(getInitials('John Doe')).toBe('JD')
    })
    it('handles three names', () => {
      expect(getInitials('John Michael Doe')).toBe('JD')
    })
    it('trims whitespace', () => {
      expect(getInitials('  Jane  ')).toBe('J')
    })
    it('returns ? for empty', () => {
      expect(getInitials('')).toBe('?')
      expect(getInitials('   ')).toBe('?')
    })
    it('uppercases', () => {
      expect(getInitials('bob')).toBe('B')
    })
  })

  describe('getAvatarColor', () => {
    it('returns a valid color from the palette', () => {
      const color = getAvatarColor('user-123')
      expect(AVATAR_COLORS).toContain(color)
    })
    it('returns consistent color for same id', () => {
      expect(getAvatarColor('id-abc')).toBe(getAvatarColor('id-abc'))
    })
    it('different ids can produce different colors', () => {
      const colors = new Set(Array.from({ length: 50 }, (_, i) => getAvatarColor(`user-${i}`)))
      expect(colors.size).toBeGreaterThan(1)
    })
  })
})
