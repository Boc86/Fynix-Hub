import { execFile, spawn, type ChildProcess } from 'child_process'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'
import os from 'os'
import * as CacheService from './cache.service'

const RESOURCES_YT_DLP = path.join(process.resourcesPath ?? '', 'app.asar.unpacked', 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp')
const DEV_YT_DLP = path.join(__dirname, '..', '..', 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp')
const FALLBACK_YT_DLP = '/usr/bin/yt-dlp'

function getYtDlpPath(): string {
  const candidates = [
    RESOURCES_YT_DLP,
    DEV_YT_DLP,
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    FALLBACK_YT_DLP,
    path.join(app.getPath('home'), '.local', 'bin', 'yt-dlp'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return FALLBACK_YT_DLP
}

interface BrowserPath {
  name: string
  arg: string
}

function getBrowserPaths(): BrowserPath[] {
  const home = app.getPath('home')
  const candidates: { name: string; ytDlpName: string; paths: string[] }[] = [
    {
      name: 'chrome',
      ytDlpName: 'chrome',
      paths: [
        path.join(home, '.config', 'google-chrome'),
        path.join(home, '.var', 'app', 'com.google.Chrome', 'config', 'google-chrome'),
        path.join(home, 'snap', 'chrome', 'common', '.config', 'google-chrome'),
      ],
    },
    {
      name: 'chromium',
      ytDlpName: 'chromium',
      paths: [
        path.join(home, '.config', 'chromium'),
        path.join(home, '.var', 'app', 'org.chromium.Chromium', 'config', 'chromium'),
      ],
    },
    {
      name: 'firefox',
      ytDlpName: 'firefox',
      paths: [
        path.join(home, '.mozilla', 'firefox'),
        path.join(home, '.var', 'app', 'org.mozilla.firefox', '.mozilla', 'firefox'),
        path.join(home, 'snap', 'firefox', 'common', '.mozilla', 'firefox'),
      ],
    },
    {
      name: 'edge',
      ytDlpName: 'edge',
      paths: [
        path.join(home, '.config', 'microsoft-edge'),
        path.join(home, '.var', 'app', 'com.microsoft.Edge', 'config', 'microsoft-edge'),
      ],
    },
    {
      name: 'brave',
      ytDlpName: 'brave',
      paths: [
        path.join(home, '.config', 'BraveSoftware', 'Brave-Browser'),
        path.join(home, '.var', 'app', 'com.brave.Browser', 'config', 'BraveSoftware', 'Brave-Browser'),
      ],
    },
    {
      name: 'waterfox',
      ytDlpName: 'firefox',
      paths: [
        path.join(home, '.waterfox'),
        path.join(home, '.var', 'app', 'net.waterfox.waterfox', '.waterfox'),
        path.join(home, 'snap', 'waterfox', 'common', '.waterfox'),
      ],
    },
    {
      name: 'librewolf',
      ytDlpName: 'firefox',
      paths: [
        path.join(home, '.librewolf'),
        path.join(home, '.var', 'app', 'io.gitlab.librewolf-community', '.librewolf'),
      ],
    },
  ]

  if (process.platform === 'darwin') {
    candidates.push({
      name: 'safari',
      ytDlpName: 'safari',
      paths: [],
    })
  }

  const found: BrowserPath[] = []
  for (const browser of candidates) {
    for (const p of browser.paths) {
      if (fs.existsSync(p)) {
        found.push({ name: browser.name, arg: `${browser.ytDlpName}:${p}` })
      }
    }
    found.push({ name: browser.name, arg: browser.ytDlpName })
  }

  return found
}

function runYtDlp(args: string[], timeout = 15000): Promise<string> {
  const binary = getYtDlpPath()
  return new Promise((resolve, reject) => {
    execFile(binary, args, { timeout }, (err, stdout, stderr) => {
      if (err) {
        const msg = stderr?.trim() || err.message || 'yt-dlp failed'
        reject(new Error(msg))
        return
      }
      resolve(stdout.trim())
    })
  })
}

export async function resolveStreamUrl(pageUrl: string): Promise<string> {
  const args = [
    '--no-check-certificate',
    '--no-warnings',
    '--no-cache-dir',
    '--get-url',
    '--format', 'best[ext=mp4]/best[ext=webm]/best',
    pageUrl,
  ]
  const stdout = await runYtDlp(args, 30000)
  const url = stdout.split('\n').filter(Boolean)[0]
  if (!url) throw new Error('No stream URL returned by yt-dlp')
  return url
}

import type { ChildProcess } from 'child_process'

export function spawnYtDlpStdout(pageUrl: string): ChildProcess {
  const binary = getYtDlpPath()
  console.log('[yt-dlp] piping via:', binary, 'for URL:', pageUrl)
  const args = [
    '--no-check-certificate',
    '--no-warnings',
    '--no-cache-dir',
    '--quiet',
    '--format', 'best[ext=mp4]/best[ext=webm]/best',
    '-o', '-',
    pageUrl,
  ]
  return spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
}

export function isReplayUrl(url: string): boolean {
  return /\bok\.ru\b|\bokcdn\.ru\b|\bokvideo\.ru\b|\bvk\.com\/video\b|\bvkvideo\b|\bdailymotion\.com\b|\bstreamtape\.com\b|\bstreamwish\.com\b|\bvidoza\.net\b|\bdooo\.stream\b|\bfileditchecks\b|\bvoe\.sx\b/i.test(url)
}

interface FormatInfo {
  id: string
  ext: string
  height: number
  hasVideo: boolean
  hasAudio: boolean
}

function parseFormatList(stdout: string): FormatInfo[] {
  const lines = stdout.split('\n')
  const formats: FormatInfo[] = []
  let inTable = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('ID') && trimmed.includes('EXT') && trimmed.includes('RESOLUTION')) {
      inTable = true
      continue
    }
    if (!inTable) continue
    if (/^[\-─═]+/.test(trimmed)) continue
    if (trimmed.startsWith('[')) continue

    // Split by the table's pipe separators (spaces around |)
    const parts = trimmed.split(/\s+\|\s+/)
    if (parts.length < 2) continue

    // Left part: ID EXT RESOLUTION [FPS] [CH]
    const leftMatch = parts[0].trim().match(/^(\S+)\s+(\S+)\s+(\S+(?:\s+only)?)/)
    if (!leftMatch) continue

    const id = leftMatch[1]
    const ext = leftMatch[2]
    const resolution = leftMatch[3].trim()

    let height = 0
    let hasVideo = true
    let hasAudio = true

    if (resolution.toLowerCase() === 'audio only') {
      hasVideo = false
      height = 0
    } else if (/^(\d+)x(\d+)$/.test(resolution)) {
      const m = resolution.match(/^(\d+)x(\d+)$/)
      height = m ? parseInt(m[2], 10) : 0
    } else {
      height = 0
    }

    const rest = parts.slice(1).join(' ').toLowerCase()
    if (rest.includes('audio only')) hasVideo = false
    if (rest.includes('video only')) hasAudio = false
    if (rest.includes('images')) {
      hasVideo = false
      hasAudio = false
    }

    formats.push({ id, ext, height, hasVideo, hasAudio })
  }

  return formats
}

async function listFormats(videoUrl: string, extraArgs: string[] = []): Promise<FormatInfo[]> {
  const stdout = await runYtDlp([
    '--no-check-certificate',
    '--no-warnings',
    '--no-cache-dir',
    '--list-formats',
    ...extraArgs,
    videoUrl,
  ])
  return parseFormatList(stdout)
}

function selectBestFormat(formats: FormatInfo[]): { formatId: string; ext: string } | null {
  const cmp = (a: FormatInfo, b: FormatInfo): number => {
    const aScore = a.hasVideo && a.hasAudio ? 2 : a.hasVideo ? 1 : 0
    const bScore = b.hasVideo && b.hasAudio ? 2 : b.hasVideo ? 1 : 0
    if (aScore !== bScore) return bScore - aScore
    if (a.height !== b.height) return b.height - a.height
    const aMp4 = a.ext === 'mp4' ? 1 : 0
    const bMp4 = b.ext === 'mp4' ? 1 : 0
    return bMp4 - aMp4
  }

  const combined = formats.filter((f) => f.hasVideo && f.hasAudio)
  if (combined.length > 0) {
    combined.sort(cmp)
    return { formatId: combined[0].id, ext: combined[0].ext }
  }

  const videoOnly = formats.filter((f) => f.hasVideo && !f.hasAudio)
  const audioOnly = formats.filter((f) => f.hasAudio && !f.hasVideo)

  if (videoOnly.length === 0) return null

  videoOnly.sort(cmp)
  audioOnly.sort(cmp)

  if (audioOnly.length > 0) {
    return { formatId: `${videoOnly[0].id}+${audioOnly[0].id}`, ext: videoOnly[0].ext }
  }

  return { formatId: videoOnly[0].id, ext: videoOnly[0].ext }
}

async function getBestUrl(videoUrl: string, extraArgs: string[] = []): Promise<{ url: string; fileType: string }> {
  const formats = await listFormats(videoUrl, extraArgs)
  const selected = selectBestFormat(formats)
  if (!selected) throw new Error('No suitable format found in yt-dlp output')

  const getUrlArgs = [
    '--no-check-certificate',
    '--no-warnings',
    '--no-cache-dir',
    '--get-url',
    '--format', selected.formatId,
    ...extraArgs,
    videoUrl,
  ]
  const stdout = await runYtDlp(getUrlArgs)
  const url = stdout.split('\n').filter(Boolean)[0]
  if (!url) throw new Error('No stream URL returned by yt-dlp')
  return { url, fileType: selected.ext }
}

function isRetryableError(msg: string): boolean {
  const lower = msg.toLowerCase()
  return lower.includes('sign in') || lower.includes('bot') || lower.includes('unsupported platform') || lower.includes('requested format is not available')
}

function isBrowserUnavailableError(msg: string): boolean {
  const lower = msg.toLowerCase()
  return lower.includes('could not find') ||
    lower.includes('not installed') ||
    lower.includes('locked') ||
    lower.includes('unsupported platform') ||
    lower.includes('database is locked')
}

function getVideoId(url: string): string | null {
  try {
    const u = new URL(url)
    return u.searchParams.get('v') || u.pathname.split('/').pop() || null
  } catch {
    return null
  }
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeout = 8000): Promise<Response> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal })
    return res
  } finally {
    clearTimeout(t)
  }
}

