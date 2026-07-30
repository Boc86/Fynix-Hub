import React, {
  forwardRef, useEffect, useImperativeHandle, useRef, useState, useCallback,
} from 'react'
import { createPlayer } from '@videojs/react'
import { videoFeatures } from '@videojs/react/video'
import { HlsJsVideo } from '@videojs/react/media/hlsjs-video'
import { Container, useMedia } from '@videojs/react'
import styles from './VideoPlayer.module.css'
import Hls from 'hls.js'

// ─── Stub Google Cast to prevent Cast SDK script load in Electron ────────────
if (!(globalThis as any).chrome?.cast) {
  ;(globalThis as any).chrome = {
    ...(globalThis as any).chrome,
    cast: {},
  }
}

// ─── Create typed player (exclude remotePlayback to avoid Cast SDK load) ─────
const Player = createPlayer({
  features: videoFeatures.filter(
    (f: any) => f?.name !== 'remotePlayback',
  ),
})

// ─── Public handle ───────────────────────────────────────────────────────────
export interface VideoJsPlayerHandle {
  getPosition: () => number
  getDuration: () => number
  seek: (time: number) => void
  pause: () => void
  play: () => Promise<void>
  isPaused: () => boolean
  addSubtitle: (url: string, label: string, language?: string) => void
}

