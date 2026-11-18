import React, { useState, useCallback, useEffect } from 'react'
import { useToast } from './useToast'

export interface WatchHistoryItem {
  id: string
  type: 'movie' | 'show' | 'documentary' | 'anime'
  title: string
  poster?: string
  watchedAt: number
  progress?: number
  duration?: number
  rating?: number
  review?: string
}

export interface ProfilePreferences {
  theme: 'dark' | 'light' | 'blue'
  language: string
  quality: 'low' | 'medium' | 'high' | 'ultra'
  autoplay: boolean
  subtitles: boolean
  audioLanguage: string
  fontSize: number
  playbackSpeed: number
}

export interface ParentalControl {
  enabled: boolean
  rating: string
  restrictedContent: string[]
  pin?: string
}

export interface ProfileCustomizations {
  layout: 'grid' | 'list' | 'detail'
  sortBy: 'date' | 'name' | 'rating' | 'popularity'
  filterBy: 'all' | 'movies' | 'shows' | 'favorites' | 'watched'
  showAdultContent: boolean
  showTrailers: boolean
  autoPlayNext: boolean
}

export interface Profile {
  id: string
  name: string
  avatar?: string
  preferences: ProfilePreferences
  watchHistory: WatchHistoryItem[]
  favoriteGenres: string[]
  parentalControl: ParentalControl
  customizations: ProfileCustomizations
  createdAt: number
  lastActive: number
}