const INVIDIOUS_INSTANCES = [
  'https://vid.puffyan.us',
  'https://iv.datura.network',
  'https://iv.nboeck.de',
  'https://yt.artemislena.eu',
  'https://yewtu.be',
  'https://invidious.snopyta.org',
  'https://inv.nadeko.net',
  'https://invidious.flokinet.to',
]

const PIPED_INSTANCES = [
  'https://api.piped.projectkyuubi.com',
  'https://api.piped.privacydev.net',
  'https://api.piped.adminforge.de',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.moomoo.me',
]

function mimeToExt(mime: string): string {
  const m = mime.match(/video\/(\w+)/)
  return m ? m[1] : 'mp4'
}

async function tryInvidious(videoId: string): Promise<{ url: string; fileType: string }> {
  const results = await Promise.allSettled(
    INVIDIOUS_INSTANCES.map(async (base) => {
      const res = await fetchWithTimeout(`${base}/api/v1/videos/${videoId}`)
      if (!res.ok) throw new Error(`${base} returned ${res.status}`)
      const data = await res.json()
      const formats: Array<{ url: string; type?: string }> = data.formatStreams || data.adaptiveFormats || []
      const combined = formats.find((f) => f.url && (f.type || '').includes('video'))
      if (combined?.url) return { url: combined.url, fileType: mimeToExt(combined.type || 'video/mp4') }
      const video = formats.find((f) => f.url && (f.type || '').includes('video') && !(f.type || '').includes('audio'))
      if (video?.url) return { url: video.url, fileType: mimeToExt(video.type || 'video/mp4') }
      throw new Error(`${base} returned no playable stream`)
    })
  )
  for (const r of results) {
    if (r.status === 'fulfilled') return r.value
  }
  throw new Error('No Invidious instance returned a playable stream')
}

