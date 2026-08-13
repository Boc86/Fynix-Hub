import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  title?: string
  message: string
  onBack?: () => void
  onRetry?: () => void
}

function friendlyMessage(raw: string): string {
  const lower = raw.toLowerCase()
  if (lower.includes('encrypted') || lower.includes('par2') || lower.includes('repair'))
    return 'Download failed — the file may be encrypted or incomplete on Usenet.'
  if (lower.includes('could not get stream url') || lower.includes('could not locate'))
    return 'Could not locate the downloaded file — it may still be unpacking.'
  if (lower.includes('failed to send nzb') || lower.includes('connect to download client'))
    return 'Could not connect to your download client — check NZBGet settings.'
  if (lower.includes('exceeds') && lower.includes('limit'))
    return 'File is too large for your download size limit.'
  if (lower.includes('download removed'))
    return 'The download was removed before playback started.'
  if (lower.includes('download') && lower.includes('failed'))
    return 'Download failed in NZBGet — check parity status and logs.'
  if (lower.includes('failed to start player') || lower.includes('mpv'))
    return 'Video player failed to start.'
  if (lower.includes('timeout') || lower.includes('timed out'))
    return 'Connection timed out — check your network and Usenet settings.'
  if (lower.includes('ffmpeg') && lower.includes('not found'))
    return 'FFmpeg is not installed or not in PATH. Check your installation.'
  if (lower.includes('ffmpeg') && (lower.includes('exit') || lower.includes('crashed')))
    return 'FFmpeg process failed — the stream may be corrupted or unsupported.'
  if (lower.includes('codec') || lower.includes('decoder'))
    return 'Video codec is not supported by your system. Try a different source.'
  if (lower.includes('network') || lower.includes('connection refused') || lower.includes('connection reset'))
    return 'Network error — the stream server may be unreachable.'
  if (lower.includes('no such file') || lower.includes('file not found'))
    return 'The stream file could not be found — it may have been removed.'
  if (lower.includes('permission denied'))
    return 'Permission denied — check file permissions.'
  if (lower.includes('invalid data') || lower.includes('corrupt'))
    return 'The stream data appears to be corrupted or invalid.'
  if (lower.includes('protocol') || lower.includes('not supported'))
    return 'The stream protocol is not supported. Try a different source.'
  return raw
}

export default function ErrorModal({ title = 'Playback Error', message, onBack, onRetry }: Props) {
  const display = friendlyMessage(message)
  const backRef = useRef<HTMLButtonElement>(null)
  const retryRef = useRef<HTMLButtonElement>(null)

  // Auto-focus the primary action on mount — the player behind holds focus
  // otherwise, so Enter/arrows go nowhere (or leak to the global delegator).
  useEffect(() => {
    ;(retryRef.current ?? backRef.current)?.focus()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      // Focus trap: keep Tab/Shift+Tab cycling between the modal buttons so
      // focus never escapes into the hidden app UI behind the overlay.
      const buttons = [backRef.current, retryRef.current].filter(Boolean) as HTMLButtonElement[]
      if (buttons.length < 2) return
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
      return
    }
    if (e.key === 'Escape') {
      // Swallow Escape so the window-level handler never also navigates
      // (modal rule: stopPropagation on Escape/Enter). No onBack → let the
      // global Escape (leave player) run instead of trapping the user.
      if (onBack) {
        e.stopPropagation()
        onBack()
      }
      return
    }
    // Enter/Space on a button: let the native click fire (confirm/retry),
    // but stop the event from reaching the window-level keydown handler.
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement).tagName === 'BUTTON') {
      e.stopPropagation()
    }
  }

  const modal = (
    <div
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      }}
    >
      <div
        style={{
          background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 12, padding: 32, minWidth: 380, maxWidth: 440,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)', textAlign: 'center',
        }}
      >
        <h2 style={{ margin: '0 0 12px 0', fontSize: 18, fontWeight: 600, color: '#fff' }}>
          {title}
        </h2>
        <p style={{ margin: '0 0 24px 0', fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
          {display}
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          {onBack && (
            <button
              ref={backRef}
              tabIndex={0}
              onClick={onBack}
              style={{
                padding: '10px 24px', borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.2)', background: 'transparent',
                color: '#fff', cursor: 'pointer', fontSize: 14,
              }}
            >
              Go Back
            </button>
          )}
          {onRetry && (
            <button
              ref={retryRef}
              tabIndex={0}
              onClick={onRetry}
              style={{
                padding: '10px 24px', borderRadius: 6,
                border: 'none', background: 'var(--accent, #FF6B00)',
                color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600,
              }}
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  )

  // Portal to document.body — the player view may sit under animated
  // wrappers whose persisted transform would anchor position:fixed to the
  // wrapper box instead of the viewport (repo-wide fixed-overlay rule).
  return createPortal(modal, document.body)
}
