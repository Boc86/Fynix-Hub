import { spawn, execSync, type ChildProcess } from 'child_process'
import * as net from 'net'
import * as fs from 'fs'
import * as path from 'path'

let mpvProcess: ChildProcess | null = null
let ipcSocketPath = '/tmp/mpv-fynix.sock'
let onExitCb: ((code: number | null, signal: string | null) => void) | null = null
let lastExitCode: number | null = null

export function setOnExitCallback(cb: (code: number | null, signal: string | null) => void): void {
  onExitCb = cb
}

function isFlatpak(): boolean {
  return fs.existsSync('/.flatpak-info') || !!process.env.FLATPAK_ID
}

const MPV_BINARY_CANDIDATES: string[] = [
  '/app/lib/com.fynix.hub/resources/app.asar.unpacked/assets/bin/mpv/mpv',
  '/app/lib/com.fynix.hub/resources/bin/mpv/mpv',
]

function findMpvCommand(): { cmd: string; mpvDir: string } {
  console.log('[MPV] Resources path:', process.resourcesPath, '__dirname:', __dirname)

  const candidates = [
    ...MPV_BINARY_CANDIDATES,
    path.join(process.resourcesPath, 'app.asar.unpacked/assets/bin/mpv/mpv'),
    path.join(process.resourcesPath, 'assets/bin/mpv/mpv'),
    path.join(__dirname, '../../../assets/bin/mpv/mpv'),
    path.join(__dirname, '../../assets/bin/mpv/mpv'),
    path.join(__dirname, '../assets/bin/mpv/mpv'),
    path.join(__dirname, 'assets/bin/mpv/mpv'),
    '/app/bin/mpv',
    '/app/lib/mpv/bin/mpv',
    'mpv',
  ]

  const tried: string[] = []
  for (const c of candidates) {
    tried.push(c)
    if (fs.existsSync(c)) {
      console.log('[MPV] Found binary at:', c)
      return { cmd: c, mpvDir: path.dirname(c) }
    }
  }

  console.log('[MPV] Tried paths:', tried.map(c => c + ' (exists: ' + fs.existsSync(c) + ')'))
  console.log('[MPV] No binary found, defaulting to mpv')
  return { cmd: 'mpv', mpvDir: '' }
}

function waitForSocket(socketPath: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      if (fs.existsSync(socketPath)) {
        resolve()
        return
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`IPC socket not created after ${timeoutMs}ms`))
        return
      }
      setTimeout(check, 100)
    }
    check()
  })
}

function sendCommand(command: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket()
    const payload = JSON.stringify(command) + '\n'

    client.connect(ipcSocketPath, () => {
      client.write(payload)
    })

    let data = ''
    client.on('data', (chunk) => {
      data += chunk.toString()
    })

    client.on('close', () => {
      try {
        resolve(JSON.parse(data))
      } catch {
        resolve(data)
      }
    })

    client.on('error', (err) => {
      reject(err)
    })

    setTimeout(() => {
      client.destroy()
      reject(new Error('IPC command timed out'))
    }, 5000)
  })
}

