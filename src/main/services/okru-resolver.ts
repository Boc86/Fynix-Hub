import * as http from 'http'
import * as https from 'https'
import { URL } from 'url'

const OKRU_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
}

const CDN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Referer': 'https://ok.ru/',
  'Origin': 'https://ok.ru',
}

function fetchUrl(url: string, headers: Record<string, string>, maxRedirects = 5): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    let currentUrl = url
    const visited: string[] = []

    const doFetch = () => {
      if (visited.length > maxRedirects) {
        reject(new Error('Too many redirects'))
        return
      }
      visited.push(currentUrl)
      const u = new URL(currentUrl)
      const isHttps = u.protocol === 'https:'
      const client = isHttps ? https : http

      const req = client.request({
        hostname: u.hostname,
        port: u.port || (isHttps ? 443 : 80),
        path: u.pathname + u.search,
        method: 'GET',
        headers: { ...headers },
      }, (res) => {
        const status = res.statusCode || 0
        if (status >= 300 && status < 400 && res.headers.location) {
          const newUrl = new URL(res.headers.location, currentUrl).toString()
          res.resume()
          currentUrl = newUrl
          doFetch()
          return
        }

        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const buffer = Buffer.concat(chunks)
          const encoding = (res.headers['content-encoding'] || '').toLowerCase()
          let body: Buffer = buffer
          try {
            if (encoding === 'gzip') body = require('zlib').gunzipSync(buffer)
            else if (encoding === 'deflate') body = require('zlib').inflateSync(buffer)
            else if (encoding === 'br') body = require('zlib').brotliDecompressSync(buffer)
          } catch {
            body = buffer
          }
          resolve({
            status,
            body: body.toString('utf-8'),
            headers: res.headers as Record<string, string>,
          })
        })
        res.on('error', reject)
      })

      req.on('error', reject)
      req.setTimeout(15000, () => req.destroy(new Error('Request timeout')))
      req.end()
    }

    doFetch()
  })
}

export async function extractVideoIdFromUrl(url: string): Promise<string | null> {
  const m = url.match(/ok\.ru\/video(?:embed)?\/(\d+)/)
  return m ? m[1] : null
}

interface OkruMetadata {
  movie?: {
    title?: string
    duration?: number
    poster?: string
  }
  hlsManifestUrl?: string
  ondemandHls?: string
  videos?: { url?: string }[]
  failoverHosts?: string[]
}

function htmlDecode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_m, c) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[c] as string))
    .replace(/\\\\u0026/g, '&')
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/')
    .replace(/\\\\"/g, '"')
    .replace(/\\"/g, '"')
}

function extractHlsManifestUrl(decoded: string): string | null {
  const allMatches: string[] = []
  const re = /https?:\/\/vd\d+\.okcdn\.ru\/video\.m3u8\?[^\s"'\\]+/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(decoded)) !== null) {
    allMatches.push(m[0])
  }
  if (allMatches.length > 0) return allMatches[0]
  const re2 = /https?:\/\/vd\d+\.okcdn\.ru\/video\.m3u8[^\s"'\\]*/gi
  while ((m = re2.exec(decoded)) !== null) {
    if (m[0].includes('.m3u8?')) allMatches.push(m[0])
  }
  if (allMatches.length > 0) return allMatches[0]
  const re3 = /https?:\/\/[^\s"'\\]+\.okcdn\.ru\/[^\s"'\\]+\.m3u8[^\s"'\\]*/gi
  while ((m = re3.exec(decoded)) !== null) {
    allMatches.push(m[0])
  }
  if (allMatches.length > 0) return allMatches[0]
  return null
}

async function fetchEmbedMetadata(videoId: string): Promise<OkruMetadata> {
  const url = `https://ok.ru/videoembed/${videoId}`
  const { body } = await fetchUrl(url, OKRU_HEADERS)

  const okVideoMatch = body.match(/data-module="OKVideo"[\s\S]*?data-options="([^"]+)"/)
  if (!okVideoMatch) {
    throw new Error('Could not find OKVideo data-module in embed page')
  }

  const raw = okVideoMatch[1]
  const decoded = htmlDecode(raw)
  console.log('[okru-resolver] decoded length:', decoded.length, 'first 200 chars:', decoded.slice(0, 200))

  const hlsUrl = extractHlsManifestUrl(decoded)
  if (!hlsUrl) {
    const fallback = extractHlsManifestUrl(body)
    if (fallback) {
      console.log('[okru-resolver] using raw-body fallback URL')
      return { hlsManifestUrl: fallback }
    }
    throw new Error('No hlsManifestUrl found in embed page')
  }

  console.log('[okru-resolver] extracted manifest URL:', hlsUrl)
  return { hlsManifestUrl: hlsUrl }
}

async function fetchMasterPlaylist(masterUrl: string): Promise<{ url: string }> {
  const { body } = await fetchUrl(masterUrl, CDN_HEADERS)
  const resolutions: Record<string, number> = {
    mobile: 144, lowest: 240, low: 360, sd: 480, hd: 720, full: 1080, quad: 1440, ultra: 2160,
  }
  const lines = body.split(/\r?\n/)
  let bestBandwidth = -1
  let bestUrl: string | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const qMatch = line.match(/QUALITY=(\w+)/)
    if (qMatch) {
      const resolutionName = qMatch[1]
      const nextLine = lines[i + 1]?.trim()
      if (nextLine && !nextLine.startsWith('#')) {
        let absoluteUrl: URL
        try {
          absoluteUrl = new URL(nextLine, masterUrl)
        } catch {
          continue
        }
        const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/)
        const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0
        if (bandwidth > bestBandwidth) {
          bestBandwidth = bandwidth
          bestUrl = absoluteUrl.toString()
        }
      }
    } else {
      const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/)
      if (bandwidthMatch) {
        const nextLine = lines[i + 1]?.trim()
        if (nextLine && !nextLine.startsWith('#')) {
          try {
            const absoluteUrl = new URL(nextLine, masterUrl)
            const bandwidth = parseInt(bandwidthMatch[1], 10)
            if (bandwidth > bestBandwidth) {
              bestBandwidth = bandwidth
              bestUrl = absoluteUrl.toString()
            }
          } catch { /* ignore */ }
        }
      }
    }
  }
  if (!bestUrl) throw new Error('No usable variants in HLS master playlist')
  return { url: bestUrl }
}

export async function resolveOkruReplay(url: string): Promise<string> {
  const videoId = await extractVideoIdFromUrl(url)
  if (!videoId) throw new Error('Not an ok.ru video URL: ' + url)
  const meta = await fetchEmbedMetadata(videoId)
  const masterUrl = meta.hlsManifestUrl || meta.ondemandHls
  if (!masterUrl) throw new Error('No HLS manifest in ok.ru metadata')
  console.log('[okru-resolver] returning raw HLS manifest URL, letting mpv handle playlist parsing')
  return masterUrl
}

export function isOkruReplay(url: string): boolean {
  return /ok\.ru\/video(?:embed)?\/\d+/.test(url)
}
