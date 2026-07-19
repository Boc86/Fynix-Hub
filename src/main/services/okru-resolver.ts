import * as http from 'http'
import * as https from 'https'
import { URL } from 'url'

const OKRU_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate',
}

const CDN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Referer': 'https://ok.ru/',
  'Origin': 'https://ok.ru',
}

function fetchUrl(url: string, headers: Record<string, string>, maxRedirects = 5, maxRetries = 3): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    let currentUrl = url
    const visited: string[] = []
    let retriesLeft = maxRetries
    let errored = false

    const retry = (err: Error) => {
      if (errored) return
      if (retriesLeft > 0) {
        errored = true
        retriesLeft--
        console.log(`[okru-resolver] retrying (${maxRetries - retriesLeft}/${maxRetries}) after: ${err.message}`)
        currentUrl = visited[visited.length - 1]
        setTimeout(() => { errored = false; doFetch() }, 1000)
      } else {
        reject(err)
      }
    }

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
        res.on('error', retry)
      })

      req.on('error', retry)
      req.setTimeout(30000, () => req.destroy(new Error('Request timeout')))
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
  // Any .m3u8 on any okcdn.ru or mail.ru subdomain
  const hlsRe = /https?:\/\/[^\s"'\\]+\.(?:okcdn|mail)\.[^\s"'\\]*\.m3u8[^\s"'\\]*/gi
  const all: string[] = []
  let m: RegExpExecArray | null
  while ((m = hlsRe.exec(decoded)) !== null) all.push(m[0])
  if (all.length > 0) {
    const withQuery = all.filter(u => u.includes('?'))
    return (withQuery.length > 0 ? withQuery : all)[0]
  }
  return null
}

function extractHlsFromJson(obj: any): string | null {
  // Try nested flashvars.metadata first (main video page format)
  if (obj.flashvars && typeof obj.flashvars.metadata === 'string') {
    try {
      const meta = JSON.parse(obj.flashvars.metadata)
      if (typeof meta.hlsManifestUrl === 'string' && meta.hlsManifestUrl) return meta.hlsManifestUrl
      if (Array.isArray(meta.videos) && meta.videos.length > 0) {
        // prefer higher quality
        const qualities: Record<string, number> = { mobile: 0, lowest: 1, low: 2, sd: 3, hd: 4, full: 5, quad: 6, ultra: 7 }
        let best = meta.videos[0]
        let bestScore = -1
        for (const v of meta.videos) {
          if (v && typeof v.url === 'string' && v.url) {
            const score = qualities[v.name] ?? 0
            if (score > bestScore) { best = v; bestScore = score }
          }
        }
        if (best && best.url) return best.url
      }
    } catch { /* not JSON */ }
  }

  // Direct hlsManifestUrl field
  if (typeof obj.hlsManifestUrl === 'string' && obj.hlsManifestUrl) return obj.hlsManifestUrl
  // ondemandHls field
  if (typeof obj.ondemandHls === 'string' && obj.ondemandHls) return obj.ondemandHls
  // url240/360/480/720/1080 = quality MP4, skip url/url11 (SWF players)
  const urlFields = ['url240', 'url360', 'url480', 'url720', 'url1080', 'url1440', 'url2160']
  for (const key of urlFields) {
    if (typeof obj[key] === 'string' && obj[key] && obj[key].startsWith('http')) {
      return obj[key]
    }
  }
  // videos array fallback (top-level)
  if (Array.isArray(obj.videos) && obj.videos.length > 0) {
    for (const v of obj.videos) {
      if (v && typeof v.url === 'string' && v.url) return v.url
    }
  }
  // url11 as last resort (might be SWF, but try anyway)
  if (typeof obj.url11 === 'string' && obj.url11 && obj.url11.startsWith('http')) return obj.url11
  if (typeof obj.url === 'string' && obj.url && obj.url.startsWith('http')) return obj.url
  return null
}

