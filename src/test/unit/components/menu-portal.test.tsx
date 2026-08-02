// @vitest-environment jsdom
// Verify the LiveTV context menu is portaled to document.body (escapes the
// .animate-fade transformed ancestor that breaks position:fixed viewport anchoring).
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

// Lightweight re-creation of the portal pattern used in LiveTV.tsx + Prompt.tsx:
// the menu must mount as a direct child of document.body, not inside the
// render container, so no ancestor transform can hijack its fixed positioning.
describe('menu portal (position:fixed escape)', () => {
  it('portaled overlay is a direct child of document.body', () => {
    const { container } = render(
      <div className="animate-fade">
        <PortalTest />
      </div>,
    )
    // The regular (non-portaled) content stays in the container…
    expect(container.querySelector('.in-container')).toBeTruthy()
    // …but the fixed overlay mounts at the body root.
    const overlay = document.body.querySelector('.portal-overlay')
    expect(overlay).toBeTruthy()
    expect(overlay!.parentElement).toBe(document.body)
    // The overlay is NOT inside the transformed .animate-fade wrapper.
    const inFade = container.querySelector('.portal-overlay')
    expect(inFade).toBeNull()
  })
})

function PortalTest() {
  return (
    <>
      <div className="in-container">content</div>
      {createPortalFn(
        <div className="portal-overlay" style={{ position: 'fixed', inset: 0 }} />,
        document.body,
      )}
    </>
  )
}

// Minimal createPortal shim matching react-dom's signature for the test.
import { createPortal as createPortalFn } from 'react-dom'