// ─── Props ───────────────────────────────────────────────────────────────────
interface VideoJsPlayerProps {
  src: string
  startTime?: number
  audioLanguage?: string
  poster?: string
  title?: string
  clearlogoUrl?: string | null
  fallbackDuration?: number // TMDB duration in seconds
  onBack?: () => void
  mediaInfo?: { tmdbId: number; mediaType: string; season?: number; episode?: number }
  onTimeUpdate?: (currentTime: number) => void
  onDurationChange?: (duration: number) => void
  onEnded?: () => void
  /** Whether to resume from saved position (false = start from beginning) */
  shouldResume?: boolean
  onPlay?: () => void
  onPause?: () => void
    onCanPlay?: () => void
    onError?: (error: MediaError | Error) => void
    audioTracks?: { index: number; language: string; title: string; codec: string; channels: number; isDefault: boolean }[]
    isRemux?: boolean
    onAudioTrackSelect?: (trackIndex: number) => void
  }

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatSeekDelta(sec: number): string {
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h`
  if (sec >= 60) return `${Math.floor(sec / 60)}m`
  return `${sec}s`
}

function getAudioTracks(video: HTMLVideoElement): { index: number; label: string; language: string; enabled: boolean }[] {
  const tracks = (video as any).audioTracks as any
  if (!tracks) return []
  const result: { index: number; label: string; language: string; enabled: boolean }[] = []
  for (let i = 0; i < tracks.length; i++) {
    result.push({
      index: i,
      label: tracks[i].label || tracks[i].language || `Track ${i + 1}`,
      language: tracks[i].language || '',
      enabled: tracks[i].enabled,
    })
  }
  return result
}

function getSubtitleTracks(video: HTMLVideoElement): { index: number; label: string; language: string; mode: string }[] {
  const tracks = video.textTracks
  const result: { index: number; label: string; language: string; mode: string }[] = []
  for (let i = 0; i < tracks.length; i++) {
    if (tracks[i].kind === 'subtitles' || tracks[i].kind === 'captions') {
      result.push({
        index: i,
        label: tracks[i].label || tracks[i].language || `Track ${i + 1}`,
        language: tracks[i].language || '',
        mode: tracks[i].mode,
      })
    }
  }
  return result
}

// ─── Seek step escalation ────────────────────────────────────────────────────
const SEEK_STEPS = [10, 30, 60, 300, 600, 1200, 1800, 3600] // 10s, 30s, 1m, 5m, 10m, 20m, 30m, 60m
const SEEK_STEP_TIMEOUT = 1500 // ms — reset step index after this

// ─── Aspect ratios ───────────────────────────────────────────────────────────
const ASPECT_RATIOS = ['Default', '16:9', '4:3', '21:9', '1:1', 'Fill'] as const
type AspectRatio = typeof ASPECT_RATIOS[number]

function getAspectCss(ar: AspectRatio): string {
  switch (ar) {
    case '16:9': return '16 / 9'
    case '4:3': return '4 / 3'
    case '21:9': return '21 / 9'
    case '1:1': return '1 / 1'
    case 'Fill': return 'unset'
    default: return 'unset'
  }
}

// ─── OSD button definitions ──────────────────────────────────────────────────
// Row 0 = scrub bar, Row 1 = buttons
// Button indices: 0=rewind, 1=play/pause, 2=forward, 3=audio, 4=subs, 5=aspect
const BUTTON_COUNT = 6

// ─── SVG Icons ───────────────────────────────────────────────────────────────
const BackIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
)

const PlayIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="6 3 20 12 6 21" />
  </svg>
)

const PauseIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="5" y="3" width="4" height="18" />
    <rect x="15" y="3" width="4" height="18" />
  </svg>
)

const RewindIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="11 19 2 12 11 5" />
    <polygon points="22 19 13 12 22 5" />
  </svg>
)

const ForwardIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="2 5 11 12 2 19" />
    <polygon points="13 5 22 12 13 19" />
  </svg>
)

const VolumeIcon = ({ muted }: { muted: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19" fill="currentColor" />
    {muted ? (
      <>
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </>
    ) : (
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    )}
  </svg>
)

const FullscreenIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </svg>
)

const SubtitleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M7 12h10M7 8h6" />
  </svg>
)

const AudioIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
)

const AspectIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <line x1="2" y1="4" x2="2" y2="20" />
    <line x1="22" y1="4" x2="22" y2="20" />
  </svg>
)

// ─── OSD auto-hide ───────────────────────────────────────────────────────────
const OSD_HIDE_DELAY = 5000 // 5s when OSD is open (longer than before for navigation)

// ─── Inner helper: capture hls.js engine and force startLoad(0) ───────────
// Fixed outside forwardRef to avoid re-creating on every render.
function HlsStartFix({
  shouldResume,
  onEngine,
}: {
  shouldResume: boolean
  onEngine: (engine: any) => void
}) {
  const media = useMedia()
  const engine = (media as any)?.engine ?? null

  useEffect(() => {
    if (!engine) return
    onEngine(engine)
    if (shouldResume) return

    // Call startLoad(0) immediately to override the preload mixin's startLoad(-1)
    // that triggers live-edge logic for EVENT-type playlists.
    console.log('[VideoJsPlayer] HLS engine ready, forcing startLoad(0)')
    engine.startLoad(0)

    // Also listen for subsequent re-loads (e.g. on audio track switch).
    const onManifestLoaded = () => {
      console.log('[VideoJsPlayer] HLS manifest re-loaded, forcing startLoad(0)')
      engine.startLoad(0)
    }
    engine.on(Hls.Events.MANIFEST_LOADED, onManifestLoaded)
    return () => {
      engine.off(Hls.Events.MANIFEST_LOADED, onManifestLoaded)
    }
  }, [engine, shouldResume, onEngine])

  return null
}

// ─── Component ───────────────────────────────────────────────────────────────
export const VideoJsPlayer = forwardRef<VideoJsPlayerHandle, VideoJsPlayerProps>(
  function VideoJsPlayer(
    {
      src,
      startTime = 0,
      audioLanguage,
      poster,
      title,
      clearlogoUrl,
      fallbackDuration = 0,
      onBack,
      mediaInfo,
      onTimeUpdate,
      onDurationChange,
      onEnded,
      shouldResume = false,
      onPlay,
      onPause,
      onCanPlay,
      onError,
      audioTracks: probedAudioTracks,
      isRemux = false,
      onAudioTrackSelect,
    },
    forwardedRef
  ) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const hlsEngineRef = useRef<any>(null)
    const handleEngine = useCallback((engine: any) => {
      hlsEngineRef.current = engine
    }, [])

    // ── Debug: log src changes and video element events ─────
    useEffect(() => {
      console.log('[VideoJsPlayer] src changed:', src?.slice(0, 120))
    }, [src])

    // ── Fetch chapters when src changes ──────────────────────────────
    useEffect(() => {
      setChapters([])
      if (!src) return
      window.api.player.getChapters().then((ch) => {
        if (ch && ch.length > 0) {
          console.log('[VideoJsPlayer] Loaded', ch.length, 'chapters')
          setChapters(ch)
        }
      }).catch(() => {})
    }, [src])

    useEffect(() => {
      const v = videoRef.current
      if (!v) return
      const logEvent = (name: string) => () => console.log(`[VideoJsPlayer] ${name}`)
      const logError = () => {
        const err = v.error
        console.error('[VideoJsPlayer] video error:', {
          code: err?.code,
          message: err?.message,
          src: v.currentSrc?.slice(0, 120),
          readyState: v.readyState,
          networkState: v.networkState,
          paused: v.paused,
          error: err ? { MEDIA_ERR_ABORTED: 1, MEDIA_ERR_NETWORK: 2, MEDIA_ERR_DECODE: 3, MEDIA_ERR_SRC_NOT_SUPPORTED: 4 }[err.code] : null,
        })
      }
      // Detect dead stream: poll every 2s, surface error if no playback after 8s
      let hasPlayed = false
      let elapsed = 0
      const pollTimer = setInterval(() => {
        if (hasPlayed) return
        if (v.readyState >= 3 || !v.paused) { hasPlayed = true; return }
        elapsed += 2000
        if (elapsed >= 8000) {
          clearInterval(pollTimer)
          console.warn('[VideoJsPlayer] stream failed to start after 8s — likely dead or unreachable')
          onError?.(new Error('The stream is not responding — the source may be down') as any)
        }
      }, 2000)
      v.addEventListener('play', () => { hasPlayed = true })
      v.addEventListener('playing', () => { hasPlayed = true; clearInterval(pollTimer) })
      v.addEventListener('error', logError)
      return () => {
        clearInterval(pollTimer)
        v.removeEventListener('error', logError)
      }
    }, [onError])
    // ── OSD state ──────────────────────────────────────────────────────
    const [osdOpen, setOsdOpen] = useState(false)
    const [osdRow, setOsdRow] = useState(0) // 0 = scrub bar, 1 = buttons
    const [osdButtonIndex, setOsdButtonIndex] = useState(1) // start on play/pause
    const osdTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    // Video state
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [isPaused, setIsPaused] = useState(false)
    const [isMuted, setIsMuted] = useState(false)
    const [volume, setVolume] = useState(1)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [buffered, setBuffered] = useState(0)

    // Track state
    const [videoElementTracks, setVideoElementTracks] = useState<{ index: number; label: string; language: string; enabled: boolean }[]>([])
    const [displayAudioTracks, setDisplayAudioTracks] = useState<{ index: number; label: string; language: string; enabled: boolean }[]>([])
    const [activeAudioTrack, setActiveAudioTrack] = useState(0)
    const [subtitleTracks, setSubtitleTracks] = useState<{ index: number; label: string; language: string; mode: string }[]>([])
    const [activeSubtitleTrack, setActiveSubtitleTrack] = useState(-1)
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('Default')
    const [chapters, setChapters] = useState<{ startTime: number; endTime: number; title: string }[]>([])
    const [audioMenuOpen, setAudioMenuOpen] = useState(false)
    const [subtitleMenuOpen, setSubtitleMenuOpen] = useState(false)
    const [aspectMenuOpen, setAspectMenuOpen] = useState(false)
    const audioMenuRef = useRef<HTMLDivElement>(null)
    const subtitleMenuRef = useRef<HTMLDivElement>(null)
    const aspectMenuRef = useRef<HTMLDivElement>(null)

    // Seek escalation
    const seekStepRef = useRef(0)
    const seekStepTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const seekDirectionRef = useRef<1 | -1>(1)

    // OSD feedback message
    const [osdMessage, setOsdMessage] = useState<string | null>(null)
    const osdMessageTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    // Scrub bar drag state
    const scrubRef = useRef<HTMLDivElement>(null)
    const [isSeeking, setIsSeeking] = useState(false)

    // ── Show temporary OSD message ─────────────────────────────────────
    const showOsdMessage = useCallback((msg: string) => {
      setOsdMessage(msg)
      clearTimeout(osdMessageTimerRef.current)
      osdMessageTimerRef.current = setTimeout(() => setOsdMessage(null), 1500)
    }, [])

    // ── OSD open/close ─────────────────────────────────────────────────
    const openOsd = useCallback(() => {
      setOsdOpen(true)
      clearTimeout(osdTimerRef.current)
      osdTimerRef.current = setTimeout(() => setOsdOpen(false), OSD_HIDE_DELAY)
    }, [])

    const closeOsd = useCallback(() => {
      setOsdOpen(false)
      clearTimeout(osdTimerRef.current)
      setAudioMenuOpen(false)
      setSubtitleMenuOpen(false)
      setAspectMenuOpen(false)
    }, [])

    const toggleOsd = useCallback(() => {
      if (osdOpen) closeOsd()
      else openOsd()
    }, [osdOpen, openOsd, closeOsd])

    // Reset OSD timer when navigating
    const resetOsdTimer = useCallback(() => {
      clearTimeout(osdTimerRef.current)
      osdTimerRef.current = setTimeout(() => setOsdOpen(false), OSD_HIDE_DELAY)
    }, [])

    // Show center icon briefly
    const [showCenterIcon, setShowCenterIcon] = useState<'play' | 'pause' | null>(null)
    const centerTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const flashCenterIcon = useCallback((type: 'play' | 'pause') => {
      setShowCenterIcon(type)
      clearTimeout(centerTimerRef.current)
      centerTimerRef.current = setTimeout(() => setShowCenterIcon(null), 600)
    }, [])

    // ── Play/pause ─────────────────────────────────────────────────────
    const togglePlayPause = useCallback(() => {
      const v = videoRef.current
      if (!v) return
      if (v.paused) v.play()
      else v.pause()
    }, [])

    const handlePlayInternal = useCallback(() => {
      setIsPaused(false)
      flashCenterIcon('play')
      onPlay?.()
    }, [flashCenterIcon, onPlay])

    const handlePauseInternal = useCallback(() => {
      setIsPaused(true)
      flashCenterIcon('pause')
      onPause?.()
    }, [flashCenterIcon, onPause])

    // ── Time update ────────────────────────────────────────────────────
    const handleTimeUpdateInternal = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
      const v = e.currentTarget
      setCurrentTime(v.currentTime)
      if (v.buffered.length > 0) {
        setBuffered(v.buffered.end(v.buffered.length - 1))
      }
      onTimeUpdate?.(v.currentTime)
    }, [onTimeUpdate])

    const handleDurationChange = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
      setDuration(e.currentTarget.duration)
      onDurationChange?.(e.currentTarget.duration)
    }, [onDurationChange])

    // ── Volume ─────────────────────────────────────────────────────────
    const adjustVolume = useCallback((delta: number) => {
      const v = videoRef.current
      if (!v) return
      const newVol = Math.max(0, Math.min(1, v.volume + delta))
      v.volume = newVol
      v.muted = newVol === 0
      setVolume(newVol)
      setIsMuted(v.muted)
      showOsdMessage(`Volume: ${Math.round(newVol * 100)}%`)
    }, [showOsdMessage])

    const toggleMute = useCallback(() => {
      const v = videoRef.current
      if (!v) return
      v.muted = !v.muted
      setIsMuted(v.muted)
      showOsdMessage(v.muted ? 'Muted' : `Volume: ${Math.round(v.volume * 100)}%`)
    }, [showOsdMessage])

    // ── Seek ───────────────────────────────────────────────────────────
    const seekDelta = useCallback((delta: number) => {
      const v = videoRef.current
      if (!v) return
      v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + delta))
      showOsdMessage(`${delta > 0 ? '+' : ''}${formatSeekDelta(delta)}`)
    }, [showOsdMessage])

    const seekToPercent = useCallback((pct: number) => {
      const v = videoRef.current
      if (!v || !isFinite(v.duration)) return
      v.currentTime = (pct / 100) * v.duration
    }, [])

    // ── Chapter skip ──────────────────────────────────────────────────
    const CHAPTER_BOUNDARY_THRESHOLD = 5 // seconds — if within this of a boundary, skip chapter

    /**
     * Try to skip to the next chapter. Returns true if a chapter skip was performed.
     * Only skips if current position is within CHAPTER_BOUNDARY_THRESHOLD of a chapter end.
     */
    const skipToNextChapter = useCallback(() => {
      if (chapters.length === 0) return false
      const v = videoRef.current
      if (!v) return false
      const t = v.currentTime
      // Find the chapter we're currently in (or the nearest one ahead)
      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i]
        // If we're within threshold of this chapter's end, skip to next chapter start
        if (Math.abs(t - ch.endTime) < CHAPTER_BOUNDARY_THRESHOLD) {
          const nextIdx = i + 1
          if (nextIdx < chapters.length) {
            v.currentTime = chapters[nextIdx].startTime
            const nextCh = chapters[nextIdx]
            showOsdMessage(nextCh.title || `Chapter ${nextIdx + 1}`)
          }
          return true
        }
      }
      return false
    }, [chapters, showOsdMessage])

    /**
     * Try to skip to the previous chapter. Returns true if a chapter skip was performed.
     * Only skips if current position is within CHAPTER_BOUNDARY_THRESHOLD of a chapter start.
     */
    const skipToPrevChapter = useCallback(() => {
      if (chapters.length === 0) return false
      const v = videoRef.current
      if (!v) return false
      const t = v.currentTime
      // Find the chapter we're currently in
      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i]
        // If we're within threshold of this chapter's start, skip to previous chapter start
        if (Math.abs(t - ch.startTime) < CHAPTER_BOUNDARY_THRESHOLD) {
          const prevIdx = i - 1
          if (prevIdx >= 0) {
            v.currentTime = chapters[prevIdx].startTime
            const prevCh = chapters[prevIdx]
            showOsdMessage(prevCh.title || `Chapter ${prevIdx + 1}`)
          }
          return true
        }
      }
      return false
    }, [chapters, showOsdMessage])

    // ── Playback speed ────────────────────────────────────────────────
    const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]
    const [playbackSpeed, setPlaybackSpeed] = useState(1)

    const adjustSpeed = useCallback((direction: 1 | -1) => {
      const v = videoRef.current
      if (!v) return
      const idx = SPEEDS.findIndex(s => s === v.playbackRate)
      const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (idx === -1 ? 2 : idx) + direction))]
      v.playbackRate = next
      setPlaybackSpeed(next)
      showOsdMessage(`Speed: ${next}x`)
    }, [showOsdMessage])

    // ── Fullscreen ─────────────────────────────────────────────────────
    const toggleFullscreen = useCallback(() => {
      const el = containerRef.current
      if (!el) return
      if (document.fullscreenElement) document.exitFullscreen()
      else el.requestFullscreen()
    }, [])

    useEffect(() => {
      const onChange = () => setIsFullscreen(!!document.fullscreenElement)
      document.addEventListener('fullscreenchange', onChange)
      return () => document.removeEventListener('fullscreenchange', onChange)
    }, [])

    // ── Track refresh ─────────────────────────────────────────────────
    const refreshTracks = useCallback(() => {
      const v = videoRef.current
      if (!v) return
      setVideoElementTracks(getAudioTracks(v))
      setSubtitleTracks(getSubtitleTracks(v))
      const at = getAudioTracks(v)
      const activeA = at.findIndex(t => t.enabled)
      if (activeA >= 0) setActiveAudioTrack(activeA)
      const st = getSubtitleTracks(v)
      const activeS = st.findIndex(t => t.mode === 'showing')
      setActiveSubtitleTrack(activeS >= 0 ? activeS : -1)
    }, [])

    useEffect(() => {
      const v = videoRef.current
      if (!v) return
      v.addEventListener('loadedmetadata', refreshTracks)
      const checkTracks = () => setTimeout(refreshTracks, 200)
      v.addEventListener('loadedmetadata', checkTracks)
      return () => {
        v.removeEventListener('loadedmetadata', refreshTracks)
        v.removeEventListener('loadedmetadata', checkTracks)
      }
    }, [src, refreshTracks])

    // Use probed audio tracks for remuxed content, video element tracks for direct playback
    useEffect(() => {
      if (isRemux && probedAudioTracks && probedAudioTracks.length > 0) {
        setDisplayAudioTracks(probedAudioTracks.map(t => ({
          index: t.index,
          label: t.title || t.language || `Track ${t.index + 1}`,
          language: t.language,
          enabled: t.isDefault,
        })))
        const defaultIdx = probedAudioTracks.findIndex(t => t.isDefault)
        if (defaultIdx >= 0) setActiveAudioTrack(defaultIdx)
      } else {
        // For direct playback, use video element's audio tracks
        const v = videoRef.current
        if (v) {
          const tracks = getAudioTracks(v)
          setDisplayAudioTracks(tracks)
          const activeA = tracks.findIndex(t => t.enabled)
          if (activeA >= 0) setActiveAudioTrack(activeA)
        }
      }
    }, [isRemux, probedAudioTracks, src])

    // ── Audio track cycling ────────────────────────────────────────────
    const cycleAudioTrack = useCallback(() => {
      const v = videoRef.current
      if (!v) return
      const tracks = displayAudioTracks
      if (tracks.length <= 1) {
        showOsdMessage('No other audio tracks')
        return
      }
      const nextIdx = (activeAudioTrack + 1) % tracks.length

      if (isRemux && onAudioTrackSelect) {
        onAudioTrackSelect(tracks[nextIdx].index)
        showOsdMessage(`Switching to: ${tracks[nextIdx].label}`)
        setActiveAudioTrack(nextIdx)
        return
      }

      // HTML5 audio track switching (direct playback)
      const at = (v as any).audioTracks as any
      if (at) {
        for (let i = 0; i < at.length; i++) {
          at[i].enabled = i === nextIdx
        }
      }
      setActiveAudioTrack(nextIdx)
      refreshTracks()
      showOsdMessage(`Audio: ${tracks[nextIdx].label}`)
    }, [displayAudioTracks, activeAudioTrack, isRemux, onAudioTrackSelect, refreshTracks, showOsdMessage])

    const selectAudioTrack = useCallback((idx: number) => {
      const tracks = displayAudioTracks
      const matchTrack = tracks.find(t => t.index === idx)

      if (isRemux && onAudioTrackSelect) {
        onAudioTrackSelect(idx)
        setActiveAudioTrack(tracks.findIndex(t => t.index === idx))
        showOsdMessage(`Audio: ${matchTrack?.label || `Track ${idx + 1}`}`)
        setAudioMenuOpen(false)
        return
      }

      const v = videoRef.current
      if (!v) return
      const at = (v as any).audioTracks as any
      if (at) {
        for (let i = 0; i < at.length; i++) {
          at[i].enabled = i === idx
        }
      }
      setActiveAudioTrack(tracks.findIndex(t => t.index === idx))
      refreshTracks()
      showOsdMessage(`Audio: ${matchTrack?.label || `Track ${idx + 1}`}`)
      setAudioMenuOpen(false)
    }, [displayAudioTracks, isRemux, onAudioTrackSelect, refreshTracks, showOsdMessage])

    // ── Subtitle cycling ──────────────────────────────────────────────
    const cycleSubtitle = useCallback(() => {
      const v = videoRef.current
      if (!v) return
      const tracks = v.textTracks
      const subIdxs: number[] = []
      for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].kind === 'subtitles' || tracks[i].kind === 'captions') subIdxs.push(i)
      }
      if (subIdxs.length === 0) {
        showOsdMessage('No subtitles available')
        return
      }
      const cur = subIdxs.indexOf(activeSubtitleTrack)
      const next = (cur + 1) % (subIdxs.length + 1)
      for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].kind === 'subtitles' || tracks[i].kind === 'captions') tracks[i].mode = 'disabled'
      }
      if (next < subIdxs.length) {
        tracks[subIdxs[next]].mode = 'showing'
        setActiveSubtitleTrack(subIdxs[next])
        showOsdMessage(`Subtitles: ${tracks[subIdxs[next]].label || 'On'}`)
      } else {
        setActiveSubtitleTrack(-1)
        showOsdMessage('Subtitles: Off')
      }
      refreshTracks()
    }, [activeSubtitleTrack, refreshTracks, showOsdMessage])

    const selectSubtitle = useCallback((idx: number) => {
      const v = videoRef.current
      if (!v) return
      const tracks = v.textTracks
      for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].kind === 'subtitles' || tracks[i].kind === 'captions') tracks[i].mode = 'disabled'
      }
      if (idx >= 0) {
        tracks[idx].mode = 'showing'
        setActiveSubtitleTrack(idx)
        showOsdMessage(`Subtitles: ${tracks[idx].label || 'On'}`)
      } else {
        setActiveSubtitleTrack(-1)
        showOsdMessage('Subtitles: Off')
      }
      refreshTracks()
      setSubtitleMenuOpen(false)
    }, [refreshTracks, showOsdMessage])

    // ── Aspect ratio ──────────────────────────────────────────────────
    const cycleAspect = useCallback(() => {
      const idx = ASPECT_RATIOS.indexOf(aspectRatio)
      const next = ASPECT_RATIOS[(idx + 1) % ASPECT_RATIOS.length]
      setAspectRatio(next)
      showOsdMessage(`Aspect: ${next}`)
    }, [aspectRatio, showOsdMessage])

    const selectAspect = useCallback((ar: AspectRatio) => {
      setAspectRatio(ar)
      showOsdMessage(`Aspect: ${ar}`)
      setAspectMenuOpen(false)
    }, [showOsdMessage])

    useEffect(() => {
      const v = videoRef.current
      if (!v) return
      if (aspectRatio === 'Fill') {
        v.style.objectFit = 'fill'
        v.style.aspectRatio = 'unset'
      } else if (aspectRatio === 'Default') {
        v.style.objectFit = 'contain'
        v.style.aspectRatio = 'unset'
      } else {
        v.style.objectFit = 'contain'
        v.style.aspectRatio = getAspectCss(aspectRatio)
      }
    }, [aspectRatio])

    // ── Scrub bar (mouse drag) ────────────────────────────────────────
    const handleScrubDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      if (!osdOpen) return
      setIsSeeking(true)
      const v = videoRef.current
      const bar = scrubRef.current
      if (!v || !bar) return
      const rect = bar.getBoundingClientRect()
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      v.currentTime = pct * v.duration

      const onMove = (ev: MouseEvent) => {
        const rect2 = bar.getBoundingClientRect()
        const pct2 = Math.max(0, Math.min(1, (ev.clientX - rect2.left) / rect2.width))
        v.currentTime = pct2 * v.duration
      }
      const onUp = () => {
        setIsSeeking(false)
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }, [osdOpen])

    // ── Click on video → play/pause (when OSD is closed) ──────────────
    const handleVideoClick = useCallback(() => {
      if (osdOpen) return
      togglePlayPause()
    }, [osdOpen, togglePlayPause])

    const handleVideoDoubleClick = useCallback(() => {
      toggleFullscreen()
    }, [toggleFullscreen])

    // ── Button actions by index ────────────────────────────────────────
    const activateButton = useCallback((idx: number) => {
      switch (idx) {
        case 0: adjustSpeed(-1); break // rewind speed
        case 1: togglePlayPause(); break // play/pause
        case 2: adjustSpeed(1); break // forward speed
        case 3: cycleAudioTrack(); break // audio
        case 4: cycleSubtitle(); break // subtitles
        case 5: cycleAspect(); break // aspect ratio
      }
      resetOsdTimer()
    }, [adjustSpeed, togglePlayPause, cycleAudioTrack, cycleSubtitle, cycleAspect, resetOsdTimer])

    const getButtonLabel = useCallback((idx: number): string => {
      switch (idx) {
        case 0: return `Rewind (${playbackSpeed === 1 ? '1x' : `${playbackSpeed}x`})`
        case 1: return isPaused ? 'Play' : 'Pause'
        case 2: return `Forward (${playbackSpeed === 1 ? '1x' : `${playbackSpeed}x`})`
        case 3: return displayAudioTracks.length > 1 ? `Audio: ${displayAudioTracks[activeAudioTrack]?.label || ''}` : 'Audio'
        case 4: return activeSubtitleTrack >= 0 ? `Subs: ${subtitleTracks.find(t => t.index === activeSubtitleTrack)?.label || 'On'}` : 'Subtitles'
        case 5: return `Aspect: ${aspectRatio}`
        default: return ''
      }
    }, [isPaused, playbackSpeed, displayAudioTracks, activeAudioTrack, subtitleTracks, activeSubtitleTrack, aspectRatio])

    // ── Keyboard handler (window-level for robustness) ────────────────
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        const v = videoRef.current
        if (!v) return

        // ── OSD is OPEN ────────────────────────────────────────────
        if (osdOpen) {
          switch (e.key) {
            case 'Escape':
              e.preventDefault()
              closeOsd()
              return
            case 'Enter':
              if (osdRow === 0) {
                // On scrub bar row — do nothing
                resetOsdTimer()
                return
              }
              // In a dropdown, close it first
              if (audioMenuOpen) { setAudioMenuOpen(false); e.preventDefault(); resetOsdTimer(); return }
              if (subtitleMenuOpen) { setSubtitleMenuOpen(false); e.preventDefault(); resetOsdTimer(); return }
              if (aspectMenuOpen) { setAspectMenuOpen(false); e.preventDefault(); resetOsdTimer(); return }
              // On buttons row → activate focused button
              e.preventDefault()
              activateButton(osdButtonIndex)
              resetOsdTimer()
              return

            case 'ArrowLeft':
              e.preventDefault()
              if (osdRow === 0) {
                if (skipToPrevChapter()) {
                  // Chapter skip performed
                } else {
                  seekDelta(-10)
                }
              } else {
                setOsdButtonIndex((osdButtonIndex - 1 + BUTTON_COUNT) % BUTTON_COUNT)
              }
              resetOsdTimer()
              return

            case 'ArrowRight':
              e.preventDefault()
              if (osdRow === 0) {
                if (skipToNextChapter()) {
                  // Chapter skip performed
                } else {
                  seekDelta(10)
                }
              } else {
                setOsdButtonIndex((osdButtonIndex + 1) % BUTTON_COUNT)
              }
              resetOsdTimer()
              return

            case 'ArrowUp':
              e.preventDefault()
              if (osdRow === 1) setOsdRow(0)
              resetOsdTimer()
              return

            case 'ArrowDown':
              e.preventDefault()
              if (osdRow === 0) setOsdRow(1)
              resetOsdTimer()
              return

            case ' ':
              e.preventDefault()
              if (osdRow === 1) activateButton(osdButtonIndex)
              resetOsdTimer()
              return
          }
          return // don't process other keys when OSD is open
        }

        // ── OSD is CLOSED ───────────────────────────────────────────
        switch (e.key) {
          case 'Enter':
            e.preventDefault()
            openOsd()
            return

          case 'Escape':
            e.preventDefault()
            if (document.fullscreenElement) {
              document.exitFullscreen()
            } else {
              onBack?.()
            }
            return

          case 'ArrowLeft':
            e.preventDefault()
            if (skipToPrevChapter()) {
              openOsd()
              return
            }
            if (seekDirectionRef.current !== -1) {
              seekStepRef.current = 0
              seekDirectionRef.current = -1
            }
            seekDelta(-SEEK_STEPS[seekStepRef.current])
            if (seekStepRef.current < SEEK_STEPS.length - 1) seekStepRef.current++
            clearTimeout(seekStepTimerRef.current)
            seekStepTimerRef.current = setTimeout(() => { seekStepRef.current = 0 }, SEEK_STEP_TIMEOUT)
            openOsd()
            return

          case 'ArrowRight':
            e.preventDefault()
            if (skipToNextChapter()) {
              openOsd()
              return
            }
            if (seekDirectionRef.current !== 1) {
              seekStepRef.current = 0
              seekDirectionRef.current = 1
            }
            seekDelta(SEEK_STEPS[seekStepRef.current])
            if (seekStepRef.current < SEEK_STEPS.length - 1) seekStepRef.current++
            clearTimeout(seekStepTimerRef.current)
            seekStepTimerRef.current = setTimeout(() => { seekStepRef.current = 0 }, SEEK_STEP_TIMEOUT)
            openOsd()
            return

          case 'ArrowUp':
            e.preventDefault()
            adjustVolume(0.05)
            openOsd()
            return
          case 'ArrowDown':
            e.preventDefault()
            adjustVolume(-0.05)
            openOsd()
            return

          case ' ':
          case 'k':
            e.preventDefault()
            togglePlayPause()
            return

          case 'm':
            e.preventDefault()
            toggleMute()
            openOsd()
            return

          case 'f':
            e.preventDefault()
            toggleFullscreen()
            return

          case 's':
          case 'c':
            if (!e.ctrlKey && !e.metaKey) {
              e.preventDefault()
              cycleSubtitle()
              openOsd()
            }
            break

          case 'a':
            if (!e.ctrlKey && !e.metaKey) {
              e.preventDefault()
              cycleAudioTrack()
              openOsd()
            }
            break

          case 'r':
            if (!e.ctrlKey && !e.metaKey) {
              e.preventDefault()
              cycleAspect()
              openOsd()
            }
            break

          case '[':
            e.preventDefault()
            adjustSpeed(-1)
            openOsd()
            break
          case ']':
            e.preventDefault()
            adjustSpeed(1)
            openOsd()
            break

          case '0': case '1': case '2': case '3': case '4':
          case '5': case '6': case '7': case '8': case '9':
            e.preventDefault()
            seekToPercent(parseInt(e.key) * 10)
            openOsd()
            break
        }
      }
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }, [
      osdOpen, osdRow, osdButtonIndex, audioMenuOpen, subtitleMenuOpen, aspectMenuOpen,
      openOsd, closeOsd, resetOsdTimer, activateButton, seekDelta, seekToPercent,
      skipToPrevChapter, skipToNextChapter,
      adjustVolume, togglePlayPause, toggleMute, toggleFullscreen,
      cycleAudioTrack, cycleSubtitle, cycleAspect, adjustSpeed, onBack,
    ])

    // ── Close dropdown menus on outside click ─────────────────────────
    useEffect(() => {
      const anyOpen = audioMenuOpen || subtitleMenuOpen || aspectMenuOpen
      if (!anyOpen) return
      const handler = (e: MouseEvent) => {
        const target = e.target as Node
        if (audioMenuRef.current && !audioMenuRef.current.contains(target)) setAudioMenuOpen(false)
        if (subtitleMenuRef.current && !subtitleMenuRef.current.contains(target)) setSubtitleMenuOpen(false)
        if (aspectMenuRef.current && !aspectMenuRef.current.contains(target)) setAspectMenuOpen(false)
      }
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }, [audioMenuOpen, subtitleMenuOpen, aspectMenuOpen])

    // ── Expose imperative methods ──────────────────────────────────────
    useImperativeHandle(forwardedRef, () => ({
      getPosition: () => videoRef.current?.currentTime ?? 0,
      getDuration: () => videoRef.current?.duration ?? 0,
      seek: (time: number) => { if (videoRef.current) videoRef.current.currentTime = time },
      pause: () => { videoRef.current?.pause() },
      play: async () => { videoRef.current?.play() },
      isPaused: () => videoRef.current?.paused ?? true,
      addSubtitle: (url: string, label: string, language = 'en') => {
        const video = videoRef.current
        if (!video) return
        const track = document.createElement('track')
        track.kind = 'subtitles'
        track.label = label
        track.srclang = language
        track.src = url
        video.appendChild(track)
        setTimeout(refreshTracks, 300)
        const tracks = video.textTracks
        for (let i = 0; i < tracks.length; i++) {
          if (tracks[i].label === label) {
            tracks[i].mode = 'showing'
            setActiveSubtitleTrack(i)
          }
        }
      },
    }), [refreshTracks])

    // ── Seek to start time on resume ─────────────────────────────────
    useEffect(() => {
      const video = videoRef.current
      if (!video || !shouldResume || startTime <= 0) return
      console.log('[VideoJsPlayer] resume: seeking to', startTime)
      const onLoaded = () => {
        video.currentTime = startTime
      }
      video.addEventListener('loadedmetadata', onLoaded, { once: true })
      if (video.readyState >= 1) {
        video.currentTime = startTime
      }
      return () => video.removeEventListener('loadedmetadata', onLoaded)
    }, [startTime, src, shouldResume])

    useEffect(() => {
      const v = videoRef.current
      if (!v) return
      const onMeta = () => { console.log('[VideoJsPlayer] loadedmetadata: duration=', v.duration, 'seekable=', v.seekable?.length) }
      const onPlay = () => { console.log('[VideoJsPlayer] play event: currentTime=', v.currentTime) }
      const onSeeked = () => { console.log('[VideoJsPlayer] seeked event: currentTime=', v.currentTime) }
      v.addEventListener('loadedmetadata', onMeta)
      v.addEventListener('play', onPlay)
      v.addEventListener('seeked', onSeeked)
      return () => {
        v.removeEventListener('loadedmetadata', onMeta)
        v.removeEventListener('play', onPlay)
        v.removeEventListener('seeked', onSeeked)
      }
    }, [src])

    // ── Audio language preference ──────────────────────────────────────
    useEffect(() => {
      const video = videoRef.current
      if (!video || !audioLanguage) return
      const selectTrack = () => {
        const tracks = (video as any).audioTracks as any
        if (!tracks) return
        for (let i = 0; i < tracks.length; i++) {
          if (tracks[i].language?.toLowerCase().startsWith(audioLanguage.toLowerCase())) {
            tracks[i].enabled = true
            refreshTracks()
            return
          }
        }
      }
      video.addEventListener('loadedmetadata', selectTrack, { once: true })
      if (video.readyState >= 1) selectTrack()
    }, [audioLanguage, src, refreshTracks])

    // ── Cleanup timers ────────────────────────────────────────────────
    useEffect(() => {
      return () => {
        clearTimeout(osdTimerRef.current)
        clearTimeout(centerTimerRef.current)
        clearTimeout(osdMessageTimerRef.current)
        clearTimeout(seekStepTimerRef.current)
      }
    }, [])

    // ── Derived values ─────────────────────────────────────────────────
    const displayDuration = (duration > 0 && isFinite(duration)) ? duration : fallbackDuration
    const progress = displayDuration > 0 ? (currentTime / displayDuration) * 100 : 0
    const bufferProgress = displayDuration > 0 ? (buffered / displayDuration) * 100 : 0
    const episodeLabel = mediaInfo?.mediaType === 'tv' && mediaInfo.season && mediaInfo.episode
      ? `S${String(mediaInfo.season).padStart(2, '0')} E${String(mediaInfo.episode).padStart(2, '0')}`
      : null

    return (
      <div
        ref={containerRef}
        className={styles.player}
        tabIndex={-1}
      >
        {/* ── Video element ─────────────────────────────────────── */}
        <Player.Provider>
          <HlsStartFix shouldResume={shouldResume} onEngine={handleEngine} />
          <Container className={styles.videoContainer}>
            <HlsJsVideo
              key={`${src}-${shouldResume ? 'resume' : 'reset'}`}
              ref={videoRef}
              className={styles.video}
              src={src}
              poster={poster}
              autoPlay
              playsInline
              preload="auto"
              config={{
                hlsJs: {
                  startPosition: 0,
                },
              }}
              onTimeUpdate={handleTimeUpdateInternal}
              onDurationChange={handleDurationChange}
              onEnded={onEnded}
              onError={(e: React.SyntheticEvent<HTMLVideoElement>) => onError?.(e.currentTarget.error as MediaError)}
              onPlay={handlePlayInternal}
              onPause={handlePauseInternal}
              onCanPlay={onCanPlay}
              onClick={handleVideoClick}
              onDoubleClick={handleVideoDoubleClick}
            />
          </Container>
        </Player.Provider>

        {/* ── Center play/pause flash ────────────────────────────── */}
        {showCenterIcon && (
          <div className={styles.osdCenter}>
            <div className={styles.centerPlayIcon}>
              {showCenterIcon === 'play' ? <PlayIcon size={36} /> : <PauseIcon size={36} />}
            </div>
          </div>
        )}

        {/* ── OSD feedback message ──────────────────────────────── */}
        {osdMessage && (
          <div className={styles.osdCenterMessage}>{osdMessage}</div>
        )}

        {/* ── OSD overlay ───────────────────────────────────────── */}
        {osdOpen && (
          <div className={styles.osd}>
            {/* Top gradient + back button + clearlogo */}
            <div className={styles.osdTop}>
              <button className={styles.osdBtn} onClick={onBack} title="Back (Esc)">
                <BackIcon />
              </button>
              <div style={{ flex: 1 }} />
              {clearlogoUrl && (
                <img
                  className={styles.osdClearlogo}
                  src={clearlogoUrl}
                  alt=""
                  draggable={false}
                />
              )}
            </div>

            {/* Bottom bar: scrub + buttons */}
            <div className={styles.osdBottom}>
              {/* Row 0: Scrub bar */}
              <div
                ref={scrubRef}
                className={`${styles.scrubBar} ${osdRow === 0 ? styles.scrubBarFocused : ''}`}
                onMouseDown={handleScrubDown}
              >
                <div className={styles.scrubTrack}>
                  <div className={styles.scrubBuffer} style={{ width: bufferProgress + '%' }} />
                  <div className={styles.scrubFilled} style={{ width: progress + '%' }} />
                  <div className={styles.scrubThumb} style={{ left: progress + '%' }} />
                </div>
                <div className={styles.scrubTimeRow}>
                  <span className={styles.scrubTimeLabel}>{formatTime(currentTime)}</span>
                  <span className={styles.scrubTimeSep}> / </span>
                  <span className={styles.scrubTimeLabel}>{formatTime(displayDuration)}</span>
                  {episodeLabel && (
                    <span className={styles.osdEpisode}>{episodeLabel}</span>
                  )}
                </div>
              </div>

              {/* Row 1: Buttons */}
              <div className={`${styles.osdBottomRow} ${osdRow === 1 ? styles.osdRowFocused : ''}`}>
                {/* 0: Rewind speed */}
                <button
                  className={`${styles.osdBtn} ${osdButtonIndex === 0 && osdRow === 1 ? styles.osdBtnFocused : ''}`}
                  onClick={() => { adjustSpeed(-1); resetOsdTimer() }}
                  title="Rewind speed ([)"
                >
                  <RewindIcon />
                </button>

                {/* 1: Play/Pause */}
                <button
                  className={`${styles.osdBtn} ${styles.osdBtnLarge} ${osdButtonIndex === 1 && osdRow === 1 ? styles.osdBtnFocused : ''}`}
                  onClick={() => { togglePlayPause(); resetOsdTimer() }}
                  title="Play/Pause (Space)"
                >
                  {isPaused ? <PlayIcon size={28} /> : <PauseIcon size={28} />}
                </button>

                {/* 2: Forward speed */}
                <button
                  className={`${styles.osdBtn} ${osdButtonIndex === 2 && osdRow === 1 ? styles.osdBtnFocused : ''}`}
                  onClick={() => { adjustSpeed(1); resetOsdTimer() }}
                  title="Forward speed (])"
                >
                  <ForwardIcon />
                </button>

                <div className={styles.osdBtnSpacer} />

                {/* 3: Audio track */}
                <div className={styles.trackMenuWrap} ref={audioMenuRef}>
                  <button
                    className={`${styles.osdBtn} ${osdButtonIndex === 3 && osdRow === 1 ? styles.osdBtnFocused : ''} ${activeAudioTrack >= 0 ? styles.osdBtnActive : ''}`}
                    onClick={() => { setAudioMenuOpen(!audioMenuOpen); setSubtitleMenuOpen(false); setAspectMenuOpen(false); resetOsdTimer() }}
                    title="Audio track (A)"
                  >
                    <AudioIcon />
                  </button>
                  {audioMenuOpen && (
                    <div className={styles.trackDropdown}>
                      <div className={styles.trackDropdownHeader}>Audio Track</div>
                      {displayAudioTracks.map((t) => (
                        <button
                          key={t.index}
                          className={`${styles.trackItem} ${t.enabled ? styles.trackItemActive : ''}`}
                          onClick={() => selectAudioTrack(t.index)}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 4: Subtitles */}
                <div className={styles.trackMenuWrap} ref={subtitleMenuRef}>
                  <button
                    className={`${styles.osdBtn} ${osdButtonIndex === 4 && osdRow === 1 ? styles.osdBtnFocused : ''} ${activeSubtitleTrack >= 0 ? styles.osdBtnActive : ''}`}
                    onClick={() => { setSubtitleMenuOpen(!subtitleMenuOpen); setAudioMenuOpen(false); setAspectMenuOpen(false); resetOsdTimer() }}
                    title="Subtitles (S)"
                  >
                    <SubtitleIcon />
                  </button>
                  {subtitleMenuOpen && (
                    <div className={styles.trackDropdown}>
                      <div className={styles.trackDropdownHeader}>Subtitles</div>
                      <button
                        className={`${styles.trackItem} ${activeSubtitleTrack === -1 ? styles.trackItemActive : ''}`}
                        onClick={() => selectSubtitle(-1)}
                      >
                        Off
                      </button>
                      {subtitleTracks.map((t) => (
                        <button
                          key={t.index}
                          className={`${styles.trackItem} ${t.mode === 'showing' ? styles.trackItemActive : ''}`}
                          onClick={() => selectSubtitle(t.index)}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 5: Aspect ratio */}
                <div className={styles.trackMenuWrap} ref={aspectMenuRef}>
                  <button
                    className={`${styles.osdBtn} ${osdButtonIndex === 5 && osdRow === 1 ? styles.osdBtnFocused : ''}`}
                    onClick={() => { setAspectMenuOpen(!aspectMenuOpen); setAudioMenuOpen(false); setSubtitleMenuOpen(false); resetOsdTimer() }}
                    title="Aspect ratio (R)"
                  >
                    <AspectIcon />
                  </button>
                  {aspectMenuOpen && (
                    <div className={styles.trackDropdown}>
                      <div className={styles.trackDropdownHeader}>Aspect Ratio</div>
                      {ASPECT_RATIOS.map((ar) => (
                        <button
                          key={ar}
                          className={`${styles.trackItem} ${ar === aspectRatio ? styles.trackItemActive : ''}`}
                          onClick={() => selectAspect(ar)}
                        >
                          {ar}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className={styles.osdBtnSpacer} />

                {/* Fullscreen */}
                <button
                  className={styles.osdBtn}
                  onClick={toggleFullscreen}
                  title="Fullscreen (F)"
                >
                  <FullscreenIcon />
                </button>
              </div>

              {/* Speed indicator */}
              {playbackSpeed !== 1 && (
                <div className={styles.speedIndicator}>{playbackSpeed}x</div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  },
)
