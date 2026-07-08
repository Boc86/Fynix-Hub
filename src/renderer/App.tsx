import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Layout from './components/Layout/Layout'
import Browser from './components/Browser/Browser'
import DetailView from './components/DetailView/DetailView'
import VideoPlayer from './components/VideoPlayer/VideoPlayer'
import SearchModal from './components/SearchModal/SearchModal'
import Settings from './components/Settings/Settings'
import Sidebar from './components/Sidebar/Sidebar'

import ContextMenu from './components/ContextMenu/ContextMenu'
import TorrentSearch from './components/TorrentSearch/TorrentSearch'
import Sports from './components/Sports/Sports'
import LiveTV from './components/LiveTV/LiveTV'
import EPG from './components/EPG/EPG'
import ErrorBoundary from './components/ErrorBoundary'
import VirtualKeyboard from './components/VirtualKeyboard/VirtualKeyboard'
import ProfilePicker from './components/ProfilePicker/ProfilePicker'
import Prompt from './components/Prompt/Prompt'
import type { ContextTarget } from './components/ContextMenu/ContextMenu'
import type { NavView } from './components/Sidebar/Sidebar'
import type { TorrentResult, RivestreamResult } from './types.d'
import { useMediaStore } from './store/mediaStore'
import { useSettingsStore } from './store/settingsStore'

  type View = 'browser' | 'detail' | 'player' | 'settings' | 'movies' | 'tv-shows' | 'youtube' | 'free-search' | 'sports' | 'live-tv' | 'epg'

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
  const [torrentSearchTitle, setTorrentSearchTitle] = useState('')
  const [torrentSearchYear, setTorrentSearchYear] = useState<number | undefined>()
  const [freeSearchOpen, setFreeSearchOpen] = useState(false)
  const [freeSearchQuery, setFreeSearchQuery] = useState('')

  const [contextTarget, setContextTarget] = useState<ContextTarget | null>(null)
  const [virtualKeyboardOpen, setVirtualKeyboardOpen] = useState(false)
  const [addProfilePromptOpen, setAddProfilePromptOpen] = useState(false)
  const [torrentResults, setTorrentResults] = useState<TorrentResult[]>([])
  const [torrentCachedMap, setTorrentCachedMap] = useState<Record<string, string[]>>({})
  const [rivestreamResults, setRivestreamResults] = useState<RivestreamResult[]>([])
  const [torrentSearching, setTorrentSearching] = useState(false)
  const [streamUrl, setStreamUrl] = useState<string | undefined>()
  const [streamError, setStreamError] = useState<string | null>(null)
  const [playerInfo, setPlayerInfo] = useState<PlayerInfo | undefined>()
  const [playerLoading, setPlayerLoading] = useState(false)
  const [genreType, setGenreType] = useState<'movie' | 'tv' | undefined>()
  const autoPlayResultsRef = useRef<TorrentResult[]>([])
  const autoPlayIndexRef = useRef(0)
  const currentInfoHashRef = useRef<string | null>(null)
  const resumePositionRef = useRef<number | undefined>(undefined)
  const resumeDurationRef = useRef<number>(3600) // default 1h estimate
  const searchSessionRef = useRef(0)
  const searchInfoHashesRef = useRef<Set<string>>(new Set())
  const searchRunningRef = useRef(false)
  const torrentSearchOpenRef = useRef(false)
  const viewRef = useRef<View>('browser')
  const historyRef = useRef<View[]>([])
  const keyboardInputRef = useRef<HTMLElement | null>(null)
  const savedFocusRef = useRef<HTMLElement | null>(null)
  const prevModalCountRef = useRef(0)
  const { loadFromDisk, tmdbApiKey, profiles, activeProfileId, setActiveProfile, addProfile, traktConnected } = useSettingsStore()
  const goBackRef = useRef<() => void>(() => {})
  const playerInfoRef = useRef<PlayerInfo | undefined>(undefined)

  // Listen for Escape key from YouTube BrowserView to return focus
  useEffect(() => {
    goBackRef.current = goBack
  })

  useEffect(() => {
    return window.api.youtube.onFocusBack(() => {
      if (view === 'youtube') {
        goBackRef.current()
      }
    })
  }, [view])

  useEffect(() => {
    return window.api.embed.onHide(() => {
      window.api.embed.hide()
    })
  }, [])

  const accentColor = useSettingsStore((s) => s.accentColor)
  const preferredAudioLang = useSettingsStore((s) => s.preferredAudioLanguage)
  const preferredLangs = useSettingsStore((s) => s.preferredLanguages)

  function getAudioLang(): string | undefined {
    if (preferredAudioLang) return preferredAudioLang.toLowerCase()
    const langNameToCode: Record<string, string> = {
      english: 'eng', spanish: 'spa', french: 'fra', german: 'deu',
      italian: 'ita', portuguese: 'por', japanese: 'jpn', korean: 'kor',
      chinese: 'chi', russian: 'rus', hindi: 'hin', arabic: 'ara',
    }
    for (const l of preferredLangs) {
      const mapped = langNameToCode[l.toLowerCase()]
      if (mapped) return mapped
    }
    return undefined
  }
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accentColor)
    document.documentElement.style.setProperty('--accent-hover', accentColor + '80')
    const r = parseInt(accentColor.slice(1, 3), 16)
    const g = parseInt(accentColor.slice(3, 5), 16)
    const b = parseInt(accentColor.slice(5, 7), 16)
    document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`)
  }, [accentColor])

  useEffect(() => {
    const unsubscribe = window.api.onRemoteAction((action) => {
      if (action === 'home') {
        window.api.youtube.hide()
        setView('browser')
      } else if (action === 'back') {
        if (virtualKeyboardOpen) {
          setVirtualKeyboardOpen(false)
        } else if (freeSearchOpen) {
          setFreeSearchOpen(false); setFreeSearchQuery('')
        } else if (torrentSearchOpen) {
          setTorrentSearchOpen(false)
        } else if (searchOpen) {
          setSearchOpen(false)
        } else if (sidebarOpen) {
          setSidebarOpen(false)
        } else if (contextTarget) {
          setContextTarget(null)
        } else if (view === 'youtube') {
          return
        } else if (view === 'browser') {
          setSidebarOpen((prev) => !prev)
        } else {
          goBack()
        }
      } else if (action === 'search') {
        if (!searchOpen && !sidebarOpen) {
          savedFocusRef.current = document.activeElement as HTMLElement
          setSearchOpen(true)
        }
      } else if (action === 'contextMenu') {
        if (!contextTarget) {
          if (view === 'browser' || view === 'movies' || view === 'tv-shows') {
            const el = document.activeElement
            if (el) {
              el.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', bubbles: true }))
            }
          } else {
            savedFocusRef.current = document.activeElement as HTMLElement
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
      }
    })
    return unsubscribe
  }, [view, searchOpen, sidebarOpen, contextTarget])

  const DEBRID_SERVICES = useMemo(() => ['real-debrid', 'torbox', 'premiumize', 'alldebrid'], [])
  const [validDebridServices, setValidDebridServices] = useState<string[]>(DEBRID_SERVICES)
  useEffect(() => {
    window.api.debrid.checkAllAccountStatus().then((statuses: Record<string, { valid: boolean }>) => {
      const valid = DEBRID_SERVICES.filter(s => statuses[s]?.valid)
      window.api.log(`[Debrid] Account statuses: ${JSON.stringify(statuses)}`)
      window.api.log(`[Debrid] Valid services: ${valid.length > 0 ? valid.join(', ') : 'none, using all'}`)
      setValidDebridServices(valid.length > 0 ? valid : DEBRID_SERVICES)
    }).catch(() => { window.api.log('[Debrid] checkAllAccountStatus failed') })
  }, [])
  const selectedMedia = useMediaStore((s) => s.selectedMedia)
  const storeSeason = useMediaStore((s) => s.selectedSeason)
  const storeEpisode = useMediaStore((s) => s.selectedEpisode)
  const storeResume = useMediaStore((s) => s.resumeProgress)

  const fetchWatchedData = useCallback(async () => {
    const authStatus = await window.api.trakt.getAuthStatus()
    if (authStatus.authenticated) {
      const [watchedMovies, watchedShows] = await Promise.all([
        window.api.trakt.getWatchedMovies().catch(() => null),
        window.api.trakt.getWatchedShows().catch(() => null),
      ])

      if (watchedMovies || watchedShows) {
        const ids = new Set<number>()
        if (watchedMovies) watchedMovies.forEach((m: any) => { if (m.movie?.ids?.tmdb) ids.add(m.movie.ids.tmdb) })
        if (watchedShows) watchedShows.forEach((s: any) => { if (s.show?.ids?.tmdb) ids.add(s.show.ids.tmdb) })
        useMediaStore.getState().setTraktWatched(ids)

        const epMap = new Map<number, Map<number, Set<number>>>()
        if (watchedShows) {
          for (const s of watchedShows) {
            const tmdbId = s.show?.ids?.tmdb
            if (!tmdbId) continue
            const seasonsMap = new Map<number, Set<number>>()
            for (const season of (s.seasons || [])) {
              if (!season.number || season.number === 0) continue
              const epSet = new Set<number>()
              for (const ep of (season.episodes || [])) {
                if (ep.number && ep.number > 0) epSet.add(ep.number)
              }
              if (epSet.size > 0) seasonsMap.set(season.number, epSet)
            }
            if (seasonsMap.size > 0) epMap.set(tmdbId, seasonsMap)
          }
        }
        useMediaStore.getState().setEpisodeWatched(epMap)
      }
    }
  }, [])

  // Fetch watched data on initial mount (after settings are loaded)
  useEffect(() => {
    let cancelled = false
    async function init() {
      await loadFromDisk()
      if (cancelled) return
      await fetchWatchedData()
    }
    init()
    return () => { cancelled = true }
  }, [loadFromDisk, fetchWatchedData])

  // Re-fetch watched data when Trakt is newly connected after initial load
  const prevTraktRef = useRef(false)
  useEffect(() => {
    if (traktConnected && !prevTraktRef.current) {
      fetchWatchedData()
    }
    prevTraktRef.current = traktConnected
  }, [traktConnected, fetchWatchedData])

  // Keep resumePositionRef and resumeDurationRef in sync with playerInfo
  useEffect(() => {
    resumePositionRef.current = playerInfo?.resumePosition
    if (playerInfo?.resumePosition && playerInfo.resumePosition > 0) {
      const sm = useMediaStore.getState().selectedMedia
      const runtime = (sm as any)?.runtime
      if (playerInfo.mediaType === 'movie' && typeof runtime === 'number' && runtime > 0) {
        resumeDurationRef.current = runtime * 60 // minutes → seconds
      } else if (playerInfo.mediaType === 'tv') {
        resumeDurationRef.current = 1800 // 30 min default for TV
      } else {
        resumeDurationRef.current = 7200 // 2h fallback
      }
    }
  }, [playerInfo?.resumePosition])

  // Stop mpv and clean up torrent when leaving player view
  useEffect(() => {
    if (view !== 'player') {
      window.api.mpv.stop().catch(() => {})
      if (currentInfoHashRef.current) {
        window.api.torrent.removeTorrent(currentInfoHashRef.current).catch(() => {})
        currentInfoHashRef.current = null
      }
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

  // Keep refs in sync with state for useCallback guards (refs are always current)
  useEffect(() => { torrentSearchOpenRef.current = torrentSearchOpen }, [torrentSearchOpen])
  useEffect(() => { viewRef.current = view }, [view])
  useEffect(() => { playerInfoRef.current = playerInfo }, [playerInfo])

  const navigate = useCallback((v: View) => {
    if (v === 'youtube') {
      window.api.youtube.show()
    } else if (view === 'youtube') {
      // Hide YouTube BrowserView when navigating away from YouTube
      window.api.youtube.hide()
    }
    historyRef.current = [...historyRef.current, view]
    setView(v)
  }, [view])

  const goBack = useCallback(() => {
    const h = historyRef.current
    if (h.length > 0) {
      const prev = h[h.length - 1]
      historyRef.current = h.slice(0, -1)
      if (view === 'youtube') {
        window.api.youtube.hide()
      }
      setView(prev)
    } else {
      if (view === 'youtube') {
        window.api.youtube.hide()
      }
      setView('browser')
    }
  }, [view])

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
    query?: string
    tmdbId?: number
  }) => {
    // Re-entry guard: prevent concurrent searches
    if (searchRunningRef.current) {
      window.api.log('[App] runTorrentSearch blocked — search already running')
      return
    }
    searchRunningRef.current = true
    setTorrentSearching(true)
    setTorrentResults([])
    setTorrentCachedMap({})
    setRivestreamResults([])

    // Provider 1: public indexers + Vyla streams
    const searchPromise = window.api.torrent.search(query)
      .then(res => {
        const torrents = res.torrents || []
        const rive = res.rive || []
        setTorrentResults(torrents)
        setRivestreamResults(rive)
        window.api.writeDebugFile({
          phase: 'search-results',
          query,
          torrentCount: torrents.length,
          riveCount: rive.length,
          results: torrents.map((r: TorrentResult) => ({ title: r.title, infoHash: r.infoHash, indexer: r.indexer, seeders: r.seeders, magnetUri: r.magnetUri?.slice(0, 80) })),
        }).catch(() => {})
        return torrents
      })
      .catch(err => {
        console.error('[App] Public indexer search failed:', err)
        window.api.writeDebugFile({ phase: 'indexer-error', query, error: err?.message }).catch(() => {})
        setTorrentResults([])
        setRivestreamResults([])
        return []
      })

    let debridCachedMap: Record<string, string[]> = {}
    let perService: Record<string, number> = {}

    // Providers 2-N: debrid cache checks (run once indexers return hashes)
    const debridPromise = searchPromise.then(async (results) => {
      if (results.length === 0) { window.api.log('[Debrid] No results to check cache against'); return }
      const hashes: string[] = []
      const magnets: string[] = []
      for (const r of results) {
        if (r.infoHash) {
          hashes.push(r.infoHash)
          magnets.push(r.magnetUri || '')
        }
      }
      window.api.log(`[Debrid] Checking ${hashes.length} hashes across ${validDebridServices.length} service(s): ${validDebridServices.join(', ')}`)
      const cached: Record<string, string[]> = {}
      perService = {}
      await Promise.all(validDebridServices.map(async (svc) => {
        try {
          const status = await window.api.debrid.getStatus(svc)
          window.api.log(`[Debrid] ${svc} configured: ${status.configured}`)
          if (status.configured) {
            const batch = await window.api.debrid.checkCachedBatch(svc, hashes, magnets)
            const batchCount = Object.keys(batch).length
            let svcCached = 0
            for (const [hash, isCached] of Object.entries(batch)) {
              if (isCached === true || isCached === 'true') {
                const key = hash.toLowerCase()
                if (!cached[key]) cached[key] = []
                if (!cached[key].includes(svc)) cached[key].push(svc)
                svcCached++
              }
            }
            window.api.log(`[Debrid] ${svc}: batch returned ${batchCount} entries, ${svcCached} cached`)
            perService[svc] = svcCached
          }
        } catch (e: any) {
          window.api.log(`[Debrid] Cache check failed for ${svc}: ${e?.message || e}`)
          perService[svc] = -1
        }
      }))
      debridCachedMap = cached
      setTorrentCachedMap(cached)
      window.api.log(`[Debrid] Final cached map: ${Object.keys(cached).length} unique hashes`)
      window.api.writeDebugFile({
        phase: 'debrid-cache-check',
        query,
        perService,
        totalCached: Object.keys(cached).length,
      }).catch(() => {})
    })

    // Rivestream search is now integrated into torrent:search handler
    const rivestreamPromise = Promise.resolve([])

    // Fire debrid independently — don't block the UI
    debridPromise.catch(() => {})

    const [indexerResult] = await Promise.allSettled([searchPromise, rivestreamPromise])
    const finalResults = indexerResult.status === 'fulfilled' ? indexerResult.value : []
    searchRunningRef.current = false
    setTorrentSearching(false)
    window.api.writeDebugFile({
      phase: 'search-complete',
      query,
      resultCount: finalResults.length,
    }).catch(() => {})
  }, [DEBRID_SERVICES, validDebridServices])

  // Run torrent search whenever the modal opens. Read selectedMedia from the store
  // inside the effect (not as a dep) to avoid re-triggering the search when the
  // detail view finishes loading and updates selectedMedia while the modal is open.
  useEffect(() => {
    if (!torrentSearchOpen) return
    // Re-entry guard: if a search is already in-flight, don't start another
    if (searchRunningRef.current) {
      window.api.log('[App] search effect blocked — search already running')
      return
    }
    const media = useMediaStore.getState().selectedMedia
    if (!media) return
    const season = useMediaStore.getState().selectedSeason
    const episode = useMediaStore.getState().selectedEpisode
    const isEpisode = media.mediaType === 'tv' && episode !== null
    runTorrentSearch({
      title: media.title,
      year: media.releaseDate ? parseInt(media.releaseDate.slice(0, 4)) : undefined,
      type: isEpisode ? 'episode' : 'movie',
      season: isEpisode ? season : undefined,
      episode: isEpisode ? episode ?? undefined : undefined,
      tmdbId: media.id,
    })
  }, [torrentSearchOpen, runTorrentSearch])

  const playTorrent = useCallback(async (result: TorrentResult): Promise<string> => {
    window.api.log('[App] playTorrent called with:', result?.title, result?.infoHash?.slice(0, 16), 'magnet:', result?.magnetUri?.slice(0, 60))
    // Guard: reject results whose infoHash wasn't in the current search
    if (searchInfoHashesRef.current.size > 0 && !searchInfoHashesRef.current.has(result.infoHash.toLowerCase())) {
      const msg = `playTorrent rejected: ${result.infoHash.slice(0, 16)} not in current search (${searchInfoHashesRef.current.size} hashes)`
      window.api.log('[App]', msg)
      throw new Error(msg)
    }
    const localResult: any = await window.api.localCache.getUrl(result.infoHash)
    if (localResult?.url) {
      window.api.log('[App] Serving from local cache:', localResult.url)
      return localResult.url
    }

    const services = validDebridServices
    const checkResults = await Promise.allSettled(
      services.map(async (service: string) => {
        const cached = await window.api.debrid.checkCached(service, result.infoHash)
        return { service, cached: cached.cached }
      })
    )
    const cachedService = checkResults.find(
      (r): r is PromiseFulfilledResult<{ service: string; cached: boolean }> =>
        r.status === 'fulfilled' && r.value.cached
    )
    if (cachedService) {
      const { service } = cachedService.value
      window.api.log('[App]', service, 'has torrent cached, using it')
      const dl = await window.api.debrid.addAndWait(result.magnetUri, service)
      const url = typeof dl === 'string' ? dl : (dl.url || '')
      return url
    }

    const torrentResult = await window.api.torrent.addTorrent(result.magnetUri)
    const streamRes = await window.api.torrent.getStreamUrl(torrentResult.infoHash)
    return streamRes.url
  }, [])

  const startPlayback = useCallback(async (result: TorrentResult) => {
    window.api.log('[App] startPlayback', result.title, result.infoHash.slice(0, 16))
    autoPlayResultsRef.current = []
    autoPlayIndexRef.current = 0
    setTorrentSearchOpen(false)
    setFreeSearchOpen(false)
    setFreeSearchQuery('')
    setPlayerLoading(true)
    setStreamError(null)
    navigate('player')

    try {
      const audioLang = getAudioLang()
      const url = await playTorrent(result)
      window.api.log('[App] Stream URL:', url)
      currentInfoHashRef.current = result.infoHash
      const rp = resumePositionRef.current
      resumePositionRef.current = undefined
      if (rp && result.infoHash) {
        window.api.torrent.prioritizeResume(result.infoHash, rp, resumeDurationRef.current).catch(() => {})
      }
      await window.api.mpv.start(url, rp, accentColor, playerInfo?.mediaType === 'tv', audioLang, playerInfo)
      setPlayerLoading(false)
    } catch (err: any) {
      window.api.log('[App] Playback failed:', err.message)
      setStreamError(err?.message || 'Failed to start playback')
      setPlayerLoading(false)
    }
  }, [navigate, playTorrent, accentColor, playerInfo?.mediaType, preferredAudioLang, preferredLangs])

  const tryAutoPlayResult = useCallback(async (index: number, session?: number) => {
    // Stale-index guard: if refs were cleared but we're called with index > 0, abort
    if (autoPlayResultsRef.current.length === 0 && index > 0) {
      window.api.log(`[App] Auto-play stale index ${index}: refs cleared, aborting`)
      return
    }
    if (session !== undefined && session !== searchSessionRef.current) {
      window.api.log(`[App] Auto-play attempt ${index + 1} stale session ${session}, current ${searchSessionRef.current}, aborting`)
      return
    }
    const results = autoPlayResultsRef.current
    if (index >= results.length) {
      window.api.log(`[App] Auto-play exhausted ${index}/${results.length}, all failed`)
      setStreamError('All torrents failed to play. Try disabling auto-play in Settings.')
      setPlayerLoading(false)
      return
    }
    const result = results[index]
    autoPlayIndexRef.current = index
    window.api.log(`[App] Auto-play attempt ${index + 1}/${results.length}: ${result.title} (${result.infoHash.slice(0, 16)}) session=${searchSessionRef.current}`)
    try {
      const audioLang = getAudioLang()
      const url = await playTorrent(result)
      if (searchSessionRef.current !== (session ?? searchSessionRef.current)) {
        window.api.log('[App] Session changed during playTorrent, aborting auto-play')
        return
      }
      currentInfoHashRef.current = result.infoHash
      const rp = resumePositionRef.current
      resumePositionRef.current = undefined
      if (rp && result.infoHash) {
        window.api.torrent.prioritizeResume(result.infoHash, rp, resumeDurationRef.current).catch(() => {})
      }
      await window.api.mpv.start(url, rp, accentColor, playerInfo?.mediaType === 'tv', audioLang, playerInfo)
      setPlayerLoading(false)
    } catch (err: any) {
      window.api.log(`[App] Auto-play attempt ${index + 1} failed: ${err.message}`)
      tryAutoPlayResult(index + 1, session)
    }
  }, [playTorrent, accentColor, playerInfo?.mediaType, preferredAudioLang, preferredLangs])

  const handlePlayUrl = useCallback(async (url: string) => {
    try {
      await window.api.mpv.start(url, undefined, accentColor, false, undefined)
    } catch (err: any) {
      window.api.log('[App] Playback failed:', err.message)
      setStreamError(err?.message || 'Failed to start playback')
    }
  }, [accentColor])

  const handlePlayEmbed = useCallback((result: RivestreamResult) => {
    setTorrentSearchOpen(false)
    setFreeSearchOpen(false)
    setFreeSearchQuery('')
    window.api.embed.show(result.embedUrl)
  }, [])

  const handlePlay = useCallback(async (resumePosition?: number) => {
    // Guard: reject if a torrent search modal is already open or player is active
    if (torrentSearchOpenRef.current) {
      window.api.log('[App] handlePlay blocked — torrentSearchOpen already true')
      return
    }
    if (viewRef.current === 'player') {
      window.api.log('[App] handlePlay blocked — player already active')
      return
    }

    const selected = useMediaStore.getState().selectedMedia
    if (!selected) return
    const season = useMediaStore.getState().selectedSeason
    let episode = useMediaStore.getState().selectedEpisode
    if (selected.mediaType === 'tv' && episode === null) {
      episode = 1
    }

    // Always clear stale auto-play state before any new play
    autoPlayResultsRef.current = []
    autoPlayIndexRef.current = 0
    currentInfoHashRef.current = null
    searchInfoHashesRef.current = new Set()
    const session = ++searchSessionRef.current
    const caller = new Error().stack?.split('\n').slice(2, 4).map(l => l.trim()).join(' | ') || 'unknown'
    window.api.log(`[App] handlePlay session=${session} caller=${caller} autoPlayTorrent=`, selected.title, selected.id)

    setPlayerInfo({
      tmdbId: selected.id,
      mediaType: selected.mediaType || 'movie',
      season: episode ? season : undefined,
      episode: episode ?? undefined,
      resumePosition,
    })

    const { autoPlayTorrent, maxTorrentSize } = useSettingsStore.getState()
    if (!autoPlayTorrent) {
      window.api.log(`[App] handlePlay manual path, opening modal`)
      const isEpisode = selected.mediaType === 'tv' && episode !== null
      // Clear stale results so TorrentSearch mounts with empty data (not old results from a prior search)
      setTorrentResults([])
      setTorrentCachedMap({})
      setTorrentSearchTitle(isEpisode ? `${selected.title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}` : selected.title)
      setTorrentSearchYear(selected.releaseDate ? parseInt(selected.releaseDate.slice(0, 4)) : undefined)
      setTorrentSearchOpen(true)
      return
    }
    window.api.log(`[App] handlePlay auto-play path`)
    setPlayerLoading(true)
    setStreamUrl(undefined)
    setStreamError(null)
    navigate('player')

    try {
      const isEpisode = selected.mediaType === 'tv' && episode !== null
      const res = await window.api.torrent.search({
        title: selected.title,
        year: selected.releaseDate ? parseInt(selected.releaseDate.slice(0, 4)) : undefined,
        type: isEpisode ? 'episode' : 'movie',
        season: isEpisode ? season : undefined,
        episode: isEpisode ? (episode ?? undefined) : undefined,
        tmdbId: selected.id,
      })
      const results: TorrentResult[] = res.torrents || []

      if (results.length === 0) {
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

      // Track which infoHashes are valid for this search (for playTorrent guard)
      searchInfoHashesRef.current = new Set(filtered.map((r: TorrentResult) => r.infoHash.toLowerCase()))
      autoPlayResultsRef.current = filtered
      window.api.log(`[App] Auto-play session=${session} got ${filtered.length} results, hashes:`, filtered.map((r: TorrentResult) => `${r.title}=${r.infoHash.slice(0, 16)}`))

      // Try ALL Vyla sources sequentially before falling back to torrents.
      // Sources arrive as SSE events resolve (0–15s). Queue them and process
      // one at a time so a broken NoTorrent doesn't skip working StreamGuide.
      const pi = playerInfo
      const ac = accentColor
      const vylaQueue: RivestreamResult[] = []
      let vylaProcessing = false
      let vylaDone = false

      async function tryPlayVyla(result: RivestreamResult): Promise<void> {
        const audioLang = getAudioLang()
        const check = await window.api.mpv.verifyUrl(result.embedUrl)
        if (!check.ok) {
          throw new Error(`Vyla URL returned ${check.status} (${check.error || 'unreachable'})`)
        }
        await window.api.mpv.start(result.embedUrl, undefined, ac, pi?.mediaType === 'tv', audioLang, pi)
        // Poll for time-pos > 0 to confirm real playback
        for (let i = 0; i < 8; i++) {
          await new Promise(r => setTimeout(r, 500))
          const pos = await window.api.mpv.getTimePos().catch(() => 0)
          if (pos > 0) {
            const quality = await window.api.mpv.verifyPlaybackQuality()
            if (!quality.isRealContent) {
              await window.api.mpv.stop().catch(() => {})
              throw new Error(`Bot video detected: ${quality.reasons.join(', ')}`)
            }
            window.api.log(`[App] Vyla playback confirmed (pos=${pos}s)`)
            vylaDone = true
            setPlayerLoading(false)
            autoPlayResultsRef.current = []
            return
          }
        }
        await window.api.mpv.stop().catch(() => {})
        throw new Error('Vyla stream stuck (no progress)')
      }

      async function processVylaQueue(): Promise<void> {
        if (vylaProcessing || vylaQueue.length === 0 || vylaDone) return
        vylaProcessing = true
        while (vylaQueue.length > 0) {
          const r = vylaQueue.shift()!
          window.api.log(`[App] Trying Vyla source: ${r.title} (${vylaQueue.length} remaining)`)
          try {
            await tryPlayVyla(r)
            return
          } catch (err: any) {
            window.api.log(`[App] Vyla source failed: ${err.message}`)
            if (vylaDone) return
          }
        }
        vylaProcessing = false
        // Don't fall back yet — late sources may still arrive via SSE
        // The 15s timeout below handles the final fallback
      }

      const unsubRive = window.api.torrent.onRiveResult((result) => {
        if (searchSessionRef.current !== session) { unsubRive(); return }
        vylaQueue.push(result)
        processVylaQueue()
      })

      const vylaTimeout = setTimeout(() => {
        unsubRive()
        window.api.log(`[App] Vyla timeout (15s)`)
        if (!vylaProcessing && !vylaDone) {
          if (vylaQueue.length > 0) {
            processVylaQueue()
          } else {
            vylaDone = true
            tryAutoPlayResult(0, session)
          }
        } else if (vylaProcessing) {
          // A source is being polled — let it finish naturally
          // processVylaQueue will handle fallback when queue empties
        }
      }, 15000)
    } catch (err: any) {
      setStreamError(err?.message || 'Auto-play search failed')
      setPlayerLoading(false)
    }
  }, [navigate, playTorrent])

  const handlePlayerBack = useCallback(() => {
    const pi = playerInfoRef.current
    if (pi) {
      Promise.all([
        window.api.mpv.getTimePos().catch(() => 0),
        window.api.mpv.getDuration().catch(() => 0),
      ]).then(([pos, dur]) => {
        if (pos > 0 && dur > 0) {
          const p = pos / dur
          if (isFinite(p) && p > 0) {
            window.api.watch.updateProgress(pi.tmdbId, pi.mediaType, p, pi.season, pi.episode)
          }
        }
      })
      window.api.mpv.stop().catch(() => {})
    }
    autoPlayResultsRef.current = []
    if (currentInfoHashRef.current) {
      window.api.torrent.removeTorrent(currentInfoHashRef.current).catch(() => {})
    }
    currentInfoHashRef.current = null
    setStreamUrl(undefined)
    setStreamError(null)
    setPlayerInfo(undefined)
    setPlayerLoading(false)
    goBack()
  }, [])

  const handlePlayYouTubeVideo = useCallback(async (video: any) => {
    // Placeholder for the Webview approach
    // We will implement the BrowserView logic in the main process
    console.log('[App] Play YouTube Video (Webview):', video)
    navigate('youtube')
  }, [navigate])

  const handleContextMenu = useCallback((target: ContextTarget) => {
    setContextTarget(target)
  }, [])

  const handleResetProgress = useCallback(async (target: ContextTarget) => {
    try {
      const payload = target.type === 'movie'
        ? { movies: [{ ids: { tmdb: target.tmdbId } }] }
        : target.episode !== undefined
          ? { shows: [{ ids: { tmdb: target.tmdbId }, seasons: [{ season: target.season, episodes: [{ number: target.episode }] }] }] }
          : target.season !== undefined
            ? { shows: [{ ids: { tmdb: target.tmdbId }, seasons: [{ season: target.season }] }] }
            : { shows: [{ ids: { tmdb: target.tmdbId } }] }
      await window.api.trakt.markUnwatched(payload)
      await window.api.watch.updateProgress(target.tmdbId, target.type, 0, target.season, target.episode)
    } catch { /* ignore */ }
    useMediaStore.getState().triggerRefresh()
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
    useMediaStore.getState().triggerRefresh()
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
    useMediaStore.getState().triggerRefresh()
  }, [])

  const handleShowSources = useCallback(async (target: ContextTarget) => {
    if (target.type === 'episode') {
      setTorrentSearchTitle(`${target.title} S${String(target.season).padStart(2, '0')}E${String(target.episode).padStart(2, '0')}`)
      setTorrentSearchYear(undefined)
      await runTorrentSearch({
        title: `${target.title} S${String(target.season).padStart(2, '0')}E${String(target.episode).padStart(2, '0')}`,
        type: 'episode',
        season: target.season,
        episode: target.episode,
      })
    } else {
      setTorrentSearchTitle(target.title)
      setTorrentSearchYear(undefined)
      await runTorrentSearch({
        title: target.title,
        type: 'movie',
      })
    }
    setTorrentSearchOpen(true)
  }, [runTorrentSearch])

  const handleDropShow = useCallback(async (target: ContextTarget) => {
    try {
      await window.api.trakt.markUnwatched({ shows: [{ ids: { tmdb: target.tmdbId } }] })
    } catch { /* ignore */ }
    useMediaStore.getState().triggerRefresh()
  }, [])


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
        tryAutoPlayResult(nextIdx, searchSessionRef.current)
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
        resumePositionRef.current = undefined
        setPlayerInfo((prev) => prev ? { ...prev, episode: nextEp, resumePosition: undefined } : undefined)
        handlePlay()
        return
      }
    }
    navigate('detail')
  }, [navigate, handlePlay])

  // When mpv exits (killed by user), clean up immediately
  useEffect(() => {
    const unsub = window.api.mpv.onExited(() => {
      console.log('[App] mpv exited, cleaning up')
      autoPlayResultsRef.current = []
      autoPlayIndexRef.current = 0
      if (currentInfoHashRef.current) {
        window.api.torrent.removeTorrent(currentInfoHashRef.current).catch(() => {})
        currentInfoHashRef.current = null
      }
    })
    return unsub
  }, [])

  // Global keyboard handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Disable Fynix keyboard handler when YouTube BrowserView is active
      // BrowserView handles its own keyboard navigation
      if (view === 'youtube') return
      
      const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)
      
      if (e.key === 'Escape') {
        if (virtualKeyboardOpen) { setVirtualKeyboardOpen(false); return }
        if (freeSearchOpen) { setFreeSearchOpen(false); setFreeSearchQuery(''); return }
        if (torrentSearchOpen) { setTorrentSearchOpen(false); return }
        if (searchOpen) { setSearchOpen(false); return }
        if (sidebarOpen) { setSidebarOpen(false); return }
        if (view === 'sports' || view === 'live-tv' || view === 'epg') return
        if (view === 'player') { handlePlayerBack(); return }
        if (view !== 'browser') { goBack(); return }
      }
      
      if (e.key === 'Backspace') {
        if (isTyping) return
        if (view === 'sports' || view === 'live-tv' || view === 'epg') return
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
        if (view === 'browser' || view === 'movies' || view === 'tv-shows') {
          e.preventDefault()
          savedFocusRef.current = e.target as HTMLElement
          setSidebarOpen((o) => !o)
          return
        }
        if (view === 'player') { e.preventDefault(); handlePlayerBack(); return }
        e.preventDefault()
        goBack()
        return
      }
      
      // 's' key opens search from any view (except when typing or search already open)
      if ((e.key === 's' || e.code === 'KeyS') && !searchOpen && !sidebarOpen && !isTyping) {
        e.preventDefault()
        savedFocusRef.current = e.target as HTMLElement
        setSearchOpen(true)
        return
      }
      
      // Enter on text input - show virtual keyboard
  if (e.key === 'Enter' && isTyping && !virtualKeyboardOpen && (e.target as HTMLElement).tagName !== 'SELECT') {
    e.preventDefault()
    keyboardInputRef.current = e.target as HTMLInputElement
    savedFocusRef.current = e.target as HTMLElement
    setVirtualKeyboardOpen(true)
  }
      
      // 'c' key - context menus
      if ((e.key === 'c' || e.code === 'KeyC' || e.code === 'ContextMenu') && !isTyping && !contextTarget) {
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

  // --- Profile Logic (must be before any early returns — Rules of Hooks) ---
  const handleProfileSelect = useCallback(async (profile: any) => {
    await setActiveProfile(profile.id)
    useMediaStore.getState().setSelectedMedia(null)
    const hasApiKey = !!useSettingsStore.getState().tmdbApiKey
    setView(hasApiKey ? 'browser' : 'settings')
  }, [setActiveProfile])

  const handleAddProfile = useCallback(() => {
    setAddProfilePromptOpen(true)
  }, [])

  const handleConfirmAddProfile = useCallback((name: string) => {
    addProfile(name)
    setAddProfilePromptOpen(false)
  }, [addProfile])

  const handleCancelAddProfile = useCallback(() => {
    setAddProfilePromptOpen(false)
  }, [])

  const showProfileSplash = !activeProfileId || profiles.length === 0
  // --- /Profile Logic ---

  if (showProfileSplash) {
    return (
      <>
        <ProfilePicker
          profiles={profiles}
          onSelect={handleProfileSelect}
          onAdd={handleAddProfile}
        />
        {addProfilePromptOpen && (
          <Prompt
            title="Add Profile"
            placeholder="Profile name"
            confirmLabel="Create"
            onConfirm={handleConfirmAddProfile}
            onCancel={handleCancelAddProfile}
          />
        )}
      </>
    )
  }

  const isEpisode = selectedMedia?.mediaType === 'tv' && storeEpisode !== null

  return (
    <Layout>
      <Sidebar
        open={sidebarOpen}
        currentView={view === 'sports' ? 'sports' : view === 'live-tv' ? 'live-tv' : view === 'epg' ? 'epg' : view === 'settings' ? 'settings' : view === 'movies' ? 'movies' : view === 'tv-shows' ? 'tv-shows' : view === 'youtube' ? 'youtube' : 'browser'}
        onNavigate={navigateSidebar}
        onSearch={() => setSearchOpen(true)}
        onClose={() => setSidebarOpen(false)}
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
            key={selectedMedia?.id}
            onBack={() => goBack()}
            onPlay={handlePlay}
            onPlayTrailer={() => {}}
            onContextMenu={handleContextMenu}
          />
        </div>
      )}
      {view === 'player' && (
        <VideoPlayer
          streamUrl={streamUrl}
          streamError={streamError}
          mediaInfo={playerInfo}
          playerLoading={playerLoading}
          onStreamError={onStreamError}
          onBack={handlePlayerBack}
          onNextEpisode={handleNextEpisode}
        />
      )}
      {view === 'settings' && (
        <div className="animate-fade">
          <Settings onClose={() => goBack()} />
        </div>
      )}
      {view === 'sports' && (
        <div className="animate-fade">
          <ErrorBoundary fallback={<div style={{ padding: 24, color: '#fff' }}>Sports view failed to load. Check console for details.</div>}>
            <Sports
            onPlay={(title, year) => {
              setTorrentSearchTitle(title)
              setTorrentSearchYear(year)
              setTorrentSearchOpen(true)
              runTorrentSearch({ query: title, title, year, type: 'movie' })
            }}
            onPlayUrl={async (url) => {
              setTorrentSearchOpen(false)
              setFreeSearchOpen(false)
              setFreeSearchQuery('')
              setPlayerLoading(true)
              setStreamError(null)
              navigate('player')
              try {
                currentInfoHashRef.current = null
                resumePositionRef.current = undefined
                const audioLang = getAudioLang()
                await window.api.mpv.start(url, undefined, accentColor, false, audioLang, undefined, 'https://dami-tv.pro/')
                setPlayerLoading(false)
              } catch (err: any) {
                window.api.log('[App] Replay playback failed:', err.message)
                setStreamError(err?.message || 'Failed to start replay')
                setPlayerLoading(false)
              }
            }}
            onBack={() => goBack()}
          />
          </ErrorBoundary>
        </div>
      )}
      {view === 'live-tv' && (
        <div className="animate-fade">
          <LiveTV
            onPlayUrl={async (url) => {
              setTorrentSearchOpen(false)
              setFreeSearchOpen(false)
              setFreeSearchQuery('')
              setPlayerLoading(true)
              setStreamError(null)
              navigate('player')
              try {
                currentInfoHashRef.current = null
                resumePositionRef.current = undefined
                const audioLang = getAudioLang()
                await window.api.mpv.start(url, undefined, accentColor, false, audioLang, undefined, 'https://dami-tv.pro/')
                setPlayerLoading(false)
              } catch (err: any) {
                window.api.log('[App] LiveTV playback failed:', err.message)
                setStreamError(err?.message || 'Failed to start live TV')
                setPlayerLoading(false)
              }
            }}
            onBack={() => goBack()}
          />
        </div>
      )}
      {view === 'youtube' && (
        <div className="animate-fade" style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
      )}
        {searchOpen && (
          <SearchModal
            onClose={() => setSearchOpen(false)}
            keyboardOpen={virtualKeyboardOpen}
            onSelect={async (media) => {
              setSearchOpen(false)
              try {
                const detail = await window.api.tmdb.getDetails(media.mediaType, media.id)
                useMediaStore.getState().setSelectedMedia(detail)
              } catch {
                useMediaStore.getState().setSelectedMedia(media as any)
              }
              navigate('detail')
            }}
            onFreeSearch={(query) => {
              setSearchOpen(false)
              setFreeSearchQuery(query)
              setFreeSearchOpen(true)
              runTorrentSearch({ title: query, type: 'movie' })
            }}
            onTorrentSelect={(torrent) => {
              setSearchOpen(false)
              startPlayback(torrent)
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
          onResetProgress={handleResetProgress}
          onDropShow={handleDropShow}
        />
      )}
      {virtualKeyboardOpen && (
        <VirtualKeyboard inputElement={keyboardInputRef.current as HTMLInputElement | HTMLTextAreaElement | null} onClose={() => setVirtualKeyboardOpen(false)} />
      )}
        {torrentSearchOpen && (
          <TorrentSearch
            title={torrentSearchTitle}
            year={torrentSearchYear}
            results={torrentResults}
            cachedMap={torrentCachedMap}
            loading={torrentSearching}
            rivestreamResults={rivestreamResults}
            onSelect={startPlayback}
            onSelectRivestream={handlePlayEmbed}
            onClose={() => { window.api.log('[App] TorrentSearch onClose triggered'); setTorrentSearchOpen(false); setTorrentSearchTitle(''); setTorrentSearchYear(undefined); setTorrentResults([]); setTorrentCachedMap({}); setRivestreamResults([]) }}
          />
        )}
        {freeSearchOpen && (
          <TorrentSearch
            title={freeSearchQuery}
            year={undefined}
            results={torrentResults}
            cachedMap={torrentCachedMap}
            loading={torrentSearching}
            onSelect={startPlayback}
            onClose={() => { setFreeSearchOpen(false); setFreeSearchQuery(''); setTorrentResults([]); setTorrentCachedMap({}); setTorrentSearchOpen(false) }}
          />
        )}
    </Layout>
  )
}