async function fetchEmbedPage(videoId: string, baseUrl: string, headers: Record<string, string>): Promise<OkruMetadata> {
  const { body } = await fetchUrl(baseUrl, headers)
  console.log('[okru-resolver] page size:', body.length, 'has data-options:', body.includes('data-options='))

  // Try extracting data-options value directly (any attribute)
  const dataOptionsMatch = body.match(/data-options="([^"]+)"/)
  if (dataOptionsMatch) {
    const raw = dataOptionsMatch[1]
    const decoded = htmlDecode(raw)
    console.log('[okru-resolver] data-options decoded length:', decoded.length, 'first 200 chars:', decoded.slice(0, 200))

    // Try JSON fields from the decoded object
    try {
      const parsed = JSON.parse(decoded)
      console.log('[okru-resolver] JSON keys:', Object.keys(parsed).join(', '))
      if (parsed.flashvars) console.log('[okru-resolver] has flashvars.metadata:', typeof parsed.flashvars.metadata)
      const jsonHls = extractHlsFromJson(parsed)
      if (jsonHls) {
        console.log('[okru-resolver] extracted manifest URL from JSON')
        return { hlsManifestUrl: jsonHls }
      }
    } catch (e) {
      console.log('[okru-resolver] JSON parse failed:', (e as Error).message)
    }
  } else {
    console.log('[okru-resolver] no data-options found in page, body snippet:', body.slice(1000, 2000))
  }

  // Fallback: regex on the decoded (but not JSON-parsed) data-options string
  // Pattern: "hlsManifestUrl":"https://..." (after htmlDecode)
  if (dataOptionsMatch) {
    const decoded = htmlDecode(dataOptionsMatch[1])
    const hlsKeyMatch = decoded.match(/"hlsManifestUrl"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (hlsKeyMatch) {
      let url = hlsKeyMatch[1]
      url = url.replace(/\\u0026/g, '&')
      if (url.startsWith('http')) {
        console.log('[okru-resolver] extracted hlsManifestUrl via regex on decoded data-options')
        return { hlsManifestUrl: url }
      }
    }
  }

  // Targeted: extract hlsManifestUrl value from raw body with HTML entities
  const hlsRawMatch = body.match(/hlsManifestUrl(?:&quot;)?\s*:\s*(?:&quot;)?([^&"]+\.m3u8[^&"]*)/i)
  if (hlsRawMatch) {
    let url = hlsRawMatch[1]
    url = url.replace(/\\u0026/g, '&').replace(/\\\\u0026/g, '&')
    console.log('[okru-resolver] extracted hlsManifestUrl from raw body')
    return { hlsManifestUrl: url }
  }

  // Regex on raw body for any .m3u8
  const reUrl = extractHlsManifestUrl(body)
  if (reUrl) {
    console.log('[okru-resolver] extracted manifest URL via regex')
    return { hlsManifestUrl: reUrl }
  }

  // Look for any data-config JSON in the page
  const configMatch = body.match(/data-config="([^"]+)"/)
  if (configMatch) {
    const configDecoded = htmlDecode(configMatch[1])
    try {
      const config = JSON.parse(configDecoded)
      const hls = extractHlsFromJson(config)
      if (hls) {
        console.log('[okru-resolver] extracted manifest URL from data-config JSON')
        return { hlsManifestUrl: hls }
      }
    } catch { /* not valid JSON */ }
    const hlsFromConfig = extractHlsManifestUrl(configDecoded)
    if (hlsFromConfig) {
      console.log('[okru-resolver] extracted manifest URL from data-config regex')
      return { hlsManifestUrl: hlsFromConfig }
    }
  }

  throw new Error('No hlsManifestUrl found in embed page')
}

async function fetchEmbedMetadata(videoId: string): Promise<OkruMetadata> {
  const urls = [
    `https://ok.ru/videoembed/${videoId}`,
    `https://ok.ru/video/${videoId}`,
    `https://m.ok.ru/video/${videoId}`,
  ]
  const mobileHeaders = { ...OKRU_HEADERS, 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' }

  let lastError: Error | null = null
  for (let i = 0; i < urls.length; i++) {
    try {
      console.log(`[okru-resolver] trying URL ${i + 1}/${urls.length}: ${urls[i]}`)
      const headers = urls[i].includes('m.ok.ru') ? mobileHeaders : OKRU_HEADERS
      return await fetchEmbedPage(videoId, urls[i], headers)
    } catch (err) {
      lastError = err as Error
      console.log(`[okru-resolver] URL ${i + 1}/${urls.length} failed: ${(err as Error).message}`)
    }
  }

  throw lastError || new Error('No hlsManifestUrl found in embed page')
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
