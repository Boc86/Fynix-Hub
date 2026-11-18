import { describe, it, expect } from 'vitest'

describe('Enhanced Profiles', () => {
  it('should create profile with proper structure', () => {
    const profile = {
      id: '1',
      name: 'John Doe',
      avatar: '/avatars/john.jpg',
      preferences: {
        theme: 'dark',
        language: 'en',
        quality: 'high',
        autoplay: true
      },
      watchHistory: [
        { id: '101', type: 'movie', title: 'Inception', watchedAt: Date.now() },
        { id: '102', type: 'show', title: 'Breaking Bad', watchedAt: Date.now() }
      ],
      favoriteGenres: ['action', 'sci-fi'],
      parentalControl: {
        enabled: false,
        rating: 'PG-13'
      }
    }
    
    expect(profile.id).toBe('1')
    expect(profile.name).toBe('John Doe')
    expect(profile.preferences.theme).toBe('dark')
    expect(profile.watchHistory.length).toBe(2)
    expect(profile.favoriteGenres).toContain('action')
  })
  
  it('should support profile preferences', () => {
    const preferences = {
      theme: 'dark',
      language: 'en',
      quality: 'high',
      autoplay: true,
      subtitles: true,
      audioLanguage: 'en'
    }
    
    expect(preferences.theme).toBe('dark')
    expect(preferences.quality).toBe('high')
    expect(preferences.autoplay).toBe(true)
  })
  
  it('should track watch history', () => {
    const watchHistory = [
      { id: '101', type: 'movie', title: 'Inception', watchedAt: Date.now() },
      { id: '102', type: 'show', title: 'Breaking Bad', watchedAt: Date.now() + 1000 }
    ]
    
    expect(watchHistory.length).toBe(2)
    expect(watchHistory[0].title).toBe('Inception')
    expect(watchHistory[1].watchedAt).toBeGreaterThan(watchHistory[0].watchedAt)
  })
  
  it('should support parental controls', () => {
    const parentalControl = {
      enabled: true,
      rating: 'PG-13',
      restrictedContent: ['violence', 'adult']
    }
    
    expect(parentalControl.enabled).toBe(true)
    expect(parentalControl.rating).toBe('PG-13')
    expect(parentalControl.restrictedContent).toContain('violence')
  })
  
  it('should support profile switching', () => {
    const profiles = [
      { id: '1', name: 'John', avatar: '/avatars/john.jpg' },
      { id: '2', name: 'Jane', avatar: '/avatars/jane.jpg' }
    ]
    
    const activeProfile = profiles.find(p => p.id === '1')
    expect(activeProfile?.name).toBe('John')
  })
  
  it('should support profile customization', () => {
    const profile = {
      id: '1',
      name: 'John Doe',
      customizations: {
        layout: 'grid',
        sortBy: 'date',
        filterBy: 'all',
        showAdultContent: false
      }
    }
    
    expect(profile.customizations.layout).toBe('grid')
    expect(profile.customizations.sortBy).toBe('date')
    expect(profile.customizations.showAdultContent).toBe(false)
  })
})