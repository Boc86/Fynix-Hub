import React from 'react'

interface Props {
  percent: number
  onCancel: () => void
}

export default function UpdateModal({ percent, onCancel }: Props) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 12, padding: 32, minWidth: 380, maxWidth: 420,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)', textAlign: 'center',
        }}
      >
        <h2 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 600, color: '#fff' }}>
          Downloading Update
        </h2>
        <p style={{ margin: '0 0 24px 0', fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
          Please wait while the update downloads...
        </p>
        <div
          style={{
            width: '100%', height: 8, background: 'rgba(255,255,255,0.1)',
            borderRadius: 4, overflow: 'hidden', marginBottom: 12,
          }}
        >
          <div
            style={{
              width: `${Math.min(Math.max(percent, 0), 100)}%`, height: '100%',
              background: 'var(--accent, #FF6B00)', borderRadius: 4,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
          {Math.round(percent)}%
        </div>
        <button
          tabIndex={0}
          onClick={onCancel}
          style={{
            marginTop: 20, padding: '8px 20px', borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.2)', background: 'transparent',
            color: '#fff', cursor: 'pointer', fontSize: 13,
          }}
        >
          Hide
        </button>
      </div>
    </div>
  )
}
