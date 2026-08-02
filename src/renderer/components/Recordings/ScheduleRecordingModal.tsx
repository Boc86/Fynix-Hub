import React, { useEffect, useState } from 'react'
import { loadMergedChannels, MergedChannel } from '../../utils/channels'

interface ScheduleRecordingModalProps {
  onClose: () => void
  onScheduled: () => void
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 12px',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.15)',
  color: '#fff',
  fontSize: 13,
  outline: 'none',
  colorScheme: 'dark',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'rgba(255,255,255,0.6)',
  marginBottom: 6,
}

function todayLocalISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function ScheduleRecordingModal({ onClose, onScheduled }: ScheduleRecordingModalProps) {
  const [channels, setChannels] = useState<MergedChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [channelId, setChannelId] = useState('')
  const [date, setDate] = useState(todayLocalISO())
  const [startTime, setStartTime] = useState('20:00')
  const [endTime, setEndTime] = useState('21:00')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Only channels with an M3U source can be FFmpeg-recorded (CDN streams use
  // one-time-use tokens), so filter those out for the dropdown.
  useEffect(() => {
    let cancelled = false
    loadMergedChannels()
      .then((chs) => {
        if (cancelled) return
        const recordable = chs.filter((ch) => ch.sources.includes('m3u'))
        setChannels(recordable)
        if (recordable.length > 0) setChannelId(recordable[0].id)
      })
      .catch(() => { if (!cancelled) setError('Failed to load channels') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Escape closes the modal; the parent handler bails out while this is open,
  // so the keypress never reaches the page-level navigation logic.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const channel = channels.find((ch) => ch.id === channelId) || null

  const startMs = date && startTime ? new Date(`${date}T${startTime}`).getTime() : NaN
  const endMs = date && endTime ? new Date(`${date}T${endTime}`).getTime() : NaN
  const endBeforeStart = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs <= startMs
  const valid = Boolean(channel) && Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs

  const handleSubmit = async () => {
    if (!channel || !valid || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await window.api.recordings.schedule({
        title: `Manual: ${channel.name}`,
        channelName: channel.name,
        startTime: startMs,
        endTime: endMs,
        channel: { id: channel.id, name: channel.name, countryCode: channel.countryCode, playerUrl: '' },
        sources: [{ type: 'm3u', url: undefined }], // service resolves the stream URL at fire time
      })
      onScheduled()
      onClose()
    } catch (err: any) {
      setError(`Failed to schedule: ${err?.message || err}`)
      setSubmitting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
      onClick={onClose}>
      <div style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: 24, width: 440, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}
        onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 4 }}>Schedule Recording</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.4 }}>
          Record an M3U channel at a specific time. The stream URL is resolved when the recording starts.
        </p>

        <label style={labelStyle}>Channel</label>
        <select value={channelId} onChange={(e) => setChannelId(e.target.value)} disabled={loading || channels.length === 0}
          style={{ ...inputStyle, cursor: loading || channels.length === 0 ? 'default' : 'pointer' }}>
          {loading && <option value="">Loading channels…</option>}
          {!loading && channels.length === 0 && <option value="">No M3U channels found</option>}
          {channels.map((ch) => (
            <option key={ch.id} value={ch.id}>{ch.name}</option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Start</label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>End</label>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={inputStyle} />
          </div>
        </div>

        {endBeforeStart && (
          <div style={{ fontSize: 12, color: '#ff6b6b', marginTop: 8 }}>End time must be after start time.</div>
        )}
        {error && (
          <div style={{ fontSize: 12, color: '#ff6b6b', marginTop: 8 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
          <button tabIndex={0} onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 14 }}>
            Cancel
          </button>
          <button tabIndex={0} onClick={handleSubmit} disabled={!valid || submitting}
            style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: !valid || submitting ? 'rgba(255,255,255,0.15)' : 'var(--accent)', color: '#fff', cursor: !valid || submitting ? 'default' : 'pointer', fontSize: 14, fontWeight: 600 }}>
            {submitting ? 'Scheduling…' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  )
}
