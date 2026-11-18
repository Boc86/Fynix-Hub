import React, { useState, useMemo } from 'react'
import { useContentDiscovery, ContentItem, DiscoveryFilters } from '../../hooks/useContentDiscovery'
import { useToast } from '../../hooks/useToast'
import Skeleton from '../Skeleton/Skeleton'
import styles from './ContentDiscovery.module.css'

interface ContentDiscoveryProps {
  onContentSelect?: (content: ContentItem) => void
  showFilters?: boolean
  showTrending?: boolean
  showRecommendations?: boolean
}

export function ContentDiscovery({ 
  onContentSelect, 
  showFilters = true, 
  showTrending = true, 
  showRecommendations = true 
}: ContentDiscoveryProps) {
  const {
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
    loadMore
  } = useContentDiscovery()
  
  const { addToast } = useToast()
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  const handleContentClick = (content: ContentItem) => {
    onContentSelect?.(content)
    addToast({ message: `Selected: ${content.title}`, type: 'info' })
  }

  const handleFilterChange = (key: keyof DiscoveryFilters, value: any) => {
    updateFilters({ [key]: value })
  }

  const handleSortChange = (sortBy: 'title' | 'date' | 'rating' | 'relevance' | 'popularity', sortOrder: 'asc' | 'desc') => {
    updateFilters({ sortBy, sortOrder })
  }

  const clearFilters = () => {
    resetFilters()
  }

  const activeFiltersCount = Object.values(filters).filter(value => 
    value !== undefined && value !== null && value !== ''
  ).length

  return (
    <div className={styles.discovery}>
      <div className={styles.header}>
        <h2>Discover Content</h2>
        
        <div className={styles.searchBar}>
          <input
            type="text"
            placeholder="Search movies, shows, genres..."
            value={searchQuery}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
          />
          {searchQuery && (
            <button onClick={() => setSearch('')} className={styles.clearButton}>
              ✕
            </button>
          )}
        </div>
        
        <div className={styles.actions}>
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`${styles.filterButton} ${isFilterOpen ? styles.active : ''}`}
          >
            Filters {activeFiltersCount > 0 && <span className={styles.filterCount}>{activeFiltersCount}</span>}
          </button>
          
          {activeFiltersCount > 0 && (
            <button onClick={clearFilters} className={styles.clearFiltersButton}>
              Clear All
            </button>
          )}
        </div>
      </div>

      {isFilterOpen && (
        <div className={styles.filtersPanel}>
          <div className={styles.filtersSection}>
            <h3>Genre</h3>
            <div className={styles.filterOptions}>
              {availableGenres.map(genre => (
                <label key={genre} className={styles.filterOption}>
                  <input
                    type="checkbox"
                    checked={filters.genre === genre}
                    onChange={(e) => handleFilterChange('genre', e.target.checked ? genre : undefined)}
                  />
                  {genre}
                </label>
              ))}
            </div>
          </div>

          <div className={styles.filtersSection}>
            <h3>Type</h3>
            <div className={styles.filterOptions}>
              {['movie', 'show', 'documentary', 'anime'].map(type => (
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

          <div className={styles.filtersSection}>
            <h3>Sort By</h3>
            <div className={styles.filterOptions}>
              <label className={styles.filterOption}>
                <input
                  type="radio"
                  name="sort"
                  checked={filters.sortBy === 'relevance'}
                  onChange={() => handleSortChange('relevance', 'desc')}
                />
                Relevance
              </label>
              <label className={styles.filterOption}>
                <input
                  type="radio"
                  name="sort"
                  checked={filters.sortBy === 'rating'}
                  onChange={() => handleSortChange('rating', 'desc')}
                />
                Rating
              </label>
              <label className={styles.filterOption}>
                <input
                  type="radio"
                  name="sort"
                  checked={filters.sortBy === 'popularity'}
                  onChange={() => handleSortChange('popularity', 'desc')}
                />
                Popularity
              </label>
              <label className={styles.filterOption}>
                <input
                  type="radio"
                  name="sort"
                  checked={filters.sortBy === 'date'}
                  onChange={() => handleSortChange('date', 'desc')}
                />
                Release Date
              </label>
            </div>
          </div>
        </div>
      )}

      {showTrending && trendingContent.length > 0 && (
        <div className={styles.section}>
          <h3>Trending Now</h3>
          <div className={styles.contentGrid}>
            {trendingContent.slice(0, 6).map(item => (
              <div key={item.id} className={styles.contentCard} onClick={() => handleContentClick(item)}>
                <div className={styles.contentPoster}>
                  {item.poster ? (
                    <img src={item.poster} alt={item.title} />
                  ) : (
                    <div className={styles.placeholder}>
                      <Skeleton variant="rectangular" width="100%" height={200} />
                    </div>
                  )}
                  <div className={`${styles.contentBadge} ${styles.trending}`}>🔥 Trending</div>
                </div>
                <div className={styles.contentInfo}>
                  <h4>{item.title}</h4>
                  <div className={styles.contentMeta}>
                    <span className={styles.rating}>⭐ {item.rating}</span>
                    <span className={styles.year}>{item.year}</span>
                  </div>
                  <p className={styles.contentDescription}>{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showRecommendations && recommendations.length > 0 && (
        <div className={styles.section}>
          <h3>Recommended For You</h3>
          <div className={styles.contentGrid}>
            {recommendations.slice(0, 6).map(item => (
              <div key={item.id} className={styles.contentCard} onClick={() => handleContentClick(item)}>
                <div className={styles.contentPoster}>
                  {item.poster ? (
                    <img src={item.poster} alt={item.title} />
                  ) : (
                    <div className={styles.placeholder}>
                      <Skeleton variant="rectangular" width="100%" height={200} />
                    </div>
                  )}
                  <div className={`${styles.contentBadge} ${styles.recommended}`}>🎯 Recommended</div>
                </div>
                <div className={styles.contentInfo}>
                  <h4>{item.title}</h4>
                  <div className={styles.contentMeta}>
                    <span className={styles.rating}>⭐ {item.rating}</span>
                    <span className={styles.year}>{item.year}</span>
                  </div>
                  <p className={styles.contentDescription}>{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.section}>
        <h3>All Content</h3>
        <div className={styles.contentGrid}>
          {filteredContent.map(item => (
            <div key={item.id} className={styles.contentCard} onClick={() => handleContentClick(item)}>
              <div className={styles.contentPoster}>
                {item.poster ? (
                  <img src={item.poster} alt={item.title} />
                ) : (
                  <div className={styles.placeholder}>
                    <Skeleton variant="rectangular" width="100%" height={200} />
                  </div>
                )}
                <div className={styles.contentMeta}>
                  <span className={styles.rating}>⭐ {item.rating}</span>
                  <span className={styles.year}>{item.year}</span>
                </div>
              </div>
              <div className={styles.contentInfo}>
                <h4>{item.title}</h4>
                <p className={styles.contentDescription}>{item.description}</p>
                <div className={styles.contentTags}>
                  {item.genre.slice(0, 3).map(genre => (
                    <span key={genre} className={styles.tag}>{genre}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {filteredContent.length === 0 && (
          <div className={styles.emptyState}>
            <p>No content found</p>
            <p>Try adjusting your filters or search query</p>
          </div>
        )}
        
        {filteredContent.length >= options.limit! && (
          <div className={styles.loadMore}>
            <button onClick={loadMore} className={styles.loadMoreButton}>
              Load More
            </button>
          </div>
        )}
      </div>
    </div>
  )
}