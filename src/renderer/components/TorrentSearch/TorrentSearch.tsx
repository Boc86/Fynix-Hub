import React, { useEffect, useState, useMemo } from 'react'
import type { TorrentResult } from '../../types.d'
import { useSettingsStore } from '../../store/settingsStore'
import styles from './TorrentSearch.module.css'

interface TorrentSearchProps {
  title: string
  year?: number
  results: TorrentResult[]
  cachedMap: Record<string, string[]>
  loading: boolean
  onSelect: (result: TorrentResult) => void
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

  // If English is selected, also accept titles with no explicit language tag
  // (untagged torrents are typically English)
  if (languages.some(l => l.toLowerCase() === 'english')) {
    const hasExplicitTag = Object.values(tags).some(patterns =>
      patterns.some(p => lower.includes(p))
    )
    if (!hasExplicitTag) return true
  }

  return languages.some(lang => {
    const key = lang.toLowerCase()
    const patterns = tags[key] || [key]
    return patterns.some(p => lower.includes(p))
  })
}

export default function TorrentSearch({ title, year, results, cachedMap, loading, onSelect, onClose }: TorrentSearchProps) {
  const [selectedIdx, setSelectedIdx] = useState(0)
  const prefLangs = useSettingsStore(s => s.preferredLanguages)
  const prefRes = useSettingsStore(s => s.preferredResolutions)
  const maxTorrentSize = useSettingsStore(s => s.maxTorrentSize)

  const filteredResults = useMemo(() => {
    let r = results
    if (prefRes && prefRes.length > 0) r = r.filter(x => matchesQuality(x.title, prefRes))
    if (prefLangs && prefLangs.length > 0) r = r.filter(x => matchesLanguage(x.title, prefLangs))
    if (maxTorrentSize > 0) r = r.filter(x => x.size <= maxTorrentSize * 1073741824)
    return [...r].sort((a, b) => {
      const aCached = (cachedMap[a.infoHash.toLowerCase()]?.length ?? 0) > 0 ? 0 : 1
      const bCached = (cachedMap[b.infoHash.toLowerCase()]?.length ?? 0) > 0 ? 0 : 1
      if (aCached !== bCached) return aCached - bCached
      const qualityOrder: Record<string, number> = { '4K': 0, '1080p': 1, '720p': 2, '480p': 3 }
      const aQ = qualityOrder[a.quality] ?? 99
      const bQ = qualityOrder[b.quality] ?? 99
      if (aQ !== bQ) return aQ - bQ
      return b.seeders - a.seeders
    })
  }, [results, prefLangs, prefRes, maxTorrentSize, cachedMap])

  const cachedCountInList = filteredResults.filter(r => (cachedMap[r.infoHash.toLowerCase()]?.length ?? 0) > 0).length

  window.api.writeDebugFile({
    phase: 'torrent-search-render',
    prefLangs,
    prefRes,
    maxTorrentSize,
    propsResultsCount: results.length,
    propsCachedMapKeys: Object.keys(cachedMap),
    propsLoading: loading,
    filteredResultsCount: filteredResults.length,
    cachedCountInList,
    firstFilteredInfoHashes: filteredResults.slice(0, 5).map(r => r.infoHash.toLowerCase()),
    whyCachedWereFiltered: results.filter(r => (cachedMap[r.infoHash.toLowerCase()]?.length ?? 0) > 0).map(r => ({
      title: r.title,
      infoHash: r.infoHash,
      matchesQuality: matchesQuality(r.title, prefRes),
      matchesLanguage: matchesLanguage(r.title, prefLangs),
      withinSize: maxTorrentSize > 0 ? r.size <= maxTorrentSize * 1073741824 : true,
    })),
  }).catch(() => {})

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, filteredResults.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter' && filteredResults[selectedIdx]) {
        e.preventDefault()
        onSelect(filteredResults[selectedIdx])
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [filteredResults, selectedIdx, onSelect, onClose])

  return (
    <div className={styles.overlay} onClick={onClose}>
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
          {!loading && filteredResults.length === 0 && (
            <div className={styles.empty}>
              {results.length > 0 ? 'No results match your language/resolution filters' : 'No torrents found'}
            </div>
          )}
          {!loading && filteredResults.map((r, idx) => (
            <div
              key={`${r.infoHash}-${idx}`}
              className={`${styles.result} ${idx === selectedIdx ? styles.selected : ''}`}
              onClick={() => onSelect(r)}
              onMouseEnter={() => setSelectedIdx(idx)}
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
          ))}
        </div>

        {filteredResults.length > 0 && (
          <div className={styles.footer}>
            <span className={styles.hint}>↑↓ navigate · Enter select · Esc close{Object.keys(cachedMap).length > 0 ? ' · Cached = instant stream' : ''}</span>
            {(prefLangs.length > 0 || prefRes.length > 0) && (
              <span className={styles.filterInfo}> · filtered by preferences</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
