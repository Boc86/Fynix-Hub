import * as http from 'http'
import { URL } from 'url'
import * as httpsMod from 'https'
import { resolveOkruReplay, isOkruReplay } from './okru-resolver'

// ── ok.ru-only proxy session state (isolated from shared cache service) ──────

interface OkruProxySession {
  id: string
  url: string
  headers: Record<string, string>
}

const okruProxySessions = new Map<string, OkruProxySession>()

function generateOkruProxyId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// v2.0.6 CDN headers for okcdn/ok.ru/VK HLS manifests and segments
function getOkruCdnHeaders(
  url: string,
  baseHeaders: Record<string, string> = {},
): Record<string, string> {
  const isOkCdn = /okcdn\.ru/i.test(url)
  const isOkCdnHls = isOkCdn && /\.m3u8/i.test(url)
  const isVkUser = /vkuser\.net/i.test(url)
  const isVk = /vk\.com|vkvideo/i.test(url)

  if (isOkCdn && !isOkCdnHls) {
    return {
      ...baseHeaders,
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Encoding': 'identity',
    }
  }
  if (isOkCdnHls || isVkUser || isVk) {
    return {
      ...baseHeaders,
      Referer: 'https://ok.ru/',
      Origin: 'https://ok.ru',
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Encoding': 'identity',
    }
  }
  return baseHeaders
}

function fetchOkruRemoteUrl(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: Buffer; contentType: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const isHttps = u.protocol === 'https:'
    const client = isHttps ? httpsMod : http
    const req = client.request(
      {
        hostname: u.hostname,
        port: u.port || (isHttps ? 443 : 80),
        path: u.pathname + u.search,
        method: 'GET',
        headers,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks),
            contentType:
              res.headers['content-type'] || 'application/octet-stream',
          })
        })
      },
    )
    req.on('error', reject)
    req.setTimeout(30000, () => req.destroy(new Error('Request timeout')))
    req.end()
  })
}