export async function startPlayback(url: string, resumePosition?: number, accentColor?: string): Promise<void> {
  await stopPlayback()

  if (fs.existsSync(ipcSocketPath)) {
    try { fs.unlinkSync(ipcSocketPath) } catch {}
  }

  console.log('[MPV] Env DISPLAY:', process.env.DISPLAY)
  console.log('[MPV] Env FLATPAK_ID:', process.env.FLATPAK_ID)
  if (accentColor) console.log('[MPV] Accent color for OSC:', accentColor)

  const { cmd, mpvDir } = findMpvCommand()

  const mpvArgs = [
    '--no-config',
    `--input-ipc-server=${ipcSocketPath}`,
    '--keep-open=yes',
    '--fullscreen',
    '--ontop',
    '--no-border',
    '--no-keepaspect',
    '--no-window-dragging',
    '--hwdec=no',
    '--vo=gpu',
    '--gpu-context=x11egl',
  ]

  if (mpvDir) {
    const confPath = path.join(mpvDir, 'mpv.conf')
    const inputPath = path.join(mpvDir, 'input.conf')
    if (fs.existsSync(confPath)) mpvArgs.push(`--include=${confPath}`)
    if (fs.existsSync(inputPath)) mpvArgs.push(`--input-conf=${inputPath}`)
    const scriptPath = path.join(mpvDir, 'scripts', 'fynix-osc.lua')
    if (fs.existsSync(scriptPath)) {
      mpvArgs.push(`--script=${scriptPath}`)
      console.log('[MPV] Loading custom OSC script:', scriptPath)
    }
  }

  const accent = (accentColor || '#FF6B00').replace(/^#/, '')
  const scriptOpts = [
    `fynix-accent=${accent}`,
    'fynix-hide_timeout=3',
  ].join(',')
  mpvArgs.push(`--script-opts=${scriptOpts}`)

  const resumePos = (resumePosition && resumePosition > 0) ? resumePosition : undefined
  if (resumePos) {
    console.log('[MPV] Will seek to resume position:', resumePos)
  }

  mpvArgs.push(url)

  const fullArgs = [...mpvArgs]
  console.log('[MPV] Starting:', cmd, fullArgs.join(' '))

  const libPaths: string[] = []
  if (mpvDir) {
    libPaths.push(path.join(mpvDir, 'lib'))
  }
  if (isFlatpak()) {
    libPaths.push('/app/lib/ffmpeg')
  }
  const ldLibPath = [...libPaths, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')
  const env = { ...process.env }
  if (ldLibPath) {
    env.LD_LIBRARY_PATH = ldLibPath
  }

  mpvProcess = spawn(cmd, fullArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  })

  let settled = false

  const promise = new Promise<void>((resolve, reject) => {
    mpvProcess!.on('error', (err) => {
      console.error('[MPV] Spawn error:', err.message)
      mpvProcess = null
      if (!settled) {
        settled = true
        reject(new Error(`Failed to start mpv: ${err.message}`))
      }
    })

    mpvProcess!.on('exit', (code, signal) => {
      console.log('[MPV] Process exited with code', code, 'signal', signal)
      lastExitCode = code
      mpvProcess = null
      if (fs.existsSync(ipcSocketPath)) {
        try { fs.unlinkSync(ipcSocketPath) } catch {}
      }
      if (onExitCb) onExitCb(code, signal)
      if (!settled) {
        settled = true
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`mpv exited with code ${code}`))
        }
      }
    })

    let stderrBuf = ''
    mpvProcess!.stdout?.on('data', (data: Buffer) => {
      console.log('[MPV] stdout:', data.toString().trim())
    })

    mpvProcess!.stderr?.on('data', (data: Buffer) => {
      stderrBuf += data.toString()
      console.log('[MPV] stderr:', data.toString().trim())
    })

    mpvProcess!.on('close', () => {
      if (stderrBuf) {
        console.log('[MPV] Full stderr:\n' + stderrBuf.trim())
      }
    })

    waitForSocket(ipcSocketPath, 10000)
      .then(async () => {
        if (resumePos) {
          console.log('[MPV] Socket ready, seeking to resume position:', resumePos)
          try {
            await sendCommand({ command: ['set', 'time-pos', resumePos] })
            console.log('[MPV] Resume seek completed')
          } catch (e) {
            console.warn('[MPV] Resume seek failed:', e)
          }
        }
        if (!settled) {
          settled = true
          resolve()
        }
      })
      .catch((err) => {
        if (!settled) {
          settled = true
          reject(err)
        }
      })
  })

  return promise
}

export async function stopPlayback(): Promise<void> {
  if (mpvProcess) {
    try {
      await sendCommand({ command: ['quit'] })
    } catch {}
    mpvProcess.kill('SIGTERM')
    setTimeout(() => {
      if (mpvProcess && !mpvProcess.killed) {
        mpvProcess.kill('SIGKILL')
      }
    }, 500)
    mpvProcess = null
  }
  if (fs.existsSync(ipcSocketPath)) {
    try { fs.unlinkSync(ipcSocketPath) } catch {}
  }
}

export async function togglePause(): Promise<void> {
  try {
    await sendCommand({ command: ['cycle', 'pause'] })
  } catch {}
}

export async function pause(): Promise<void> {
  try {
    await sendCommand({ command: ['set', 'pause', 'yes'] })
  } catch {}
}

export async function resume(): Promise<void> {
  try {
    await sendCommand({ command: ['set', 'pause', 'no'] })
  } catch {}
}

export async function seek(seconds: number): Promise<void> {
  try {
    await sendCommand({ command: ['seek', seconds, 'relative'] })
  } catch {}
}

export async function getTimePos(): Promise<number> {
  try {
    const res = await sendCommand({ command: ['get_property', 'time-pos'] })
    return res?.data ?? 0
  } catch {
    return 0
  }
}

export async function getDuration(): Promise<number> {
  try {
    const res = await sendCommand({ command: ['get_property', 'duration'] })
    return res?.data ?? 0
  } catch {
    return 0
  }
}

export async function getPaused(): Promise<boolean> {
  try {
    const res = await sendCommand({ command: ['get_property', 'pause'] })
    return res?.data ?? true
  } catch {
    return true
  }
}

export async function addSubtitle(filePath: string): Promise<void> {
  try {
    await sendCommand({ command: ['sub-add', filePath] })
  } catch {}
}

export async function showSkipIntro(endMs: number): Promise<void> {
  try {
    await sendCommand({ command: ['script-message-to', 'fynix-osc', 'show-skip-intro', String(endMs)] })
  } catch {}
}

export async function hideSkipIntro(): Promise<void> {
  try {
    await sendCommand({ command: ['script-message-to', 'fynix-osc', 'hide-skip-intro'] })
  } catch {}
}

export async function setHasNext(hasNext: boolean): Promise<void> {
  try {
    await sendCommand({ command: ['script-message-to', 'fynix-osc', 'set-has-next', hasNext ? 'true' : 'false'] })
  } catch {}
}

export function getLastExitCode(): number | null {
  return lastExitCode
}

export function isAvailable(): boolean {
  if (isFlatpak()) {
    try {
      execSync('flatpak info io.mpv.Mpv//stable', { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }
  try {
    execSync('mpv --version', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export function isRunning(): boolean {
  return mpvProcess !== null && !mpvProcess.killed
}
