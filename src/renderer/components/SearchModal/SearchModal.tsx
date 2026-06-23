import React, { useState, useCallback, useRef, useEffect } from 'react'
import type { MediaItem } from '../../types'
import MediaCard from '../MediaCard/MediaCard'
import styles from './SearchModal.module.css'

interface SearchModalProps {
  onClose: () => void
  onSelect: (item: MediaItem) => void
  keyboardOpen?: boolean
  onFreeSearch?: (query: string) => void
}

type SearchFilter = 'all' | 'movie' | 'tv'

const FILTERS: Array<{ id: SearchFilter | 'free'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'movie', label: 'Movies' },
  { id: 'tv', label: 'TV Shows' },
  { id: 'free', label: 'Free' },
]

export default function SearchModal({ onClose, onSelect, keyboardOpen, onFreeSearch }: SearchModalProps) {
  const [query, setQuery] = useState('')
  const [movieResults, setMovieResults] = useState<MediaItem[]>([])
  const [tvResults, setTvResults] = useState<MediaItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [filter, setFilter] = useState<SearchFilter>('all')
  const [focusedSection, setFocusedSection] = useState<'input' | 'filter' | 'result'>('input')
  const [focusedIdx, setFocusedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setMovieResults([])
      setTvResults([])
      return
    }
    setIsSearching(true)
    try {
      const [movies, tv] = await Promise.all([
        window.api.tmdb.search(q, 'movie'),
        window.api.tmdb.search(q, 'tv'),
      ])
      setMovieResults(movies?.results || [])
      setTvResults(tv?.results || [])
    } catch {
      setMovieResults([])
      setTvResults([])
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

  const results: MediaItem[] = filter === 'all'
    ? [...movieResults, ...tvResults].slice(0, 24)
    : filter === 'movie'
      ? movieResults.slice(0, 20)
      : tvResults.slice(0, 20)

  const filterCount = query.trim() ? FILTERS.length : 0
  const resultCount = results.length

  useEffect(() => {
    const sections = (): Array<{ id: 'input' | 'filter' | 'result'; count: number }> => [
      { id: 'input', count: 1 },
      ...(filterCount > 0 ? [{ id: 'filter' as const, count: filterCount }] : []),
      ...(resultCount > 0 ? [{ id: 'result' as const, count: resultCount }] : []),
    ]

    const handleKeyDown = (e: KeyboardEvent) => {
      // When the virtual keyboard is open, arrow/Enter keys belong to it
      if (keyboardOpen) return

      const secs = sections()
      const curSecIdx = secs.findIndex(s => s.id === focusedSection)

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          for (let i = curSecIdx + 1; i < secs.length; i++) {
            if (secs[i].count > 0) {
              if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
                document.activeElement.blur()
              }
              setFocusedSection(secs[i].id)
              setFocusedIdx(0)
              if (secs[i].id !== 'input') inputRef.current?.blur()
              return
            }
          }
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          for (let i = curSecIdx - 1; i >= 0; i--) {
            if (secs[i].count > 0) {
              if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
                document.activeElement.blur()
              }
              setFocusedSection(secs[i].id)
              setFocusedIdx(secs[i].count - 1)
              if (secs[i].id === 'input') inputRef.current?.focus()
              else inputRef.current?.blur()
              return
            }
          }
          break
        }
        case 'ArrowRight':
          if (focusedSection !== 'input') {
            e.preventDefault()
            const count = secs[curSecIdx]?.count || 1
            setFocusedIdx(prev => (prev + 1) % count)
          }
          break
        case 'ArrowLeft':
          if (focusedSection !== 'input') {
            e.preventDefault()
            const count = secs[curSecIdx]?.count || 1
            setFocusedIdx(prev => (prev - 1 + count) % count)
          }
          break
          case 'Enter':
            if (focusedSection === 'filter') {
              e.preventDefault()
              const sel = FILTERS[focusedIdx].id
              if (sel === 'free') {
                onFreeSearch?.(query.trim())
                return
              }
              setFilter(sel as SearchFilter)
            } else if (focusedSection === 'result') {
              e.preventDefault()
              onSelect(results[focusedIdx])
            }
            break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focusedSection, focusedIdx, filterCount, resultCount, results, filter, onSelect, keyboardOpen])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div ref={modalRef} className={`${styles.modal} animate-scale`} onClick={(e) => e.stopPropagation()}>
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
              if (e.key === 'Enter') {
                if (timeoutRef.current) clearTimeout(timeoutRef.current)
                doSearch(query)
              }
            }}
          />
        </div>
        {query.trim() && (
          <div className={styles.filterBar}>
            {FILTERS.map((f, idx) => (
              <button
                key={f.id}
                ref={(el) => { tabRefs.current[idx] = el }}
                tabIndex={-1}
                className={`${styles.filterTab} ${filter === f.id ? styles.filterActive : ''} ${focusedSection === 'filter' && focusedIdx === idx ? styles.focused : ''}`}
                 onClick={() => f.id !== 'free' && setFilter(f.id as SearchFilter)}
                onMouseDown={(e) => e.preventDefault()}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
        <div className={styles.results}>
          {isSearching && <p className={styles.status}>Searching...</p>}
          {!isSearching && results.length === 0 && query && (
            <p className={styles.status}>No results found</p>
          )}
          <div className={styles.grid}>
            {results.map((item, idx) => (
              <MediaCard key={`${item.mediaType}-${item.id}`} item={item} onSelect={onSelect} isFocused={focusedSection === 'result' && focusedIdx === idx} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
