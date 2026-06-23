import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Layout from './components/Layout/Layout'
import Browser from './components/Browser/Browser'
import DetailView from './components/DetailView/DetailView'
import VideoPlayer from './components/VideoPlayer/VideoPlayer'
import SearchModal from './components/SearchModal/SearchModal'
import Settings from './components/Settings/Settings'
import Sidebar from './components/Sidebar/Sidebar'
import SportsPage from './components/Sports/SportsPage'
import TorrentSearch from './components/TorrentSearch/TorrentSearch'
import ContextMenu from './components/ContextMenu/ContextMenu'
import VirtualKeyboard from './components/VirtualKeyboard/VirtualKeyboard'
import type { ContextTarget } from './components/ContextMenu/ContextMenu'
import type { NavView } from './components/Sidebar/Sidebar'
import type { TorrentResult } from './types.d'
import { useMediaStore } from './store/mediaStore'
import { useSettingsStore } from './store/settingsStore'

type View = 'browser' | 'detail' | 'player' | 'settings' | 'movies' | 'tv-shows' | 'sports' | 'free-search'

interface PlayerInfo {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  season?: number
  episode?: number
  resumePosition?: number
  isTrailer?: boolean
}

export default function App() {
  const [view, setView] = useState<View>('browser')
  const [searchOpen, setSearchOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [torrentSearchOpen, setTorrentSearchOpen] = useState(false)
  const [freeSearchOpen, setFreeSearchOpen] = useState(false)
  const [freeSearchQuery, setFreeSearchQuery] = useState('')

  const [contextTarget, setContextTarget] = useState<ContextTarget | null>(null)
  const [virtualKeyboardOpen, setVirtualKeyboardOpen] = useState(false)
  const [torrentResults, setTorrentResults] = useState<TorrentResult[]>([])
  const [torrentCachedMap, setTorrentCachedMap] = useState<Record<string, string[]>>({})
  const [torrentSearching, setTorrentSearching] = useState(false)
  const [streamUrl, setStreamUrl] = useState<string | undefined>()
  const [streamError, setStreamError] = useState<string | null>(null)
  const [playerInfo, setPlayerInfo] = useState<PlayerInfo | undefined>()
  const [playerLoading, setPlayerLoading] = useState(false)
  const [genreType, setGenreType] = useState<'movie' | 'tv' | undefined>()
  const [sportsSearchTitle, setSportsSearchTitle] = useState<string>('')
  const [sportsSearchYear, setSportsSearchYear] = useState<number | undefined>()
  const autoPlayResultsRef = useRef<TorrentResult[]>([])
  const autoPlayIndexRef = useRef(0)
  const currentInfoHashRef = useRef<string | null>(null)
  const historyRef = useRef<View[]>([])
  const keyboardInputRef = useRef<HTMLElement | null>(null)
  const savedFocusRef = useRef<HTMLElement | null>(null)
  const prevModalCountRef = useRef(0)
  const { loadFromDisk, tmdbApiKey, sportsEnabled } = useSettingsStore()

  const DEBRID_SERVICES = useMemo(() => ['real-debrid', 'torbox', 'premiumize', 'alldebrid'], [])
  const selectedMedia = useMediaStore((s) => s.selectedMedia)
  const storeSeason = useMediaStore((s) => s.selectedSeason)
  const storeEpisode = useMediaStore((s) => s.selectedEpisode)
  const storeResume = useMediaStore((s) => s.resumeProgress)

  useEffect(() => {
    loadFromDisk()
  }, [])

  // Stop transcoder when leaving player view
  useEffect(() => {
    if (view !== 'player') {
      window.api.transcoder.stop().catch(() => {})
    }
  }, [view])

  // Centralized focus management: save activeElement when a modal opens,
  // restore it when all modals close.  Saving is done here only as a
  // fallback — modal-triggering handlers (Enter on input, 's', 'c', etc.)
  // save explicitly beforehand so the correct element is captured before
  // the modal's auto-focus runs.
  const modalCount = [searchOpen, sidebarOpen, torrentSearchOpen, freeSearchOpen, !!contextTarget, virtualKeyboardOpen].filter(Boolean).length
  useLayoutEffect(() => {
    if (modalCount > 0 && prevModalCountRef.current === 0 && !savedFocusRef.current) {
      savedFocusRef.current = document.activeElement as HTMLElement
    } else if (modalCount === 0 && prevModalCountRef.current > 0) {
      const el = savedFocusRef.current
      savedFocusRef.current = null
      if (el && document.contains(el)) {
        el.focus()
      }
    }
    prevModalCountRef.current = modalCount
  }, [modalCount])

  const navigate = useCallback((v: View) => {
    historyRef.current = [...historyRef.current, view]
    setView(v)
  }, [view])

  const goBack = useCallback(() => {
    const h = historyRef.current
    if (h.length > 0) {
      const prev = h[h.length - 1]
      historyRef.current = h.slice(0, -1)
      setView(prev)
    } else {
      setView('browser')
    }
  }, [])

  const navigateSidebar = useCallback((v: NavView) => {
    if (v !== view) {
      setGenreType(v === 'movies' ? 'movie' : v === 'tv-shows' ? 'tv' : undefined)
      navigate(v as View)
    } else {
      setSidebarOpen(false)
    }
  }, [navigate, view])

  const navigateGenre = useCallback((type: 'movie' | 'tv', genreId: number) => {
    setGenreType(type)
    const targetView = type === 'movie' ? 'movies' : 'tv-shows'
    navigate(targetView as View)
  }, [navigate])

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((o) => !o)
  }, [])

  const runTorrentSearch = useCallback(async (query: {
    title: string
    year?: number
    imdbId?: string
    type: 'movie' | 'episode'
    season?: number
    episode?: number
  }) => {
    setTorrentSearching(true)
    setTorrentResults([])
    setTorrentCachedMap({})

    // Provider 1: public indexers
    const indexerPromise = window.api.torrent.search(query)
      .then(res => {
        const results = res || []
        setTorrentResults(results)
        window.api.writeDebugFile({
          phase: 'indexer-results',
          query,
          resultCount: results.length,
          results: results.map((r: TorrentResult) => ({ title: r.title, infoHash: r.infoHash, indexer: r.indexer, magnetUri: r.magnetUri?.slice(0, 80) })),
        }).catch(() => {})
        return results
      })
      .catch(err => {
        console.error('[App] Public indexer search failed:', err)
        window.api.writeDebugFile({ phase: 'indexer-error', query, error: err?.message }).catch(() => {})
        return []
      })

    let debridCachedMap: Record<string, string[]> = {}
    let perService: Record<string, number> = {}

    // Providers 2-N: debrid cache checks (run once indexers return hashes)
    const debridPromise = indexerPromise.then(async (results) => {
      if (results.length === 0) return
      const hashes: string[] = []
      const magnets: string[] = []
      for (const r of results) {
        if (r.infoHash) {
          hashes.push(r.infoHash)
          magnets.push(r.magnetUri || '')
        }
      }
      const cached: Record<string, string[]> = {}
      perService = {}
      await Promise.all(DEBRID_SERVICES.map(async (svc) => {
        try {
          const status = await window.api.debrid.getStatus(svc)
          if (status.configured) {
            const batch = await window.api.debrid.checkCachedBatch(svc, hashes, magnets)
            let svcCached = 0
            for (const [hash, isCached] of Object.entries(batch)) {
              if (isCached === true || isCached === 'true') {
                const key = hash.toLowerCase()
                if (!cached[key]) cached[key] = []
                if (!cached[key].includes(svc)) cached[key].push(svc)
                svcCached++
              }
            }
            perService[svc] = svcCached
          }
        } catch (e: any) {
          console.error(`[App] Debrid cache check failed for ${svc}:`, e?.message || e)
          perService[svc] = -1
        }
      }))
      debridCachedMap = cached
      setTorrentCachedMap(cached)
      window.api.writeDebugFile({
        phase: 'debrid-cache-check',
        query,
        perService,
        totalCached: Object.keys(cached).length,
      }).catch(() => {})
    })

    const [indexerResult] = await Promise.allSettled([indexerPromise, debridPromise])
    const finalResults = indexerResult.status === 'fulfilled' ? indexerResult.value : []
    setTorrentSearching(false)
    window.api.writeDebugFile({
      phase: 'search-complete',
      query,
      resultCount: finalResults.length,
      cachedMap: debridCachedMap,
      cachedCount: Object.keys(debridCachedMap).length,
      perService,
    }).catch(() => {})
  }, [DEBRID_SERVICES])

  // Run torrent search whenever the modal opens with selected media
  useEffect(() => {
    if (!torrentSearchOpen || !selectedMedia) return
    const isEpisode = selectedMedia.mediaType === 'tv' && storeEpisode !== null
    runTorrentSearch({
      title: isEpisode
        ? `${selectedMedia.title} S${String(storeSeason).padStart(2, '0')}E${String(storeEpisode).padStart(2, '0')}`
        : selectedMedia.title,
      year: selectedMedia.releaseDate ? parseInt(selectedMedia.releaseDate.slice(0, 4)) : undefined,
      type: isEpisode ? 'episode' : 'movie',
      season: isEpisode ? storeSeason : undefined,
      episode: isEpisode ? storeEpisode ?? undefined : undefined,
    })
  }, [torrentSearchOpen, selectedMedia, storeSeason, storeEpisode, runTorrentSearch])

  const maybeTranscode = useCallback(async (url: string): Promise<string> => {
    try {
      const avail = await window.api.transcoder.isAvailable()
      if (!avail) return url
      const result = await window.api.transcoder.start(url)
      console.log('[App] Transcoding proxy:', result.proxyUrl)
      return result.proxyUrl
    } catch (err: any) {
      console.log('[App] Transcoder unavailable, using direct URL:', err?.message)
      return url
    }
  }, [])

  const playTorrent = useCallback(async (result: TorrentResult): Promise<string> => {
    const preferred = await window.api.debrid.getPreferred()
    let url: string
    if (preferred.service) {
      const cached = await window.api.debrid.checkCached(preferred.service, result.infoHash)
      if (cached.cached) {
        const dl = await window.api.debrid.addAndWait(result.magnetUri, preferred.service)
        url = typeof dl === 'string' ? dl : (dl.url || '')
        return await maybeTranscode(url)
      }
    }
    const torrentResult = await window.api.torrent.addTorrent(result.magnetUri)
    const streamRes = await window.api.torrent.getStreamUrl(torrentResult.infoHash)
    return await maybeTranscode(streamRes.url)
  }, [maybeTranscode])

  const startPlayback = useCallback(async (result: TorrentResult) => {
    console.log('[App] startPlayback', result.title, result.infoHash.slice(0, 16))
    setTorrentSearchOpen(false)
    setFreeSearchOpen(false)
    setFreeSearchQuery('')
    setPlayerLoading(true)
    setStreamError(null)
    navigate('player')

    try {
      const url = await playTorrent(result)
      console.log('[App] Stream URL:', url)
      setStreamUrl(url)
    } catch (err: any) {
      console.error('[App] Playback failed:', err.message, err.stack)
      setStreamError(err?.message || 'Failed to start playback')
    } finally {
      setPlayerLoading(false)
    }
  }, [navigate, playTorrent])

  const tryAutoPlayResult = useCallback(async (index: number) => {
    const results = autoPlayResultsRef.current
    if (index >= results.length) {
      setStreamError('All torrents failed to play. Try disabling auto-play in Settings.')
      setPlayerLoading(false)
      return
    }
    const result = results[index]
    autoPlayIndexRef.current = index
    console.log(`[App] Auto-play attempt ${index + 1}/${results.length}: ${result.title}`)
    try {
      const url = await playTorrent(result)
      currentInfoHashRef.current = result.infoHash
      setStreamUrl(url)
      setPlayerLoading(false)
    } catch (err: any) {
      console.log(`[App] Auto-play attempt ${index + 1} failed: ${err.message}`)
      tryAutoPlayResult(index + 1)
    }
  }, [playTorrent])

  const handlePlay = useCallback(async (resumePosition?: number) => {
    const selected = useMediaStore.getState().selectedMedia
    if (!selected) return
    const season = useMediaStore.getState().selectedSeason
    let episode = useMediaStore.getState().selectedEpisode
    if (selected.mediaType === 'tv' && episode === null) {
      episode = 1
    }

    setPlayerInfo({
      tmdbId: selected.id,
      mediaType: selected.mediaType || 'movie',
      season: episode ? season : undefined,
      episode: episode ?? undefined,
      resumePosition,
    })

    const { autoPlayTorrent, maxTorrentSize } = useSettingsStore.getState()
    if (!autoPlayTorrent) {
      setTorrentSearchOpen(true)
      return
    }

    // Auto-play: show player loading, search, try results in order
    autoPlayResultsRef.current = []
    autoPlayIndexRef.current = 0
    currentInfoHashRef.current = null
    setPlayerLoading(true)
    setStreamUrl(undefined)
    setStreamError(null)
    navigate('player')

    try {
      const isEpisode = selected.mediaType === 'tv' && episode !== null
      const results: TorrentResult[] = (await window.api.torrent.search({
        title: isEpisode ? `${selected.title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}` : selected.title,
        year: selected.releaseDate ? parseInt(selected.releaseDate.slice(0, 4)) : undefined,
        type: isEpisode ? 'episode' : 'movie',
        season: isEpisode ? season : undefined,
        episode: isEpisode ? (episode ?? undefined) : undefined,
      })) || []

      if (!results || results.length === 0) {
        setStreamError('No torrents found for auto-play')
        setPlayerLoading(false)
        return
      }

      const filtered = maxTorrentSize > 0
        ? results.filter((r: TorrentResult) => r.size <= maxTorrentSize * 1073741824)
        : results

      if (filtered.length === 0) {
        setStreamError('No torrents within the size limit')
        setPlayerLoading(false)
        return
      }

      autoPlayResultsRef.current = filtered
      tryAutoPlayResult(0)
    } catch (err: any) {
      setStreamError(err?.message || 'Auto-play search failed')
      setPlayerLoading(false)
    }
  }, [navigate, playTorrent, tryAutoPlayResult])

  const handlePlayTrailer = useCallback(async (youtubeUrl: string) => {
    setPlayerLoading(true)
    setStreamError(null)
    navigate('player')
    try {
      const res = await window.api.youtube.getStreamUrl(youtubeUrl)
      if (!res.success || !res.url) throw new Error(res.error || 'No trailer stream found')
      // YouTube direct URLs are already playable; skip the ffmpeg transcoding proxy
      setPlayerInfo({
        tmdbId: selectedMedia?.id || 0,
        mediaType: selectedMedia?.mediaType || 'movie',
        isTrailer: true,
      })
      setStreamUrl(res.url)
    } catch (err: any) {
      console.error('[App] Trailer playback failed:', err.message)
      setStreamError(err?.message || 'Failed to load trailer')
    } finally {
      setPlayerLoading(false)
    }
  }, [navigate, selectedMedia])

  const handleContextMenu = useCallback((target: ContextTarget) => {
    setContextTarget(target)
  }, [])

  const handleMarkWatched = useCallback(async (target: ContextTarget) => {
    try {
      const payload = target.type === 'movie'
        ? { movies: [{ ids: { tmdb: target.tmdbId } }] }
        : target.episode !== undefined
          ? { shows: [{ ids: { tmdb: target.tmdbId }, seasons: [{ season: target.season, episodes: [{ number: target.episode }] }] }] }
          : target.season !== undefined
            ? { shows: [{ ids: { tmdb: target.tmdbId }, seasons: [{ season: target.season }] }] }
            : { shows: [{ ids: { tmdb: target.tmdbId } }] }
      await window.api.trakt.markWatched(payload)
    } catch { /* ignore */ }
  }, [])

  const handleMarkUnwatched = useCallback(async (target: ContextTarget) => {
    try {
      const payload = target.type === 'movie'
        ? { movies: [{ ids: { tmdb: target.tmdbId } }] }
        : target.episode !== undefined
          ? { shows: [{ ids: { tmdb: target.tmdbId }, seasons: [{ season: target.season, episodes: [{ number: target.episode }] }] }] }
          : target.season !== undefined
            ? { shows: [{ ids: { tmdb: target.tmdbId }, seasons: [{ season: target.season }] }] }
            : { shows: [{ ids: { tmdb: target.tmdbId } }] }
      await window.api.trakt.markUnwatched(payload)
    } catch { /* ignore */ }
  }, [])

  const handleShowSources = useCallback(async (target: ContextTarget) => {
    if (target.type === 'episode') {
      await runTorrentSearch({
        title: `${target.title} S${String(target.season).padStart(2, '0')}E${String(target.episode).padStart(2, '0')}`,
        type: 'episode',
        season: target.season,
        episode: target.episode,
      })
    } else {
      await runTorrentSearch({
        title: target.title,
        type: 'movie',
      })
    }
    setTorrentSearchOpen(true)
  }, [runTorrentSearch])

  const handleSportsTorrentSearch = useCallback(async (title: string, year?: number) => {
    setSportsSearchTitle(title)
    setSportsSearchYear(year)
    await runTorrentSearch({ title, type: 'movie' })
    setTorrentSearchOpen(true)
  }, [runTorrentSearch])

  const onStreamError = useCallback(() => {
    if (autoPlayResultsRef.current.length > 0) {
      const nextIdx = autoPlayIndexRef.current + 1
      if (nextIdx < autoPlayResultsRef.current.length) {
        console.log(`[App] Stream error during auto-play, trying next result (${nextIdx + 1})/${autoPlayResultsRef.current.length}`)
        setStreamUrl(undefined)
        setStreamError(null)
        setPlayerLoading(true)
        if (currentInfoHashRef.current) {
          window.api.torrent.removeTorrent(currentInfoHashRef.current).catch(() => {})
        }
        tryAutoPlayResult(nextIdx)
      } else {
        setStreamError('All torrents failed to play. Try disabling auto-play in Settings.')
      }
    }
  }, [tryAutoPlayResult])

  const handleNextEpisode = useCallback(() => {
    const state = useMediaStore.getState()
    const { selectedSeason, selectedEpisode, seasonEpisodes } = state
    if (selectedEpisode !== null) {
      const nextEp = selectedEpisode + 1
      const exists = seasonEpisodes.some((e) => e.episodeNumber === nextEp)
      if (exists) {
        if (currentInfoHashRef.current) window.api.torrent.removeTorrent(currentInfoHashRef.current).catch(() => {})
        useMediaStore.getState().setSelectedEpisode(nextEp)
        setStreamUrl(undefined)
        setStreamError(null)
        setPlayerInfo((prev) => prev ? { ...prev, episode: nextEp, resumePosition: undefined } : undefined)
        handlePlay()
        return
      }
    }
    navigate('detail')
  }, [navigate, handlePlay])

  // Global keyboard handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)
      
      if (e.key === 'Escape') {
        if (virtualKeyboardOpen) { setVirtualKeyboardOpen(false); return }
        if (freeSearchOpen) { setFreeSearchOpen(false); setFreeSearchQuery(''); return }
        if (torrentSearchOpen) { setTorrentSearchOpen(false); return }
        if (searchOpen) { setSearchOpen(false); return }
        if (sidebarOpen) { setSidebarOpen(false); return }
        if (view !== 'browser') { goBack(); return }
      }
      
      if (e.key === 'Backspace') {
        if (virtualKeyboardOpen) {
          e.preventDefault()
          setVirtualKeyboardOpen(false)
          return
        }
        if (freeSearchOpen) { setFreeSearchOpen(false); setFreeSearchQuery(''); return }
        if (searchOpen) {
          if (!isTyping) { setSearchOpen(false); return }
          const el = e.target as HTMLInputElement
          if (el.value === '') { e.preventDefault(); setSearchOpen(false); return }
          return
        }
        if (torrentSearchOpen) { setTorrentSearchOpen(false); return }
        if (view === 'browser' || view === 'movies' || view === 'tv-shows' || view === 'sports') {
          e.preventDefault()
          savedFocusRef.current = e.target as HTMLElement
          setSidebarOpen((o) => !o)
          return
        }
        e.preventDefault()
        goBack()
        return
      }
      
      // 's' key opens search from any view (except when typing or search already open)
      if (e.key === 's' && !searchOpen && !sidebarOpen && !isTyping) {
        e.preventDefault()
        savedFocusRef.current = e.target as HTMLElement
        setSearchOpen(true)
        return
      }
      
      // Enter on text input - show virtual keyboard
      if (e.key === 'Enter' && isTyping && !virtualKeyboardOpen) {
        e.preventDefault()
        keyboardInputRef.current = e.target as HTMLElement
        savedFocusRef.current = e.target as HTMLElement
        setVirtualKeyboardOpen(true)
        return
      }

      // 'c' key - context menus
      if (e.key === 'c' && !isTyping && !contextTarget) {
        e.preventDefault()
        savedFocusRef.current = e.target as HTMLElement
        const media = useMediaStore.getState().selectedMedia
        if (media) {
          setContextTarget({
            type: media.mediaType || 'movie',
            tmdbId: media.id,
            title: media.title,
          })
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [view, searchOpen, sidebarOpen, torrentSearchOpen, freeSearchOpen, contextTarget, virtualKeyboardOpen, goBack])

  if (!tmdbApiKey) {
    return <Settings onClose={() => {}} initialOpen />
  }

  const isEpisode = selectedMedia?.mediaType === 'tv' && storeEpisode !== null

  return (
    <Layout>
      <Sidebar
        open={sidebarOpen}
        currentView={view === 'settings' ? 'settings' : view === 'movies' ? 'movies' : view === 'tv-shows' ? 'tv-shows' : view === 'sports' ? 'sports' : 'browser'}
        onNavigate={navigateSidebar}
        onSearch={() => setSearchOpen(true)}
        onClose={() => setSidebarOpen(false)}
        sportsEnabled={sportsEnabled}
      />
      {(view === 'browser' || view === 'movies' || view === 'tv-shows') && (
        <Browser
          key={view}
          mediaTypeFilter={genreType}
          onSelectMedia={() => navigate('detail')}
          onPlay={(resumePosition) => handlePlay(resumePosition)}
          onContextMenu={handleContextMenu}
        />
      )}
      {view === 'detail' && (
        <div className="animate-slide-right">
          <DetailView
            onBack={() => goBack()}
            onPlay={handlePlay}
            onPlayTrailer={handlePlayTrailer}
            onContextMenu={handleContextMenu}
          />
        </div>
      )}
      {view === 'player' && (
        <div className="animate-fade-up">
          <VideoPlayer
            streamUrl={streamUrl}
            streamError={streamError}
            mediaInfo={playerInfo}
            playerLoading={playerLoading}
            onStreamError={onStreamError}
            onBack={() => { autoPlayResultsRef.current = []; if (currentInfoHashRef.current) window.api.torrent.removeTorrent(currentInfoHashRef.current).catch(() => {}); currentInfoHashRef.current = null; setStreamUrl(undefined); setStreamError(null); setPlayerInfo(undefined); setPlayerLoading(false); goBack() }}
            onNextEpisode={handleNextEpisode}
          />
        </div>
      )}
      {view === 'settings' && (
        <div className="animate-fade">
          <Settings onClose={() => goBack()} />
        </div>
      )}
      {view === 'sports' && (
        <div className="animate-fade">
          <SportsPage onSearchTorrent={handleSportsTorrentSearch} />
        </div>
      )}
        {searchOpen && (
          <SearchModal
            onClose={() => setSearchOpen(false)}
            keyboardOpen={virtualKeyboardOpen}
            onSelect={(media) => {
              setSearchOpen(false)
              useMediaStore.getState().setSelectedMedia(media as any)
              navigate('detail')
            }}
            onFreeSearch={(query) => {
              setSearchOpen(false)
              setFreeSearchQuery(query)
              setFreeSearchOpen(true)
              runTorrentSearch({ title: query, type: 'movie' })
            }}
          />
        )}
      {contextTarget && (
        <ContextMenu
          target={contextTarget}
          onClose={() => setContextTarget(null)}
          onMarkWatched={handleMarkWatched}
          onMarkUnwatched={handleMarkUnwatched}
          onShowSources={handleShowSources}
        />
      )}
      {virtualKeyboardOpen && (
        <VirtualKeyboard inputElement={keyboardInputRef.current as HTMLInputElement | HTMLTextAreaElement | null} onClose={() => setVirtualKeyboardOpen(false)} />
      )}
        {freeSearchOpen && (
          <TorrentSearch
            title={freeSearchQuery}
            year={undefined}
            results={torrentResults}
            cachedMap={torrentCachedMap}
            loading={torrentSearching}
            onSelect={startPlayback}
            onClose={() => { setFreeSearchOpen(false); setFreeSearchQuery(''); setTorrentResults([]); setTorrentSearchOpen(false) }}
          />
        )}
    </Layout>
  )
}