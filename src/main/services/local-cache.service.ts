import { app } from 'electron'
import * as http from 'http'
import * as https from 'https'
import * as path from 'path'
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import { Readable } from 'stream'
import * as FfmpegRemux from './ffmpeg-remux.service'

// ─── Remote Stream Proxy State ────────────────────────────────────────────────────

interface ProxySession {
  id: string
  url: string
  headers: Record<string, string>
}

const proxySessions = new Map<string, ProxySession>()

function generateProxyId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// Headers to inject for ok.ru and VK CDN streams (required for CORS/auth)
function getCdnHeaders(url: string, baseHeaders: Record<string, string> = {}): Record<string, string> {
  const isOkCdn = /okcdn\.ru/i.test(url)
  const isVkUser = /vkuser\.net/i.test(url)
  const isVk = /vk\.com|vkvideo/i.test(url)
  const isDailymotion = /dailymotion\.com/i.test(url)
  const isCdnLive = /cdnlivetv\.(is|tv)/i.test(url)

  if (isOkCdn || isVkUser || isVk) {
    return {
      ...baseHeaders,
      'Referer': 'https://ok.ru/',
      'Origin': 'https://ok.ru',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    }
  }
  if (isDailymotion) {
    return {
      ...baseHeaders,
      'Referer': 'https://www.dailymotion.com/',
      'Origin': 'https://www.dailymotion.com',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    }
  }
  if (isCdnLive) {
    return {
      ...baseHeaders,
      'Referer': 'https://cdnlivetv.is/',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    }
  }
  return baseHeaders
}

function fetchRemoteUrl(url: string, headers: Record<string, string>): Promise<{ status: number; body: Buffer; contentType: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const isHttps = u.protocol === 'https:'
    const client = isHttps ? https : http

    const req = client.request({
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method: 'GET',
      headers,
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          body: Buffer.concat(chunks),
          contentType: res.headers['content-type'] || 'application/octet-stream',
        })
      })
    })

    req.on('error', reject)
    req.setTimeout(30000, () => req.destroy(new Error('Request timeout')))
    req.end()
  })
}

// ─── Proxy Session Management ─────────────────────────────────────────────────────
// ponytail: ok.ru/VK CDN requires Referer+Origin headers that browsers can't send
// via hls.js XHR. We proxy the HLS stream through our local HTTP server which
// injects the required headers on every request.

export function createProxySession(remoteUrl: string): { proxyId: string; proxyUrl: string } {
  const proxyId = generateProxyId()
  const cdnHeaders = getCdnHeaders(remoteUrl)
  proxySessions.set(proxyId, { id: proxyId, url: remoteUrl, headers: cdnHeaders })
  // The URL must end with a video extension (.mp4) so that @videojs/react's
  // HlsJsVideo component infers ContentTypes.MP4 → native <video> playback
  // instead of hls.js (which would try to parse the MP4 bytes as an HLS
  // playlist and fail). The ".mp4" suffix is cosmetic; the proxy handler
  // matches /proxy/<id>/<anything>.
  const proxyUrl = `http://127.0.0.1:${serverPort}/proxy/${proxyId}/index.mp4`
  debug('Proxy session created:', proxyId, '→', proxyUrl, '(remote:', remoteUrl.slice(0, 60) + ')')
  return { proxyId, proxyUrl }
}

export function removeProxySession(proxyId: string): void {
  if (proxySessions.has(proxyId)) {
    debug('Proxy session removed:', proxyId)
    proxySessions.delete(proxyId)
  }
}

// ─── Local File Sessions ────────────────────────────────────────────────────────
// ponytail: completed usenet downloads are file:// paths, which Chromium blocks
// from the http://localhost renderer origin. Serve them over the local HTTP
// server (with Range support for seeking) via a token-guarded route instead.

const fileSessions = new Map<string, string>() // sessionId -> absolute file path

let fileSessionCounter = 0

