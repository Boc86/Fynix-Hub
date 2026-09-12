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
  'Accept-Encoding': 'identity',
}

function fetchUrl(url: string, headers: Record<string, string>, maxRedirects = 5, maxRetries = 3, timeoutMs = 30000): Promise<{ status: number; body: string; headers: Record<string, string> }> {
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
      req.setTimeout(timeoutMs, () => req.destroy(new Error('Request timeout')))
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
    .replace(/&(amp|lt|gt|quot|apos);/g, (_m, c) => {
      const m: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
      return m[c] ?? _m
    })
    .replace(/\u0026/g, '&')
    .replace(/\\\\\//g, '/')
    .replace(/\\\\"/g, '"')
    .replace(/\\"/g, '"')
}

function safeJsonParse(s: string): any | null {
  try { return JSON.parse(s) } catch { return null }
}

function extractHlsManifestUrl(decoded: string): string | null {
  // Any .m3u8 on any okcdn.ru or mail.ru subdomain
  const hlsRe = /https?:\/\/[^\s"']+\.(?:okcdn|mail)\.[^\s"']*\.m3u8[^\s"']*/gi
  const all: string[] = []
  let m: RegExpExecArray | null
  while ((m = hlsRe.exec(decoded)) !== null) all.push(m[0])
  if (all.length > 0) {
    const withQuery = all.filter(u => u.includes('?'))
    const rawUrl = (withQuery.length > 0 ? withQuery : all)[0]
    // The decoded data-options preserves JSON escape sequences like \u0026
    // (which is &). Replace them so the URL is valid for new URL() and CDN
    // requests — a literal backslash in a URL query is invalid and causes
    // TypeError: Invalid URL in streamRemoteUrl.
    return rawUrl.replace(/\u0026/g, '&')
  }
  return null
}

function extractHlsFromJson(obj: any, _depth = 0): string | null {
  if (_depth > 5) return null
  // Try nested flashvars.metadata — it may be a JSON-encoded string or
  // already a parsed object (ok.ru page format varies by region/visitor).
  if (obj.flashvars && obj.flashvars.metadata) {
    const meta = typeof obj.flashvars.metadata === 'string'
      ? safeJsonParse(obj.flashvars.metadata)
      : obj.flashvars.metadata
    if (meta) {
      const result = extractHlsFromJson(meta, _depth + 1)
      if (result) return result
    }
  }

  // Direct hlsManifestUrl field — validate it's not a SWF player URL
  if (typeof obj.hlsManifestUrl === 'string' && obj.hlsManifestUrl && !/\.swf/i.test(obj.hlsManifestUrl)) return obj.hlsManifestUrl
  // ondemandHls field — validate it's not a SWF player URL
  if (typeof obj.ondemandHls === 'string' && obj.ondemandHls && !/\.swf/i.test(obj.ondemandHls)) return obj.ondemandHls
  // url240/360/480/720/1080 = quality MP4, skip url/url11 (SWF players)
  const urlFields = ['url240', 'url360', 'url480', 'url720', 'url1080', 'url1440', 'url2160']
  for (const key of urlFields) {
    if (typeof obj[key] === 'string' && obj[key] && obj[key].startsWith('http')) {
      return obj[key]
    }
  }
  // videos array — skip SWF player URLs (e.g. vp.swf)
  if (Array.isArray(obj.videos) && obj.videos.length > 0) {
    for (const v of obj.videos) {
      if (v && typeof v.url === 'string' && v.url && !/\.swf(?:["'\s?]|$)/i.test(v.url)) {
        return v.url
      }
    }
  }
  return null
}

// ok.ru nests the playable URL inside flashvars.metadata (a JSON-encoded
// string). The outer data-options blob is not valid JSON, and there is no
// .m3u8 manifest embedded anymore — the metadata.videos[] array carries a
// direct progressive URL (e.g. *.vkuser.net). Pull the metadata string out
// surgically via brace-matching (resilient to ok.ru's escaping) and parse it.
// Accepts the htmlDecoded data-options (literal " delimiters), not the raw
// attribute value (which uses &quot;).
function extractFromMetadata(decoded: string): string | null {
  const key = '"metadata":"'
  const start = decoded.indexOf(key)
  if (start < 0) return null
  // The metadata value is a JSON object string. Brace-match its top-level '{'
  // so we can grab the whole object regardless of embedded quotes/escapes.
  let i = start + key.length
  if (decoded[i] !== '{') return null
  let depth = 0
  let inStr = false
  let esc = false
  let j = i
  for (; j < decoded.length; j++) {
    const c = decoded[j]
    if (inStr) {
      if (esc) { esc = false; continue }
      if (c === '\\') { esc = true; continue }
      if (c === '"') { inStr = false; continue }
    } else {
      if (c === '"') { inStr = true; continue }
      if (c === '{') depth++
      else if (c === '}') { depth--; if (depth === 0) break }
    }
  }
  if (depth !== 0) return null
  const closeQuote = j + 1
  if (decoded[closeQuote] !== '"') return null
  const metaStr = decoded.slice(i, closeQuote)
  const meta = safeJsonParse(metaStr)
  if (meta) return extractHlsFromJson(meta)
  return null
}

async function fetchEmbedPage(videoId: string, baseUrl: string, headers: Record<string, string>): Promise<OkruMetadata> {
  const { body } = await fetchUrl(baseUrl, headers, 5, 1, 12000)
  console.log('[okru-resolver] page size:', body.length, 'has data-options:', body.includes('data-options='))

  // Try extracting data-options value directly (any attribute)
  const dataOptionsMatch = body.match(/data-options="([^"]+)"/)
  const raw = dataOptionsMatch ? dataOptionsMatch[1] : ''
  let decoded = ''
  if (dataOptionsMatch) {
    decoded = htmlDecode(raw)
    console.log('[okru-resolver] data-options decoded length:', decoded.length, 'first 200 chars:', decoded.slice(0, 200))
  } else {
    console.log('[okru-resolver] no data-options found in page, body snippet:', body.slice(1000, 2000))
  }

  // 1) Plaintext .m3u8 anywhere in decoded data-options (cheap, v1.3.3-style).
  // Only search the decoded string, NOT the raw body — the body has &quot;
  // HTML entities which the regex's quote-stopper doesn't recognize, causing
  // it to match through multiple JSON values and grab a corrupt URL.
  const reUrl = decoded ? extractHlsManifestUrl(decoded) : null
  if (reUrl) {
    console.log('[okru-resolver] extracted manifest URL via regex')
    return { hlsManifestUrl: reUrl }
  }

  // 2) Whole-object parse (works when data-options is well-formed JSON).
  if (decoded) {
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
      console.log('[okru-resolver] whole-object JSON parse failed:', (e as Error).message)
    }
  }

  // 3) Surgical nested metadata extraction (the common ok.ru case).
  // When metadata is a JSON-encoded string (not a pre-parsed object),
  // extractFromMetadata brace-matches it out of the decoded data-options.
  if (decoded) {
    const metaHls = extractFromMetadata(decoded)
    if (metaHls) {
      console.log('[okru-resolver] extracted manifest URL from flashvars.metadata')
      return { hlsManifestUrl: metaHls }
    }
  }

  // 4) Fallback: regex for "hlsManifestUrl" key on decoded data-options.
  if (decoded) {
    const hlsKeyMatch = decoded.match(/"hlsManifestUrl"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (hlsKeyMatch) {
      let url = hlsKeyMatch[1].replace(/\u0026/g, '&')
      if (url.startsWith('http')) {
        console.log('[okru-resolver] extracted hlsManifestUrl via regex on decoded data-options')
        return { hlsManifestUrl: url }
      }
    }
  }

  // 5) Targeted raw-body hlsManifestUrl with HTML entities.
  const hlsRawMatch = body.match(/hlsManifestUrl(?:&quot;)?\s*:\s*(?:&quot;)?([^&"]+\.m3u8[^&"]*)/i)
  if (hlsRawMatch) {
    let url = hlsRawMatch[1].replace(/\u0026/g, '&')
    console.log('[okru-resolver] extracted hlsManifestUrl from raw body')
    return { hlsManifestUrl: url }
  }

  // 6) data-config JSON in the page.
  const configMatch = body.match(/data-config="([^"]+)"/)
  if (configMatch) {
    const configDecoded = htmlDecode(configMatch[1])
    const config = safeJsonParse(configDecoded)
    if (config) {
      const hls = extractHlsFromJson(config)
      if (hls) {
        console.log('[okru-resolver] extracted manifest URL from data-config JSON')
        return { hlsManifestUrl: hls }
      }
    }
    const hlsFromConfig = extractHlsManifestUrl(configDecoded)
    if (hlsFromConfig) {
      console.log('[okru-resolver] extracted manifest URL from data-config regex')
      return { hlsManifestUrl: hlsFromConfig }
    }
  }

  throw new Error('No hlsManifestUrl found in embed page')
}

async function fetchEmbedMetadata(videoId: string): Promise<OkruMetadata> {
  // ok.ru/video and ok.ru/videoembed serve the player config in data-options
  // (the source of the manifest). m.ok.ru returns a static shell with no
  // data-options, so it is only a last-resort fallback.
  const urls = [
    `https://ok.ru/video/${videoId}`,
    `https://ok.ru/videoembed/${videoId}`,
    `https://m.ok.ru/video/${videoId}`,
  ]
  const mobileHeaders = { ...OKRU_HEADERS, 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' }

  let lastError: Error | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      // ok.ru rate-limits repeat hits from the same IP; pause so a transient
      // block can clear before giving up.
      console.log('[okru-resolver] retrying all endpoints after brief pause')
      await new Promise((r) => setTimeout(r, 2500))
    }
    for (let i = 0; i < urls.length; i++) {
      try {
        console.log(`[okru-resolver] trying URL ${i + 1}/${urls.length} (attempt ${attempt + 1}): ${urls[i]}`)
        const headers = urls[i].includes('m.ok.ru') ? mobileHeaders : OKRU_HEADERS
        return await fetchEmbedPage(videoId, urls[i], headers)
      } catch (err) {
        lastError = err as Error
        console.log(`[okru-resolver] URL ${i + 1}/${urls.length} failed: ${(err as Error).message}`)
      }
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
  console.log('[okru-resolver] returning HLS manifest URL for proxy/hls.js playback')
  return masterUrl
}

export function isOkruReplay(url: string): boolean {
  return /ok\.ru\/video(?:embed)?\/\d+/.test(url)
}
