import { app, BrowserWindow, ipcMain, BrowserView } from 'electron'
import path from 'path'
import { registerIpcHandlers } from './ipc/handlers'
import * as TorrentSearchService from './services/torrent-search.service'
import { TizenTubeService } from './services/tizentube.service'
import { setupCursorHide } from "./utils/cursorUtils"
import { setupRemoteControl } from "./utils/remoteControl"

app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('in-process-gpu')

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined
declare const MAIN_WINDOW_VITE_NAME: string

let mainWindow: BrowserWindow | null = null
let youtubeView: BrowserView | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1280,
    minHeight: 720,
    fullscreen: true,
    backgroundColor: '#141414',
    icon: path.join(__dirname, "../../assets/FLB-512.png"),
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    webPreferences: {
      preload: path.resolve(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(
      path.resolve(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    )
  }
  setupRemoteControl(mainWindow.webContents, mainWindow)
  setupCursorHide(mainWindow)
  mainWindow.maximize()

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('resize', () => {
    if (youtubeView && mainWindow) {
      const { width, height } = mainWindow.getContentBounds()
      youtubeView.setBounds({ x: 0, y: 0, width, height })
    }
  })
}

function createYouTubeView() {
  if (youtubeView || !mainWindow) return

  youtubeView = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Spoof User-Agent to Android TV to get youtube.com/tv interface
  const tvUserAgent = 'Mozilla/5.0 (Linux; Android 11; SHIELD Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  youtubeView.webContents.setUserAgent(tvUserAgent)

  // Also spoof User-Agent at session level for all requests
  youtubeView.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.youtube.com/*'] },
    (details, callback) => {
      details.requestHeaders['User-Agent'] = tvUserAgent
      callback({ requestHeaders: details.requestHeaders })
    }
  )

  // Block ads — catch known ad domains
  youtubeView.webContents.session.webRequest.onBeforeRequest(
    {
      urls: [
        '*://*.doubleclick.net/*',
        '*://*.googlesyndication.com/*',
        '*://*.googleadservices.com/*',
        '*://*.google-analytics.com/*',
        '*://*.googletagmanager.com/*',
        '*://*.googletagservices.com/*',
        '*://*.anchor.fm/*',
        '*://*.adservice.google.com/*',
        '*://*.pagead2.googlesyndication.com/*',
        '*://*.adsafeprotected.com/*',
        '*://*.serving-sys.com/*',
        '*://*.adnxs.com/*',
        '*://*.rubiconproject.com/*',
        '*://*.pubmatic.com/*',
        '*://*.openx.net/*',
        '*://*.casalmedia.com/*',
        '*://*.moatads.com/*',
        '*://*.scorecardresearch.com/*',
      ]
    },
    (details, callback) => {
      callback({ cancel: true })
    }
  )

  mainWindow.addBrowserView(youtubeView)
 
  setupRemoteControl(youtubeView.webContents, mainWindow)
 
  const { width, height } = mainWindow.getContentBounds()
  youtubeView.setBounds({ x: 0, y: 0, width, height })

  // Focus the BrowserView so it receives keyboard input
  youtubeView.webContents.focus()

  // Inject TizenTube on did-finish-load
  let tizentubeInjected = false
  youtubeView.webContents.on('did-finish-load', () => {
    youtubeView?.webContents.focus()

    if (tizentubeInjected) return
    tizentubeInjected = true

    const scripts = TizenTubeService.getScripts()
    for (const script of scripts) {
      const wrapped = `try{\n${script}\n}catch(e){console.error('[TizenTube]',e)}`
      youtubeView?.webContents.executeJavaScript(wrapped).catch((e: any) =>
        console.error('[YouTubeView] TizenTube injection failed:', e)
      )
    }
  })

  // Intercept keyboard events
  youtubeView.webContents.on('before-input-event', (event, input) => {
    // Escape → exit YouTube entirely
    if (input.key === 'Escape' && input.type === 'keyDown') {
      event.preventDefault()
      mainWindow?.webContents.send('youtube:focus-back')
    }
    // Backspace/BrowserBack → go back within YouTube, or exit to app if on main screen
    if ((input.key === 'Backspace' || input.key === 'BrowserBack') && input.type === 'keyDown') {
      event.preventDefault()
      const url = youtubeView?.webContents.getURL() || ''
      console.log('[YouTubeView] Back pressed, current URL:', url)
      // Exit to app when on the root YouTube TV page (no fragment, empty #, or just #/)
      if (url === 'https://www.youtube.com/tv' || url === 'https://www.youtube.com/tv#' || url === 'https://www.youtube.com/tv#/') {
        console.log('[YouTubeView] On root page, exiting to app')
        mainWindow?.webContents.send('youtube:focus-back')
      } else {
        // YouTube TV SPA: dispatch Escape key directly via JS to exit video player
        // Using executeJavaScript bypasses our before-input-event handler
        console.log('[YouTubeView] Dispatching Escape via JS to exit video player')
        youtubeView?.webContents.executeJavaScript(
          'document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true}));' +
          'document.dispatchEvent(new KeyboardEvent("keyup", {key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true}));'
        ).catch(() => {})
      }
    }
  })

  youtubeView.webContents.loadURL('https://www.youtube.com/tv')
}

function destroyYouTubeView() {
  if (youtubeView && mainWindow) {
    try {
      mainWindow.removeBrowserView(youtubeView)
    } catch (e) {
      console.error('[YouTubeView] removeBrowserView failed:', e)
    }
    try {
      // @ts-ignore
      if (typeof youtubeView.webContents.close === 'function') {
        // @ts-ignore
        youtubeView.webContents.close()
      }
    } catch (e) {
      console.error('[YouTubeView] close failed:', e)
    }
    youtubeView = null
    // Focus workaround for Wayland — toggle alwaysOnTop to force window to front
    mainWindow.setAlwaysOnTop(true)
    mainWindow.moveTop()
    mainWindow.focus()
    mainWindow.webContents.focus()
    setTimeout(() => mainWindow?.setAlwaysOnTop(false), 100)
  }
}

app.whenReady().then(async () => {
  await registerIpcHandlers()

  if (TorrentSearchService.shouldRefreshTrackers()) {
    TorrentSearchService.refreshTrackers().catch(() => {})
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.on('youtube:show', () => {
  createYouTubeView()
  youtubeView?.webContents.focus()
})

ipcMain.on('youtube:hide', () => {
  destroyYouTubeView()
})

ipcMain.handle('tizentube:check-updates', async () => {
  return TizenTubeService.checkForUpdates()
})

ipcMain.handle('tizentube:update', async () => {
  return TizenTubeService.updateScripts()
})

ipcMain.handle('tizentube:get-version', async () => {
  return TizenTubeService.getVersion()
})
