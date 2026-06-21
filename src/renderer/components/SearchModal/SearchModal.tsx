import React, { useState, useCallback, useRef, useEffect } from 'react'
import type { MediaItem } from '../../types'
import MediaCard from '../MediaCard/MediaCard'
import styles from './SearchModal.module.css'

interface SearchModalProps {
  onClose: () => void
  onSelect: (item: MediaItem) => void
}

export default function SearchModal({ onClose, onSelect }: SearchModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MediaItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      return
    }
    setIsSearching(true)
    try {
      const movieResults = await window.api.tmdb.search(q, 'movie')
      const tvResults = await window.api.tmdb.search(q, 'tv')
      const combined = [
        ...(movieResults?.results || []),
        ...(tvResults?.results || []),
      ].slice(0, 20)
      setResults(combined)
    } catch {
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => doSearch(val), 400)
  }, [doSearch])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.searchBar}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search movies and TV shows..."
            value={query}
            onChange={handleChange}
            className={styles.input}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
            }}
          />
        </div>
        <div className={styles.results}>
          {isSearching && <p className={styles.status}>Searching...</p>}
          {!isSearching && results.length === 0 && query && (
            <p className={styles.status}>No results found</p>
          )}
          <div className={styles.grid}>
            {results.map((item) => (
              <MediaCard key={`${item.mediaType}-${item.id}`} item={item} onSelect={onSelect} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
