import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  percent: number
  speed?: number
  error?: string | null
  onCancel: () => void
}

function formatSpeed(bytesPerSecond: number): string {
  if (!bytesPerSecond || bytesPerSecond <= 0) return ''
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  let v = bytesPerSecond
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

export default function UpdateModal({ percent, speed, error, onCancel }: Props) {
  const isError = !!error
  const isInstalling = !isError && percent >= 100
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Auto-focus the action button on mount so Enter/Escape work immediately.
  useEffect(() => {
    buttonRef.current?.focus()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      // Single-action modal: keep focus trapped on the button so Tab never
      // escapes into the app UI behind the overlay.
      e.preventDefault()
      return
    }
    if (e.key === 'Escape') {
      // Swallow so the window-level keydown delegator never also navigates.
      e.stopPropagation()
      onCancel()
      return
    }
    // Enter/Space on the focused button: swallow (no preventDefault) so the
    // native click fires but the global handler never also reacts.
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement).tagName === 'BUTTON') {
      e.stopPropagation()
    }
  }

  const modal = (
    <div
      data-testid="update-modal-backdrop"
      onKeyDown={handleKeyDown}
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      }}
    >
      <div
        data-testid="update-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 12, padding: 32, minWidth: 380, maxWidth: 420,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)', textAlign: 'center',
        }}
      >
        <h2 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 600, color: '#fff' }}>
          {isError ? 'Update Failed' : isInstalling ? 'Installing Update…' : 'Downloading Update'}
        </h2>
        <p style={{ margin: '0 0 24px 0', fontSize: 14, color: isError ? '#ff6b6b' : 'rgba(255,255,255,0.6)' }}>
          {isError ? error : isInstalling ? 'Update complete — restarting…' : 'Please wait while the update downloads…'}
        </p>

        {!isError && !isInstalling && (
          <>
            <div
              style={{
                width: '100%', height: 8, background: 'rgba(255,255,255,0.1)',
                borderRadius: 4, overflow: 'hidden', marginBottom: 12,
              }}
            >
              <div
                data-testid="update-progress-bar"
                style={{
                  width: `${Math.min(Math.max(percent, 0), 100)}%`, height: '100%',
                  background: 'var(--accent, #FF6B00)', borderRadius: 4,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
                {Math.round(percent)}%
              </span>
              {formatSpeed(speed ?? 0) && (
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                  {formatSpeed(speed ?? 0)}
                </span>
              )}
            </div>
          </>
        )}

        {isInstalling && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 4 }}>
            <div
              style={{
                width: 24, height: 24, border: '3px solid rgba(255,255,255,0.2)',
                borderTopColor: 'var(--accent, #FF6B00)', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
              Installation in progress — the app will restart when finished.
            </div>
          </div>
        )}

        <button
          ref={buttonRef}
          tabIndex={0}
          onClick={onCancel}
          style={{
            marginTop: 20, padding: '8px 20px', borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.2)', background: 'transparent',
            color: '#fff', cursor: 'pointer', fontSize: 13,
          }}
        >
          {isError ? 'Close' : 'Hide'}
        </button>
      </div>
    </div>
  )

  // Portal to document.body — fixed overlays must not anchor to animated
  // view wrappers (repo-wide rule, see ErrorModal).
  return createPortal(modal, document.body)
}
