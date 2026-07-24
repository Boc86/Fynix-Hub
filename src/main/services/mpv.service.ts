import { app } from 'electron'
import { spawn, execSync, type ChildProcess } from 'child_process'
import * as net from 'net'
import * as fs from 'fs'
import * as path from 'path'
import * as YoutubeService from './youtube.service'
import * as OkruResolver from './okru-resolver'
import * as DailymotionResolver from './dailymotion-resolver'

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

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return { cmd: c, mpvDir: path.dirname(c) }
    }
  }

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
    const doConnect = (retriesLeft: number) => {
      const client = new net.Socket()
      const payload = JSON.stringify(command) + '\n'
      let settled = false
      let connTimer: NodeJS.Timeout | null = null
      let cmdTimer: NodeJS.Timeout | null = null

      function cleanup() {
        if (connTimer) { clearTimeout(connTimer); connTimer = null }
        if (cmdTimer) { clearTimeout(cmdTimer); cmdTimer = null }
        client.destroy()
      }

      connTimer = setTimeout(() => {
        if (!settled) {
          settled = true
          cleanup()
          reject(new Error('IPC socket connect timed out'))
        }
      }, 3000)

      client.connect(ipcSocketPath, () => {
        if (connTimer) { clearTimeout(connTimer); connTimer = null }
        client.write(payload)
      })

      let data = ''
      client.on('data', (chunk) => {
        data += chunk.toString()
        const idx = data.indexOf('\n')
        if (idx !== -1 && !settled) {
          settled = true
          const line = data.slice(0, idx)
          try {
            resolve(JSON.parse(line))
          } catch {
            resolve(line)
          }
          cleanup()
        }
      })

      client.on('close', () => {
        if (!settled) {
          settled = true
          if (data) {
            try {
              resolve(JSON.parse(data))
            } catch {
              resolve(data)
            }
          } else {
            reject(new Error('IPC connection closed without response'))
          }
        }
        cleanup()
      })

      client.on('error', (err: NodeJS.ErrnoException) => {
        cleanup()
        if (err.code === 'ENOENT' && retriesLeft > 0) {
          setTimeout(() => doConnect(retriesLeft - 1), 500)
        } else if (!settled) {
          settled = true
          reject(err)
        }
      })

      cmdTimer = setTimeout(() => {
        if (!settled) {
          settled = true
          cleanup()
          reject(new Error('IPC command timed out'))
        }
      }, 5000)
    }

    doConnect(10)
  })
}

