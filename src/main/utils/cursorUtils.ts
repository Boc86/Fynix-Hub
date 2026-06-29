import { BrowserWindow } from 'electron'

let cursorHideTimeout: NodeJS.Timeout | null = null
const CURSOR_HIDE_DELAY = 3000 // 3 seconds

export function setupCursorHide(window: BrowserWindow): void {
  if (!window) return

  // Show cursor initially
  window.webContents.executeJavaScript('document.body.style.cursor = "auto"')

  // Hide cursor after delay when mouse is idle
  const hideCursor = () => {
    if (cursorHideTimeout) clearTimeout(cursorHideTimeout)
    cursorHideTimeout = setTimeout(() => {
      window.webContents.executeJavaScript('document.body.style.cursor = "none"')
    }, CURSOR_HIDE_DELAY)
  }

  // Show cursor on mouse move
  // @ts-ignore
  window.on('mousemove', () => {
    window.webContents.executeJavaScript('document.body.style.cursor = "auto"')
    hideCursor()
  })

  // Initialize the hide timer
  hideCursor()
}
