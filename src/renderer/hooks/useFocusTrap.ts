import { useEffect, type RefObject } from 'react'

/**
 * Generic focus trap for modals: cycles Tab / Shift+Tab among the focusable
 * elements inside `containerRef` so focus never escapes into the app behind
 * the overlay. Re-arms when `active` flips (e.g. a modal opening).
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    if (!active) return
    const el = containerRef.current
    if (!el) return
    const FOCUSABLE = 'select, input, button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length < 2) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    el.addEventListener('keydown', onKeyDown)
    return () => el.removeEventListener('keydown', onKeyDown)
  }, [containerRef, active])
}
