import React, { useState, useEffect, useRef } from 'react'
import { useEnhancedSearch, SearchResult, SearchSuggestion } from '../../hooks/useEnhancedSearch'
import { useToast } from '../../hooks/useToast'
import Skeleton from '../Skeleton/Skeleton'
import styles from './EnhancedSearch.module.css'

interface EnhancedSearchProps {
  onResultSelect?: (result: SearchResult) => void
  showSuggestions?: boolean
  showHistory?: boolean
  showAnalytics?: boolean
}

export function EnhancedSearch({ 
  onResultSelect, 
  showSuggestions = true, 
  showHistory = true, 
  showAnalytics = false 
}: EnhancedSearchProps) {
  const {
    searchQuery,
    setSearchQuery,
    results,
    suggestions,
    filters,
    isSearching,
    searchHistory,
    analytics,
    performSearch,
    clearSearch,
    updateFilters,
    getSearchHistory,
    clearSearchHistory,
    getPopularQueries,
    highlightText
  } = useEnhancedSearch()
  
  const { addToast } = useToast()
  const [isFocused, setIsFocused] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  // Handle clicks outside the search dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (resultsRef.current && !resultsRef.current.contains(event.target as Node)) {
        setIsFocused(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (query.trim()) {
      setIsFocused(true)
    }
  }

  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    setSearchQuery(suggestion.text)
    performSearch(suggestion.text)
    setIsFocused(true)
  }

  const handleResultClick = (result: SearchResult) => {
    onResultSelect?.(result)
    setIsFocused(false)
    setSearchQuery('')
    addToast({ message: `Selected: ${result.title}`, type: 'info' })
  }

  const handleHistoryClick = (query: string) => {
    setSearchQuery(query)
    performSearch(query)
    setIsFocused(true)
  }

  const handleFilterChange = (key: keyof typeof filters, value: any) => {
    updateFilters({ [key]: value })
  }

  return (
    <div className={styles.searchContainer} ref={resultsRef}>
      <div className={styles.searchWrapper}>
        <div className={styles.searchInputWrapper}>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search movies, shows, genres, people..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => setIsFocused(true)}
            className={styles.searchInput}
          />
          
          {searchQuery && (
            <button 
              onClick={clearSearch}
              className={styles.clearButton}
            >
              ✕
            </button>
          )}
          
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={styles.filtersButton}
          >
            🎛️
          </button>
        </div>

        {showFilters && (
          <div className={styles.filtersPanel}>
            <div className={styles.filtersSection}>
              <h3>Type</h3>
              <div className={styles.filterOptions}>
                {['movie', 'show', 'documentary', 'anime', 'person', 'genre'].map(type => (
                  <label key={type} className={styles.filterOption}>
                    <input
                      type="checkbox"
                      checked={filters.type === type}
                      onChange={(e) => handleFilterChange('type', e.target.checked ? type : undefined)}
                    />
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.filtersSection}>
              <h3>Rating</h3>
              <div className={styles.filterOptions}>
                <label className={styles.filterOption}>
                  <input
                    type="radio"
                    name="rating"
                    checked={!filters.minRating}
                    onChange={() => handleFilterChange('minRating', undefined)}
                  />
                  Any Rating
                </label>
                <label className={styles.filterOption}>
                  <input
                    type="radio"
                    name="rating"
                    checked={filters.minRating === 4.0}
                    onChange={() => handleFilterChange('minRating', 4.0)}
                  />
                  4.0+ Stars
                </label>
                <label className={styles.filterOption}>
                  <input
                    type="radio"
                    name="rating"
                    checked={filters.minRating === 4.5}
                    onChange={() => handleFilterChange('minRating', 4.5)}
                  />
                  4.5+ Stars
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {isFocused && (searchQuery || suggestions.length > 0) && (
        <div className={styles.resultsDropdown}>
          {showSuggestions && suggestions.length > 0 && (
            <div className={styles.suggestionsSection}>
              <h4>Suggestions</h4>
              <div className={styles.suggestionsList}>
                {suggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    className={styles.suggestionItem}
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    <div className={styles.suggestionType}>
                      {suggestion.type}
                    </div>
                    <div className={styles.suggestionText}>
                      {suggestion.text}
                    </div>
                    {suggestion.category && (
                      <div className={styles.suggestionCategory}>
                        {suggestion.category}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {showHistory && searchHistory.length > 0 && (
            <div className={styles.historySection}>
              <div className={styles.historyHeader}>
                <h4>Recent Searches</h4>
                <button onClick={clearSearchHistory} className={styles.clearHistoryButton}>
                  Clear
                </button>
              </div>
              <div className={styles.historyList}>
                {searchHistory.slice(0, 5).map((item, index) => (
                  <div
                    key={index}
                    className={styles.historyItem}
                    onClick={() => handleHistoryClick(item.query)}
                  >
                    <div className={styles.historyQuery}>
                      {item.query}
                    </div>
                    <div className={styles.historyMeta}>
                      {item.resultsCount} results • {new Date(item.timestamp).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.length > 0 && (
            <div className={styles.resultsSection}>
              <h4>Search Results</h4>
              <div className={styles.resultsList}>
                {results.map((result) => (
                  <div
                    key={result.id}
                    className={styles.resultItem}
                    onClick={() => handleResultClick(result)}
                  >
                    <div className={styles.resultType}>
                      {result.type}
                    </div>
                    <div className={styles.resultContent}>
                      <div 
                        className={styles.resultTitle}
                        dangerouslySetInnerHTML={{
                          __html: highlightText(result.title, result.highlights)
                        }}
                      />
                      {result.description && (
                        <div className={styles.resultDescription}>
                          {result.description}
                        </div>
                      )}
                      {result.metadata && (
                        <div className={styles.resultMetadata}>
                          {result.metadata.year && (
                            <span className={styles.metadataItem}>📅 {result.metadata.year}</span>
                          )}
                          {result.metadata.rating && (
                            <span className={styles.metadataItem}>⭐ {result.metadata.rating}</span>
                          )}
                          {result.metadata.genre && (
                            <span className={styles.metadataItem}>🏷️ {result.metadata.genre.join(', ')}</span>
                          )}
                          {result.metadata.duration && (
                            <span className={styles.metadataItem}>⏱️ {result.metadata.duration}min</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className={styles.relevanceScore}>
                      {Math.round(result.relevance * 100)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isSearching && (
            <div className={styles.searching}>
              <div className={styles.searchingSpinner}></div>
              <span>Searching...</span>
            </div>
          )}

          {results.length === 0 && searchQuery && !isSearching && (
            <div className={styles.noResults}>
              <p>No results found for "{searchQuery}"</p>
              <p>Try different keywords or adjust your filters</p>
            </div>
          )}
        </div>
      )}

      {showAnalytics && analytics.totalSearches > 0 && (
        <div className={styles.analyticsPanel}>
          <h4>Search Analytics</h4>
          <div className={styles.analyticsStats}>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{analytics.totalSearches}</span>
              <span className={styles.statLabel}>Total Searches</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{analytics.averageResults.toFixed(1)}</span>
              <span className={styles.statLabel}>Avg Results</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{(analytics.averageTime * 1000).toFixed(0)}ms</span>
              <span className={styles.statLabel}>Avg Time</span>
            </div>
          </div>
          
          {getPopularQueries().length > 0 && (
            <div className={styles.popularQueries}>
              <h5>Popular Searches</h5>
              <div className={styles.popularQueriesList}>
                {getPopularQueries().map((query, index) => (
                  <div key={index} className={styles.popularQuery}>
                    <span className={styles.queryRank}>#{index + 1}</span>
                    <span className={styles.queryText}>{query.query}</span>
                    <span className={styles.queryCount}>{query.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}