import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { useMediaStore } from '../../store/mediaStore'
import { useSettingsStore } from '../../store/settingsStore'
import { getWatchApi } from '../../utils/watchProvider'
import type { IntroSegment } from '../../types.d'
import styles from './VideoPlayer.module.css'
import ErrorModal from '../ErrorModal/ErrorModal'
import { VideoJsPlayer, type VideoJsPlayerHandle } from './VideoJsPlayer'

// ─── Types ───────────────────────────────────────────────────────────────────
/** Imperative handle exposed by VideoPlayer via ref. */
export interface VideoPlayerHandle {
  /** Save current progress without unmounting. */
  saveCurrentProgress: () => void
  /** Returns true if playback was completed (video ended naturally). */
  wasPlaybackCompleted: () => boolean
}

interface MediaInfo {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  season?: number
  episode?: number
  resumePosition?: number
  isTrailer?: boolean
  /** Torrent infoHash + fileIndex for sidecar subtitle lookup */
  torrentInfoHash?: string
  torrentFileIndex?: number
  /** Usenet completed download directory for sidecar subtitle lookup */
  usenetCompletedDir?: string
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
  onRetryStream?: () => void
  streamUrl?: string
  streamError?: string | null
  mediaInfo?: MediaInfo
  playerLoading?: boolean
  hasNextEpisode?: boolean
  nextEpisodeTitle?: string
  title?: string
  clearlogoUrl?: string | null
  audioTracks?: { index: number; language: string; title: string; codec: string; channels: number; isDefault: boolean }[]
  isRemux?: boolean
  /** Called when the underlying stream URL changes (e.g. audio track switch).
   *  App.tsx uses this to push the new HLS URL into the video element so the
   *  player doesn't freeze loading the dead old session. */
  onStreamUrlChange?: (url: string) => void
  /** Called when playback ends naturally (video finished). */
  onPlaybackComplete?: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Component ───────────────────────────────────────────────────────────────

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
function VideoPlayerInner({
  onBack,
  onNextEpisode,
  onStreamError,
  onRetryStream,
  streamUrl,
  streamError,
  mediaInfo,
  playerLoading,
  hasNextEpisode,
  nextEpisodeTitle,
  title,
  clearlogoUrl,
  audioTracks,
  isRemux,
  onStreamUrlChange,
  onPlaybackComplete,
}, ref) {
  const videoJsRef = useRef<VideoJsPlayerHandle>(null)
  const skipBtnRef = useRef<HTMLButtonElement | null>(null)
  const scrobbleThrottle = useRef(0)
  const [activeSkip, setActiveSkip] = useState<IntroSegment | null>(null)
  const [segments, setSegments] = useState<IntroSegment[]>([])
  const currentTimeRef = useRef(0)
  const durationRef = useRef(0)
  const fallbackDurationRef = useRef(0)
  const lastGoodPosRef = useRef(0)
  const isPlayingRef = useRef(false)
  const prevPlayStateRef = useRef(false)
  const startScrobbledRef = useRef(false)
  const exitedRef = useRef(false)
  const retryCountRef = useRef(0)
  const playbackCompletedRef = useRef(false)
  const [displayError, setDisplayError] = useState<string | null>(null)

  const selectedMedia = useMediaStore((s) => s.selectedMedia)
  const preferredLanguages = useSettingsStore((s) => s.preferredLanguages)
  const preferredLanguagesRef = useRef<string[]>([])
  preferredLanguagesRef.current = preferredLanguages
  const autoPlayNext = useSettingsStore((s) => s.autoPlayNext)
  const autoPlayNextRef = useRef(false)
  autoPlayNextRef.current = autoPlayNext

  const isReconnectableStream = useCallback(() => {
    return !!streamUrl && !mediaInfo?.tmdbId
  }, [streamUrl, mediaInfo])

  // ── Progress saving ────────────────────────────────────────────────────

  const saveProgress = useCallback(() => {
    if (!mediaInfo || mediaInfo.isTrailer) return
    const t = lastGoodPosRef.current
    const d = durationRef.current > 0 ? durationRef.current : fallbackDurationRef.current
    if (!isFinite(d) || d <= 0 || !isFinite(t)) return
    const progress = Math.min(Math.max(t / d, 0), 1)
    if (progress < 0.02 || progress >= 0.98) {
      window.api.watch.deleteProgress(
        mediaInfo.tmdbId,
        mediaInfo.mediaType,
        mediaInfo.season,
        mediaInfo.episode,
      )
      return
    }
    window.api.watch.updateProgress(
      mediaInfo.tmdbId,
      mediaInfo.mediaType,
      progress,
      mediaInfo.season,
      mediaInfo.episode,
    )
  }, [mediaInfo])

  const [showSubNotFound, setShowSubNotFound] = useState(false)
  const [searchingSubs, setSearchingSubs] = useState(false)
  const showSubNotFoundRef = useRef(false)

  // ── Trakt scrobble ─────────────────────────────────────────────────────

  const scrobble = useCallback(async (action: 'start' | 'pause' | 'stop') => {
    if (!mediaInfo || mediaInfo.isTrailer) return
    const d = durationRef.current > 0 ? durationRef.current : fallbackDurationRef.current
    if (!isFinite(d) || d <= 0) return
    const progress = Math.min(Math.max(lastGoodPosRef.current / d, 0), 1)
    if (!isFinite(progress)) return
    try {
      const now = Date.now()
      const elapsed = now - scrobbleThrottle.current
      if (action === 'start' && elapsed < 60000) return
      scrobbleThrottle.current = now
      const payload = buildScrobblePayload(
        mediaInfo.tmdbId, mediaInfo.mediaType, progress,
        mediaInfo.season, mediaInfo.episode,
      )
      await getWatchApi().scrobble(action, payload)
      window.api.log(`[Watch] scrobble ${action} ${Math.round(progress * 100)}%`)
    } catch (e: any) {
      window.api.log(`[Watch] scrobble ${action} failed: ${e?.message || e}`)
    }
  }, [mediaInfo])

  const markAsWatched = useCallback(async () => {
    if (!mediaInfo || mediaInfo.isTrailer) return
    const d = durationRef.current > 0 ? durationRef.current : fallbackDurationRef.current
    const t = lastGoodPosRef.current
    let progress = 0
    if (isFinite(d) && d > 0 && isFinite(t)) progress = Math.min(Math.max(t / d, 0), 1)
    if (progress < 0.90 && progress < 0.92) return
    try {
      const payload = buildHistoryPayload(
        mediaInfo.tmdbId, mediaInfo.mediaType,
        mediaInfo.season, mediaInfo.episode,
      )
      await getWatchApi().markWatched(payload)
      console.log('[Watch] markWatched ok', payload)
    } catch (e: any) {
      window.api.log(`[Watch] markWatched failed: ${e?.message || e}`)
    }
  }, [mediaInfo])

  // Expose saveCurrentProgress for parent (App.tsx) to call on back-button.
  useImperativeHandle(ref, () => ({
    saveCurrentProgress: () => {
      saveProgress()
      scrobble('stop').catch(() => {})
    },
    wasPlaybackCompleted: () => playbackCompletedRef.current,
  }), [saveProgress, scrobble, playbackCompletedRef])

  // ── Subtitle load: sidecar first, OpenSubtitles fallback ──────────────────
  // ponytail: forced-only defaults to true (opensubtitlesForcedOnly setting);
  // default language comes from preferredLanguages (first entry) or
  // preferredAudioLanguage. Torrent/usenet sidecar .srt/.vtt files are served
  // via the local HTTP cache before hitting OpenSubtitles.

  const handleSearchSubs = useCallback(async () => {
    if (!mediaInfo || mediaInfo.isTrailer) return
    setSearchingSubs(true)
    try {
      const params: any = {
        tmdbId: mediaInfo.tmdbId,
        type: mediaInfo.mediaType,
        season: mediaInfo.season,
        episode: mediaInfo.episode,
        language: preferredLanguagesRef.current[0]?.toLowerCase().slice(0, 2) || 'en',
      }
      if (useSettingsStore.getState().opensubtitlesForcedOnly) params.forcedOnly = true
      const subs = await window.api.openSubtitles.search(params)
      const prefs = preferredLanguagesRef.current
      if (subs.length > 0 && prefs.length > 0) {
        const match = subs.find((s: any) => {
          const lang = s.attributes.language || ''
          return prefs.some(p => lang.toLowerCase().startsWith(p.toLowerCase()))
        })
        if (match) {
          const fileId = match.attributes.files?.[0]?.file_id
          if (fileId) {
            const filePath = await window.api.openSubtitles.downloadAndSave(fileId)
            if (filePath) {
              videoJsRef.current?.addSubtitle(filePath, match.attributes.language || 'sub')
            }
          }
        }
      }
    } catch {}
    setSearchingSubs(false)
    setShowSubNotFound(false)
    showSubNotFoundRef.current = false
  }, [mediaInfo])

  // ── Finish playback ────────────────────────────────────────────────────

  const finishPlayback = useCallback((goNext: boolean) => {
    saveProgress()
    scrobble('stop').catch(() => {})
    markAsWatched().catch(() => {})
    useMediaStore.getState().triggerRefresh()
    if (goNext) onNextEpisode()
    else onBack()
  }, [saveProgress, scrobble, markAsWatched, onNextEpisode, onBack])

  // ── Fetch intro segments ───────────────────────────────────────────────

  useEffect(() => {
    setSegments([])
    setActiveSkip(null)

    if (!mediaInfo || mediaInfo.isTrailer) return

    if (mediaInfo.segments && mediaInfo.segments.length > 0) {
      setSegments(mediaInfo.segments.map(s => ({
        type: s.type as any,
        startMs: s.startMs,
        endMs: s.endMs,
        durationMs: s.endMs && s.startMs ? s.endMs - s.startMs : null,
        startsAtBeginning: s.startMs === 0,
        endsAtMediaEnd: false,
      })))
      return
    }

    if (mediaInfo.mediaType !== 'tv' && mediaInfo.mediaType !== 'movie') return

    const mi = mediaInfo
    let cancelled = false
    async function fetchSegments() {
      try {
        const res = await window.api.intros.getSegments({
          tmdbId: mi.tmdbId,
          season: mi.season,
          episode: mi.episode,
        })
        if (cancelled) return
        if (res && res.length > 0) {
          setSegments(res)
        }
      } catch {}
    }
    fetchSegments()
    return () => { cancelled = true }
  }, [mediaInfo?.tmdbId, mediaInfo?.mediaType, mediaInfo?.season, mediaInfo?.episode])

  // ── Focus the skip button when it appears ───────────────────────────────
  // Without focus, Enter is caught by the window-level OSD handler (opens the
  // OSD instead of activating the button). The button's own onKeyDown then
  // consumes the key via stopPropagation.
  useEffect(() => {
    if (activeSkip) skipBtnRef.current?.focus()
  }, [activeSkip])

  // ── Fallback duration for progress calc ────────────────────────────────

  useEffect(() => {
    fallbackDurationRef.current = 0
    if (!mediaInfo || mediaInfo.isTrailer) return
    if (mediaInfo.mediaType === 'movie') {
      const movieRuntime = (selectedMedia as any)?.runtime
      if (typeof movieRuntime === 'number' && movieRuntime > 0) {
        fallbackDurationRef.current = movieRuntime * 60
      }
    } else if (mediaInfo.mediaType === 'tv' && mediaInfo.season && mediaInfo.episode) {
      let cancelled = false
      window.api.tmdb.getEpisode(mediaInfo.tmdbId, mediaInfo.season, mediaInfo.episode).then((ep: any) => {
        if (!cancelled && ep?.runtime && typeof ep.runtime === 'number') {
          fallbackDurationRef.current = ep.runtime * 60
        }
      }).catch(() => {})
      return () => { cancelled = true }
    }
  }, [mediaInfo?.tmdbId, mediaInfo?.mediaType, mediaInfo?.season, mediaInfo?.episode, mediaInfo?.isTrailer, selectedMedia])

  // ── Auto-load subtitles: sidecar first, OpenSubtitles fallback ───────────
  useEffect(() => {
    const fetchSubtitles = async () => {
      if (!mediaInfo || mediaInfo.isTrailer) return
      try {
        // 1a) Torrent sidecar subtitles (in-torrent .srt/.vtt via local HTTP cache)
        if (mediaInfo.torrentInfoHash && mediaInfo.torrentFileIndex !== undefined) {
          const sidecar = await window.api.torrent.getSidecarSubs(
            mediaInfo.torrentInfoHash,
            mediaInfo.torrentFileIndex,
          )
          if (sidecar.length > 0) {
            for (const sub of sidecar) {
              videoJsRef.current?.addSubtitle(sub.url, sub.label, sub.language)
            }
            return
          }
        }
        // 1b) Usenet sidecar subtitles (completed download dir .srt/.vtt files)
        if (mediaInfo.usenetCompletedDir) {
          const sidecar = await window.api.usenet.getSidecarSubs(mediaInfo.usenetCompletedDir)
          if (sidecar.length > 0) {
            for (const sub of sidecar) {
              videoJsRef.current?.addSubtitle(sub.url, sub.label, sub.language)
            }
            return
          }
        }
        // 2) Fallback: OpenSubtitles (forced-only, user preferred language)
        const params: any = {
          tmdbId: mediaInfo.tmdbId,
          type: mediaInfo.mediaType,
          season: mediaInfo.season,
          episode: mediaInfo.episode,
          language: preferredLanguagesRef.current[0]?.toLowerCase().slice(0, 2) || 'en',
        }
        if (useSettingsStore.getState().opensubtitlesForcedOnly) params.forcedOnly = true
        const subs = await window.api.openSubtitles.search(params)
        const prefs = preferredLanguagesRef.current
        if (subs.length > 0 && prefs.length > 0) {
          const match = subs.find((s: any) => {
            const lang = s.attributes.language || ''
            return prefs.some(p => lang.toLowerCase().startsWith(p.toLowerCase()))
          })
          if (match) {
            const fileId = match.attributes.files?.[0]?.file_id
            if (fileId) {
              const filePath = await window.api.openSubtitles.downloadAndSave(fileId)
              if (filePath) {
                videoJsRef.current?.addSubtitle(filePath, match.attributes.language || 'sub')
              }
            }
          }
        }
      } catch {}
    }
    fetchSubtitles()
  }, [mediaInfo?.tmdbId, mediaInfo?.mediaType, mediaInfo?.season, mediaInfo?.episode, mediaInfo?.torrentInfoHash, mediaInfo?.torrentFileIndex, mediaInfo?.usenetCompletedDir])

  // ── Event callbacks for VideoJsPlayer ──────────────────────────────────

  const handleTimeUpdate = useCallback((time: number) => {
    currentTimeRef.current = time
    // Advance lastGoodPosRef only forward (or within 30s) — crash/reset can
    // cause pos to jump to 0, corrupting Trakt scrobble position.
    if (time > lastGoodPosRef.current || Math.abs(time - lastGoodPosRef.current) < 30) {
      lastGoodPosRef.current = time
    }

    // Persist a fresh resume point every tick.
    saveProgress()

    // ── Scrobble logic (moved from poll loop) ──────────────────────────
    const playing = isPlayingRef.current
    const d = durationRef.current

    if (playing && !startScrobbledRef.current && isFinite(d) && d > 0) {
      scrobble('start')
      startScrobbledRef.current = true
    }

    // Periodic progress update to Trakt (throttled to 60s inside scrobble()).
    if (playing && startScrobbledRef.current) {
      scrobble('start')
    }

    // ── Skip-intro detection ──────────────────────────────────────────
    if (segments.length > 0) {
      const currentMs = time * 1000
      const active = segments.find((seg) => {
        if (seg.type !== 'intro' && seg.type !== 'recap') return false
        if (seg.startMs === null || seg.endMs === null) return false
        return currentMs >= seg.startMs && currentMs <= seg.endMs
      })
      setActiveSkip(active || null)
    }

    // ── Up Next popup (~30s before end of TV episode) ─────────────────
    if (
      mediaInfo &&
      mediaInfo.mediaType === 'tv' &&
      hasNextEpisode &&
      d > 0 &&
      time > 0 &&
      d - time <= 30 &&
      time >= 60
    ) {
      // Up-next is handled by the React overlay — just trigger it once.
      // The state is managed by the parent (App.tsx) via hasNextEpisode.
    }
  }, [mediaInfo, hasNextEpisode, segments, saveProgress, scrobble, finishPlayback])

  const handlePlay = useCallback(() => {
    isPlayingRef.current = true
    const prev = prevPlayStateRef.current
    if (!prev && startScrobbledRef.current) {
      // Resume after pause: send a fresh start so Trakt logs the resume time.
      scrobble('start')
    }
    prevPlayStateRef.current = true
  }, [scrobble])

  const handlePause = useCallback(() => {
    isPlayingRef.current = false
    if (prevPlayStateRef.current) {
      scrobble('pause')
    }
    prevPlayStateRef.current = false
  }, [scrobble])

  const handleEnded = useCallback(() => {
    if (exitedRef.current) return
    exitedRef.current = true
    playbackCompletedRef.current = true
    onPlaybackComplete?.()
    finishPlayback(!!(mediaInfo?.mediaType === 'tv' && hasNextEpisode && autoPlayNextRef.current))
  }, [mediaInfo, hasNextEpisode, finishPlayback, onPlaybackComplete])

  const handleError = useCallback((error?: MediaError | Error) => {
    if (exitedRef.current) return

    let errorMsg = 'Playback error'
    if (error) {
      if ('code' in error && error.code) {
        switch (error.code) {
          case 1: errorMsg = 'Playback was aborted'; break
          case 2: errorMsg = 'A network error occurred while loading the stream'; break
          case 3: errorMsg = 'The video could not be decoded — the format may be unsupported'; break
          case 4: errorMsg = 'The video source is not supported or unavailable'; break
          default: errorMsg = error.message || 'Unknown playback error'
        }
      } else {
        errorMsg = error.message || 'Unknown playback error'
      }
    }

    if (isReconnectableStream() && retryCountRef.current < 1 && onRetryStream) {
      retryCountRef.current++
      window.api.log(`[VP] stream error, auto-reconnect attempt ${retryCountRef.current}`)
      exitedRef.current = false
      onRetryStream()
    } else {
      exitedRef.current = true
      window.api.log(`[VideoPlayer] Playback error: ${errorMsg}`, error)
      setDisplayError(errorMsg)
    }
  }, [isReconnectableStream, onRetryStream])

  const handleAudioTrackSelect = useCallback(async (trackIndex: number) => {
    try {
      const result = await (window.api.player as any).setAudioTrack(trackIndex)
      // The new session has a fresh HLS URL — push it to the video element
      // so playback doesn't freeze on the now-dead old session's URL.
      if (result?.streamUrl && onStreamUrlChange) {
        onStreamUrlChange(result.streamUrl)
      }
    } catch (err: any) {
      setDisplayError(err?.message || 'Failed to switch audio track')
    }
  }, [onStreamUrlChange])

  // Reset state when streamUrl changes.
  useEffect(() => {
    exitedRef.current = false
    startScrobbledRef.current = false
    prevPlayStateRef.current = false
    isPlayingRef.current = false
    lastGoodPosRef.current = 0
    retryCountRef.current = 0
    currentTimeRef.current = 0
    durationRef.current = 0
    setDisplayError(null)
  }, [streamUrl])

  // Listen for FFmpeg process errors (unexpected exit during playback)
  useEffect(() => {
    if (!streamUrl) return
    const unsubscribe = (window.api.player as any).onFfmpegError?.((errorMsg: string) => {
      if (exitedRef.current) return
      window.api.log(`[VP] FFmpeg error received: ${errorMsg}`)
      exitedRef.current = true
      setDisplayError(errorMsg)
    })
    return unsubscribe
  }, [streamUrl])

  // Loading timeout — surface error if stream doesn't start within 10s
  useEffect(() => {
    if (!playerLoading || !streamUrl) return
    const timeout = setTimeout(() => {
      setDisplayError(prev => prev ?? 'Stream took too long to start — the source may be unavailable or too slow.')
    }, 10_000)
    return () => clearTimeout(timeout)
  }, [playerLoading, streamUrl])

  // ── Render ─────────────────────────────────────────────────────────────

  if (playerLoading) {
    return (
      <div className={styles.player}>
        <div className={styles.splashOverlay}>
          <span className={styles.splashLogo}>Fynix Media Hub</span>
          <span className={styles.splashSub}>Preparing stream&hellip;</span>
          <div className={styles.splashSpinner} />
        </div>
      </div>
    )
  }

  if (streamError) {
    return (
      <div className={styles.player}>
        <ErrorModal
          message={streamError}
          onBack={onBack}
          onRetry={onStreamError}
        />
      </div>
    )
  }

  if (displayError) {
    return (
      <div className={styles.player}>
        <ErrorModal
          message={displayError}
          onBack={onBack}
          onRetry={() => {
            setDisplayError(null)
            onRetryStream?.()
          }}
        />
      </div>
    )
  }

  return (
    <div className={styles.player} tabIndex={-1}>
      {/* Video.js player — fills the container, provides all controls */}
      {streamUrl && (
        <VideoJsPlayer
          ref={videoJsRef}
          src={streamUrl}
          startTime={mediaInfo?.resumePosition ?? 0}
          shouldResume={!!mediaInfo?.resumePosition}
          fallbackDuration={fallbackDurationRef.current || 0}
          onTimeUpdate={handleTimeUpdate}
          onDurationChange={(d) => { durationRef.current = d }}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          onError={handleError}
          title={title}
          clearlogoUrl={clearlogoUrl}
          onBack={onBack}
          mediaInfo={mediaInfo}
          audioTracks={audioTracks}
          isRemux={isRemux}
          onAudioTrackSelect={handleAudioTrackSelect}
        />
      )}

      {/* Skip intro / recap button overlay */}
      {activeSkip && (
        <div className={styles.skipOverlay}>
          <button
            ref={skipBtnRef}
            tabIndex={0}
            className={styles.skipBtn}
            onClick={() => {
              if (activeSkip.endMs !== null) {
                videoJsRef.current?.seek(activeSkip.endMs / 1000)
              }
              setActiveSkip(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                // Focused skip button: consume the key so the window-level OSD
                // handler (open OSD / activate OSD button) never also fires.
                e.preventDefault()
                e.stopPropagation()
                if (activeSkip.endMs !== null) {
                  videoJsRef.current?.seek(activeSkip.endMs / 1000)
                }
                setActiveSkip(null)
              }
            }}
          >
            {activeSkip.type === 'recap' ? 'Skip Recap' : 'Skip Intro'}
          </button>
        </div>
      )}

      {/* Up Next overlay — appears 30s before end of TV episodes */}
      {mediaInfo?.mediaType === 'tv' && hasNextEpisode && durationRef.current > 0 && currentTimeRef.current > 0 && durationRef.current - currentTimeRef.current <= 30 && currentTimeRef.current >= 60 && (
        <div className={styles.skipOverlay}>
          <button
            tabIndex={0}
            className={styles.skipBtn}
            onClick={() => {
              exitedRef.current = true
              onNextEpisode()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                // Same as the skip button: consume so the OSD handler doesn't fire.
                e.preventDefault()
                e.stopPropagation()
                exitedRef.current = true
                onNextEpisode()
              }
            }}
          >
            Up Next: {nextEpisodeTitle || 'Next Episode'}
          </button>
        </div>
      )}

      {/* Subtitle not found overlay */}
      {showSubNotFound && (
        <div className={styles.splashOverlay}>
          <span className={styles.splashLogo}>No Subtitles</span>
          <span className={styles.splashSub}>
            {searchingSubs ? 'Searching for subtitles...' : 'No subtitles available for this video. Search OpenSubtitles?'}
          </span>
          {!searchingSubs && (
            <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
              <button
                className={styles.skipBtn}
                onClick={handleSearchSubs}
                style={{ padding: '12px 32px', fontSize: 16 }}
              >
                Yes, Search
              </button>
              <button
                className={styles.skipBtn}
                onClick={() => { setShowSubNotFound(false); showSubNotFoundRef.current = false }}
                style={{ padding: '12px 32px', fontSize: 16, opacity: 0.6 }}
              >
                No
              </button>
            </div>
          )}
          {searchingSubs && <div className={styles.splashSpinner} />}
        </div>
      )}
    </div>
  )
})
