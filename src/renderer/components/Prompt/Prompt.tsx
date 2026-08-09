import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../../hooks/useFocusTrap'

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
  const containerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(containerRef)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // Modal-level keys: Escape (when focus is on a button — the input already
  // handles its own Escape/Enter) and swallow everything else so keys never
  // leak to the app's global handler ('s' opens search, arrows navigate, …).
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCancel()
      return
    }
    e.stopPropagation()
  }

  // Portal to document.body: any non-none transform on an ancestor (e.g. the
  // .animate-fade entrance animation leaves an identity transform) makes it the
  // containing block for position:fixed descendants, so a fixed overlay would
  // cover the full scroll area instead of the viewport. Rendering at the body
  // root restores true viewport anchoring.
  return createPortal(
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
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
              // stopPropagation: the Enter must not bubble to the app's global
              // keydown handler (it would open the source selector right after
              // the rename confirm clears the prompt state).
              e.preventDefault(); e.stopPropagation()
              if (value.trim()) onConfirm(value.trim())
            } else if (e.key === 'Escape') {
              e.preventDefault(); e.stopPropagation()
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
    </div>,
    document.body,
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
  const containerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(containerRef)

  // Modal-level keys: Escape cancels; everything else is swallowed so keys
  // never leak to the app's global handler while the dialog is open.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCancel()
      return
    }
    e.stopPropagation()
  }

  // Portal to document.body: any non-none transform on an ancestor (e.g. the
  // .animate-fade entrance animation leaves an identity transform) makes it the
  // containing block for position:fixed descendants, so a fixed overlay would
  // cover the full scroll area instead of the viewport. Rendering at the body
  // root restores true viewport anchoring.
  return createPortal(
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
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
    </div>,
    document.body,
  )
}
