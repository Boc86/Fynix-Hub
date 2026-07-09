import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import type { TorrentResult, RivestreamResult, UsenetResult } from '../../types.d'
import { useSettingsStore } from '../../store/settingsStore'
import styles from './TorrentSearch.module.css'

interface TorrentSearchProps {
  title: string
  year?: number
  results: TorrentResult[]
  cachedMap: Record<string, string[]>
  loading: boolean
  rivestreamResults?: RivestreamResult[]
  usenetResults?: UsenetResult[]
  usenetLoading?: boolean
  onSelect: (result: TorrentResult) => void
  onSelectRivestream?: (result: RivestreamResult) => void
  onSelectUsenet?: (result: UsenetResult) => void
  onClose: () => void
}

function formatSize(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function qualityLabel(q: string): string {
  if (q === '4K') return '4K'
  if (q === '1080p') return '1080p'
  if (q === '720p') return '720p'
  if (q === '480p') return '480p'
  return q
}

function qualityFromTitle(title: string): string {
  const lower = title.toLowerCase()
  if (lower.includes('2160p') || lower.includes('4k')) return '4K'
  if (lower.includes('1080p')) return '1080p'
  if (lower.includes('720p')) return '720p'
  if (lower.includes('480p')) return '480p'
  return 'Unknown'
}

function matchesQuality(title: string, resolutions: string[]): boolean {
  if (!resolutions || resolutions.length === 0) return true
  return resolutions.includes(qualityFromTitle(title))
}

function matchesLanguage(title: string, languages: string[]): boolean {
  if (!languages || languages.length === 0) return true
  const lower = title.toLowerCase()
  const tags: Record<string, string[]> = {
    english: ['english', 'eng', 'en'],
    spanish: ['spanish', 'esp', 'es', 'castellano', 'latino'],
    french: ['french', 'fr', 'fra', 'vf', 'vostfr'],
    german: ['german', 'de', 'ger', 'deutsch'],
    italian: ['italian', 'it', 'ita'],
    portuguese: ['portuguese', 'pt', 'por', 'brazilian'],
    japanese: ['japanese', 'jp', 'jap', 'jpn'],
    korean: ['korean', 'kr', 'kor'],
    chinese: ['chinese', 'cn', 'chi', 'mandarin', 'cantonese'],
    russian: ['russian', 'ru', 'rus'],
    hindi: ['hindi', 'hi'],
    arabic: ['arabic', 'ar', 'ara'],
  }

  // Check if the title has any explicit language tag
  const hasExplicitTag = Object.values(tags).some(patterns =>
    patterns.some(p => lower.includes(p))
  )

  // Untagged torrents aren't penalized — they could be any language
  if (!hasExplicitTag) return true

  // If there is a tag, it must match one of the user's preferred languages
  return languages.some(lang => {
    const key = lang.toLowerCase()
    const patterns = tags[key] || [key]
    return patterns.some(p => lower.includes(p))
  })
}

function usenetFormatSize(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

export default function TorrentSearch({ title, year, results, cachedMap, loading, rivestreamResults, usenetResults, usenetLoading, onSelect, onSelectRivestream, onSelectUsenet, onClose }: TorrentSearchProps) {
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [localRiveResults, setLocalRiveResults] = useState<RivestreamResult[]>([])
  const prefLangs = useSettingsStore(s => s.preferredLanguages)
  const prefRes = useSettingsStore(s => s.preferredResolutions)
  const maxTorrentSize = useSettingsStore(s => s.maxTorrentSize)

  useEffect(() => {
    const unsubscribe = window.api.torrent.onRiveResult((result) => {
      setLocalRiveResults(prev => [...prev, result])
    })
    return unsubscribe
  }, [])

  const combinedRiveResults = [...(rivestreamResults || []), ...localRiveResults]
  const combinedUsenetResults = usenetResults || []
  const overlayRef = useRef<HTMLDivElement>(null)
  const rivestreamCount = combinedRiveResults.length
  const usenetCount = combinedUsenetResults.length

  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    overlayRef.current?.focus()
  }, [])

  useEffect(() => {
    const el = itemRefs.current[selectedIdx]
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedIdx])

  const scoredResults = useMemo(() => {
    // Only hard-filter by max size (user's explicit limit)
    let r = results
    if (maxTorrentSize > 0) r = r.filter(x => x.size <= maxTorrentSize * 1073741824)

    return [...r].sort((a, b) => score(b) - score(a))

    function score(t: TorrentResult): number {
      let s = 0
      // Tier 1: Resolution — highest first in all cases
      const q = qualityFromTitle(t.title)
      const resolutionScores: Record<string, number> = { '4K': 10000000, '1080p': 5000000, '720p': 1000000, '480p': 500000 }
      s += resolutionScores[q] ?? 0
      // Tier 2: Cached
      if ((cachedMap[t.infoHash.toLowerCase()]?.length ?? 0) > 0) s += 1000000
      // Tier 3: Preferred resolution bonus
      if (matchesQuality(t.title, prefRes)) s += 100000
      // Tier 4: Preferred language
      if (matchesLanguage(t.title, prefLangs)) s += 10000
      // Tier 5: Size
      if (maxTorrentSize > 0 && t.size > 0) {
        const ratio = t.size / (maxTorrentSize * 1073741824)
        s += Math.round((1 - ratio) * 1000)
      } else if (t.size > 0) {
        if (t.size >= 524288000 && t.size <= 53687091200) s += 500
      }
      // Tier 6: Seeders (tiebreaker)
      s += Math.min(t.seeders, 999)
      return s
    }
  }, [results, prefLangs, prefRes, maxTorrentSize, cachedMap])

  const totalItems = rivestreamCount + usenetCount + scoredResults.length

  const cachedCountInList = scoredResults.filter(r => (cachedMap[r.infoHash.toLowerCase()]?.length ?? 0) > 0).length

  const handleOverlayKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Backspace') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, totalItems - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)); return }
    if (e.key === 'Home') { e.preventDefault(); setSelectedIdx(0); return }
    if (e.key === 'End') { e.preventDefault(); setSelectedIdx(totalItems - 1); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIdx < rivestreamCount && onSelectRivestream && combinedRiveResults) {
        onSelectRivestream(combinedRiveResults[selectedIdx])
      } else if (selectedIdx >= rivestreamCount && selectedIdx < rivestreamCount + usenetCount && onSelectUsenet) {
        onSelectUsenet(combinedUsenetResults[selectedIdx - rivestreamCount])
      } else {
        const torrentIdx = selectedIdx - rivestreamCount - usenetCount
        if (scoredResults[torrentIdx]) {
          onSelect(scoredResults[torrentIdx])
        }
      }
    }
    e.stopPropagation()
  }, [scoredResults, selectedIdx, onSelect, onClose, rivestreamCount, combinedRiveResults, onSelectRivestream, usenetCount, combinedUsenetResults, onSelectUsenet])

  return (
    <div className={styles.overlay} tabIndex={-1} ref={overlayRef} onKeyDown={handleOverlayKeyDown} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Select Torrent</h2>
          <p className={styles.subtitle}>{title}{year ? ` (${year})` : ''}</p>
          {Object.keys(cachedMap).length > 0 && (
            <p className={styles.cacheInfo}>{cachedCountInList} cached result{cachedCountInList !== 1 ? 's' : ''} available</p>
          )}
          <button className={styles.closeBtn} onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className={styles.list}>
          {loading && (
            <div className={styles.loading}>
              <div className={styles.spinner} />
              <span>Searching torrents...</span>
            </div>
          )}
           {!loading && rivestreamCount > 0 && (
             <>
               <div className={styles.sectionLabel}>Direct Stream</div>
                {combinedRiveResults.map((r, idx) => (
                  <div
                    key={`rivestream-${idx}`}
                    ref={el => { itemRefs.current[idx] = el }}
                    className={`${styles.result} ${idx === selectedIdx ? styles.selected : ''}`}
                    onClick={() => onSelectRivestream?.(r)}
                    onMouseEnter={() => setSelectedIdx(idx)}
                 >
                   <div className={styles.resultTitle}>{r.title}</div>
                   <div className={styles.resultMeta}>
                     <span className={`${styles.badge} ${styles.quality}`}>{r.quality}</span>
                     <span className={`${styles.badge} ${styles.direct}`}>{r.indexer}</span>
                   </div>
                 </div>
               ))}
             </>
           )}

           {!loading && usenetLoading && (
             <div className={styles.loading}>
               <div className={styles.spinner} />
               <span>Searching Usenet...</span>
             </div>
           )}

           {!loading && !usenetLoading && usenetCount > 0 && (
             <>
               <div className={styles.sectionLabel}>Usenet</div>
               {combinedUsenetResults.map((r, idx) => {
                 const displayIdx = rivestreamCount + idx
                 return (
                   <div
                     key={`usenet-${idx}`}
                     ref={el => { itemRefs.current[displayIdx] = el }}
                     className={`${styles.result} ${displayIdx === selectedIdx ? styles.selected : ''}`}
                     onClick={() => onSelectUsenet?.(r)}
                     onMouseEnter={() => setSelectedIdx(displayIdx)}
                   >
                     <div className={styles.resultTitle}>{r.title}</div>
                     <div className={styles.resultMeta}>
                       <span className={`${styles.badge} ${styles.quality}`}>{r.quality}</span>
                       <span className={`${styles.badge} ${styles.indexer}`}>{r.indexer}</span>
                       <span className={styles.size}>{usenetFormatSize(r.size)}</span>
                     </div>
                   </div>
                 )
               })}
             </>
           )}

          {!loading && scoredResults.length === 0 && rivestreamCount === 0 && usenetCount === 0 && (
            <div className={styles.empty}>
              No torrents found
            </div>
          )}
          {!loading && scoredResults.length > 0 && (
            <>
              <div className={styles.sectionLabel}>Torrents</div>
              {scoredResults.map((r, idx) => {
                const displayIdx = rivestreamCount + usenetCount + idx
                return (
                  <div
                    key={`${r.infoHash}-${idx}`}
                    ref={el => { itemRefs.current[displayIdx] = el }}
                    className={`${styles.result} ${displayIdx === selectedIdx ? styles.selected : ''}`}
                    onClick={() => onSelect(r)}
                    onMouseEnter={() => setSelectedIdx(displayIdx)}
                  >
                    <div className={styles.resultTitle}>{r.title}</div>
                    <div className={styles.resultMeta}>
                      <span className={`${styles.badge} ${styles.quality}`}>{qualityLabel(r.quality)}</span>
                      <span className={`${styles.badge} ${styles.indexer}`}>{r.indexer}</span>
                      <span className={styles.size}>{formatSize(r.size)}</span>
                      <span className={styles.seeders}>S: {r.seeders}</span>
                      <span className={styles.leechers}>L: {r.leechers}</span>
                      {cachedMap[r.infoHash.toLowerCase()]?.map(svc => (
                        <span key={svc} className={`${styles.badge} ${styles.cached}`}>
                          {svc === 'real-debrid' ? 'RD' : svc === 'torbox' ? 'TB' : svc === 'premiumize' ? 'PM' : svc === 'alldebrid' ? 'AD' : svc}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>

        {totalItems > 0 && (
          <div className={styles.footer}>
            <span className={styles.hint}>↑↓ navigate · Enter select · Esc close{rivestreamCount > 0 ? ' · Direct Stream = instant play' : ''}{usenetCount > 0 ? ' · Usenet = streams via download client' : ''}{Object.keys(cachedMap).length > 0 ? ' · Cached = instant stream' : ''}</span>
            {(prefLangs.length > 0 || prefRes.length > 0) && (
              <span className={styles.filterInfo}> · preferences boost results</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