export function createFileSession(filePath: string): { sessionId: string; url: string } {
  const sessionId = 'f' + (++fileSessionCounter).toString(36) + Math.random().toString(36).slice(2, 8)
  fileSessions.set(sessionId, filePath)
  // Append the real filename so the URL ends with the media extension
  // (e.g. .mp4). The renderer's HlsJsVideo wrapper infers the content type
  // from the URL: *.mp4 → native <video> playback; anything else → hls.js,
  // which would try to parse the MP4 as an HLS manifest and stall.
  const basename = path.basename(filePath).replace(/[?#]/g, '_')
  const url = `http://127.0.0.1:${serverPort}/local/${sessionId}/${encodeURIComponent(basename)}`
  debug('File session created:', sessionId, '→', url, '(path:', filePath.slice(0, 80) + ')')
  return { sessionId, url }
}

export function removeFileSession(sessionId: string): void {
  if (fileSessions.has(sessionId)) {
    debug('File session removed:', sessionId)
    fileSessions.delete(sessionId)
  }
}

export interface TorrentStreamInfo {
  stream: Readable
  size: number
  name: string
}

type StreamFactory = (infoHash: string, fileIndex: number, range?: { start: number; end?: number }) => TorrentStreamInfo | null

let server: http.Server | null = null
let serverPort = 0
const CACHE_DIR = path.join(app.getPath('userData'), 'torrent-cache')
let torrentStreamFactory: StreamFactory | null = null

export function setTorrentStreamFactory(fn: StreamFactory) {
  torrentStreamFactory = fn
}

function debug(...args: any[]) {
  console.log('[LocalCache]', ...args)
}

export function getCacheDir(): string {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
  }
  return CACHE_DIR
}

export function getCachedFilePath(infoHash: string, fileName?: string): string | null {
  const dir = path.join(CACHE_DIR, infoHash.toLowerCase())
  if (!fs.existsSync(dir)) return null
  if (fileName) {
    const fp = path.join(dir, fileName)
    return fs.existsSync(fp) ? fp : null
  }
  const entries = fs.readdirSync(dir)
  if (entries.length === 0) return null
  let largest = ''
  let largestSize = 0
  for (const e of entries) {
    const fp = path.join(dir, e)
    try {
      const stat = fs.statSync(fp)
      if (stat.isFile() && stat.size > largestSize) {
        largest = e
        largestSize = stat.size
      }
    } catch {}
  }
  return largest ? path.join(dir, largest) : path.join(dir, entries[0])
}

export async function isCached(infoHash: string): Promise<boolean> {
  const infoDir = path.join(CACHE_DIR, infoHash.toLowerCase())
  try {
    await fsp.access(infoDir, fs.constants.R_OK)
    const entries = await fsp.readdir(infoDir)
    return entries.length > 0
  } catch {
    return false
  }
}

export function getCacheUrl(infoHash: string): string | null {
  if (!serverPort) return null
  const fp = getCachedFilePath(infoHash)
  if (!fp) return null
  const relativePath = path.relative(CACHE_DIR, fp)
  return `http://127.0.0.1:${serverPort}/cache/${encodeURIComponent(relativePath)}`
}

function getCacheDirSize(dir: string): number {
  let total = 0
  try {
    const entries = fs.readdirSync(dir)
    for (const e of entries) {
      const fp = path.join(dir, e)
      try {
        const stat = fs.statSync(fp)
        if (stat.isDirectory()) total += getCacheDirSize(fp)
        else total += stat.size
      } catch {}
    }
  } catch {}
  return total
}

export function getCacheStatus(): { count: number; sizeBytes: number; sizeGb: string } {
  try {
    if (!fs.existsSync(CACHE_DIR)) return { count: 0, sizeBytes: 0, sizeGb: '0 GB' }
    const entries = fs.readdirSync(CACHE_DIR)
    let sizeBytes = 0
    let count = 0
    for (const e of entries) {
      const fp = path.join(CACHE_DIR, e)
      if (fs.statSync(fp).isDirectory()) {
        sizeBytes += getCacheDirSize(fp)
        count++
      }
    }
    return { count, sizeBytes, sizeGb: (sizeBytes / (1024 ** 3)).toFixed(1) + ' GB' }
  } catch {
    return { count: 0, sizeBytes: 0, sizeGb: '0 GB' }
  }
}

export async function clearCache(): Promise<void> {
  if (!fs.existsSync(CACHE_DIR)) return
  const entries = await fsp.readdir(CACHE_DIR)
  for (const e of entries) {
    const fp = path.join(CACHE_DIR, e)
    await fsp.rm(fp, { recursive: true, force: true })
  }
}

function serveFile(filePath: string, req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Access-Control-Allow-Origin': '*' })
      res.end('File not found')
      return
    }

    const stat = fs.statSync(filePath)
    const totalSize = stat.size
    const range = req.headers.range

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1
      const chunkSize = end - start + 1

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      })

      const stream = fs.createReadStream(filePath, { start, end })
      stream.pipe(res)
      stream.on('error', () => { if (!res.writableEnded) res.end() })
    } else {
      res.writeHead(200, {
        'Content-Length': totalSize,
        'Content-Type': 'application/octet-stream',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      })
      const stream = fs.createReadStream(filePath)
      stream.pipe(res)
      stream.on('error', () => { if (!res.writableEnded) res.end() })
    }
  } catch (err: any) {
    debug('Error serving file:', err.message)
    if (!res.writableEnded) res.end()
  }
}

