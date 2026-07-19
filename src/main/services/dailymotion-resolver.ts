import * as https from 'https'
import { URL } from 'url'

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function fetchPage(url: string, retries = 3): Promise<string> {
  return new Promise((resolve, reject) => {
    let retriesLeft = retries
    function doFetch() {
      const u = new URL(url)
      const req = https.request({
        hostname: u.hostname, port: 443, path: u.pathname + u.search,
        method: 'GET',
        headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*' },
      }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks).toString()))
      })
      req.on('error', (err) => {
        if (retriesLeft > 0) { retriesLeft--; setTimeout(doFetch, 1000) }
        else reject(err)
      })
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')) })
      req.end()
    }
    doFetch()
  })
}

export function isDailymotionUrl(url: string): boolean {
  return /dailymotion\.com\/(player|embed|video)\//.test(url) || /dailymotion\.com\/(player|embed)\?/.test(url)
}

export function extractVideoId(url: string): string | null {
  const qs = url.match(/[?&]video=([a-z0-9]+)/i)
  if (qs) return qs[1]
  const path = url.match(/dailymotion\.com\/(?:video|embed)\/([a-z0-9]+)/i)
  if (path) return path[1]
  return null
}

export async function resolveDailymotionUrl(url: string): Promise<{ url: string; cookie?: string }> {
  const videoId = extractVideoId(url)
  if (!videoId) throw new Error('Could not extract Dailymotion video ID from: ' + url)

  // Try the metadata API first — captures cookies needed by the CDN
  const metaResult = await fetchMetadataWithCookies(videoId)
  if (metaResult) return metaResult

  // Fallback: try the embed page (no cookies needed for this path)
  const playerUrl = `https://geo.dailymotion.com/player.html?video=${videoId}`
  const body = await fetchPage(playerUrl)
  const configMatch = body.match(/window\.__PLAYER_CONFIG__\s*=\s*({.*?});/s)
  if (configMatch) {
    try {
      const config = JSON.parse(configMatch[1])
      const manifestUrl = config?.criticalMetadata?.manifestUrl
      if (manifestUrl) return { url: manifestUrl }
    } catch { /* ignore */ }
  }

  throw new Error('No playable stream found for Dailymotion video')
}

function fetchMetadataWithCookies(videoId: string): Promise<{ url: string; cookie?: string } | null> {
  return new Promise((resolve) => {
    const u = new URL(`https://www.dailymotion.com/player/metadata/video/${videoId}`)
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search,
      method: 'GET',
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString())
          const hlsUrl = pickBestQuality(parsed?.qualities)
          if (!hlsUrl) return resolve(null)
          const cookies = res.headers['set-cookie']
          const cookieStr = cookies ? cookies.map(c => c.split(';')[0]).join('; ') : undefined
          resolve({ url: hlsUrl, cookie: cookieStr })
        } catch { resolve(null) }
      })
    })
    req.on('error', () => resolve(null))
    req.setTimeout(15000, () => { req.destroy(); resolve(null) })
    req.end()
  })
}

function pickBestQuality(qualities: any): string | null {
  if (!qualities) return null
  const order = ['auto', '2160', '1440', '1080', '720', '480', '360', '240', '144']
  for (const key of order) {
    const q = qualities[key]
    if (q && q.length > 0 && q[0].url) return q[0].url
  }
  for (const key of Object.keys(qualities)) {
    const q = qualities[key]
    if (q && q.length > 0 && q[0].url) return q[0].url
  }
  return null
}