export async function startPlayback(url: string, resumePosition?: number, accentColor?: string, audioLanguage?: string, _playbackInfo?: any, _referer?: string): Promise<void> {
  await stopPlayback()

  if (fs.existsSync(ipcSocketPath)) {
    try { fs.unlinkSync(ipcSocketPath) } catch {}
  }

  let playUrl: string = url
  let isDailymotion = false
  let dailymotionCookie: string | undefined
  if (OkruResolver.isOkruReplay(url)) {
    try {
      console.log('[MPV] Resolving ok.ru replay URL via custom resolver')
      const resolved = await OkruResolver.resolveOkruReplay(url)
      console.log('[MPV] Resolved ok.ru manifest URL, passing directly to mpv')
      playUrl = resolved
    } catch (err: any) {
      console.error('[MPV] ok.ru resolution failed:', err?.message)
      throw err
    }
  } else if (DailymotionResolver.isDailymotionUrl(url)) {
    isDailymotion = true
    try {
      console.log('[MPV] Resolving Dailymotion URL via custom resolver')
      const resolved = await DailymotionResolver.resolveDailymotionUrl(url)
      if (resolved.cookie) {
        console.log('[MPV] Dailymotion cookies captured for CDN auth')
      }
      console.log('[MPV] Resolved Dailymotion stream URL:', resolved.url)
      playUrl = resolved.url
      dailymotionCookie = resolved.cookie
    } catch (err: any) {
      console.error('[MPV] Dailymotion resolution failed:', err?.message)
      throw err
    }
  }

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
    '--gpu-context=auto',
    '--gpu-api=opengl',
    '--cache=yes',
    '--cache-pause-initial=yes',
    '--demuxer-readahead-secs=15',
    '--demuxer-max-bytes=200MiB',
    '--demuxer-max-back-bytes=50MiB',
    '--ytdl=no',
    '--log-file=/tmp/mpv-fynix.log',
    '--msg-level=cplayer=v,demuxer=v,cache=v,stream=v',
  ]

  if (audioLanguage) {
    mpvArgs.push(`--alang=${audioLanguage}`)
  }

  if (/^https?:\/\//.test(playUrl)) {
    const isLocalCache = /^http:\/\/127\.0\.0\.1/.test(playUrl)
    const isOkCdn = /okcdn\.ru/i.test(playUrl)
    const isVk = /vk\.com|vkvideo/i.test(playUrl)
    // ok.ru replay resolves to a direct *.vkuser.net progressive URL.
    const isVkUser = /vkuser\.net/i.test(playUrl)
    // Live HLS hosts (no VOD duration) must not get a network timeout or long
    // lookahead cache — those abort/stall on CDN gaps instead of riding through.
    // ponytail: matches v1.3.3, which had no such flags for these streams.
    const isLiveHost = /cdnlivetv\.(tv|is)/i.test(playUrl)

    if (!isLocalCache) {
      mpvArgs.push('--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')
    }

    // Network timeout + larger network cache apply only to real remote streams.
    // Local 127.0.0.1 / file:// streams (torrent + usenet cache) must NOT get a
    // network timeout — their server stalls while buffering and mpv would abort,
    // leaving --keep-open frozen on the first frame ("plays the same file").
    if (!isLocalCache && !isOkCdn && !isVk && !isVkUser && !isDailymotion && !isLiveHost) {
      mpvArgs.push('--network-timeout=30')
      mpvArgs.push('--cache-secs=60')
    }

    if (isOkCdn) {
      mpvArgs.push('--referrer=https://ok.ru/')
      mpvArgs.push('--http-header-fields=Origin: https://ok.ru')
    } else if (isVk || isVkUser) {
      mpvArgs.push('--referrer=https://ok.ru/')
      mpvArgs.push('--http-header-fields=Origin: https://ok.ru')
    } else if (isDailymotion) {
      mpvArgs.push('--user-agent=Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0')
      mpvArgs.push('--referrer=https://www.dailymotion.com/')
      const fields = [`Origin: https://www.dailymotion.com`]
      if (dailymotionCookie) fields.push(`Cookie: ${dailymotionCookie}`)
      mpvArgs.push(`--http-header-fields=${fields.join(', ')}`)
    }

    if (_referer && !isLocalCache && !isOkCdn && !isVk && !isDailymotion) {
      mpvArgs.push(`--referrer=${_referer}`)
    }
  }

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
    const thumbfastPath = path.join(mpvDir, 'scripts', 'thumbfast.lua')
    if (fs.existsSync(thumbfastPath)) {
      mpvArgs.push(`--script=${thumbfastPath}`)
      console.log('[MPV] Loading thumbfast script:', thumbfastPath)
    }
  }

  const isReplayBypass = /^https?:\/\/.*okcdn\.ru/i.test(playUrl) || /vk\.com|vkvideo/i.test(playUrl)
  if (isReplayBypass) {
    mpvArgs.push('--cache=no')
    mpvArgs.push('--cache-pause-initial=no')
    mpvArgs.push('--demuxer-readahead-secs=0')
    mpvArgs.push('--demuxer-max-bytes=200MiB')
    mpvArgs.push('--demuxer-max-back-bytes=50MiB')
    mpvArgs.push('--prefetch-playlist=no')
    mpvArgs.push('--force-seekable=no')
    console.log('[MPV] Replay bypass: cache disabled for', playUrl.split('/')[2])
  }

  const accent = (accentColor || '#FF6B00').replace(/^#/, '')
  const scriptOpts = [
    `fynix-accent=${accent}`,
    'fynix-hide_timeout=3',
    `thumbfast-mpv_path=${cmd}`,
  ].join(',')
  mpvArgs.push(`--script-opts=${scriptOpts}`)

  const resumePos = (resumePosition && resumePosition > 0) ? resumePosition : undefined
  if (resumePos) {
    console.log('[MPV] Will seek to resume position:', resumePos)
  }

  mpvArgs.push(playUrl)

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

  // Rotate the mpv log so each session's log is preserved (crash diagnosis).
  const logPath = '/tmp/mpv-fynix.log'
  if (fs.existsSync(logPath)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    try { fs.renameSync(logPath, `/tmp/mpv-fynix-${ts}.log`) } catch {}
  }

  mpvProcess = spawn(cmd, mpvArgs, {
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

    // Wait up to 3 seconds for IPC socket to confirm mpv started successfully.
    // If mpv exits before that, the exit handler above will reject immediately.
    const startTimeout = setTimeout(() => {
      if (!settled) {
        settled = true
        resolve()
        // Do resume-seek asynchronously in the background once socket is ready
        if (resumePos) {
          waitForSocket(ipcSocketPath, 10000)
            .then(async () => {
              console.log('[MPV] Socket ready, seeking to resume position:', resumePos)
              try {
                await sendCommand({ command: ['set', 'time-pos', resumePos] })
                console.log('[MPV] Resume seek completed')
              } catch (e) {
                console.warn('[MPV] Resume seek failed:', e)
              }
            })
            .catch((err) => {
              console.warn('[MPV] Socket wait timeout for resume seek:', err)
            })
        }
      }
    }, 3000)
  })

  return promise
}

