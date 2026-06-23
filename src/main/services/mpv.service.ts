import { spawn, type ChildProcess } from 'child_process'
import * as net from 'net'
import * as path from 'path'
import * as os from 'os'

let mpvProcess: ChildProcess | null = null
let mpvSocket: net.Socket | null = null
let socketPath = ''
let _duration = 0
let _exitCallback: ((code: number | null) => void) | null = null

function getSocketPath(): string {
  return path.join(os.tmpdir(), `fynix-mpv-${Date.now()}.sock`)
}

export function isAvailable(): boolean {
  try {
    require('child_process').execSync('which mpv', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function sendCommand(command: any): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!mpvSocket || mpvSocket.destroyed) return reject(new Error('No mpv connection'))
    const msg = JSON.stringify(command) + '\n'
    let buffer = ''
    const onData = (data: Buffer) => {
      buffer += data.toString()
      if (buffer.includes('\n')) {
        const lines = buffer.split('\n')
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const response = JSON.parse(line)
            mpvSocket?.removeListener('data', onData)
            resolve(response)
            return
          } catch { /* incomplete, keep buffering */ }
        }
        buffer = lines[lines.length - 1]
      }
    }
    const timeout = setTimeout(() => {
      mpvSocket?.removeListener('data', onData)
      reject(new Error('mpv command timed out'))
    }, 5000)
    const cleanup = () => {
      clearTimeout(timeout)
      mpvSocket?.removeListener('data', onData)
    }
    mpvSocket.on('data', onData)
    mpvSocket.write(msg)
    // Also clean up if socket closes
    mpvSocket.once('close', cleanup)
  })
}

export function play(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (mpvProcess) stop()
    _duration = 0
    _exitCallback = null
    socketPath = getSocketPath()

    mpvProcess = spawn('mpv', [
      url,
      `--input-ipc-server=${socketPath}`,
      '--no-terminal',
      '--osc=yes',
    ], { stdio: ['ignore', 'pipe', 'pipe'] })

    mpvProcess.on('error', (err: Error) => {
      mpvProcess = null
      reject(new Error(`Failed to launch mpv: ${err.message}`))
    })

    mpvProcess.on('close', (code) => {
      const cb = _exitCallback
      mpvProcess = null
      cleanupSocket()
      if (cb) cb(code)
    })

    let elapsed = 0
    const interval = setInterval(() => {
      elapsed += 200
      if (elapsed > 10000) {
        clearInterval(interval)
        killProcess()
        reject(new Error('Timeout waiting for mpv socket'))
        return
      }
      const s = net.createConnection(socketPath)
      s.on('connect', () => {
        clearInterval(interval)
        mpvSocket = s
        s.on('error', () => {})
        sendCommand({ command: ['get_property', 'duration'] }).then(res => {
          if (res?.data) _duration = res.data
        }).catch(() => {})
        resolve()
      })
      s.on('error', () => {})
    }, 200)
  })
}

function cleanupSocket() {
  if (mpvSocket) {
    mpvSocket.removeAllListeners()
    mpvSocket.destroy()
    mpvSocket = null
  }
  socketPath = ''
}

function killProcess() {
  if (mpvProcess && !mpvProcess.killed) {
    mpvProcess.kill('SIGTERM')
    setTimeout(() => {
      if (mpvProcess && !mpvProcess.killed) mpvProcess.kill('SIGKILL')
    }, 2000)
  }
}

export function stop() {
  killProcess()
  cleanupSocket()
  mpvProcess = null
  _exitCallback = null
}

export async function getTimePos(): Promise<number> {
  try {
    const res = await sendCommand({ command: ['get_property', 'time-pos'] })
    return typeof res?.data === 'number' ? res.data : 0
  } catch {
    return 0
  }
}

export function getDuration(): number {
  return _duration
}

export async function getPaused(): Promise<boolean> {
  try {
    const res = await sendCommand({ command: ['get_property', 'pause'] })
    return !!res?.data
  } catch {
    return true
  }
}

export async function setPaused(paused: boolean) {
  try {
    await sendCommand({ command: ['set_property', 'pause', paused] })
  } catch { /* ignore */ }
}

export async function seek(seconds: number) {
  try {
    await sendCommand({ command: ['seek', seconds, 'absolute'] })
  } catch { /* ignore */ }
}

export function isRunning(): boolean {
  return mpvProcess !== null && !mpvProcess.killed
}

export function onExit(callback: (code: number | null) => void) {
  _exitCallback = callback
}