async function tryPiped(videoId: string): Promise<{ url: string; fileType: string }> {
  const results = await Promise.allSettled(
    PIPED_INSTANCES.map(async (base) => {
      const res = await fetchWithTimeout(`${base}/streams/${videoId}`)
      if (!res.ok) throw new Error(`${base} returned ${res.status}`)
      const data = await res.json()
      const video = data.videoStreams?.find((s: any) => s.url && s.videoOnly === false) || data.videoStreams?.[0]
      if (video?.url) {
        const mime = video.mimeType || ''
        const ext = mimeToExt(mime || `video/${video.format || 'mp4'}`)
        return { url: video.url, fileType: ext }
      }
      throw new Error(`${base} returned no playable stream`)
    })
  )
  for (const r of results) {
    if (r.status === 'fulfilled') return r.value
  }
  throw new Error('No Piped instance returned a playable stream')
}

async function exportCookies(browserArg: string, outputPath: string): Promise<void> {
  await runYtDlp([
    '--no-check-certificate',
    '--no-warnings',
    '--cookies-from-browser',
    browserArg,
    '--cookies',
    outputPath,
    'https://www.youtube.com',
  ], 30000)
}

function validateCookiesFile(filePath: string): { valid: boolean; message: string } {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split('\n').filter((l) => l.trim())
    if (lines.length === 0) return { valid: false, message: 'cookies.txt is empty' }
    const header = lines[0].toLowerCase()
    if (!header.includes('http cookie file') && !header.includes('netscape http cookie file')) {
      return { valid: false, message: 'cookies.txt is missing a valid Netscape header' }
    }
    const hasYoutube = lines.some((l) => l.toLowerCase().includes('youtube.com'))
    if (!hasYoutube) return { valid: false, message: 'cookies.txt contains no YouTube cookies' }
    return { valid: true, message: '' }
  } catch (err: any) {
    return { valid: false, message: err.message }
  }
}