// v2.0.6 rewriteHlsUrls: fix \\u0026 before proxy-url-encoding internal URLs
function rewriteOkruHlsUrls(
  playlist: string,
  baseUrl: string,
  proxyId: string,
  serverPort: number,
): string {
  return playlist.replace(
    /^((?!#)[^\s\r\n]+)(.*)$/gm,
    (_match: string, rawUrl: string, rest: string) => {
      if (rawUrl.startsWith('http://127.0.0.1:')) return _match
      rawUrl = rawUrl.replace(/\\u0026/g, '&')
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

// Stream the remote URL through, forwarding the client's Range header.
async function streamOkruRemoteUrl(
  remoteUrl: string,
  headers: Record<string, string>,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  try {
    const u = new URL(remoteUrl)
    const isHttps = u.protocol === 'https:'
    const client = isHttps ? httpsMod : http
    const opts: http.RequestOptions = {
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method: 'GET',
      headers,
    }
    if (req.headers.range) {
      opts.headers = { ...headers, Range: req.headers.range as string }
    }
    const upstream = client.request(opts, (upRes) => {
      if (upRes.statusCode !== 200) {
        console.error(
          '[okru-playback] upstream stream HTTP',
          upRes.statusCode,
          'for',
          remoteUrl.slice(0, 80),
        )
        if (res.headersSent || res.writableEnded || res.destroyed) return
        res.writeHead(upRes.statusCode || 502, {
          'Access-Control-Allow-Origin': '*',
        })
        if (res.writableEnded || res.destroyed) return
        res.end('Upstream stream failed')
        upRes.resume()
        return
      }
      if (res.headersSent || res.writableEnded || res.destroyed) return
      res.writeHead(200, {
        'Content-Type':
          upRes.headers['content-type'] || 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      })
      upRes.pipe(res)
    })
    upstream.on('error', (err) => {
      console.error('[okru-playback] upstream stream error:', err.message)
      if (res.headersSent || res.writableEnded || res.destroyed) return
      res.writeHead(500, { 'Access-Control-Allow-Origin': '*' })
      if (res.writableEnded || res.destroyed) return
      res.end('Upstream stream error')
    })
    upstream.end()
  } catch (err) {
    console.error('[okru-playback] streamRemoteUrl error:', err)
    if (res.headersSent || res.writableEnded || res.destroyed) return
    res.writeHead(500, { 'Access-Control-Allow-Origin': '*' })
    if (res.writableEnded || res.destroyed) return
    res.end('Upstream stream error')
  }
}

// v2.0.6 serveRemotePlaylist: fetch master playlist with CDN headers, rewrite
// internal URLs to the ok.ru-only proxy, serve back. Non-200 upstream → forward
// status + message.
async function serveOkruRemotePlaylist(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  okruSession: OkruProxySession,
  serverPort: number,
): Promise<void> {
  const cdnHeaders = getOkruCdnHeaders(okruSession.url)
  const isLikelyVideo =
    !/\.m3u8/i.test(okruSession.url) &&
    (req.headers.range || /okcdn\.ru|vkuser\.net/i.test(okruSession.url))

  if (isLikelyVideo) {
    await streamOkruRemoteUrl(okruSession.url, cdnHeaders, req, res)
    return
  }

  try {
    const { status, body, contentType } = await fetchOkruRemoteUrl(
      okruSession.url,
      cdnHeaders,
    )
    if (status !== 200) {
      console.error(
        '[okru-playback] master playlist HTTP',
        status,
        'for',
        okruSession.url.slice(0, 80),
      )
      if (res.headersSent || res.writableEnded || res.destroyed) return
      res.writeHead(status, { 'Access-Control-Allow-Origin': '*' })
      if (res.writableEnded || res.destroyed) return
      res.end('Remote playlist fetch failed')
      return
    }

    const isPlaylist =
      /mpegurl|x-mpegurl/i.test(contentType) ||
      /\.m3u8(\?|$)/i.test(okruSession.url) ||
      body.toString('utf-8').startsWith('#EXTM3U')

    if (isPlaylist) {
      const content = body.toString('utf-8')
      const rewritten = rewriteOkruHlsUrls(
        content,
        okruSession.url,
        okruSession.id,
        serverPort,
      )
      if (res.headersSent || res.writableEnded || res.destroyed) return
      res.writeHead(200, {
        'Content-Type':
          contentType || 'application/x-mpegURL; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      })
      if (res.writableEnded || res.destroyed) return
      res.end(rewritten)
    } else {
      await streamOkruRemoteUrl(okruSession.url, cdnHeaders, req, res)
    }
  } catch (err) {
    console.error('[okru-playback] master playlist error:', err)
    if (res.headersSent || res.writableEnded || res.destroyed) return
    res.writeHead(500, { 'Access-Control-Allow-Origin': '*' })
    if (res.writableEnded || res.destroyed) return
    res.end('Remote playlist proxy error')
  }
}

// v2.0.6 serveProxiedContent: fetch remote URL, decide playlist-vs-segment, serve.
async function serveOkruProxiedContent(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  remoteUrl: string,
  okruSession: OkruProxySession,
  serverPort: number,
): Promise<void> {
  const cdnHeaders = getOkruCdnHeaders(remoteUrl)
  const isLikelyVideo =
    !/\.m3u8/i.test(remoteUrl) &&
    (req.headers.range || /okcdn\.ru|vkuser\.net/i.test(remoteUrl))

  if (isLikelyVideo) {
    await streamOkruRemoteUrl(remoteUrl, cdnHeaders, req, res)
    return
  }

  try {
    const { status, body, contentType } = await fetchOkruRemoteUrl(
      remoteUrl,
      cdnHeaders,
    )
    if (status !== 200) {
      console.error(
        '[okru-playback] proxied content HTTP',
        status,
        'for',
        remoteUrl.slice(0, 80),
      )
      if (res.headersSent || res.writableEnded || res.destroyed) return
      res.writeHead(status, { 'Access-Control-Allow-Origin': '*' })
      if (res.writableEnded || res.destroyed) return
      res.end('Proxied fetch failed')
      return
    }

    const isPlaylist =
      /mpegurl|x-mpegurl/i.test(contentType) ||
      /\.m3u8(\?|$)/i.test(remoteUrl) ||
      body.toString('utf-8').startsWith('#EXTM3U')

    if (isPlaylist) {
      const content = body.toString('utf-8')
      const rewritten = rewriteOkruHlsUrls(
        content,
        remoteUrl,
        okruSession.id,
        serverPort,
      )
      if (res.headersSent || res.writableEnded || res.destroyed) return
      res.writeHead(200, {
        'Content-Type':
          contentType || 'application/x-mpegURL; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      })
      if (res.writableEnded || res.destroyed) return
      res.end(rewritten)
    } else {
      const rangeHeader = req.headers.range
      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        const end = parts[1]
          ? Math.max(0, parseInt(parts[1], 10))
          : body.length - 1
        const chunkSize = end - start + 1
        if (res.headersSent || res.writableEnded || res.destroyed) return
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${body.length}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': contentType || 'video/mp4',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        })
        if (res.writableEnded || res.destroyed) return
        res.end(body.slice(start, end + 1))
      } else {
        if (res.headersSent || res.writableEnded || res.destroyed) return
        res.writeHead(200, {
          'Content-Length': body.length,
          'Content-Type': contentType || 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        })
        if (res.writableEnded || res.destroyed) return
        res.end(body)
      }
    }
  } catch (err) {
    console.error('[okru-playback] proxied content error:', err)
    if (res.headersSent || res.writableEnded || res.destroyed) return
    res.writeHead(500, { 'Access-Control-Allow-Origin': '*' })
    if (res.writableEnded || res.destroyed) return
    res.end('Proxied content error')
  }
}

// v2.0.6-style ok.ru proxy request handler
export function handleOkruProxyRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  serverPort: number,
): boolean {
  req.on('error', () => {
    if (!res.writableEnded) {
      if (res.writableEnded || res.destroyed) return
      res.end()
    }
  })
  res.on('error', () => {})

  const url = req.url || '/'
  const proxyMatch = url.match(/^\/proxy\/([a-zA-Z0-9]+)\/?(.*)$/)
  if (!proxyMatch) {
    return false
  }

  const okruSession = okruProxySessions.get(proxyMatch[1])
  if (!okruSession) {
    return false
  }

  const subPath = proxyMatch[2]

  if (!subPath) {
    serveOkruRemotePlaylist(req, res, okruSession, serverPort)
    return true
  }

  let remoteUrl: string
  try {
    remoteUrl = decodeURIComponent(subPath).replace(/\\u0026/g, '&')
  } catch {
    if (res.headersSent || res.writableEnded || res.destroyed) return true
    res.writeHead(400, { 'Access-Control-Allow-Origin': '*' })
    if (res.writableEnded || res.destroyed) return true
    res.end('Bad proxy URL encoding')
    return true
  }

  serveOkruProxiedContent(req, res, remoteUrl, okruSession, serverPort)
  return true
}

// ── Public API ──────────────────────────────────────────────────────────────

export function destroyOkruProxySession(proxyId: string): void {
  okruProxySessions.delete(proxyId)
}

export async function resolveAndCreateOkruProxy(
  inputUrl: string,
  serverPort: number,
): Promise<{ proxyUrl: string; proxyId: string; destroy: () => void }> {
  const resolvedUrl = await resolveOkruReplay(inputUrl)
  const proxyId = generateOkruProxyId()
  const cdnHeaders = getOkruCdnHeaders(resolvedUrl)
  okruProxySessions.set(proxyId, {
    id: proxyId,
    url: resolvedUrl,
    headers: cdnHeaders,
  })
  const proxyUrl = `http://127.0.0.1:${serverPort}/proxy/${proxyId}/`
  console.log(
    '[okru-playback] ok.ru proxy session created:',
    proxyId,
    '→',
    proxyUrl,
  )
  return {
    proxyUrl,
    proxyId,
    destroy() {
      okruProxySessions.delete(proxyId)
    },
  }
}

export { isOkruReplay }