export async function stopPlayback(): Promise<void> {
  if (mpvProcess) {
    const proc = mpvProcess
    mpvProcess = null
    // Graceful quit first; only escalate to SIGTERM/SIGKILL if mpv ignores it.
    // Sending quit + SIGTERM together races and yields a confusing exit code 4.
    // Bound the whole thing so a frozen mpv can never block the caller (the
    // reconnect/finish path depends on stop() resolving promptly).
    const quitWithTimeout = Promise.race([
      sendCommand({ command: ['quit'] }).then(() => true).catch(() => false),
      new Promise<boolean>((r) => setTimeout(() => r(false), 2000)),
    ])
    const quitOk = await quitWithTimeout
    if (quitOk) {
      const exited = await new Promise<boolean>((resolve) => {
        const t = setTimeout(() => resolve(false), 500)
        proc.once('exit', () => { clearTimeout(t); resolve(true) })
      })
      if (exited) return
    }
    if (!proc.killed) proc.kill('SIGTERM')
    setTimeout(() => {
      if (!proc.killed) proc.kill('SIGKILL')
    }, 500)
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

export async function getProperty(name: string): Promise<any> {
  try {
    const res = await sendCommand({ command: ['get_property', name] })
    return res?.data
  } catch {
    return null
  }
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
    await sendCommand({ command: ['script-message-to', 'fynix_osc', 'show-skip-intro', String(endMs)] })
  } catch {}
}

export async function hideSkipIntro(): Promise<void> {
  try {
    await sendCommand({ command: ['script-message-to', 'fynix_osc', 'hide-skip-intro'] })
  } catch {}
}

export async function showSplash(): Promise<void> {
  try {
    await sendCommand({ command: ['script-message-to', 'fynix_osc', 'show-splash'] })
  } catch {}
}

export async function hideSplash(): Promise<void> {
  try {
    await sendCommand({ command: ['script-message-to', 'fynix_osc', 'hide-splash'] })
  } catch {}
}

export async function setHasNext(hasNext: boolean): Promise<void> {
  try {
    await sendCommand({ command: ['script-message-to', 'fynix_osc', 'set-has-next', hasNext ? 'true' : 'false'] })
  } catch {}
}

export async function setAutoplayNext(autoplay: boolean): Promise<void> {
  try {
    await sendCommand({ command: ['script-message-to', 'fynix_osc', 'set-autoplay-next', autoplay ? 'true' : 'false'] })
  } catch {}
}

export async function setPlot(text: string): Promise<void> {
  try {
    const truncated = text.length > 500 ? text.slice(0, 500) + '...' : text
    await sendCommand({ command: ['script-message-to', 'fynix_osc', 'set-plot', truncated] })
  } catch {}
}

export async function setUpNext(opts: { imagePath: string; title: string; subtitle: string; countdown: number }): Promise<void> {
  try {
    const args = ['script-message-to', 'fynix_osc', 'set-up-next', opts.imagePath, opts.title, opts.subtitle, String(opts.countdown)]
    await sendCommand({ command: args })
  } catch {}
}

export async function clearUpNext(): Promise<void> {
  try {
    await sendCommand({ command: ['script-message-to', 'fynix_osc', 'clear-up-next'] })
  } catch {}
}

export function getLastExitCode(): number | null {
  return lastExitCode
}

export async function getSubAction(): Promise<string | null> {
  try {
    const res = await sendCommand({ command: ['get_property_string', 'user-data/fynix/sub-action'] })
    return res?.data || null
  } catch {
    return null
  }
}

export async function clearSubAction(): Promise<void> {
  try {
    await sendCommand({ command: ['set_property_string', 'user-data/fynix/sub-action', ''] })
  } catch {}
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
