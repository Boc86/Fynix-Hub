import React, { useState, useEffect, useRef } from 'react'

interface PromptProps {
  title: string
  message?: string
  placeholder?: string
  defaultValue?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

export default function Prompt({ title, message, placeholder, defaultValue, confirmLabel = 'OK', cancelLabel = 'Cancel', onConfirm, onCancel }: PromptProps) {
  const [value, setValue] = useState(defaultValue || '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1a1a1a',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 12,
          padding: 24,
          minWidth: 360,
          maxWidth: 480,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)'
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: message ? 8 : 20 }}>
          {title}
        </h2>
        {message && (
          <p style={{ margin: '0 0 16px 0', fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>
            {message}
          </p>
        )}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (value.trim()) onConfirm(value.trim())
            } else if (e.key === 'Escape') {
              onCancel()
            }
          }}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 6,
            color: '#fff',
            fontSize: 14,
            outline: 'none',
            boxSizing: 'border-box'
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            tabIndex={0}
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'transparent',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14
            }}
          >
            {cancelLabel}
          </button>
          <button
            tabIndex={0}
            onClick={() => value.trim() && onConfirm(value.trim())}
            disabled={!value.trim()}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: 'none',
              background: value.trim() ? 'var(--accent, #FF6B00)' : 'rgba(255,107,0,0.3)',
              color: '#fff',
              cursor: value.trim() ? 'pointer' : 'not-allowed',
              fontSize: 14,
              fontWeight: 600
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

interface ConfirmProps {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function Confirm({ title, message, confirmLabel = 'OK', cancelLabel = 'Cancel', destructive, onConfirm, onCancel }: ConfirmProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1a1a1a',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 12,
          padding: 24,
          minWidth: 360,
          maxWidth: 480,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)'
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: message ? 8 : 20 }}>
          {title}
        </h2>
        {message && (
          <p style={{ margin: '0 0 20px 0', fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>
            {message}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            tabIndex={0}
            onClick={onCancel}
            autoFocus
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'transparent',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14
            }}
          >
            {cancelLabel}
          </button>
          <button
            tabIndex={0}
            onClick={onConfirm}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: 'none',
              background: destructive ? '#d32f2f' : 'var(--accent, #FF6B00)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