function serveTorrentStream(
  infoHash: string,
  fileIndex: number,
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const range = req.headers.range

  let start: number | undefined
  let end: number | undefined
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-')
    start = parseInt(parts[0], 10)
    if (parts[1]) end = parseInt(parts[1], 10)
  }

  const rangeOpts = start !== undefined ? { start, ...(end !== undefined ? { end } : {}) } : undefined
  const info = torrentStreamFactory!(infoHash, fileIndex, rangeOpts)
  if (!info) {
    res.writeHead(404)
    res.end('Torrent stream not available')
    return
  }

  const totalSize = info.size

  if (range && start !== undefined) {
    const actualEnd = end ?? totalSize - 1
    const chunkSize = actualEnd - start + 1

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${actualEnd}/${totalSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-cache',
    })
  } else {
    res.writeHead(200, {
      'Content-Length': totalSize,
      'Content-Type': 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    })
  }

  info.stream.pipe(res)
  info.stream.on('error', () => { if (!res.writableEnded) res.end() })

  // If the torrent stalls (no data for 15s), end the response so mpv can
  // reconnect. Without this, a paused torrent hangs the HTTP response
  // forever, mpv's video output freezes, and the system monitor kills it.
  let stallTimer: ReturnType<typeof setTimeout> | null = null
  const STALL_TIMEOUT = 15000
  const resetStall = () => {
    if (stallTimer) clearTimeout(stallTimer)
    stallTimer = setTimeout(() => {
      debug('Torrent stream stalled, ending response')
      info.stream.destroy()
      if (!res.writableEnded) res.end()
    }, STALL_TIMEOUT)
  }
  info.stream.on('data', resetStall)
  resetStall()
  res.on('close', () => { if (stallTimer) clearTimeout(stallTimer) })
}

// ─── Remote HLS Proxy ─────────────────────────────────────────────────────────────
// When hls.js fetches /proxy/<id>/, we serve the master playlist and rewrite
// all variant/segment URLs to route through the proxy (so CDN headers are injected).
//
// URL scheme:
//   /proxy/<id>/                    → fetch session.url (master playlist), rewrite
//   /proxy/<id>/<encoded-remote-url> → fetch the decoded URL, rewrite if it's a playlist

