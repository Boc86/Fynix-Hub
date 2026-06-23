import React, { useState, useEffect, useRef, useCallback } from 'react'
import styles from './VirtualKeyboard.module.css'

interface VirtualKeyboardProps {
  onClose: () => void
  inputElement?: HTMLInputElement | HTMLTextAreaElement | null
}

type KeyboardMode = 'lower' | 'upper' | 'numbers'

const ROWS_LOWER: string[][] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
]

const ROWS_UPPER: string[][] = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
]

const ROWS_SYMBOLS: string[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['-', '/', ':', ';', '(', ')', '$', '&', '@', '"'],
  ['.', ',', '?', '!', '\'', '`', '~', '%', '^', '*'],
]

const EXTRA_SYMBOLS = ['[', ']', '{', '}', '#', '<', '>', '+', '=', '_', '\\', '|']

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    (el instanceof HTMLInputElement ? HTMLInputElement : HTMLTextAreaElement).prototype, 'value'
  )?.set
  if (nativeSetter) {
    nativeSetter.call(el, value)
  } else {
    el.value = value
  }
}

function insertText(text: string, el: HTMLInputElement | HTMLTextAreaElement) {
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? start
  const newVal = el.value.slice(0, start) + text + el.value.slice(end)
  setNativeValue(el, newVal)
  const newPos = start + text.length
  el.setSelectionRange(newPos, newPos)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function deleteChar(el: HTMLInputElement | HTMLTextAreaElement) {
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? start
  let newVal: string
  if (end > start) {
    newVal = el.value.slice(0, start) + el.value.slice(end)
  } else if (start > 0) {
    newVal = el.value.slice(0, start - 1) + el.value.slice(start)
  } else {
    return
  }
  setNativeValue(el, newVal)
  const newPos = Math.min(start, newVal.length)
  el.setSelectionRange(newPos, newPos)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

export default function VirtualKeyboard({ onClose, inputElement }: VirtualKeyboardProps) {
  const [mode, setMode] = useState<KeyboardMode>('lower')
  const [capsLock, setCapsLock] = useState(false)
  const [shiftOn, setShiftOn] = useState(false)
  const [showExtra, setShowExtra] = useState(false)
  const [highlightedIdx, setHighlightedIdx] = useState(0)
  const highlightedRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  highlightedRef.current = highlightedIdx

  // Focus the container after mount (useEffect, not useLayoutEffect, so
  // App's useLayoutEffect has already saved document.activeElement)
  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  // Close on Escape via window listener
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const currentRows = mode === 'numbers' ? ROWS_SYMBOLS : (mode === 'upper' ? ROWS_UPPER : ROWS_LOWER)
  const letterCount = currentRows.reduce((s, r) => s + r.length, 0)
  const extraCount = (mode === 'numbers' && showExtra) ? EXTRA_SYMBOLS.length : 0

  const specialKeys: Array<{ id: string; label: string; action: string }> = []
  specialKeys.push({ id: '__mode__', label: mode === 'numbers' ? 'ABC' : '123', action: 'mode' })
  if (mode === 'numbers') {
    specialKeys.push({ id: '__extra__', label: '#+=', action: 'extra' })
  }
  if (mode !== 'numbers') {
    specialKeys.push({ id: '__shift__', label: '⇧', action: 'shift' })
    specialKeys.push({ id: '__caps__', label: 'Aa', action: 'caps' })
  }
  specialKeys.push({ id: '__backspace__', label: '⌫', action: 'backspace' })
  specialKeys.push({ id: '__space__', label: 'Space', action: 'space' })
  specialKeys.push({ id: '__enter__', label: '⏎', action: 'enter' })
  specialKeys.push({ id: '__hide__', label: '✕', action: 'hide' })

  const totalButtons = letterCount + extraCount + specialKeys.length

  // Row boundaries for keyboard navigation
  const rowSizes: number[] = currentRows.map((r) => r.length)
  if (extraCount > 0) rowSizes.push(extraCount)
  rowSizes.push(specialKeys.length)

  // Build flat key data
  interface KeyInfo { label: string; action: string; keyChar?: string }
  const flatKeys: KeyInfo[] = []
  for (const row of currentRows) {
    for (const k of row) {
      flatKeys.push({ label: k, action: 'press', keyChar: k })
    }
  }
  if (mode === 'numbers' && showExtra) {
    for (const k of EXTRA_SYMBOLS) {
      flatKeys.push({ label: k, action: 'press', keyChar: k })
    }
  }
  for (const sk of specialKeys) {
    flatKeys.push({ label: sk.label, action: sk.action, keyChar: sk.id })
  }

  // Build row offset array for up/down navigation
  const rowOffsets: number[] = []
  let offset = 0
  for (const size of rowSizes) {
    rowOffsets.push(offset)
    offset += size
  }

  const findRowIndex = (idx: number): number => {
    for (let r = 0; r < rowOffsets.length; r++) {
      const nextOffset = r + 1 < rowOffsets.length ? rowOffsets[r + 1] : totalButtons
      if (idx >= rowOffsets[r] && idx < nextOffset) return r
    }
    return -1
  }

  const handleAction = useCallback((info: KeyInfo) => {
    if (!inputElement) return
    if (info.action === 'press') {
      insertText(info.keyChar!, inputElement)
      if (shiftOn && !capsLock) {
        setShiftOn(false)
        setMode('lower')
      }
    } else if (info.action === 'backspace') {
      deleteChar(inputElement)
    } else if (info.action === 'space') {
      insertText(' ', inputElement)
    } else if (info.action === 'shift') {
      if (mode === 'lower') { setMode('upper'); setShiftOn(true) }
      else if (mode === 'upper' && capsLock) { setMode('lower'); setCapsLock(false) }
      else { setMode('lower'); setShiftOn(false) }
    } else if (info.action === 'caps') {
      setCapsLock((c) => !c)
      setMode((m) => m === 'upper' ? 'lower' : 'upper')
      setShiftOn(false)
    } else if (info.action === 'mode') {
      if (mode === 'numbers') { setMode('lower'); setShowExtra(false) }
      else { setMode('numbers'); setShowExtra(false) }
    } else if (info.action === 'extra') {
      setShowExtra((o) => !o)
    } else if (info.action === 'enter') {
      // Dispatch Enter on the input to trigger search submission
      if (inputElement) {
        inputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      }
      onClose()
    } else if (info.action === 'hide') {
      onClose()
    }
  }, [mode, shiftOn, capsLock, inputElement, onClose])

  // onKeyDown handler for the keyboard container — depends only on
  // stable values (highlightedRef, rowOffsets, totalButtons, etc.)
  const navigate = useCallback((e: React.KeyboardEvent) => {
    const cur = highlightedRef.current
    const total = totalButtons
    if (total === 0) return

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      setHighlightedIdx((cur + 1) % total)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setHighlightedIdx((cur - 1 + total) % total)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const curRow = findRowIndex(cur)
      if (curRow < 0 || curRow + 1 >= rowOffsets.length) return
      const nextRowIdx = rowOffsets[curRow + 1]
      const curInRow = cur - rowOffsets[curRow]
      const nextRowSize = (curRow + 2 < rowOffsets.length ? rowOffsets[curRow + 2] : total) - nextRowIdx
      const target = nextRowIdx + Math.min(curInRow, nextRowSize - 1)
      setHighlightedIdx(target)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const curRow = findRowIndex(cur)
      if (curRow <= 0 || curRow >= rowOffsets.length) return
      const prevRowIdx = rowOffsets[curRow - 1]
      const curInRow = cur - rowOffsets[curRow]
      const prevRowSize = rowOffsets[curRow] - prevRowIdx
      const target = prevRowIdx + Math.min(curInRow, prevRowSize - 1)
      setHighlightedIdx(target)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (cur >= 0 && cur < flatKeys.length) {
        handleAction(flatKeys[cur])
      }
    }
  }, [rowOffsets, totalButtons, flatKeys, handleAction])

  // Clamp highlighted index when rows change
  useEffect(() => {
    if (highlightedIdx >= totalButtons && totalButtons > 0) {
      setHighlightedIdx(totalButtons - 1)
    }
  }, [totalButtons, highlightedIdx])

  const renderRow = (rowKeys: string[], rowIdx: number, baseIdx: number) => (
    <div key={rowIdx} className={styles.row}>
      {rowKeys.map((k, ci) => {
        const idx = baseIdx + ci
        return (
          <button
            key={k}
            tabIndex={-1}
            className={`${styles.key} ${idx === highlightedIdx ? styles.highlighted : ''}`}
            onPointerDown={(e) => { e.preventDefault(); setHighlightedIdx(idx); handleAction(flatKeys[idx]) }}
          >
            {k}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        ref={containerRef}
        className={styles.keyboard}
        onClick={(e) => e.stopPropagation()}
        tabIndex={0}
        onKeyDown={navigate}
      >
        {capsLock && <div className={styles.lockBadge}>Caps Lock</div>}
        {currentRows.map((row, ri) => renderRow(row, ri, rowOffsets[ri]))}
        {mode === 'numbers' && showExtra && (
          <div className={styles.row}>
            {EXTRA_SYMBOLS.map((k, ci) => {
              const idx = rowOffsets[rowOffsets.length - 2] + ci
              return (
                <button
                  key={k}
                  tabIndex={-1}
                  className={`${styles.key} ${idx === highlightedIdx ? styles.highlighted : ''}`}
                  onPointerDown={(e) => { e.preventDefault(); setHighlightedIdx(idx); handleAction(flatKeys[idx]) }}
                >
                  {k}
                </button>
              )
            })}
          </div>
        )}
        <div className={styles.row}>
          {specialKeys.map((sk, si) => {
            const idx = (rowOffsets[rowOffsets.length - 1]) + si
            const isHighlighted = idx === highlightedIdx
            let cls = isHighlighted ? `${styles.specialKey} ${styles.highlighted}` : styles.specialKey
            if (sk.action === 'backspace') cls = isHighlighted ? `${styles.backspaceKey} ${styles.highlighted}` : styles.backspaceKey
            else if (sk.action === 'space') cls = isHighlighted ? `${styles.spaceKey} ${styles.highlighted}` : styles.spaceKey
            else if (sk.action === 'enter') cls = isHighlighted ? `${styles.enterKey} ${styles.highlighted}` : styles.enterKey
            else if (sk.action === 'hide') cls = isHighlighted ? `${styles.hideKey} ${styles.highlighted}` : styles.hideKey
            else if (sk.action === 'shift' && mode === 'upper' && !capsLock) cls = isHighlighted ? `${styles.specialKey} ${styles.specialActive} ${styles.highlighted}` : `${styles.specialKey} ${styles.specialActive}`
            else if (sk.action === 'caps' && capsLock) cls = isHighlighted ? `${styles.specialKey} ${styles.specialActive} ${styles.highlighted}` : `${styles.specialKey} ${styles.specialActive}`
            else if (sk.action === 'extra' && showExtra) cls = isHighlighted ? `${styles.specialKey} ${styles.specialActive} ${styles.highlighted}` : `${styles.specialKey} ${styles.specialActive}`

            return (
              <button
                key={sk.id}
                tabIndex={-1}
                className={cls}
                onPointerDown={(e) => { e.preventDefault(); setHighlightedIdx(idx); handleAction(flatKeys[idx]) }}
              >
                {sk.action === 'backspace' ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z"/>
                  </svg>
                ) : sk.action === 'enter' ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 7v4H5.83l3.58-3.59L8 6l-6 6 6 6 1.41-1.41L5.83 13H21V7z"/>
                  </svg>
                ) : sk.action === 'hide' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                  </svg>
                ) : sk.action === 'shift' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L2 12h3v8h14v-8h3L12 2zM7 18v-2h10v2H7z"/>
                  </svg>
                ) : sk.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
