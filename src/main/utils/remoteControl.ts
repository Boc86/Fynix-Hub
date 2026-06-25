import { WebContents, BrowserWindow } from 'electron'
import { getSetting } from '../services/cache.service'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export function setupRemoteControl(webContents: WebContents, mainWindow: BrowserWindow): void {
  if (!webContents || !mainWindow) return

  const logPath = path.join(app.getPath('userData'), 'remote_debug.log')

  webContents.on('before-input-event', (event, input) => {
    const logEntry = `[${new Date().toISOString()}] type=${input.type} code=${input.code} key=${input.key}\n`
    fs.appendFileSync(logPath, logEntry)

    if (input.type !== 'keyDown') return

    const remoteMapping = getSetting<Record<string, string>>('remoteMapping')
    if (!remoteMapping) return

    for (const [action, mappedCode] of Object.entries(remoteMapping)) {
      if (input.code === mappedCode) {
        event.preventDefault()
        mainWindow.webContents.send('remote:action', action)
        break
      }
    }
  })
}
