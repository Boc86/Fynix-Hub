import { autoUpdater, UpdateInfo } from 'electron-updater'
import { BrowserWindow } from 'electron'

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

let mainWindow: BrowserWindow | null = null
let updateAvailable = false
let updateVersion = ''
let updateReleaseNotes = ''
let downloadProgress = 0
let updateDownloaded = false

export function setMainWindow(win: BrowserWindow | null) {
  mainWindow = win
}

function sendStatus(data: Record<string, unknown>) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:update-status', data)
  }
}

autoUpdater.on('checking-for-update', () => {
  sendStatus({ status: 'checking' })
})

autoUpdater.on('update-available', (info: UpdateInfo) => {
  updateAvailable = true
  updateVersion = info.version
  updateReleaseNotes = typeof info.releaseNotes === 'string' ? info.releaseNotes : info.releaseNotes?.join?.('\n') ?? ''
  sendStatus({ status: 'available', version: updateVersion, releaseNotes: updateReleaseNotes })
})

autoUpdater.on('update-not-available', () => {
  sendStatus({ status: 'not-available' })
})

autoUpdater.on('download-progress', (progress) => {
  downloadProgress = progress.percent
  sendStatus({ status: 'downloading', percent: progress.percent })
})

autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
  updateDownloaded = true
  updateVersion = info.version
  updateReleaseNotes = typeof info.releaseNotes === 'string' ? info.releaseNotes : info.releaseNotes?.join?.('\n') ?? ''
  sendStatus({ status: 'downloaded', version: updateVersion, releaseNotes: updateReleaseNotes, percent: 100 })
})

autoUpdater.on('error', (err: Error) => {
  console.error('[Updater]', err.message)
  sendStatus({ status: 'error', message: err.message })
})

export function isAppImage(): boolean {
  return !!process.env.APPIMAGE
}

export async function checkForUpdates(): Promise<void> {
  try {
    await autoUpdater.checkForUpdates()
  } catch (err: any) {
    console.error('[Updater] checkForUpdates failed:', err?.message || err)
  }
}

export async function downloadUpdate(): Promise<boolean> {
  if (!isAppImage()) return false
  if (updateDownloaded) return true
  return new Promise((resolve) => {
    const onDownloaded = () => { cleanup(); resolve(true) }
    const onError = () => { cleanup(); resolve(false) }
    const cleanup = () => {
      autoUpdater.removeListener('update-downloaded', onDownloaded)
      autoUpdater.removeListener('error', onError)
    }
    autoUpdater.once('update-downloaded', onDownloaded)
    autoUpdater.once('error', onError)
    autoUpdater.downloadUpdate()
  })
}

export function installUpdate(): void {
  if (!updateDownloaded) return
  autoUpdater.quitAndInstall(true, true)
}

export function getStatus() {
  return {
    updateAvailable,
    updateVersion,
    updateReleaseNotes,
    downloadProgress,
    updateDownloaded,
    isAppImage: isAppImage(),
  }
}

export function init() {
  autoUpdater.logger = console
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'Boc86',
    repo: 'Fynix-Hub',
  })
}