function rewriteHlsUrls(playlist: string, baseUrl: string, proxyId: string): string {
  // In an HLS playlist, every non-empty, non-directive line is a URI
  // (variant URL in master, segment URL in media). Some CDN URLs end with
  // /video/ or other paths without standard extensions, so we match broadly.
  return playlist.replace(
    /^((?!#)[^\s\r\n]+)(.*)$/gm,
    (_match, rawUrl, rest) => {
      // Already rewritten? Skip.
      if (rawUrl.startsWith('http://127.0.0.1:')) return _match
      // Resolve relative URLs against the playlist's base URL
      let absoluteUrl: string
      try {
        absoluteUrl = new URL(rawUrl, baseUrl).href
      } catch {
        absoluteUrl = rawUrl
      }
      const encoded = encodeURIComponent(absoluteUrl)
      return `http://127.0.0.1:${serverPort}/proxy/${proxyId}/${encoded}${rest}`
    },
  )
}

/**
 * Write response headers / body only if the response is still open. When the
 * client aborts (hls.js retry, src change, HMR reload, auto-reconnect), the
 * `req 'error'` handler in handleRequest calls res.end() → headers are already
 * sent → a later writeHead() throws ERR_HTTP_HEADERS_SENT, and the catch block
 * writing a 500 throws AGAIN → unhandled promise rejection in the main process
 * and the stream response hls.js was waiting for never arrives. Guarding every
 * write makes aborted requests a silent no-op instead of a crash.
 */
function safeWriteHead(res: http.ServerResponse, status: number, headers?: http.OutgoingHttpHeaders): void {
  if (res.headersSent || res.writableEnded || res.destroyed) return
  res.writeHead(status, headers)
}

function safeEnd(res: http.ServerResponse, chunk?: string | Buffer): void {
  // NOTE: NOT guarded on headersSent — writeHead() sets headersSent=true, and
  // res.end() is precisely what flushes the buffered headers + body. Only skip
  // when the response is already finished (aborted client, req 'error' handler).
  if (res.writableEnded || res.destroyed) return
  res.end(chunk)
}

/** Send an error response, but only if nothing has been written yet. */
function safeError(res: http.ServerResponse, message: string): void {
  if (res.headersSent || res.writableEnded || res.destroyed) return
  res.writeHead(500, { 'Access-Control-Allow-Origin': '*' })
  res.end(message)
}

/**
 * Serve the first proxied request — the master playlist or a progressive
 * video file. For HLS playlists we must buffer + rewrite variant/segment
 * URLs. For progressive video (e.g. ok.ru CDN MP4 without .m3u8 extension)
 * we must NOT buffer the whole file into memory — stream it through instead,
 * forwarding the client's Range header so the browser can seek.
 */
async function serveRemotePlaylist(
  remoteUrl: string, proxyId: string, req: http.IncomingMessage, res: http.ServerResponse,
) {
  const cdnHeaders = getCdnHeaders(remoteUrl)

  // For the first request of a progressive video, the browser may send a
  // Range header (hls.js probes the first 1KB for the init segment). Detect
  // content type via a streaming request — if it's a playlist, buffer and
  // rewrite; if it's a video, pipe through.
  // ok.ru/VK CDN URLs have no .m3u8 extension and serve progressive MP4.
  const isLikelyVideo = !/\.m3u8/i.test(remoteUrl) && (
    req.headers.range          // Browser probing for init segment
    || /okcdn\.ru|vkuser\.net/i.test(remoteUrl)  // Known progressive CDN
  )

  if (isLikelyVideo) {
    // Video path — stream straight through, no buffering.
    streamRemoteUrl(remoteUrl, cdnHeaders, req, res)
    return
  }

  // Playlist path — fetch, check content type, rewrite.
  try {
    const { status, body, contentType } = await fetchRemoteUrl(remoteUrl, cdnHeaders)

    if (status !== 200) {
      debug('Remote playlist HTTP', status, 'for', remoteUrl.slice(0, 80))
      safeWriteHead(res, status, { 'Access-Control-Allow-Origin': '*' })
      safeEnd(res, 'Remote playlist fetch failed')
      return
    }

    const isPlaylist = /mpegurl|x-mpegurl/i.test(contentType)
      || /\\.m3u8(\\?|$)/i.test(remoteUrl)
      || body.toString('utf-8').startsWith('#EXTM3U')

    if (isPlaylist) {
      const content = body.toString('utf-8')
      const rewritten = rewriteHlsUrls(content, remoteUrl, proxyId)
      safeWriteHead(res, 200, {
        'Content-Type': contentType || 'application/x-mpegURL; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      })
      safeEnd(res, rewritten)
    } else {
      // Got a video file back (no .m3u8 in URL, not a playlist by content type) —
      // stream it through without buffering 7+ GB into memory.
      streamRemoteUrl(remoteUrl, cdnHeaders, req, res)
    }
  } catch (err: any) {
    debug('Remote playlist error:', err.message)
    safeError(res, 'Remote playlist proxy error')
  }
}

async function serveRemoteFile(
  remoteUrl: string, req: http.IncomingMessage, res: http.ServerResponse,
) {
  try {
    const cdnHeaders = getCdnHeaders(remoteUrl)
    const { status, body, contentType } = await fetchRemoteUrl(remoteUrl, cdnHeaders)

    if (status !== 200) {
      debug('Remote file HTTP', status, 'for', remoteUrl.slice(0, 80))
      safeWriteHead(res, status, { 'Access-Control-Allow-Origin': '*' })
      safeEnd(res, 'Remote file fetch failed')
      return
    }

    const rangeHeader = req.headers.range
    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : body.length - 1
      const chunkSize = end - start + 1

      safeWriteHead(res, 206, {
        'Content-Range': `bytes ${start}-${end}/${body.length}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType || 'video/mp4',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      })
      safeEnd(res, body.slice(start, end + 1))
    } else {
      safeWriteHead(res, 200, {
        'Content-Length': body.length,
        'Content-Type': contentType || 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      })
      safeEnd(res, body)
    }
  } catch (err: any) {
    debug('Remote file error:', err.message)
    safeError(res, 'Remote file proxy error')
  }
}

/** Stream a remote URL directly to the response, forwarding Range requests.
 *  Used for large progressive files (ok.ru/VK CDN MP4s) that can't be
 *  buffered into memory. */
function streamRemoteUrl(
  remoteUrl: string,
  headers: Record<string, string>,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  const u = new URL(remoteUrl)
  const isHttps = u.protocol === 'https:'
  const client = isHttps ? https : http

  const outHeaders: Record<string, string> = { ...headers }
  // Forward Range header so the CDN returns 206 for seek requests.
  const range = req.headers.range
  if (range) outHeaders['Range'] = range
  // Don't request gzip from the CDN — we pipe bytes directly.
  outHeaders['Accept-Encoding'] = 'identity'

  const upstreamReq = client.request({
    hostname: u.hostname,
    port: u.port || (isHttps ? 443 : 80),
    path: u.pathname + u.search,
    method: 'GET',
    headers: outHeaders,
  }, (upRes) => {
    // Pass through key headers from upstream.
    safeWriteHead(res, upRes.statusCode || 200, {
      'Content-Type': upRes.headers['content-type'] || 'video/mp4',
      'Accept-Ranges': upRes.headers['accept-ranges'] || 'bytes',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      ...(upRes.headers['content-range'] && { 'Content-Range': upRes.headers['content-range'] }),
      ...(upRes.headers['content-length'] && { 'Content-Length': upRes.headers['content-length'] }),
    })

    upRes.pipe(res)
    upRes.on('error', () => {
      if (!res.writableEnded) res.end()
    })
    res.on('close', () => {
      upRes.destroy()
    })
  })

  upstreamReq.on('error', (err) => {
    debug('Stream remote URL error:', err.message, 'for', remoteUrl.slice(0, 80))
    safeError(res, 'Remote stream error')
  })
  upstreamReq.setTimeout(300000, () => upstreamReq.destroy(new Error('Stream timeout')))
  upstreamReq.end()
}

// Fetch a proxied URL and decide whether it's a playlist (rewrite) or segment (serve).
// CDN variant URLs like /expires/.../video/ don't have .m3u8 extensions,
// so we check the Content-Type header from the upstream response.
// For segments (video data), we stream directly without buffering the whole file.
async function serveProxiedContent(
  remoteUrl: string, proxyId: string, req: http.IncomingMessage, res: http.ServerResponse,
) {
  const cdnHeaders = getCdnHeaders(remoteUrl)

  // For non-.m3u8 URLs without a Range header, do a lightweight peek to
  // classify the content. If the upstream returns a playlist content-type,
  // buffer + rewrite; otherwise stream the binary through.
  // With a Range header we stream straight away (segments carry Range headers).
  if (req.headers.range && !/\\.m3u8/i.test(remoteUrl)) {
    streamRemoteUrl(remoteUrl, cdnHeaders, req, res)
    return
  }

  try {
    const { status, body, contentType } = await fetchRemoteUrl(remoteUrl, cdnHeaders)

    if (status !== 200) {
      debug('Proxied content HTTP', status, 'for', remoteUrl.slice(0, 80))
      safeWriteHead(res, status)
      safeEnd(res, 'Proxied fetch failed')
      return
    }

    const isPlaylist = /mpegurl|x-mpegurl/i.test(contentType)
      || /\.m3u8(\?|$)/i.test(remoteUrl)
      || body.toString('utf-8').startsWith('#EXTM3U')

    if (isPlaylist) {
      // Rewrite the playlist's internal URLs to go through the proxy
      const content = body.toString('utf-8')
      const rewritten = rewriteHlsUrls(content, remoteUrl, proxyId)
      safeWriteHead(res, 200, {
        'Content-Type': contentType || 'application/x-mpegURL; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      })
      safeEnd(res, rewritten)
    } else {
      // Serve raw segment/bytes by streaming directly from the CDN.
      // For large progressive files (ok.ru/VK CD, this avoids loading
      // the entire file into memory — we pipe through Range requests.
      streamRemoteUrl(remoteUrl, cdnHeaders, req, res)
    }
  } catch (err: any) {
    debug('Proxied content error:', err.message)
    safeError(res, 'Proxied content error')
  }
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  // Prevent unhandled socket errors from crashing the Electron main process.
  req.on('error', () => { if (!res.writableEnded) res.end() })
  res.on('error', () => {})

  // Allow cross-origin reads from the renderer (dev server origin
  // http://localhost:5173, and the packaged file:// origin). Must cover ALL
  // responses — error paths included — or hls.js XHRs CORS-block upstream
  // 503s and the console fills with "No 'Access-Control-Allow-Origin' header".
  // writeHead() merges with headers set here, so one line covers every branch.
  res.setHeader('Access-Control-Allow-Origin', '*')

  const url = req.url || '/'

  // CORS preflight — hls.js sets a Range header, which is not a safelisted
  // header, so the browser sends an OPTIONS request first when the renderer
  // origin (http://localhost:5173) differs from the server (127.0.0.1).
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type, Accept',
      'Access-Control-Max-Age': '86400',
    })
    res.end()
    return
  }

  // Handle /local/<id>/<filename> — serve a local file (completed usenet
  // download) with Range support. Token-guarded: only paths registered via
  // createFileSession. The filename suffix is cosmetic (drives the renderer's
  // native-vs-hls content-type inference); the session id is the authority.
  const localMatch = url.match(/^\/local\/([a-zA-Z0-9]+)\/([^/]+)$/)
  if (localMatch && fileSessions.has(localMatch[1])) {
    serveFile(fileSessions.get(localMatch[1])!, req, res)
    return
  }

  // Handle /proxy/<id>/<path> — fetch remote HLS stream with proper headers
  //   /proxy/<id>/                    → master playlist (session.url)
  //   /proxy/<id>/<encoded-remote-url> → decoded URL fetch (variant playlists, segments)
  const proxyMatch = url.match(/^\/proxy\/([a-zA-Z0-9]+)\/?(.*)$/)
  if (proxyMatch && proxySessions.has(proxyMatch[1])) {
    const session = proxySessions.get(proxyMatch[1])!
    const subPath = proxyMatch[2]

    if (!subPath || subPath === 'master.m3u8' || subPath === 'index.mp4') {
      // First request: fetch the master playlist (or progressive video)
      serveRemotePlaylist(session.url, session.id, req, res)
      return
    }

    // Subsequent requests: decode the URL from the path
    let remoteUrl: string
    try {
      remoteUrl = decodeURIComponent(subPath)
    } catch {
      res.writeHead(400)
      res.end('Bad proxy URL encoding')
      return
    }

    // Fetch the remote URL first, then decide based on Content-Type
    // whether it's a playlist (rewrite URLs) or a segment (serve raw).
    serveProxiedContent(remoteUrl, session.id, req, res)
    return
  }

  // Handle /remux/<sessionId>/<filename> — FFmpeg HLS remux output (MPEG-TS segments)
  const remuxMatch = url.match(/^\/remux\/([a-zA-Z0-9]+)\/(playlist\.m3u8|segment\d{5}\.ts)$/)
  if (remuxMatch) {
    FfmpegRemux.handleRemuxRequest(remuxMatch[1], remuxMatch[2], req, res)
    return
  }

  // Handle /webtorrent/<infoHash>/<fileIndex> — stream via WebTorrent in-memory
  const wtMatch = url.match(/^\/webtorrent\/([a-fA-F0-9]+)\/(\d+)/)
  if (wtMatch && torrentStreamFactory) {
    const infoHash = wtMatch[1].toLowerCase()
    const fileIndex = parseInt(wtMatch[2], 10)
    serveTorrentStream(infoHash, fileIndex, req, res)
    return
  }

  // Handle /stream/<infoHash>/<index> (legacy, fallback)
  const streamMatch = url.match(/^\/stream\/([a-fA-F0-9]+)\/(\d+)/)
  if (streamMatch) {
    const infoHash = streamMatch[1].toLowerCase()
    const fileIndex = parseInt(streamMatch[2], 10)
    const infoDir = path.join(CACHE_DIR, infoHash)
    if (!fs.existsSync(infoDir)) {
      res.writeHead(404)
      res.end('Torrent not cached')
      return
    }
    const entries = fs.readdirSync(infoDir).filter(e => {
      const fp = path.join(infoDir, e)
      return fs.statSync(fp).isFile()
    })
    const filePath = entries[fileIndex] ? path.join(infoDir, entries[fileIndex]) : null
    if (!filePath) {
      res.writeHead(404)
      res.end('File not found')
      return
    }
    serveFile(filePath, req, res)
    return
  }

  const match = url.match(/^\/cache\/(.+)/)
  if (!match) {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  const relativePath = decodeURIComponent(match[1])
  const filePath = path.join(CACHE_DIR, relativePath)

  if (!filePath.startsWith(CACHE_DIR)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  serveFile(filePath, req, res)
}

export function getPort(): number {
  return serverPort
}

export function init(): void {
  getCacheDir()
  debug(`Cache directory: ${CACHE_DIR}`)

  if (server) return
  server = http.createServer(handleRequest)
  server.requestTimeout = 300000
  server.headersTimeout = 60000
  server.keepAliveTimeout = 30000
  server.listen(0, '127.0.0.1', () => {
    const addr = server!.address()
    if (addr && typeof addr === 'object') {
      serverPort = addr.port
      debug(`HTTP cache server listening on port ${serverPort}`)
    }
  })
}

export function destroy(): void {
  if (server) {
    // Force-close active connections so mpv's HTTP client doesn't hang.
    // server.close() alone waits for keep-alive connections to drain.
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections()
    }
    server.close()
    server = null
    serverPort = 0
    torrentStreamFactory = null
  }
}
