import React, { useState, useCallback, useRef, useEffect } from 'react'
import type { MediaItem, TorrentResult, UsenetResult } from '../../types'
import MediaCard from '../MediaCard/MediaCard'
import { useSettingsStore } from '../../store/settingsStore'
import styles from './SearchModal.module.css'

interface SearchModalProps {
  onClose: () => void
  onSelect: (item: MediaItem) => void
  keyboardOpen?: boolean
  onFreeSearch?: (query: string) => void
  onTorrentSelect?: (torrent: TorrentResult) => void
  onUsenetSelect?: (usenet: UsenetResult) => void
}

type SearchFilter = 'all' | 'movie' | 'tv' | 'free'

const FILTERS: Array<{ id: SearchFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'movie', label: 'Movies' },
  { id: 'tv', label: 'TV Shows' },
  { id: 'free', label: 'Search All' },
]

function formatSize(bytes: number): string {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB'
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(0) + ' MB'
  return bytes + ' B'
}

export default function SearchModal({ onClose, onSelect, keyboardOpen, onFreeSearch, onTorrentSelect, onUsenetSelect }: SearchModalProps) {
  const store = useSettingsStore()
  const [query, setQuery] = useState('')
  const [movieResults, setMovieResults] = useState<MediaItem[]>([])
  const [tvResults, setTvResults] = useState<MediaItem[]>([])
  const [torrentResults, setTorrentResults] = useState<TorrentResult[]>([])
  const [usenetResults, setUsenetResults] = useState<UsenetResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [filter, setFilter] = useState<SearchFilter>('all')
  const [focusedSection, setFocusedSection] = useState<'input' | 'filter' | 'result'>('input')
  const [focusedIdx, setFocusedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const modalRef = useRef<HTMLDivElement>(null)
  const [sourceVyla, setSourceVyla] = useState(store.vylaSearchEnabled)
  const [sourceTorrent, setSourceTorrent] = useState(store.torrentSearchEnabled)
  const [sourceUsenet, setSourceUsenet] = useState(store.usenetSearchEnabled)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const doSearch = useCallback(async (q: string, srcVyla = sourceVyla, srcTorrent = sourceTorrent, srcUsenet = sourceUsenet) => {
    if (!q.trim()) {
      setMovieResults([])
      setTvResults([])
      setTorrentResults([])
      setUsenetResults([])
      return
    }
    setIsSearching(true)
    if (filter === 'free') {
      const promises: Promise<any>[] = []
      if (srcTorrent) {
        promises.push(
          window.api.torrent.search({ query: q, type: 'movie' })
            .then(r => { setTorrentResults(r?.torrents || []); return r })
            .catch(() => { setTorrentResults([]); return [] })
        )
      }
      if (srcUsenet) {
        promises.push(
          window.api.usenet.search({ query: q })
            .then(r => {
              const maxSize = useSettingsStore.getState().maxDownloadSize
              const filtered = maxSize > 0 ? (r || []).filter((x: UsenetResult) => x.size <= maxSize * 1073741824) : (r || [])
              setUsenetResults(filtered)
              return r
            })
            .catch(() => { setUsenetResults([]); return [] })
        )
      }
      if (promises.length === 0) {
        setTorrentResults([])
        setUsenetResults([])
      } else {
        await Promise.allSettled(promises)
      }
    } else {
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
      }
    }
    setIsSearching(false)
  }, [filter, sourceVyla, sourceTorrent, sourceUsenet])

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
      : filter === 'tv'
        ? tvResults.slice(0, 20)
        : []

  const filterCount = query.trim() ? FILTERS.length : 0
  const resultCount = filter === 'free' ? torrentResults.length + usenetResults.length : results.length
  const isTorrentView = filter === 'free'

  useEffect(() => {
    if (query.trim()) {
      doSearch(query)
    }
  }, [filter])

  // Re-search when source toggles change
  useEffect(() => {
    if (query.trim() && isTorrentView) {
      doSearch(query)
    }
  }, [sourceVyla, sourceTorrent, sourceUsenet])

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
          if (focusedSection === 'result' && resultCount > 0) {
            const nextIdx = focusedIdx + 1
            if (nextIdx < resultCount) {
              setFocusedIdx(nextIdx)
              return
            }
            // else, we are at the last item, try to move to next section (if any)
          }
          // Try to move to next section
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
          if (focusedSection === 'result' && resultCount > 0) {
            const prevIdx = focusedIdx - 1
            if (prevIdx >= 0) {
              setFocusedIdx(prevIdx)
              return
            }
            // else, we are at the first item, try to move to previous section
          }
          // Try to move to previous section
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
             setFilter(sel)
            } else if (focusedSection === 'result') {
              e.preventDefault()
              if (isTorrentView) {
                if (sourceTorrent && focusedIdx < torrentResults.length) {
                  onTorrentSelect?.(torrentResults[focusedIdx])
                } else if (sourceUsenet) {
                  const usenetIdx = sourceTorrent ? focusedIdx - torrentResults.length : focusedIdx
                  onUsenetSelect?.(usenetResults[usenetIdx])
                }
              } else {
                onSelect(results[focusedIdx])
              }
            }
           break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focusedSection, focusedIdx, filterCount, resultCount, results, torrentResults, usenetResults, filter, onSelect, onTorrentSelect, onUsenetSelect, keyboardOpen, isTorrentView, sourceTorrent, sourceUsenet])

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
                onClick={() => setFilter(f.id)}
                onMouseDown={(e) => e.preventDefault()}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
        <div className={styles.results}>
          {isTorrentView && (
            <div style={{ display: 'flex', gap: 6, padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <button
                tabIndex={-1}
                className={`${styles.sourceToggle} ${sourceVyla ? styles.sourceActive : ''}`}
                onClick={() => { setSourceVyla(!sourceVyla) }}
              >
                Vyla
              </button>
              <button
                tabIndex={-1}
                className={`${styles.sourceToggle} ${sourceTorrent ? styles.sourceActive : ''}`}
                onClick={() => { setSourceTorrent(!sourceTorrent) }}
              >
                Torrents
              </button>
              <button
                tabIndex={-1}
                className={`${styles.sourceToggle} ${sourceUsenet ? styles.sourceActive : ''}`}
                onClick={() => { setSourceUsenet(!sourceUsenet) }}
              >
                Usenet
              </button>
            </div>
          )}
          {isSearching && <p className={styles.status}>Searching...</p>}
          {!isSearching && isTorrentView && query && torrentResults.length === 0 && usenetResults.length === 0 && (
            <p className={styles.status}>No results found</p>
          )}
          {!isSearching && !isTorrentView && results.length === 0 && query && (
            <p className={styles.status}>No results found</p>
          )}
          {isTorrentView ? (
            <div className={styles.torrentList}>
              {sourceTorrent && torrentResults.map((torrent, idx) => (
                <div
                  key={`${torrent.infoHash}-${idx}`}
                  className={`${styles.torrentRow} ${focusedSection === 'result' && focusedIdx === idx ? styles.focused : ''}`}
                  onClick={() => onTorrentSelect?.(torrent)}
                  role="button"
                  tabIndex={-1}
                >
                  <div className={styles.torrentInfo}>
                    <div className={styles.torrentTitle}>📦 {torrent.title}</div>
                    <div className={styles.torrentMeta}>
                      <span className={styles.torrentQuality}>{torrent.quality}</span>
                      <span>{formatSize(torrent.size)}</span>
                      <span>{torrent.seeders} SE</span>
                      <span className={styles.torrentIndexer}>{torrent.indexer}</span>
                    </div>
                  </div>
                </div>
              ))}
              {sourceUsenet && usenetResults.map((usenet, idx) => {
                const displayIdx = (sourceTorrent ? torrentResults.length : 0) + idx
                return (
                  <div
                    key={`usenet-${idx}`}
                    className={`${styles.torrentRow} ${focusedSection === 'result' && focusedIdx === displayIdx ? styles.focused : ''}`}
                    onClick={() => onUsenetSelect?.(usenet)}
                    role="button"
                    tabIndex={-1}
                  >
                    <div className={styles.torrentInfo}>
                      <div className={styles.torrentTitle}>📰 {usenet.title}</div>
                      <div className={styles.torrentMeta}>
                        <span className={styles.torrentQuality}>{usenet.quality}</span>
                        <span>{formatSize(usenet.size)}</span>
                        <span className={styles.torrentIndexer}>{usenet.indexer}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className={styles.grid}>
              {results.map((item, idx) => (
                <MediaCard key={`${item.mediaType}-${item.id}`} item={item} onSelect={onSelect} isFocused={focusedSection === 'result' && focusedIdx === idx} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
