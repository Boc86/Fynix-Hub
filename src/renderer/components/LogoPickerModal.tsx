import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { candidateLogoUrls } from '../utils/logos'

interface LogoPickerChannel {
  id: string
  name: string
  countryCode: string
}

interface LogoPickerModalProps {
  channel: LogoPickerChannel
  /** Currently saved custom logo URL (may be ''). */
  currentUrl: string
  onConfirm: (url: string) => void
  onCancel: () => void
}

/**
 * Set Logo dialog: shows fuzzy-matched logo candidates from the tv-logos
 * GitHub repo (via candidateLogoUrls) as thumbnails, plus a text input for a
 * custom URL. Candidates are HEAD-verified in the main process (cached) before
 * being shown, so only real logos appear — and they stay. Clicking a candidate
 * (or arrowing to it) fills the input; Enter / "Set Logo" applies,
 * Escape / Cancel closes.
 *
 * Portaled to document.body: any non-none transform on an ancestor (e.g. the
 * .animate-fade entrance animation leaves an identity transform) makes it the
 * containing block for position:fixed descendants, so a fixed overlay would
 * cover the full scroll area instead of the viewport.
 */
export default function LogoPickerModal({ channel, currentUrl, onConfirm, onCancel }: LogoPickerModalProps) {
  const candidates = useMemo(
    () => Array.from(new Set(candidateLogoUrls(channel.name, channel.countryCode))),
    [channel.name, channel.countryCode]
  )

  const [url, setUrl] = useState(currentUrl || '')
  // Index into the verified candidate list; -1 = nothing highlighted.
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const [verified, setVerified] = useState<string[] | null>(null) // null = verifying
  const inputRef = useRef<HTMLInputElement>(null)

  // Verify candidates in the main process (HEAD check, cached) so only real
  // logos are shown — the fuzzy guesses that 404 never appear, and the list
  // never collapses after images fail to load.
  useEffect(() => {
    let cancelled = false
    if (candidates.length === 0) { setVerified([]); return }
    window.api.channelLogo
      .verify(candidates)
      .then((ok: string[]) => { if (!cancelled) setVerified(ok) })
      .catch(() => { if (!cancelled) setVerified([]) })
    return () => { cancelled = true }
  }, [candidates])

  // Pre-highlight a candidate when the current logo matches one of the verified ones.
  useEffect(() => {
    if (verified && currentUrl) {
      const idx = verified.indexOf(currentUrl)
      if (idx >= 0) setSelectedIdx(idx)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verified])

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const liveCandidates = verified ?? []

  // Pure navigation: move the highlight; the value follows via the effect below.
  const moveSelection = (dir: 1 | -1) => {
    if (liveCandidates.length === 0) return
    setSelectedIdx((i) => {
      const n = liveCandidates.length
      return i + dir < 0 ? n - 1 : (i + dir) % n
    })
  }

  // Keep the input value in sync with the highlighted candidate.
  useEffect(() => {
    if (selectedIdx >= 0 && selectedIdx < liveCandidates.length) {
      setUrl(liveCandidates[selectedIdx])
    }
  }, [selectedIdx, liveCandidates])

  const applyUrl = (value: string) => {
    const trimmed = value.trim()
    if (trimmed) onConfirm(trimmed)
  }

  // Keyboard: Escape closes, arrows move the highlighted candidate, Enter
  // applies the highlighted candidate or the typed URL. stopPropagation keeps
  // the event from reaching App's global handler.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation(); onCancel(); return
    }
    if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation(); applyUrl(url); return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault(); e.stopPropagation(); moveSelection(1); return
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault(); e.stopPropagation(); moveSelection(-1); return
    }
  }

  const hasUrl = url.trim().length > 0
  const canUseSelected = selectedIdx >= 0 && selectedIdx < liveCandidates.length

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      }}
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 12, padding: 24, width: 560, maxWidth: '92vw',
          maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
          Set Logo — {channel.name}
        </h2>
        <p style={{ margin: '0 0 16px 0', fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>
          Pick a matching logo (↑/↓/←/→ to browse, Enter to apply) or paste a custom image URL below.
        </p>

        {liveCandidates.length > 0 && (
          <div
            role="listbox"
            aria-label="Logo candidates"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}
          >
            {liveCandidates.map((candidateUrl, i) => {
              const selected = i === selectedIdx
              return (
                <button
                  key={candidateUrl}
                  role="option"
                  aria-selected={selected}
                  tabIndex={-1}
                  onClick={() => { setSelectedIdx(i); setUrl(candidateUrl) }}
                  title={candidateUrl}
                  style={{
                    width: 88, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: selected ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                    border: selected ? '2px solid var(--accent, #FF6B00)' : '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 8, cursor: 'pointer', padding: 4,
                  }}
                >
                  <img
                    src={candidateUrl}
                    alt=""
                    loading="lazy"
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                </button>
              )
            })}
          </div>
        )}

        {verified === null && candidates.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
            <div style={{ width: 14, height: 14, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
            Checking candidate logos…
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setSelectedIdx(-1) }}
          placeholder="https://example.com/logo.png"
          onKeyDown={handleKeyDown}
          style={{
            width: '100%', padding: '10px 12px', boxSizing: 'border-box',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 6, color: '#fff', fontSize: 14, outline: 'none',
          }}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            tabIndex={0}
            onClick={onCancel}
            style={{
              padding: '8px 16px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)',
              background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 14,
            }}
          >
            Cancel
          </button>
          <button
            tabIndex={0}
            disabled={!canUseSelected}
            onClick={() => canUseSelected && onConfirm(liveCandidates[selectedIdx])}
            style={{
              padding: '8px 16px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)',
              background: canUseSelected ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
              color: canUseSelected ? '#fff' : 'rgba(255,255,255,0.35)',
              cursor: canUseSelected ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 600,
            }}
          >
            Use Selected
          </button>
          <button
            tabIndex={0}
            disabled={!hasUrl}
            onClick={() => applyUrl(url)}
            style={{
              padding: '8px 16px', borderRadius: 6, border: 'none',
              background: hasUrl ? 'var(--accent, #FF6B00)' : 'rgba(255,107,0,0.3)',
              color: '#fff', cursor: hasUrl ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 600,
            }}
          >
            Set Logo
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
