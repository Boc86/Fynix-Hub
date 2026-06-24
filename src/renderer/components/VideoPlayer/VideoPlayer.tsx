import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useMediaStore } from '../../store/mediaStore'
import type { IntroSegment } from '../../types.d'
import styles from './VideoPlayer.module.css'

interface TorrentProgress {
  progress: number
  downloaded: number
  total: number
  downloadSpeed: number
  numPeers: number
  timeRemaining: number
}

interface MediaInfo {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  season?: number
  episode?: number
  resumePosition?: number
  isTrailer?: boolean
  // Segments can be provided by various add-ons (SponsorBlock, introDB, etc.)
  segments?: {
    type: 'intro' | 'recap' | 'intro-and-recap'
    startMs: number | null
    endMs: number | null
  }[]
}

interface VideoPlayerProps {
  onBack: () => void
  onNextEpisode: () => void
  onStreamError?: () => void
  streamUrl?: string
  streamError?: string | null
  mediaInfo?: MediaInfo
  playerLoading?: boolean
}

function buildScrobblePayload(tmdbId: number, mediaType: string, progress: number, season?: number, episode?: number) {
  const pct = Math.max(progress * 100, 1.0)
  if (mediaType === 'tv' && season !== undefined && episode !== undefined) {
    return {
      show: { ids: { tmdb: tmdbId } },
      episode: { season, number: episode },
      progress: pct,
    }
  }
  return {
    movie: { ids: { tmdb: tmdbId } },
    progress: pct,
  }
}

