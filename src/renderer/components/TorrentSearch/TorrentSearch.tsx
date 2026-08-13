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
    polish: ['polish', 'pl', 'polski'],
    dutch: ['dutch', 'nl', 'nederlands'],
    swedish: ['swedish', 'sv'],
    norwegian: ['norwegian', 'no', 'norsk'],
    danish: ['danish', 'da', 'dansk'],
    finnish: ['finnish', 'fi', 'suomi'],
    czech: ['czech', 'cs', 'czesky'],
    hungarian: ['hungarian', 'hu', 'magyar'],
    greek: ['greek', 'el', 'ell'],
    turkish: ['turkish', 'tr', 'turkce'],
    thai: ['thai', 'th'],
    vietnamese: ['vietnamese', 'vi'],
    romanian: ['romanian', 'ro'],
    ukrainian: ['ukrainian', 'uk'],
    persian: ['persian', 'fa', 'farsi'],
  }

  // Check if the title has any explicit language tag (word-boundary match
  // so e.g. "en" doesn't match inside "french" or "copilot")
  const hasExplicitTag = Object.values(tags).some(patterns =>
    patterns.some(p => new RegExp(`\\b${p.replace(/[-/\\^$*+?.()|[\\]{}]/g, '\\$&')}\\b`).test(lower))
  )

  // Untagged torrents aren't penalized — they could be any language
  if (!hasExplicitTag) return true

  // If there is a tag, it must match one of the user's preferred languages
  return languages.some(lang => {
    const key = lang.toLowerCase()
    const patterns = tags[key] || [key]
    return patterns.some(p => new RegExp(`\\b${p.replace(/[-/\\^$*+?.()|[\\]{}]/g, '\\$&')}\\b`).test(lower))
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
  const maxDownloadSize = useSettingsStore(s => s.maxDownloadSize)

  useEffect(() => {
    const unsubscribe = window.api.torrent.onRiveResult((result) => {
      setLocalRiveResults(prev => [...prev, result])
    })
    return unsubscribe
  }, [])

  const combinedRiveResults = [...(rivestreamResults || []), ...localRiveResults]
  const combinedUsenetResults = (() => {
    const filtered = maxDownloadSize > 0
      ? (usenetResults || []).filter(r => r.size <= maxDownloadSize * 1073741824)
      : (usenetResults || [])
    // Cached (already downloaded) results first
    return [...filtered].sort((a, b) => (b.streamUrl ? 1 : 0) - (a.streamUrl ? 1 : 0))
  })()
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
    if (el && listRef.current) {
      const container = listRef.current
      const itemTop = el.offsetTop - container.offsetTop
      const itemBottom = itemTop + el.offsetHeight
      if (itemTop < container.scrollTop) {
        container.scrollTop = itemTop
      } else if (itemBottom > container.scrollTop + container.clientHeight) {
        container.scrollTop = itemBottom - container.clientHeight
      }
    }
  }, [selectedIdx])

  const scoredResults = useMemo(() => {
    // Only hard-filter by max size (user's explicit limit)
    let r = results
    if (maxDownloadSize > 0) r = r.filter(x => x.size <= maxDownloadSize * 1073741824)

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
      if (maxDownloadSize > 0 && t.size > 0) {
        const ratio = t.size / (maxDownloadSize * 1073741824)
        s += Math.round((1 - ratio) * 1000)
      } else if (t.size > 0) {
        if (t.size >= 524288000 && t.size <= 53687091200) s += 500
      }
      // Tier 6: Seeders (tiebreaker)
      s += Math.min(t.seeders, 999)
      return s
    }
  }, [results, prefLangs, prefRes, maxDownloadSize, cachedMap])

  const totalItems = rivestreamCount + usenetCount + scoredResults.length

  const cachedCountInList = scoredResults.filter(r => (cachedMap[r.infoHash.toLowerCase()]?.length ?? 0) > 0).length
  const usenetCachedCount = combinedUsenetResults.filter(r => !!r.streamUrl).length

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
    }
    window.addEventListener('keydown', onKey, true)
    overlayRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey, true)
  }, [scoredResults, selectedIdx, onSelect, onClose, rivestreamCount, combinedRiveResults, onSelectRivestream, usenetCount, combinedUsenetResults, onSelectUsenet, totalItems])

  return (
    <div className={styles.overlay} tabIndex={-1} ref={overlayRef} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Select Torrent</h2>
          <p className={styles.subtitle}>{title}{year ? ` (${year})` : ''}</p>
          {(Object.keys(cachedMap).length > 0 || usenetCachedCount > 0) && (
            <p className={styles.cacheInfo}>
              {cachedCountInList > 0 && `${cachedCountInList} cached torrent${cachedCountInList !== 1 ? 's' : ''}`}
              {cachedCountInList > 0 && usenetCachedCount > 0 && ' · '}
              {usenetCachedCount > 0 && `${usenetCachedCount} cached Usenet result${usenetCachedCount !== 1 ? 's' : ''}`}
              {' available'}
            </p>
          )}
          <button className={styles.closeBtn} onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className={styles.list} ref={listRef}>
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
                      {r.streamUrl && <span className={`${styles.badge} ${styles.cached}`}>Cached</span>}
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
                      <span className={`${styles.badge} ${styles.quality}`}>{r.quality}</span>
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
            <span className={styles.hint}>↑↓ navigate · Enter select · Esc close{rivestreamCount > 0 ? ' · Direct Stream = instant play' : ''}{usenetCount > 0 ? ' · Usenet = streams via download client' : ''}{(Object.keys(cachedMap).length > 0 || usenetCachedCount > 0) ? ' · Cached = instant stream' : ''}</span>
            {(prefLangs.length > 0 || prefRes.length > 0) && (
              <span className={styles.filterInfo}> · preferences boost results</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
