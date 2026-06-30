import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useMediaStore } from '../../store/mediaStore'
import { useSettingsStore } from '../../store/settingsStore'
import type { IntroSegment } from '../../types.d'
import styles from './VideoPlayer.module.css'

interface MediaInfo {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  season?: number
  episode?: number
  resumePosition?: number
  isTrailer?: boolean
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

export default function VideoPlayer({ onBack, onNextEpisode, onStreamError, streamUrl, streamError, mediaInfo, playerLoading }: VideoPlayerProps) {
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const skipCheckRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const scrobbleThrottle = useRef(0)
  const [segments, setSegments] = useState<IntroSegment[]>([])
  const [activeSkip, setActiveSkip] = useState<IntroSegment | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [fallbackDuration, setFallbackDuration] = useState(0)
  const selectedMedia = useMediaStore((s) => s.selectedMedia)
  const preferredLanguages = useSettingsStore((s) => s.preferredLanguages)
  const preferredLanguagesRef = useRef<string[]>([])
  preferredLanguagesRef.current = preferredLanguages
  const isPlayingRef = useRef(false)
  const prevPlayStateRef = useRef<boolean | null>(null)

  const saveProgress = useCallback(() => {
    if (!mediaInfo || mediaInfo.isTrailer) return
    if (!isFinite(duration) || duration <= 0 || !isFinite(currentTime)) return
    const progress = currentTime / duration
    if (isFinite(progress) && progress > 0) {
      window.api.watch.updateProgress(
        mediaInfo.tmdbId,
        mediaInfo.mediaType,
        progress,
        mediaInfo.season,
        mediaInfo.episode,
      )
    }
  }, [mediaInfo, duration, currentTime])

  const splashHiddenRef = useRef(false)

  const scrobble = useCallback(async (action: 'start' | 'pause' | 'stop') => {
    if (!mediaInfo || mediaInfo.isTrailer) return
    if (!isFinite(duration) || duration <= 0) return
    const progress = currentTime / duration
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
  }, [mediaInfo, duration, currentTime])

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

  // Backup exit handler — if mpv exits and poll loop hasn't caught it yet
  const exitedRef = useRef(false)
  useEffect(() => {
    const unsub = window.api.mpv.onExited(() => {
      if (exitedRef.current) return
      exitedRef.current = true
      saveProgress()
      scrobble('stop').catch(() => {})
      markAsWatched().catch(() => {})
      window.api.mpv.getLastExitCode().then((code) => {
        if (code === 42) {
          onNextEpisode()
        } else {
          onBack()
        }
      }).catch(() => onBack())
    })
    return unsub
  }, [saveProgress, scrobble, markAsWatched, onBack, onNextEpisode])

  // Fetch intro segments
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

    if (mediaInfo.mediaType !== 'tv') return

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

  // Poll mpv for time/duration/paused state + scrobble + exit detection
  useEffect(() => {
    if (playerLoading) return

    let wasEnded = false

    pollIntervalRef.current = setInterval(async () => {
      let pos = 0
      let dur = 0
      let paused = true
      try {
        const poll = await Promise.all([
          window.api.mpv.getTimePos(),
          window.api.mpv.getDuration(),
          window.api.mpv.getPaused(),
        ])
        pos = poll[0]
        dur = poll[1]
        paused = poll[2]

        // Hide splash on first valid time-pos
        if (pos > 0 && !splashHiddenRef.current) {
          splashHiddenRef.current = true
          window.api.mpv.hideSplash().catch(() => {})
        }

        setCurrentTime(pos)
        if (dur > 0) setDuration(dur)

        const playing = !paused
        isPlayingRef.current = playing

        const prev = prevPlayStateRef.current
        if (prev === false && playing) {
          scrobble('start')
        }
        if (prev === true && !playing) {
          scrobble('pause')
        }
        prevPlayStateRef.current = playing

        if (!wasEnded && dur > 0 && pos >= dur - 5 && pos > 0) {
          wasEnded = true
          saveProgress()
          await scrobble('stop')
          await markAsWatched()
          if (mediaInfo?.isTrailer) {
            onBack()
          } else if (mediaInfo?.mediaType === 'tv') {
            onNextEpisode()
          }
        }
      } catch {
        const running = await window.api.mpv.isRunning().catch(() => false)
        if (!running && !wasEnded && !playerLoading) {
          wasEnded = true
          saveProgress()
          scrobble('stop').catch(() => {})
          markAsWatched().catch(() => {})
          const code = await window.api.mpv.getLastExitCode().catch(() => null)
          if (code === 42) {
            onNextEpisode()
          } else {
            onBack()
          }
        }
      }
    }, 1000)

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [playerLoading, mediaInfo, scrobble, saveProgress, markAsWatched, onBack, onNextEpisode])

  // Skip-intro detection — sends skip-intro to mpv Lua script
  useEffect(() => {
    if (skipCheckRef.current) clearInterval(skipCheckRef.current)
    if (segments.length === 0) return

    let lastSignalTime = 0
    skipCheckRef.current = setInterval(() => {
      const currentMs = currentTime * 1000
      const active = segments.find((seg) => {
        if (seg.type !== 'intro' && seg.type !== 'recap') return false
        if (seg.startMs === null || seg.endMs === null) return false
        return currentMs >= seg.startMs && currentMs <= seg.endMs
      })
      setActiveSkip((prev) => {
        if (prev && !active) {
          window.api.mpv.hideSkipIntro().catch(() => {})
          return null
        }
        if (active && (!prev || prev.startMs !== active.startMs)) return active
        return prev
      })

      if (active && active.endMs !== null && Date.now() - lastSignalTime > 5000) {
        lastSignalTime = Date.now()
        window.api.mpv.showSkipIntro(active.endMs).catch(() => {})
      }
    }, 500)

    return () => {
      if (skipCheckRef.current) clearInterval(skipCheckRef.current)
      window.api.mpv.hideSkipIntro().catch(() => {})
    }
  }, [segments, currentTime])

  // Fallback duration for progress calc
  useEffect(() => {
    setFallbackDuration(0)
    if (!mediaInfo || mediaInfo.isTrailer) return
    if (mediaInfo.mediaType === 'movie') {
      const movieRuntime = (selectedMedia as any)?.runtime
      if (typeof movieRuntime === 'number' && movieRuntime > 0) {
        setFallbackDuration(movieRuntime * 60)
      }
    } else if (mediaInfo.mediaType === 'tv' && mediaInfo.season && mediaInfo.episode) {
      let cancelled = false
      window.api.tmdb.getEpisode(mediaInfo.tmdbId, mediaInfo.season, mediaInfo.episode).then((ep: any) => {
        if (!cancelled && ep?.runtime && typeof ep.runtime === 'number') {
          setFallbackDuration(ep.runtime * 60)
        }
      }).catch(() => {})
      return () => { cancelled = true }
    }
  }, [mediaInfo?.tmdbId, mediaInfo?.mediaType, mediaInfo?.season, mediaInfo?.episode, mediaInfo?.isTrailer, selectedMedia])

  // Auto-load subtitles from OpenSubtitles
  useEffect(() => {
    const fetchSubtitles = async () => {
      if (!mediaInfo || mediaInfo.isTrailer) return

      try {
        const params: any = {
          tmdb_id: mediaInfo.tmdbId,
          season: mediaInfo.season,
          episode: mediaInfo.episode,
        }
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
                await window.api.mpv.addSubtitle(filePath)
              }
            }
          }
        }
      } catch {}
    }
    fetchSubtitles()
  }, [mediaInfo?.tmdbId, mediaInfo?.mediaType, mediaInfo?.season, mediaInfo?.episode])

  // Send clearlogo and plot to mpv
  useEffect(() => {
    if (!mediaInfo || mediaInfo.isTrailer || !selectedMedia) return

    // Clearlogo: network name (TV) or production company (movie) or media title
    const tv = selectedMedia as any
    const movie = selectedMedia as any
    let clearlogoText = ''
    if (mediaInfo.mediaType === 'tv' && tv.networks && tv.networks.length > 0) {
      clearlogoText = tv.networks[0].name
    } else if (mediaInfo.mediaType === 'movie' && movie.productionCompanies && movie.productionCompanies.length > 0) {
      clearlogoText = movie.productionCompanies[0].name
    }
    window.api.log('[VideoPlayer] clearlogo text:', JSON.stringify(clearlogoText))
    if (clearlogoText) {
      window.api.mpv.setClearlogo(clearlogoText).catch(() => {})
    }

    // Plot: movie overview or fetch episode overview
    const sendPlot = (text: string) => {
      window.api.log('[VideoPlayer] plot text:', JSON.stringify(text?.slice(0, 100)))
      if (text) window.api.mpv.setPlot(text).catch(() => {})
    }
    if (mediaInfo.mediaType === 'movie') {
      sendPlot((selectedMedia as any).overview)
    } else if (mediaInfo.mediaType === 'tv' && mediaInfo.season && mediaInfo.episode) {
      window.api.tmdb.getEpisode(mediaInfo.tmdbId, mediaInfo.season, mediaInfo.episode).then((ep: any) => {
        sendPlot(ep?.overview)
      }).catch(() => {
        sendPlot((selectedMedia as any).overview)
      })
    }
  }, [mediaInfo?.tmdbId, mediaInfo?.mediaType, mediaInfo?.season, mediaInfo?.episode, mediaInfo?.isTrailer, selectedMedia])

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
        <div className={styles.placeholder}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
          <p className={styles.errorText}>{streamError}</p>
        </div>
      </div>
    )
  }

  // mpv is on top with its own OSC — no visual overlay needed here
  // This component handles backend: polling, scrobbling, subtitles, skip-intro
  return (
    <div className={styles.player} tabIndex={-1} />
  )
}
