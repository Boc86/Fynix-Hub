import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useSettingsStore } from '../../store/settingsStore'
import { useChannelLogo } from '../../utils/useChannelLogo'
import { normalizeLogoUrl } from '../../utils/logos'

export interface Recording {
  id: string
  title: string
  channelName: string
  startTime: number
  endTime: number
  actualStartTime: number
  actualEndTime: number
  filePath: string
  status: 'scheduled' | 'recording' | 'completed' | 'failed'
  error?: string
  durationSec: number
  sizeBytes: number
  source: string
  channel: { id: string; name: string; countryCode: string; playerUrl?: string }
  sources: { type: string; url?: string }[]
}

interface RecordingsProps {
  onPlayUrl: (url: string) => Promise<void>
  onBack: () => void
}

const STATUS_COLORS: Record<Recording['status'], string> = {
  scheduled: '#f5a623',
  recording: '#ff3b30',
  completed: '#34c759',
  failed: '#8e8e93',
}

const STATUS_LABELS: Record<Recording['status'], string> = {
  scheduled: 'Scheduled',
  recording: 'Recording…',
  completed: 'Completed',
  failed: 'Failed',
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function RecordingLogo({ channel, channelName }: { channel: Recording['channel']; channelName: string }) {
  const customLogo = useSettingsStore((s) => s.liveTvCustomLogos?.[channel?.id] || '')
  const verified = useChannelLogo(channelName, '', channel?.countryCode || '')
  const src = normalizeLogoUrl(customLogo) || verified
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [src])
  if (!src || failed) return null
  return (
    <img src={src} alt="" style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 6, marginRight: 12 }}
      onError={() => setFailed(true)} />
  )
}

export default function Recordings({ onPlayUrl, onBack }: RecordingsProps) {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<Recording | null>(null)
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [focusedIdx, setFocusedIdx] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const list = await window.api.recordings.list()
      setRecordings(list || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { refresh(); containerRef.current?.focus() }, [refresh])

  // Poll while any recording is scheduled/recording so statuses update live
  useEffect(() => {
    const hasActive = recordings.some(r => r.status === 'scheduled' || r.status === 'recording')
    if (!hasActive) return
    const iv = setInterval(refresh, 15000)
    return () => clearInterval(iv)
  }, [recordings, refresh])

  useEffect(() => { refresh(); containerRef.current?.focus() }, [refresh])

  const flash = (text: string, error?: boolean) => {
    setMsg({ text, error })
    setTimeout(() => setMsg(null), 4000)
  }

  const handleCancel = async (rec: Recording) => {
    try {
      await window.api.recordings.cancel(rec.id)
      flash(`Cancelled: ${rec.title}`)
      refresh()
    } catch (err: any) {
      flash(`Failed to cancel: ${err?.message || err}`, true)
    }
  }

  const handleDelete = async (rec: Recording) => {
    setConfirmDelete(null)
    try {
      await window.api.recordings.deleteRecording(rec.id)
      flash(`Deleted: ${rec.title}`)
      refresh()
    } catch (err: any) {
      flash(`Failed to delete: ${err?.message || err}`, true)
    }
  }

  const handlePlay = async (rec: Recording) => {
    try {
      await onPlayUrl(`file://${rec.filePath}`)
    } catch (err: any) {
      flash(`Failed to play: ${err?.message || err}`, true)
    }
  }

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (confirmDelete) return
    if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); onBack(); return }
    if (recordings.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIdx(i => Math.min(i + 1, recordings.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const rec = recordings[focusedIdx]
      if (!rec) return
      if (rec.status === 'completed' || rec.status === 'recording') handlePlay(rec)
      else if (rec.status === 'scheduled') handleCancel(rec)
    }
  }, [recordings, focusedIdx, confirmDelete, onBack])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div ref={containerRef} tabIndex={0} style={{ height: '100%', overflow: 'auto', outline: 'none', padding: '24px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#fff' }}>Recordings</h2>
        <span style={{ marginLeft: 12, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
          {recordings.length} {recordings.length === 1 ? 'recording' : 'recordings'}
        </span>
        <button tabIndex={0} onClick={refresh}
          style={{ marginLeft: 'auto', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 13, fontWeight: 600 }}>
          Refresh
        </button>
      </div>

      {msg && (
        <div style={{ padding: '10px 16px', marginBottom: 16, borderRadius: 8, background: msg.error ? 'rgba(255,59,48,0.15)' : 'rgba(52,199,89,0.15)', color: msg.error ? '#ff3b30' : '#34c759', fontSize: 13 }}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
          Loading recordings...
        </div>
      ) : recordings.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 250, gap: 8 }}>
          <div style={{ fontSize: 40, opacity: 0.4 }}>📼</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15 }}>No recordings yet</div>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Open the EPG and press the red record button on any programme to schedule one.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recordings.map((rec, i) => {
            const focused = i === focusedIdx
            const active = rec.status === 'scheduled' || rec.status === 'recording'
            return (
              <div key={rec.id}
                data-recording-row={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 10,
                  background: focused ? 'rgba(var(--accent-rgb), 0.12)' : 'rgba(255,255,255,0.04)',
                  border: focused ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.08)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={() => setFocusedIdx(i)}
              >
                <RecordingLogo channel={rec.channel} channelName={rec.channelName} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.title}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                      padding: '2px 8px', borderRadius: 10, color: '#fff',
                      background: STATUS_COLORS[rec.status], opacity: 0.9,
                    }}>
                      {STATUS_LABELS[rec.status]}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {rec.channelName} · {formatDate(rec.startTime)} – {formatDate(rec.endTime)}
                  </div>
                  {rec.error && (
                    <div style={{ fontSize: 11, color: '#ff6b6b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.error}</div>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', textAlign: 'right', flexShrink: 0 }}>
                  <div>{formatBytes(rec.sizeBytes)}</div>
                  <div style={{ fontSize: 11, marginTop: 2 }}>
                    {rec.durationSec ? `${Math.round(rec.durationSec / 60)} min` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {(rec.status === 'completed' || rec.status === 'recording') && (
                    <button tabIndex={0} onClick={() => handlePlay(rec)}
                      style={{ padding: '7px 14px', borderRadius: 8, cursor: 'pointer', background: 'var(--accent)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                      {rec.status === 'recording' ? 'Watch Live' : 'Play'}
                    </button>
                  )}
                  {active && (
                    <button tabIndex={0} onClick={() => handleCancel(rec)}
                      style={{ padding: '7px 14px', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,149,0,0.15)', border: '1px solid rgba(255,149,0,0.5)', color: '#ff9500', fontSize: 12, fontWeight: 600 }}>
                      Cancel
                    </button>
                  )}
                  <button tabIndex={0} onClick={() => setConfirmDelete(rec)}
                    style={{ padding: '7px 14px', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,59,48,0.12)', border: '1px solid rgba(255,59,48,0.4)', color: '#ff6b6b', fontSize: 12, fontWeight: 600 }}>
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
          onClick={() => setConfirmDelete(null)}>
          <div style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: 24, minWidth: 360, maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}
            onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Delete recording?</h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>
              "{confirmDelete.title}" and its file will be permanently removed. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button tabIndex={0} onClick={() => setConfirmDelete(null)}
                style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 14 }}>
                Cancel
              </button>
              <button tabIndex={0} onClick={() => handleDelete(confirmDelete)}
                style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#ff3b30', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