export async function getStreamUrl(videoUrl: string): Promise<{ url: string; fileType: string }> {
  const errors: string[] = []
  const videoId = getVideoId(videoUrl)

  // primary path: Invidious + Piped in parallel (fastest and most reliable)
  if (videoId) {
    try {
      const result = await Promise.race([
        tryInvidious(videoId),
        tryPiped(videoId),
      ])
      return result
    } catch (err: any) {
      errors.push(`invidious/piped: ${err?.message || 'all failed'}`)
    }
  } else {
    errors.push('invidious/piped: no video ID extracted')
  }

  // fallback path: yt-dlp with user-supplied cookies.txt file
  const cookiesPath = CacheService.getSetting<string>('youtubeCookiesPath')
  if (cookiesPath) {
    console.log('[YouTube] Using cookies file:', cookiesPath, 'exists:', fs.existsSync(cookiesPath))
    if (fs.existsSync(cookiesPath)) {
      const validation = validateCookiesFile(cookiesPath)
      console.log('[YouTube] Cookies validation:', validation)
      if (validation.valid) {
        const cookieClients = ['default', 'tv_embedded', 'web_embedded', 'android', 'ios', 'android_music', 'ios_music', 'web_creator']
        for (const client of cookieClients) {
          try {
            const args = [
              '--cookies', cookiesPath,
              '--user-agent', 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
            ]
            if (client !== 'default') args.push('--extractor-args', `youtube:player_client=${client}`)
            return await getBestUrl(videoUrl, args)
          } catch (err: any) {
            const msg = err?.message || ''
            errors.push(`cookies-${client}: ${msg}`)
            if (!isRetryableError(msg)) throw err
          }
        }
      } else {
        errors.push(`cookies.txt-validation: ${validation.message}`)
      }
    } else {
      errors.push('cookies.txt: file does not exist')
    }
  }

  // fallback: default client without cookies
  try {
    return await getBestUrl(videoUrl)
  } catch (err: any) {
    const msg = err?.message || ''
    errors.push(`default: ${msg}`)
    if (!isRetryableError(msg)) throw err
  }

  // fallback: alternate YouTube clients without cookies
  const clients = ['tv_embedded', 'web_embedded', 'android', 'ios', 'android_music', 'ios_music', 'web_creator']
  for (const client of clients) {
    try {
      return await getBestUrl(videoUrl, ['--extractor-args', `youtube:player_client=${client}`])
    } catch (err: any) {
      const msg = err?.message || ''
      errors.push(`${client}: ${msg}`)
      if (!isRetryableError(msg)) throw err
    }
  }

  // fallback: try cookies from detected browser locations (native, Flatpak, Snap)
  const browserPaths = getBrowserPaths()
  const tmpCookies = path.join(os.tmpdir(), `fynix-yt-cookies-${Date.now()}.txt`)
  for (const browser of browserPaths) {
    try {
      return await getBestUrl(videoUrl, ['--cookies-from-browser', browser.arg])
    } catch (err: any) {
      const msg = err?.message || ''
      errors.push(`${browser.arg}: ${msg}`)
      if (isBrowserUnavailableError(msg)) continue
      if (!isRetryableError(msg)) throw err
    }
  }

  // fallback: export detected browser cookies to a temp file and use that
  for (const browser of browserPaths) {
    try {
      await exportCookies(browser.arg, tmpCookies)
      if (fs.existsSync(tmpCookies) && fs.statSync(tmpCookies).size > 0) {
        return await getBestUrl(videoUrl, ['--cookies', tmpCookies])
      }
    } catch (err: any) {
      const msg = err?.message || ''
      errors.push(`export-${browser.arg}: ${msg}`)
    }
  }

  try { fs.unlinkSync(tmpCookies) } catch { /* ignore */ }

  console.error('[YouTube] All extraction attempts failed:', errors.join(' | '))
  throw new Error(
    'YouTube is blocking this trailer. A cookies.txt file alone is no longer enough — YouTube also requires a po_token from a real browser session. ' +
    'Sign into YouTube in Chrome, Brave, Firefox, or Edge on this system; the app will automatically use the browser\'s cookies and token. ' +
    'Alternatively, export cookies together with a valid po_token from a browser where you are signed into YouTube.'
  )
}
