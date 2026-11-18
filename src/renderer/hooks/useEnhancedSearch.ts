import React, { useState, useCallback, useMemo } from 'react'
import { useToast } from './useToast'

export interface SearchResult {
  id: string
  title: string
  description?: string
  type: 'documentary' | 'movie' | 'show' | 'genre' | 'anime' | 'person' | 'music'
  relevance: number
  highlights: {
    start: number
    end: number
    field: string
  }[]
  metadata?: {
    year?: number
    rating?: number
    genre?: string[]
    poster?: string
    episodes?: number
    seasons?: number
    duration?: number
  }
}

export interface SearchFilters {
  type?: SearchResult['type']
  genre?: string
  year?: number
  minRating?: number
  maxRating?: number
  duration?: {
    min?: number
    max?: number
  }
}

export interface SearchSuggestion {
  text: string
  type: SearchResult['type']
  category?: string
  popularity?: number
}

export interface SearchHistoryItem {
  query: string
  timestamp: number
  resultsCount: number
  filters?: SearchFilters
}

export interface SearchAnalytics {
  totalSearches: number
  averageResults: number
  averageTime: number
  popularQueries: { query: string; count: number }[]
  searchByType: Record<SearchResult['type'], number>
}

export interface SearchOptions {
  limit?: number
  offset?: number
  includeSuggestions?: boolean
  includeHistory?: boolean
  useAnalytics?: boolean
}

