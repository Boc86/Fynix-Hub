import { useState, useCallback, useRef, useEffect } from 'react'

export interface Section {
  id: string
  itemCount: number
  orientation?: 'horizontal' | 'vertical'
}

interface UseSpatialNavOptions {
  sections: Section[]
  initialSection?: number
  initialItem?: number
  wrapItems?: boolean
  wrapSections?: boolean
  allArrowsNavigateItems?: boolean
  scrollContainerRef?: React.RefObject<HTMLElement | null>
}

interface UseSpatialNavResult {
  focusedSection: number
  focusedItem: number
  setFocusedSection: React.Dispatch<React.SetStateAction<number>>
  setFocusedItem: React.Dispatch<React.SetStateAction<number>>
  handleKeyDown: (e: React.KeyboardEvent | KeyboardEvent) => void
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

function skipEmptySections(sections: Section[], current: number, dir: 1 | -1): number {
  const total = sections.length
  if (total === 0) return current
  let next = current
  for (let i = 0; i < total; i++) {
    next = (next + dir + total) % total
    if (sections[next].itemCount > 0) return next
  }
  return current
}

export function useSpatialNav(options: UseSpatialNavOptions): UseSpatialNavResult {
  const {
    sections,
    initialSection = 0,
    initialItem = 0,
    wrapItems = false,
    wrapSections = true,
    allArrowsNavigateItems = false,
    scrollContainerRef,
  } = options

  const [focusedSection, setFocusedSection] = useState(initialSection)
  const [focusedItem, setFocusedItem] = useState(initialItem)

  const sectionsRef = useRef(sections)
  sectionsRef.current = sections

  // Clamp focus when sections change
  useEffect(() => {
    const sec = sectionsRef.current
    if (sec.length === 0) return
    const clampedSection = clamp(focusedSection, 0, sec.length - 1)
    let changed = false
    if (clampedSection !== focusedSection) {
      setFocusedSection(clampedSection)
      changed = true
    }
    const s = changed ? sec[clampedSection] : sec[focusedSection]
    const maxItem = Math.max(0, (s?.itemCount ?? 1) - 1)
    if (focusedItem > maxItem) {
      setFocusedItem(0)
    }
  }, [sections, focusedSection, focusedItem])

  // Scroll focused element into view
  useEffect(() => {
    const container = scrollContainerRef?.current ?? document.body
    const selector = `[data-section="${focusedSection}"][data-item="${focusedItem}"]`
    const el = container.querySelector(selector) as HTMLElement | null
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [focusedSection, focusedItem, scrollContainerRef])

  const handleKeyDown = useCallback((e: React.KeyboardEvent | KeyboardEvent) => {
    const sec = sectionsRef.current
    if (sec.length === 0) return

    const secItemCount = sec[focusedSection]?.itemCount ?? 0
    if (secItemCount === 0) return

    const isHorizontal = e.key === 'ArrowRight' || e.key === 'ArrowLeft'
    const isVertical = e.key === 'ArrowDown' || e.key === 'ArrowUp'
    if (!isHorizontal && !isVertical) return

    const dir = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1

    if (allArrowsNavigateItems) {
      if (wrapItems) {
        const next = (focusedItem + dir + secItemCount) % secItemCount
        if (next !== focusedItem) {
          e.preventDefault()
          setFocusedItem(next)
        }
      } else {
        const next = clamp(focusedItem + dir, 0, secItemCount - 1)
        if (next !== focusedItem) {
          e.preventDefault()
          setFocusedItem(next)
        }
      }
      return
    }

    const sectionOrientation = sec[focusedSection]?.orientation

    if (isHorizontal) {
      if (sectionOrientation === 'vertical') {
        const next = skipEmptySections(sec, focusedSection, dir)
        if (next !== focusedSection) {
          e.preventDefault()
          setFocusedSection(next)
          setFocusedItem(0)
        }
        return
      }
      if (wrapItems) {
        const next = (focusedItem + dir + secItemCount) % secItemCount
        if (next !== focusedItem) {
          e.preventDefault()
          setFocusedItem(next)
        }
      } else {
        const next = clamp(focusedItem + dir, 0, secItemCount - 1)
        if (next !== focusedItem) {
          e.preventDefault()
          setFocusedItem(next)
        }
      }
      return
    }

    if (isVertical) {
      if (sectionOrientation === 'horizontal') {
        const next = skipEmptySections(sec, focusedSection, dir)
        if (next !== focusedSection) {
          e.preventDefault()
          setFocusedSection(next)
          setFocusedItem(0)
        }
        return
      }
      const next = focusedItem + dir
      if (next >= 0 && next < secItemCount) {
        e.preventDefault()
        setFocusedItem(next)
      } else if (wrapSections) {
        const nextSection = skipEmptySections(sec, focusedSection, dir)
        if (nextSection !== focusedSection) {
          e.preventDefault()
          setFocusedSection(nextSection)
          setFocusedItem(dir === 1 ? 0 : Math.max(0, (sec[nextSection]?.itemCount ?? 1) - 1))
        }
      }
    }
  }, [focusedSection, focusedItem, wrapItems, wrapSections, allArrowsNavigateItems])

  return {
    focusedSection,
    focusedItem,
    setFocusedSection,
    setFocusedItem,
    handleKeyDown,
  }
}