export interface ProfileCreateData {
  name: string
  avatar?: string
  preferences?: Partial<ProfilePreferences>
  parentalControl?: Partial<ParentalControl>
  customizations?: Partial<ProfileCustomizations>
}

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null)
  const { addToast } = useToast()

  // Load profiles from localStorage on mount
  useEffect(() => {
    const savedProfiles = localStorage.getItem('fynix-profiles')
    const savedActiveProfile = localStorage.getItem('fynix-active-profile')
    
    if (savedProfiles) {
      try {
        const parsedProfiles = JSON.parse(savedProfiles)
        setProfiles(parsedProfiles)
        
        if (savedActiveProfile) {
          const profile = parsedProfiles.find((p: Profile) => p.id === savedActiveProfile)
          if (profile) {
            setActiveProfile(profile)
          }
        }
      } catch (error) {
        console.error('Failed to load profiles:', error)
      }
    }
  }, [])

  // Save profiles to localStorage whenever they change
  useEffect(() => {
    if (profiles.length > 0) {
      localStorage.setItem('fynix-profiles', JSON.stringify(profiles))
    }
  }, [profiles])

  // Save active profile to localStorage whenever it changes
  useEffect(() => {
    if (activeProfile) {
      localStorage.setItem('fynix-active-profile', activeProfile.id)
    }
  }, [activeProfile])

  const createProfile = useCallback((data: ProfileCreateData) => {
    const newProfile: Profile = {
      id: `profile_${Date.now()}`,
      name: data.name,
      avatar: data.avatar,
      preferences: {
        theme: 'dark',
        language: 'en',
        quality: 'high',
        autoplay: true,
        subtitles: true,
        audioLanguage: 'en',
        fontSize: 16,
        playbackSpeed: 1.0,
        ...data.preferences
      },
      watchHistory: [],
      favoriteGenres: [],
      parentalControl: {
        enabled: false,
        rating: 'PG-13',
        restrictedContent: [],
        ...data.parentalControl
      },
      customizations: {
        layout: 'grid',
        sortBy: 'date',
        filterBy: 'all',
        showAdultContent: true,
        showTrailers: true,
        autoPlayNext: true,
        ...data.customizations
      },
      createdAt: Date.now(),
      lastActive: Date.now()
    }
    
    setProfiles(prev => [...prev, newProfile])
    setActiveProfile(newProfile)
    addToast({ message: `Profile "${data.name}" created successfully`, type: 'success' })
    return newProfile
  }, [addToast])

  const updateProfile = useCallback((profileId: string, updates: Partial<Profile>) => {
    setProfiles(prev => prev.map(profile => {
      if (profile.id === profileId) {
        const updatedProfile = {
          ...profile,
          ...updates,
          lastActive: Date.now()
        }
        
        if (activeProfile?.id === profileId) {
          setActiveProfile(updatedProfile)
        }
        
        return updatedProfile
      }
      return profile
    }))
    
    addToast({ message: 'Profile updated successfully', type: 'success' })
  }, [activeProfile, addToast])

  const deleteProfile = useCallback((profileId: string) => {
    if (profiles.length <= 1) {
      addToast({ message: 'Cannot delete the last profile', type: 'error' })
      return
    }
    
    setProfiles(prev => prev.filter(profile => profile.id !== profileId))
    
    if (activeProfile?.id === profileId) {
      const newActiveProfile = profiles.find(p => p.id !== profileId)
      setActiveProfile(newActiveProfile || null)
    }
    
    addToast({ message: 'Profile deleted successfully', type: 'success' })
  }, [profiles, activeProfile, addToast])

  const switchProfile = useCallback((profileId: string) => {
    const profile = profiles.find(p => p.id === profileId)
    if (profile) {
      setActiveProfile(profile)
      updateProfile(profileId, { lastActive: Date.now() })
      addToast({ message: `Switched to ${profile.name}`, type: 'success' })
    }
  }, [profiles, updateProfile, addToast])

  const addToWatchHistory = useCallback((item: WatchHistoryItem) => {
    if (!activeProfile) return
    
    setProfiles(prev => prev.map(profile => {
      if (profile.id === activeProfile.id) {
        const updatedProfile = {
          ...profile,
          watchHistory: [...profile.watchHistory, item],
          lastActive: Date.now()
        }
        
        if (activeProfile.id === profile.id) {
          setActiveProfile(updatedProfile)
        }
        
        return updatedProfile
      }
      return profile
    }))
  }, [activeProfile])

  const removeFromWatchHistory = useCallback((itemId: string) => {
    if (!activeProfile) return
    
    setProfiles(prev => prev.map(profile => {
      if (profile.id === activeProfile.id) {
        const updatedProfile = {
          ...profile,
          watchHistory: profile.watchHistory.filter(item => item.id !== itemId),
          lastActive: Date.now()
        }
        
        if (activeProfile.id === profile.id) {
          setActiveProfile(updatedProfile)
        }
        
        return updatedProfile
      }
      return profile
    }))
  }, [activeProfile])

  const updateWatchProgress = useCallback((itemId: string, progress: number) => {
    if (!activeProfile) return
    
    setProfiles(prev => prev.map(profile => {
      if (profile.id === activeProfile.id) {
        const updatedProfile = {
          ...profile,
          watchHistory: profile.watchHistory.map(item => 
            item.id === itemId ? { ...item, progress } : item
          ),
          lastActive: Date.now()
        }
        
        if (activeProfile.id === profile.id) {
          setActiveProfile(updatedProfile)
        }
        
        return updatedProfile
      }
      return profile
    }))
  }, [activeProfile])

  const addFavoriteGenre = useCallback((genre: string) => {
    if (!activeProfile) return
    
    setProfiles(prev => prev.map(profile => {
      if (profile.id === activeProfile.id) {
        const updatedProfile = {
          ...profile,
          favoriteGenres: [...profile.favoriteGenres, genre],
          lastActive: Date.now()
        }
        
        if (activeProfile.id === profile.id) {
          setActiveProfile(updatedProfile)
        }
        
        return updatedProfile
      }
      return profile
    }))
  }, [activeProfile])

  const removeFavoriteGenre = useCallback((genre: string) => {
    if (!activeProfile) return
    
    setProfiles(prev => prev.map(profile => {
      if (profile.id === activeProfile.id) {
        const updatedProfile = {
          ...profile,
          favoriteGenres: profile.favoriteGenres.filter(g => g !== genre),
          lastActive: Date.now()
        }
        
        if (activeProfile.id === profile.id) {
          setActiveProfile(updatedProfile)
        }
        
        return updatedProfile
      }
      return profile
    }))
  }, [activeProfile])

  const getWatchStats = useCallback(() => {
    if (!activeProfile) return null
    
    const totalWatched = activeProfile.watchHistory.length
    const totalTimeSpent = activeProfile.watchHistory.reduce((total, item) => {
      return total + (item.duration || 0)
    }, 0)
    
    const favoriteGenres = activeProfile.favoriteGenres.reduce((acc, genre) => {
      acc[genre] = (acc[genre] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    return {
      totalWatched,
      totalTimeSpent,
      favoriteGenres,
      averageRating: activeProfile.watchHistory
        .filter(item => item.rating)
        .reduce((sum, item) => sum + (item.rating || 0), 0) / 
        activeProfile.watchHistory.filter(item => item.rating).length || 0
    }
  }, [activeProfile])

  return {
    profiles,
    activeProfile,
    createProfile,
    updateProfile,
    deleteProfile,
    switchProfile,
    addToWatchHistory,
    removeFromWatchHistory,
    updateWatchProgress,
    addFavoriteGenre,
    removeFavoriteGenre,
    getWatchStats
  }
}