export function useEnhancedSearch() {
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [filters, setFilters] = useState<SearchFilters>({})
  const [isSearching, setIsSearching] = useState(false)
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([])
  const [analytics, setAnalytics] = useState<SearchAnalytics>({
    totalSearches: 0,
    averageResults: 0,
    averageTime: 0,
    popularQueries: [],
    searchByType: {
      movie: 0,
      show: 0,
      documentary: 0,
      anime: 0,
      person: 0,
      genre: 0,
      music: 0
    }
  })
  const [options, setOptions] = useState<SearchOptions>({
    limit: 20,
    offset: 0,
    includeSuggestions: true,
    includeHistory: true,
    useAnalytics: true
  })
  
  const { addToast } = useToast()

  // Mock search data - in a real app this would come from an API
  const mockContent: SearchResult[] = [
    {
      id: '1',
      title: 'Inception',
      description: 'A thief who steals corporate secrets through dream-sharing technology',
      type: 'movie',
      relevance: 0.95,
      highlights: [
        { start: 0, end: 9, field: 'title' }
      ],
      metadata: {
        year: 2010,
        rating: 4.8,
        genre: ['sci-fi', 'action', 'thriller'],
        duration: 148
      }
    },
    {
      id: '2',
      title: 'The Matrix',
      description: 'A computer hacker learns from mysterious rebels about the true nature of his reality',
      type: 'movie',
      relevance: 0.92,
      highlights: [
        { start: 4, end: 9, field: 'title' }
      ],
      metadata: {
        year: 1999,
        rating: 4.7,
        genre: ['sci-fi', 'action'],
        duration: 136
      }
    },
    {
      id: '3',
      title: 'Incredibles',
      description: 'A family of undercover superheroes must save the world from a new villain',
      type: 'movie',
      relevance: 0.85,
      highlights: [
        { start: 0, end: 9, field: 'title' }
      ],
      metadata: {
        year: 2004,
        rating: 4.5,
        genre: ['animation', 'action', 'family'],
        duration: 115
      }
    },
    {
      id: '4',
      title: 'Breaking Bad',
      description: 'A high school chemistry teacher turns to manufacturing meth',
      type: 'show',
      relevance: 0.88,
      highlights: [
        { start: 0, end: 12, field: 'title' }
      ],
      metadata: {
        year: 2008,
        rating: 4.9,
        genre: ['drama', 'crime'],
        episodes: 62,
        seasons: 5
      }
    }
  ]

  const mockSuggestions: SearchSuggestion[] = [
    { text: 'inception movie', type: 'movie', category: 'popular', popularity: 95 },
    { text: 'inception series', type: 'show', category: 'trending', popularity: 78 },
    { text: 'inception soundtrack', type: 'music', category: 'audio', popularity: 65 },
    { text: 'inception explained', type: 'documentary', category: 'educational', popularity: 82 }
  ]

  const performSearch = useCallback(async (query: string, searchFilters?: SearchFilters) => {
    if (!query.trim()) {
      setResults([])
      setSuggestions([])
      return
    }

    setIsSearching(true)
    const startTime = Date.now()

    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 300))

      // Apply filters
      let filteredResults = [...mockContent]
      
      if (searchFilters?.type) {
        filteredResults = filteredResults.filter(item => item.type === searchFilters.type)
      }
      
      if (searchFilters?.genre) {
        filteredResults = filteredResults.filter(item => 
          item.metadata?.genre?.includes(searchFilters.genre!)
        )
      }
      
      if (searchFilters?.year) {
        filteredResults = filteredResults.filter(item => 
          item.metadata?.year === searchFilters.year
        )
      }
      
      if (searchFilters?.minRating) {
        filteredResults = filteredResults.filter(item => 
          item.metadata?.rating! >= searchFilters.minRating!
        )
      }

      // Search query matching
      const lowercaseQuery = query.toLowerCase()
      const matchedResults = filteredResults.filter(item =>
        item.title.toLowerCase().includes(lowercaseQuery) ||
        item.description?.toLowerCase().includes(lowercaseQuery)
      )

      // Sort by relevance
      const sortedResults = matchedResults
        .map(item => ({
          ...item,
          relevance: item.relevance * (item.title.toLowerCase().includes(lowercaseQuery) ? 1.1 : 1)
        }))
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, options.limit)

      // Generate suggestions
      const matchedSuggestions = mockSuggestions.filter(suggestion =>
        suggestion.text.toLowerCase().includes(lowercaseQuery)
      ).sort((a, b) => (b.popularity || 0) - (a.popularity || 0))

      setResults(sortedResults)
      setSuggestions(matchedSuggestions)

      // Update search history
      const newHistoryItem: SearchHistoryItem = {
        query,
        timestamp: Date.now(),
        resultsCount: sortedResults.length,
        filters: searchFilters
      }
      
      setSearchHistory(prev => [newHistoryItem, ...prev.slice(0, 9)]) // Keep last 10 searches

      // Update analytics
      if (options.useAnalytics) {
        setAnalytics(prev => {
          const newTotalSearches = prev.totalSearches + 1
          const newAverageResults = (prev.averageResults * prev.totalSearches + sortedResults.length) / newTotalSearches
          const searchTime = (Date.now() - startTime) / 1000
          const newAverageTime = (prev.averageTime * prev.totalSearches + searchTime) / newTotalSearches
          
          // Update popular queries
          const existingQuery = prev.popularQueries.find(q => q.query === query)
          const updatedPopularQueries = existingQuery 
            ? prev.popularQueries.map(q => q.query === query ? { ...q, count: q.count + 1 } : q)
            : [...prev.popularQueries, { query, count: 1 }]
              .sort((a, b) => b.count - a.count)
              .slice(0, 10)
          
          // Update search by type
          const searchByType = { ...prev.searchByType }
          sortedResults.forEach(result => {
            searchByType[result.type] = (searchByType[result.type] || 0) + 1
          })

          return {
            totalSearches: newTotalSearches,
            averageResults: newAverageResults,
            averageTime: newAverageTime,
            popularQueries: updatedPopularQueries,
            searchByType
          }
        })
      }

      addToast({ message: `Found ${sortedResults.length} results for "${query}"`, type: 'success' })
    } catch (error) {
      console.error('Search error:', error)
      addToast({ message: 'Search failed. Please try again.', type: 'error' })
    } finally {
      setIsSearching(false)
    }
  }, [options.limit, options.useAnalytics, addToast])

  const clearSearch = useCallback(() => {
    setSearchQuery('')
    setResults([])
    setSuggestions([])
    setFilters({})
  }, [])

  const updateFilters = useCallback((newFilters: Partial<SearchFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }))
  }, [])

  const updateOptions = useCallback((newOptions: Partial<SearchOptions>) => {
    setOptions(prev => ({ ...prev, ...newOptions }))
  }, [])

  const getSearchHistory = useCallback(() => {
    return searchHistory.slice(0, 10) // Return last 10 searches
  }, [searchHistory])

  const clearSearchHistory = useCallback(() => {
    setSearchHistory([])
    addToast({ message: 'Search history cleared', type: 'success' })
  }, [addToast])

  const getPopularQueries = useCallback((limit: number = 5) => {
    return analytics.popularQueries.slice(0, limit)
  }, [analytics.popularQueries])

  const highlightText = useCallback((text: string, highlights: { start: number; end: number }[]) => {
    if (!highlights.length) return text

    let result = ''
    let lastIndex = 0

    highlights.forEach(highlight => {
      result += text.slice(lastIndex, highlight.start)
      result += `<mark>${text.slice(highlight.start, highlight.end)}</mark>`
      lastIndex = highlight.end
    })

    result += text.slice(lastIndex)
    return result
  }, [])

  const debouncedSearch = useCallback(
    debounce((query: string) => {
      performSearch(query, filters)
    }, 300),
    [performSearch, filters]
  )

  // Auto-search when query changes
  React.useEffect(() => {
    if (searchQuery) {
      debouncedSearch(searchQuery)
    } else {
      clearSearch()
    }
  }, [searchQuery, debouncedSearch, clearSearch])

  return {
    searchQuery,
    setSearchQuery,
    results,
    suggestions,
    filters,
    isSearching,
    searchHistory,
    analytics,
    options,
    performSearch,
    clearSearch,
    updateFilters,
    updateOptions,
    getSearchHistory,
    clearSearchHistory,
    getPopularQueries,
    highlightText
  }
}

// Simple debounce utility
function debounce<T extends (...args: any[]) => void>(func: T, delay: number): T {
  let timeoutId: NodeJS.Timeout
  return ((...args: any[]) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func(...args), delay)
  }) as T
}