function buildHistoryPayload(tmdbId: number, mediaType: string, season?: number, episode?: number) {
  if (mediaType === 'tv' && season !== undefined && episode !== undefined) {
    return {
      shows: [{
        ids: { tmdb: tmdbId },
        seasons: [{ season, episodes: [{ number: episode }] }],
      }],
    }
  }
  return { movies: [{ ids: { tmdb: tmdbId } }] }
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function VideoPlayer({ onBack, onNextEpisode, onStreamError, streamUrl, streamError, mediaInfo, playerLoading }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const skipCheckRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const scrobbleThrottle = useRef(0)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [segments, setSegments] = useState<IntroSegment[]>([])
  const [activeSkip, setActiveSkip] = useState<IntroSegment | null>(null)
  const [debugOpen, setDebugOpen] = useState(false)
  const [torrentProgress, setTorrentProgress] = useState<TorrentProgress | null>(null)
  const [osdVisible, setOsdVisible] = useState(true)
  const [showCenterPlay, setShowCenterPlay] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [clearlogo, setClearlogo] = useState<string | null>(null)
  const debugIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const selectedMedia = useMediaStore((s) => s.selectedMedia)
  const [audioTracks, setAudioTracks] = useState<Array<{ id: string; label: string; language: string; enabled: boolean }>>([])
  const [audioTrackOpen, setAudioTrackOpen] = useState(false)

  const showOsd = useCallback(() => {
    setOsdVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      if (isPlaying) setOsdVisible(false)
    }, 3000)
  }, [isPlaying])

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  const saveProgress = useCallback(() => {
    const video = videoRef.current
    if (!video || !mediaInfo || mediaInfo.isTrailer) return
    const progress = video.currentTime / video.duration
    if (isFinite(progress) && progress > 0) {
      window.api.watch.updateProgress(
        mediaInfo.tmdbId,
        mediaInfo.mediaType,
        progress,
        mediaInfo.season,
        mediaInfo.episode,
      )
    }
  }, [mediaInfo])

  const scrobble = useCallback(async (action: 'start' | 'pause' | 'stop') => {
    if (!mediaInfo || mediaInfo.isTrailer) return
    const video = videoRef.current
    if (!video || !video.duration) return
    const progress = video.currentTime / video.duration
    if (!isFinite(progress) || progress <= 0) return
    try {
      const now = Date.now()
      if (action === 'start' && now - scrobbleThrottle.current < 60000) return
      scrobbleThrottle.current = now
      const payload = buildScrobblePayload(
        mediaInfo.tmdbId, mediaInfo.mediaType, progress,
        mediaInfo.season, mediaInfo.episode,
      )
      await window.api.trakt.scrobble(action, payload)
    } catch { /* non-critical */ }
  }, [mediaInfo])

  const markAsWatched = useCallback(async () => {
    if (!mediaInfo || mediaInfo.isTrailer) return
    try {
      const payload = buildHistoryPayload(
        mediaInfo.tmdbId, mediaInfo.mediaType,
        mediaInfo.season, mediaInfo.episode,
      )
      await window.api.trakt.markWatched(payload)
    } catch { /* non-critical */ }
  }, [mediaInfo])

  const skipSegment = useCallback(() => {
    const video = videoRef.current
    const seg = activeSkip
    if (!video || !seg || seg.endMs === null) return
    video.currentTime = seg.endMs / 1000
    setActiveSkip(null)
  }, [activeSkip])

  useEffect(() => {
    setSegments([])
    setActiveSkip(null)

    if (!mediaInfo || mediaInfo.isTrailer) return

    if (mediaInfo.segments && mediaInfo.segments.length > 0) {
      // Generic segments format: { type: 'intro' | 'recap', startMs, endMs }
      setSegments(mediaInfo.segments)
      return
    }

    // IntroDB is only used for TV shows
    if (mediaInfo.mediaType !== 'tv') return

    const mi = mediaInfo
    let cancelled = false
    async function fetchSegments() {
      try {
        const res = await window.api.intros.getSegments({
          tmdbId: mi.tmdbId,
          type: 'episode',
          season: mi.season,
          episode: mi.episode,
        })
        if (!cancelled && res) setSegments(res)
      } catch { /* ignore */ }
    }
    fetchSegments()
    return () => { cancelled = true }
  }, [mediaInfo?.tmdbId, mediaInfo?.season, mediaInfo?.episode, mediaInfo?.segments])

  useEffect(() => {
    if (!mediaInfo) return
    window.api.fanart.getImages(mediaInfo.tmdbId, mediaInfo.mediaType).then((res) => {
      setClearlogo(res.clearlogo || res.clearart || null)
    }).catch(() => {})
  }, [mediaInfo?.tmdbId, mediaInfo?.mediaType])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !streamUrl) return

    setLoading(true)
    setError(null)
    setCurrentTime(0)
    setDuration(0)

    video.src = streamUrl
    video.load()

    const onCanPlay = () => {
      setLoading(false)
      if (mediaInfo?.resumePosition && mediaInfo.resumePosition > 0) {
        video.currentTime = mediaInfo.resumePosition * video.duration
      }
      video.play().catch(() => setIsPlaying(false))
    }
    const onErrorEvent = () => {
      setLoading(false)
      const ve = video.error
      const msg = ve ? `MEDIA_ERR_${['ABORTED', 'NETWORK', 'DECODE', 'SRC_NOT_SUPPORTED'][ve.code - 1] || ve.code}: ${ve.message}` : 'Failed to load video stream'
      console.error('[VideoPlayer] Error:', msg, 'src:', video.src, 'readyState:', video.readyState, 'networkState:', video.networkState)
      setError(msg)
      onStreamError?.()
    }
    const onPlay = () => {
      setIsPlaying(true)
      showOsd()
      scrobble('start')
    }
    const onPause = () => {
      setIsPlaying(false)
      setOsdVisible(true)
      scrobble('pause')
    }
    const onEnded = async () => {
      setIsPlaying(false)
      setActiveSkip(null)
      setOsdVisible(true)
      saveProgress()
      await scrobble('stop')
      await markAsWatched()
      if (mediaInfo?.isTrailer) {
        onBack()
        return
      }
      if (mediaInfo?.mediaType === 'tv') {
        onNextEpisode()
      }
    }
    const onTimeupdate = () => {
      setCurrentTime(video.currentTime)
      setDuration(video.duration)
      saveProgress()
    }
    const onLoadedMetadata = () => {
      setDuration(video.duration)
      const tracks = (video as any).audioTracks
      if (tracks && typeof tracks.length === 'number') {
        const list: Array<{ id: string; label: string; language: string; enabled: boolean }> = []
        for (let i = 0; i < tracks.length; i++) {
          const t = tracks[i]
          list.push({
            id: t.id || String(i),
            label: t.label || `Track ${i + 1}`,
            language: t.language || '',
            enabled: !!t.enabled,
          })
        }
        setAudioTracks(list)
      }
    }

    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('error', onErrorEvent)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)
    video.addEventListener('timeupdate', onTimeupdate)
    video.addEventListener('loadedmetadata', onLoadedMetadata)

    progressIntervalRef.current = setInterval(onTimeupdate, 5000)

    return () => {
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('error', onErrorEvent)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('timeupdate', onTimeupdate)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
      saveProgress()
      scrobble('stop')
      video.pause()
      video.src = ''
    }
  }, [streamUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (skipCheckRef.current) clearInterval(skipCheckRef.current)
    if (segments.length === 0) return

    skipCheckRef.current = setInterval(() => {
      const video = videoRef.current
      if (!video || !segments.length) return
      const currentMs = video.currentTime * 1000

      const active = segments.find((seg) => {
        if (seg.type !== 'intro' && seg.type !== 'recap') return false
        if (seg.startMs === null || seg.endMs === null) return false
        return currentMs >= seg.startMs && currentMs <= seg.endMs
      })

      setActiveSkip((prev) => {
        if (prev && !active) return null
        if (active && (!prev || prev.startMs !== active.startMs)) return active
        return prev
      })
    }, 250)

    return () => {
      if (skipCheckRef.current) clearInterval(skipCheckRef.current)
    }
  }, [segments])

  useEffect(() => {
    if (debugOpen && streamUrl) {
      debugIntervalRef.current = setInterval(async () => {
        try {
          const infoHash = streamUrl?.match(/\/webtorrent\/([a-f0-9]+)/i)?.[1]
          if (infoHash) {
            const p = await window.api.torrent.getTorrentProgress(infoHash)
            setTorrentProgress(p)
          }
        } catch { /* ignore */ }
      }, 2000)
    } else {
      if (debugIntervalRef.current) clearInterval(debugIntervalRef.current)
      setTorrentProgress(null)
    }
    return () => {
      if (debugIntervalRef.current) clearInterval(debugIntervalRef.current)
    }
  }, [debugOpen, streamUrl])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
    setShowCenterPlay(true)
    setTimeout(() => setShowCenterPlay(false), 800)
    showOsd()
  }, [showOsd])

  const selectAudioTrack = useCallback((trackId: string) => {
    const video = videoRef.current
    if (!video) return
    const tracks = (video as any).audioTracks
    if (!tracks || typeof tracks.length !== 'number') return
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].enabled = tracks[i].id === trackId
    }
    setAudioTracks((prev) => prev.map((t) => ({ ...t, enabled: t.id === trackId })))
    setAudioTrackOpen(false)
    showOsd()
  }, [showOsd])

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current
    if (!video || !video.duration) return
    const pct = parseFloat(e.target.value)
    video.currentTime = (pct / 100) * video.duration
    setCurrentTime(video.currentTime)
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    showOsd()
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); togglePlay(); return }
    if (e.key === 'f') { e.preventDefault(); videoRef.current?.requestFullscreen(); return }
    if (e.key === 'd') { e.preventDefault(); setDebugOpen(o => !o); return }
    if (e.key === 'Enter' || e.key === 's') {
      if (activeSkip) { e.preventDefault(); skipSegment(); return }
    }
    if (e.key === 'Escape') { onBack(); return }
  }, [togglePlay, onBack, activeSkip, skipSegment, showOsd])

  const handleMouseMove = useCallback(() => {
    showOsd()
  }, [showOsd])

  if (playerLoading && !streamUrl) {
    return (
      <div className={styles.player}>
        <div className={styles.loadingOverlay}>
          <div className={styles.spinner} />
          <span>Preparing stream...</span>
        </div>
      </div>
    )
  }

  if (!streamUrl) {
    return (
      <div className={styles.player}>
        <div className={styles.placeholder}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
          {streamError ? (
            <>
              <p className={styles.errorText}>{streamError}</p>
            </>
          ) : (
            <>
              <p>No stream available. Select a torrent first.</p>
            </>
          )}
          {streamError && (
            <div className={styles.debugOverlay} style={{ position: 'relative', width: '100%', maxWidth: 500, marginTop: 20 }}>
              <div className={styles.debugTitle}>Debug (press D in player to see more)</div>
              <div className={styles.debugRow}><span>streamUrl:</span><span className={styles.debugVal}>{streamUrl || 'undefined'}</span></div>
              <div className={styles.debugRow}><span>streamError:</span><span className={styles.debugVal}>{streamError}</span></div>
            </div>
          )}
        </div>
      </div>
    )
  }

  const skipLabel = activeSkip?.type === 'recap' ? 'Skip Recap' : 'Skip Intro'
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0
  const episodeLabel = mediaInfo?.season !== undefined && mediaInfo?.episode !== undefined
    ? `S${mediaInfo.season}:E${mediaInfo.episode}`
    : null

  return (
    <div
      className={styles.player}
      onKeyDown={handleKeyDown}
      onMouseMove={handleMouseMove}
      tabIndex={-1}
    >
      <video
        ref={videoRef}
        className={styles.video}
        controls={false}
        autoPlay
        playsInline
        onClick={togglePlay}
      />

      {osdVisible && (
        <div className={styles.osd}>
          <div className={styles.osdTop}>
            <div className={styles.osdInfo}>
              {clearlogo ? (
                <img src={clearlogo} alt="" className={styles.osdClearlogo} onError={() => setClearlogo(null)} />
              ) : (
                <span className={styles.osdTitle}>
                  {(selectedMedia as any)?.name || selectedMedia?.title || ''}
                </span>
              )}
              {episodeLabel && (
                <span className={styles.osdEpisode}>{episodeLabel}</span>
              )}
            </div>
          </div>

          {showCenterPlay && (
            <div className={styles.osdCenter}>
              <div className={styles.centerPlayIcon}>
                {isPlaying ? (
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                  </svg>
                ) : (
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
              </div>
            </div>
          )}

          <div className={styles.osdBottom}>
            <div className={styles.scrubBar}>
              <input
                type="range"
                min={0}
                max={100}
                step={0.1}
                value={progressPct}
                onChange={handleSeek}
                className={styles.scrubInput}
              />
              <div className={styles.scrubTrack}>
                <div className={styles.scrubFilled} style={{ width: `${progressPct}%` }} />
                <div className={styles.scrubThumb} style={{ left: `${progressPct}%` }} />
              </div>
            </div>
            <div className={styles.osdBottomRow}>
              <div className={styles.osdTime}>
                <span>{formatTime(currentTime)}</span>
                <span className={styles.timeSep}>/</span>
                <span>{formatTime(duration)}</span>
              </div>
              <div className={styles.osdCenterControls}>
                <button className={styles.osdBtn} onClick={togglePlay} title="Play/Pause (Space/K)">
                  {isPlaying ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  )}
                </button>
              </div>
              <div className={styles.osdRight}>
                {audioTracks.length > 1 && (
                  <div className={styles.audioTrackWrap}>
                    <button className={styles.osdBtn} onClick={() => { setAudioTrackOpen((o) => !o); showOsd() }} title="Audio Tracks">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                      </svg>
                    </button>
                    {audioTrackOpen && (
                      <div className={styles.audioTrackDropdown}>
                        {audioTracks.map((t) => (
                          <button
                            key={t.id}
                            tabIndex={0}
                            className={`${styles.audioTrackItem} ${t.enabled ? styles.audioTrackActive : ''}`}
                            onClick={() => selectAudioTrack(t.id)}
                          >
                            {t.label}{t.language ? ` (${t.language})` : ''}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {activeSkip && (
                  <button className={styles.skipBtn} onClick={skipSegment}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                    </svg>
                    {skipLabel}
                  </button>
                )}
                {mediaInfo?.mediaType === 'tv' && (
                  <button className={styles.osdBtn} onClick={onNextEpisode} title="Next Episode">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {!osdVisible && activeSkip && (
        <div className={styles.skipOverlay}>
          <button className={styles.skipBtn} onClick={skipSegment}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
            </svg>
            {skipLabel}
          </button>
        </div>
      )}

      {loading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.spinner} />
          <span>Buffering stream...</span>
        </div>
      )}

      {error && (
        <div className={styles.errorOverlay}>
          <p className={styles.errorText}>{error}</p>
        </div>
      )}

      {debugOpen && (
        <div className={styles.debugOverlay}>
          <div className={styles.debugTitle}>Debug Info (press D to close)</div>
          <div className={styles.debugRow}><span>streamUrl:</span><span className={styles.debugVal}>{streamUrl || 'undefined'}</span></div>
          <div className={styles.debugRow}><span>streamError:</span><span className={styles.debugVal}>{streamError || 'null'}</span></div>
          <div className={styles.debugRow}><span>loading:</span><span className={styles.debugVal}>{String(loading)}</span></div>
          <div className={styles.debugRow}><span>isPlaying:</span><span className={styles.debugVal}>{String(isPlaying)}</span></div>
          <div className={styles.debugRow}><span>error:</span><span className={styles.debugVal}>{error || 'null'}</span></div>
          <div className={styles.debugRow}><span>segments:</span><span className={styles.debugVal}>{segments.length}</span></div>
          <div className={styles.debugRow}><span>activeSkip:</span><span className={styles.debugVal}>{activeSkip?.type || 'null'}</span></div>
          <div className={styles.debugRow}><span>video src:</span><span className={styles.debugVal}>{videoRef.current?.src || 'none'}</span></div>
          <div className={styles.debugRow}><span>video readyState:</span><span className={styles.debugVal}>{videoRef.current?.readyState ?? -1}</span></div>
          <div className={styles.debugRow}><span>video networkState:</span><span className={styles.debugVal}>{videoRef.current?.networkState ?? -1}</span></div>
          <div className={styles.debugRow}><span>currentTime:</span><span className={styles.debugVal}>{videoRef.current?.currentTime?.toFixed(1) || '0'}s</span></div>
          {torrentProgress && (
            <>
              <div className={styles.debugRow}><span>torrent progress:</span><span className={styles.debugVal}>{(torrentProgress.progress * 100).toFixed(1)}%</span></div>
              <div className={styles.debugRow}><span>torrent speed:</span><span className={styles.debugVal}>{(torrentProgress.downloadSpeed / 1024).toFixed(0)} KB/s</span></div>
              <div className={styles.debugRow}><span>torrent peers:</span><span className={styles.debugVal}>{torrentProgress.numPeers}</span></div>
              <div className={styles.debugRow}><span>torrent downloaded:</span><span className={styles.debugVal}>{(torrentProgress.downloaded / 1048576).toFixed(1)} MB / {(torrentProgress.total / 1048576).toFixed(1)} MB</span></div>
              <div className={styles.debugRow}><span>torrent remaining:</span><span className={styles.debugVal}>{torrentProgress.timeRemaining > 0 ? `${Math.round(torrentProgress.timeRemaining / 1000)}s` : 'N/A'}</span></div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
