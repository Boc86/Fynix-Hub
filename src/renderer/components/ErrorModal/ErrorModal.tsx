import React from 'react'

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
  return raw
}

export default function ErrorModal({ title = 'Playback Error', message, onBack, onRetry }: Props) {
  const display = friendlyMessage(message)

  return (
    <div
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
              tabIndex={0}
              onClick={onRetry}
              style={{
                padding: '10px 24px', borderRadius: 6,
                border: '1px solid var(--accent, #FF6B00)', background: 'var(--accent, #FF6B00)',
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
}
