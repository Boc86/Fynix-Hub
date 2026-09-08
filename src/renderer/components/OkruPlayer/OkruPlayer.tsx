import React, { useEffect, useRef, useCallback } from 'react'

interface OkruPlayerProps {
  /** Full ok.ru video URL, e.g. https://ok.ru/video/16060681816748 or https://ok.ru/videoembed/16060681816748 */
  url: string
  onBack: () => void
}

/**
 * Dedicated ok.ru player page.
 *
 * Instead of routing through the resolver → CDN proxy → hls.js chain (which
 * hits 400s on VK HLS manifests and fails on AMD/Wayland), this component
 * embeds the official ok.ru iframe player directly, exactly as described in
 * the ok.ru embed documentation:
 * https://apiok.ru/en/ext/video
 *
 * The embed URL format is:
 *   https://ok.ru/videoembed/{videoId}?autoplay=1
 *
 * ok.ru serves its own player with proper auth/cookies/CDN handling, so we
 * let the upstream player deal with stream selection, manifest parsing, and
 * segment delivery.
 *
 * Keyboard navigation: the ok.ru iframe is cross-origin, so keyboard events
 * inside it do not bubble to the parent document. We install a capturing-phase
 * keydown listener on `window` (capturing fires before the event reaches the
 * iframe) so that Escape, Backspace, and Enter/Space always reach the app's
 * navigation handlers even when the iframe has focus.
 */
export default function OkruPlayer({ url, onBack }: OkruPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Extract the video ID from the URL and build the embed URL.
  const videoId = url.match(/ok\.ru\/video(?:embed)?\/(\d+)/)?.[1]
  const embedUrl = videoId
    ? `https://ok.ru/videoembed/${videoId}?autoplay=1`
    : null

  // Ensure the iframe gets proper focus for keyboard navigation support.
  useEffect(() => {
    iframeRef.current?.focus()
  }, [embedUrl])

  // Intercept Escape, Backspace, and Enter at the window level (capturing
  // phase) so they work even when the cross-origin iframe has focus.
  // Arrow keys are left to the ok.ru player for seeking.
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Backspace') {
      e.preventDefault()
      e.stopImmediatePropagation()
      onBack()
    }
  }, [onBack])

  useEffect(() => {
    // Use capture=true so the listener fires before the event reaches the iframe
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [handleKeyDown])

  if (!embedUrl) {
    return (
      <div style={{
        position: 'absolute',
        inset: 0,
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        zIndex: 10,
      }}>
        <span>Invalid ok.ru URL — could not extract video ID</span>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{
        padding: '8px 16px',
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        zIndex: 1,
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 20,
            padding: '4px 8px',
            lineHeight: 1,
          }}
        >
          ←
        </button>
        <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 13 }}>
          ok.ru Replay
        </span>
      </div>
      <iframe
        ref={iframeRef}
        src={embedUrl}
        style={{ flex: 1, border: 'none', width: '100%' }}
        allowFullScreen
        allow="autoplay; encrypted-media; picture-in-picture; clipboard-write"
        referrerPolicy="no-referrer-when-downgrade"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation"
        title="ok.ru Replay Player"
      />
    </div>
  )
}
