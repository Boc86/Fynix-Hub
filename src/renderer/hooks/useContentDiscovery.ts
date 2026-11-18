import React, { useState, useCallback, useMemo } from 'react'
import { useToast } from './useToast'

export interface ContentItem {
  id: string
  title: string
  description?: string
  poster?: string
  backdrop?: string
  type: 'movie' | 'show' | 'documentary' | 'anime'
  genre: string[]
  year: number
  rating: number
  duration?: number
  episodes?: number
  seasons?: number
  popularity: number
  trending: boolean
  recommendations: string[]
  tags: string[]
  releaseDate: number
  addedDate: number
}

export interface DiscoveryFilters {
  genre?: string
  type?: ContentItem['type']
  rating?: number
  year?: number
  decade?: number
  minRating?: number
  maxRating?: number
  sortBy?: 'relevance' | 'rating' | 'popularity' | 'date' | 'title'
  sortOrder?: 'asc' | 'desc'
}

export interface DiscoveryOptions {
  limit?: number
  offset?: number
  includeTrending?: boolean
  includeRecommendations?: boolean
  excludeWatched?: boolean
}

export function useContentDiscovery() {
  const [content, setContent] = useState<ContentItem[]>([])
  const [filters, setFilters] = useState<DiscoveryFilters>({})
  const [options, setOptions] = useState<DiscoveryOptions>({
    limit: 20,
    offset: 0,
    includeTrending: true,
    includeRecommendations: true,
    excludeWatched: false
  })
  const [searchQuery, setSearchQuery] = useState('')
  const { addToast } = useToast()

  // Mock content data - in a real app this would come from an API
  const mockContent: ContentItem[] = [
    {
      id: '1',
      title: 'Inception',
      description: 'A thief who steals corporate secrets through dream-sharing technology',
      poster: '/posters/inception.jpg',
      type: 'movie',
      genre: ['sci-fi', 'action', 'thriller'],
      year: 2010,
      rating: 4.8,
      duration: 148,
      popularity: 950,
      trending: true,
      recommendations: ['interstellar', 'the-matrix'],
      tags: ['mind-bending', 'complex', 'award-winning'],
      releaseDate: Date.now() - 14 * 365 * 24 * 60 * 60 * 1000, // 14 years ago
      addedDate: Date.now() - 30 * 24 * 60 * 60 * 1000 // 30 days ago
    },
    {
      id: '2',
      title: 'Breaking Bad',
      description: 'A high school chemistry teacher turns to manufacturing meth',
      poster: '/posters/breaking-bad.jpg',
      type: 'show',
      genre: ['drama', 'crime', 'thriller'],
      year: 2008,
      rating: 4.9,
      episodes: 62,
      seasons: 5,
      popularity: 980,
      trending: true,
      recommendations: ['better-call-saul', 'ozark'],
      tags: ['character-driven', 'intense', 'critically-acclaimed'],
      releaseDate: Date.now() - 16 * 365 * 24 * 60 * 60 * 1000,
      addedDate: Date.now() - 45 * 24 * 60 * 60 * 1000
    },
    {
      id: '3',
      title: 'Interstellar',
      description: 'A team of explorers travel through a wormhole in space',
      poster: '/posters/interstellar.jpg',
      type: 'movie',
      genre: ['sci-fi', 'drama', 'adventure'],
      year: 2014,
      rating: 4.6,
      duration: 169,
      popularity: 920,
      trending: false,
      recommendations: ['inception', 'the-matrix'],
      tags: ['space', 'emotional', 'visually-stunning'],
      releaseDate: Date.now() - 10 * 365 * 24 * 60 * 60 * 1000,
      addedDate: Date.now() - 60 * 24 * 60 * 60 * 1000
    }
  ]

  // Initialize with mock content
  React.useEffect(() => {
    setContent(mockContent)
  }, [])

  const filterContent = useCallback((content: ContentItem[], filters: DiscoveryFilters) => {
    return content.filter(item => {
      // Genre filter
      if (filters.genre && !item.genre.includes(filters.genre)) {
        return false
      }
      
      // Type filter
      if (filters.type && item.type !== filters.type) {
        return false
      }
      
      // Rating filter
      if (filters.minRating && item.rating < filters.minRating) {
        return false
      }
      
      if (filters.maxRating && item.rating > filters.maxRating) {
        return false
      }
      
      // Year filter
      if (filters.year && item.year !== filters.year) {
        return false
      }
      
      // Decade filter
      if (filters.decade && Math.floor(item.year / 10) * 10 !== filters.decade) {
        return false
      }
      
      return true
    })
  }, [])

  const sortContent = useCallback((content: ContentItem[], sortBy: 'title' | 'date' | 'rating' | 'relevance' | 'popularity', sortOrder: 'asc' | 'desc') => {
    return [...content].sort((a, b) => {
      let valueA: any = a[sortBy as keyof ContentItem]
      let valueB: any = b[sortBy as keyof ContentItem]
      
      if (sortBy === 'title') {
        valueA = a.title.toLowerCase()
        valueB = b.title.toLowerCase()
      }
      
      if (sortBy === 'relevance') {
        // Simple relevance calculation based on rating and popularity
        valueA = a.rating * a.popularity
        valueB = b.rating * b.popularity
      }
      
      if (valueA < valueB) return sortOrder === 'asc' ? -1 : 1
      if (valueA > valueB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
  }, [])

  const searchContent = useCallback((content: ContentItem[], query: string) => {
    if (!query.trim()) return content
    
    const lowercaseQuery = query.toLowerCase()
    return content.filter(item =>
      item.title.toLowerCase().includes(lowercaseQuery) ||
      item.description?.toLowerCase().includes(lowercaseQuery) ||
      item.genre.some(g => g.toLowerCase().includes(lowercaseQuery)) ||
      item.tags.some(t => t.toLowerCase().includes(lowercaseQuery))
    )
  }, [])

  const getTrendingContent = useCallback((content: ContentItem[]) => {
    return content.filter(item => item.trending)
      .sort((a, b) => b.popularity - a.popularity)
  }, [])

  const getRecommendations = useCallback((content: ContentItem[], userPreferences?: any) => {
    // Simple recommendation algorithm based on popularity and rating
    return content
      .filter(item => item.rating >= 4.0 && item.popularity >= 500)
      .sort((a, b) => {
        const scoreA = a.rating * a.popularity
        const scoreB = b.rating * b.popularity
        return scoreB - scoreA
      })
      .slice(0, 10)
  }, [])

  const getDecades = useCallback((content: ContentItem[]) => {
    const decades = new Set<number>()
    content.forEach(item => {
      decades.add(Math.floor(item.year / 10) * 10)
    })
    return Array.from(decades).sort((a, b) => a - b)
  }, [])

  const getGenres = useCallback((content: ContentItem[]) => {
    const genres = new Set<string>()
    content.forEach(item => {
      item.genre.forEach(genre => genres.add(genre))
    })
    return Array.from(genres).sort()
  }, [])

  const filteredContent = useMemo(() => {
    let result = [...content]
    
    // Apply search
    if (searchQuery) {
      result = searchContent(result, searchQuery)
    }
    
    // Apply filters
    result = filterContent(result, filters)
    
    // Apply sorting
    if (filters.sortBy) {
      result = sortContent(result, filters.sortBy, filters.sortOrder || 'desc')
    }
    
    // Apply pagination
    if (options.limit) {
      result = result.slice(options.offset ?? 0, (options.offset ?? 0) + options.limit)
    }
    
    return result
  }, [content, filters, options, searchQuery, filterContent, sortContent, searchContent])

  const trendingContent = useMemo(() => {
    return getTrendingContent(content)
  }, [content, getTrendingContent])

  const recommendations = useMemo(() => {
    return getRecommendations(content)
  }, [content, getRecommendations])

  const availableGenres = useMemo(() => {
    return getGenres(content)
  }, [content, getGenres])

  const availableDecades = useMemo(() => {
    return getDecades(content)
  }, [content, getDecades])

  const updateFilters = useCallback((newFilters: Partial<DiscoveryFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }))
  }, [])

  const updateOptions = useCallback((newOptions: Partial<DiscoveryOptions>) => {
    setOptions(prev => ({ ...prev, ...newOptions }))
  }, [])

  const setSearch = useCallback((query: string) => {
    setSearchQuery(query)
  }, [])

  const resetFilters = useCallback(() => {
    setFilters({})
    setOptions({
      limit: 20,
      offset: 0,
      includeTrending: true,
      includeRecommendations: true,
      excludeWatched: false
    })
    setSearchQuery('')
    addToast({ message: 'Filters reset', type: 'success' })
  }, [addToast])

  const loadMore = useCallback(() => {
    setOptions(prev => ({
      ...prev,
      offset: prev.offset! + prev.limit!
    }))
  }, [])

  return {
    content,
    filteredContent,
    trendingContent,
    recommendations,
    availableGenres,
    availableDecades,
    filters,
    options,
    searchQuery,
    updateFilters,
    updateOptions,
    setSearch,
    resetFilters,
    loadMore,
    filterContent,
    sortContent,
    searchContent,
    getTrendingContent,
    getRecommendations,
    getGenres,
    getDecades
  }
}