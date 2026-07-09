import { createHash } from 'crypto'
import * as CacheService from './cache.service'

export interface SabnzbdConfig {
  url: string
  apiKey: string
}

export interface NzbgetConfig {
  url: string
  username: string
  password: string
}

export interface NzbDavConfig {
  url: string
  apiKey: string
  webdavUser: string
  webdavPass: string
}

export type UsenetProviderType = 'sabnzbd' | 'nzbget' | 'nzbdav'

export interface UsenetProviderConfig {
  type: UsenetProviderType
  sabnzbd: SabnzbdConfig
  nzbget: NzbgetConfig
  nzbdav: NzbDavConfig
}

export interface DownloadStatus {
  id: string
  name: string
  status: string
  progress: number
  size: number
  downloaded: number
  speed: number
  eta: string
  nzbUrl?: string
}

let providerConfig: UsenetProviderConfig | null = null
const activeDownloads: Map<string, DownloadStatus> = new Map()

export function loadConfig(): void {
  const sabUrl = CacheService.getSetting<string>('sabnzbdUrl') || ''
  const sabKey = CacheService.getSetting<string>('sabnzbdApiKey') || ''
  const nzbUrl = CacheService.getSetting<string>('nzbgetUrl') || ''
  const nzbUser = CacheService.getSetting<string>('nzbgetUsername') || ''
  const nzbPass = CacheService.getSetting<string>('nzbgetPassword') || ''
  const nzbdavUrl = CacheService.getSetting<string>('nzbdavUrl') || ''
  const nzbdavApiKey = CacheService.getSetting<string>('nzbdavApiKey') || ''
  const nzbdavWebdavUser = CacheService.getSetting<string>('nzbdavWebdavUser') || 'admin'
  const nzbdavWebdavPass = CacheService.getSetting<string>('nzbdavWebdavPass') || ''
  const providerType = (CacheService.getSetting<string>('usenetProvider') || 'sabnzbd') as UsenetProviderType

  if (!sabUrl && !nzbUrl && !nzbdavUrl) {
    providerConfig = null
    return
  }

  providerConfig = {
    type: providerType,
    sabnzbd: { url: sabUrl, apiKey: sabKey },
    nzbget: { url: nzbUrl, username: nzbUser, password: nzbPass },
    nzbdav: { url: nzbdavUrl, apiKey: nzbdavApiKey, webdavUser: nzbdavWebdavUser, webdavPass: nzbdavWebdavPass },
  }
}

function getConfig(): UsenetProviderConfig | null {
  if (!providerConfig) loadConfig()
  return providerConfig
}

export async function sendNzb(nzbUrl: string, title: string): Promise<DownloadStatus | null> {
  const cfg = getConfig()
  if (!cfg) return null

  try {
    if (cfg.type === 'sabnzbd') {
      return await sendToSabnzbd(cfg.sabnzbd, nzbUrl, title)
    } else if (cfg.type === 'nzbget') {
      return await sendToNzbget(cfg.nzbget, nzbUrl, title)
    } else {
      return await sendToNzbDav(cfg.nzbdav, nzbUrl, title)
    }
  } catch (err: any) {
    console.error('[Usenet] Failed to send NZB:', err?.message)
    return null
  }
}

async function sendToSabnzbd(config: SabnzbdConfig, nzbUrl: string, title: string): Promise<DownloadStatus> {
  const baseUrl = config.url.endsWith('/') ? config.url.slice(0, -1) : config.url
  const url = `${baseUrl}/api?mode=addurl&name=${encodeURIComponent(nzbUrl)}&apikey=${config.apiKey}&output=json`
  const response = await fetch(url)
  const data = await response.json()

  const id = data?.nzo_ids?.[0] || `sab-${Date.now()}`
  const status: DownloadStatus = {
    id,
    name: title,
    status: 'queued',
    progress: 0,
    size: 0,
    downloaded: 0,
    speed: 0,
    eta: '',
    nzbUrl,
  }
  activeDownloads.set(id, status)
  return status
}

async function sendToNzbget(config: NzbgetConfig, nzbUrl: string, title: string): Promise<DownloadStatus> {
  const baseUrl = config.url.endsWith('/') ? config.url.slice(0, -1) : config.url
  const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64')

  const response = await fetch(`${baseUrl}/jsonrpc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'appendurl',
      params: [title, nzbUrl, 0, false, false],
      id: 1,
    }),
  })
  const data = await response.json()
  const id = `nzbget-${Date.now()}`
  const status: DownloadStatus = {
    id,
    name: title,
    status: data.error ? 'error' : 'queued',
    progress: 0,
    size: 0,
    downloaded: 0,
    speed: 0,
    eta: '',
    nzbUrl,
  }
  activeDownloads.set(id, status)
  return status
}

async function sendToNzbDav(config: NzbDavConfig, nzbUrl: string, title: string): Promise<DownloadStatus> {
  const baseUrl = config.url.endsWith('/') ? config.url.slice(0, -1) : config.url
  const url = `${baseUrl}/api?mode=addurl&name=${encodeURIComponent(nzbUrl)}&apikey=${config.apiKey}&output=json`
  const response = await fetch(url)
  const data = await response.json()

  const id = data?.nzo_ids?.[0] || `nzbdav-${Date.now()}`
  const status: DownloadStatus = {
    id,
    name: title,
    status: 'queued',
    progress: 0,
    size: 0,
    downloaded: 0,
    speed: 0,
    eta: '',
    nzbUrl,
  }
  activeDownloads.set(id, status)
  return status
}

function computeDownloadKey(contentPath: string, apiKey: string): string {
  return createHash('sha256').update(`${contentPath}_${apiKey}`).digest('hex')
}

export async function getDownloadStatus(id: string): Promise<DownloadStatus | null> {
  const cfg = getConfig()
  if (!cfg) return activeDownloads.get(id) || null

  try {
    if (cfg.type === 'sabnzbd') {
      return await getSabnzbdStatus(cfg.sabnzbd, id)
    } else if (cfg.type === 'nzbget') {
      return await getNzbgetStatus(cfg.nzbget, id)
    } else {
      return await getNzbDavStatus(cfg.nzbdav, id)
    }
  } catch {
    return activeDownloads.get(id) || null
  }
}

async function getSabnzbdStatus(config: SabnzbdConfig, id: string): Promise<DownloadStatus | null> {
  const baseUrl = config.url.endsWith('/') ? config.url.slice(0, -1) : config.url
  const response = await fetch(`${baseUrl}/api?mode=queue&apikey=${config.apiKey}&output=json&start=0&limit=50`)
  const data = await response.json()
  const slot = data?.queue?.slots?.find((s: any) => s.nzo_id === id)
  if (!slot) return null

  return {
    id,
    name: slot.filename || slot.title || 'Unknown',
    status: slot.status || 'unknown',
    progress: parseFloat(slot.percentage || '0'),
    size: parseInt(slot.size || '0', 10),
    downloaded: parseInt(slot.mb || '0', 10) * 1048576,
    speed: parseInt(slot.speed || '0', 10),
    eta: slot.timeleft || '',
  }
}

async function getNzbgetStatus(config: NzbgetConfig, id: string): Promise<DownloadStatus | null> {
  // NZBGet doesn't support custom ID, would need to scan the list
  return activeDownloads.get(id) || null
}

async function getNzbDavStatus(config: NzbDavConfig, id: string): Promise<DownloadStatus | null> {
  const baseUrl = config.url.endsWith('/') ? config.url.slice(0, -1) : config.url
  const response = await fetch(`${baseUrl}/api?mode=history&apikey=${config.apiKey}&output=json&start=0&limit=100`)
  const data = await response.json()

  const slot = data?.history?.slots?.find((s: any) => s.nzo_id === id)
  if (!slot) return activeDownloads.get(id) || null

  const completed = slot.status === 'Completed'
  const progress = completed ? 100 : parseFloat(slot.percentage || '0')

  const status: DownloadStatus = {
    id,
    name: slot.name || 'Unknown',
    status: completed ? 'completed' : (slot.status || 'downloading'),
    progress,
    size: parseInt(slot.bytes || '0', 10) || parseInt(slot.size || '0', 10),
    downloaded: completed ? parseInt(slot.bytes || '0', 10) : 0,
    speed: 0,
    eta: '',
  }
  activeDownloads.set(id, status)
  return status
}

export async function getStreamUrl(id: string): Promise<string | null> {
  const cfg = getConfig()
  if (!cfg) return null

  const status = activeDownloads.get(id)
  if (!status || status.progress < 100) return null

  if (cfg.type === 'sabnzbd') {
    // SABnzbd can serve completed files via a direct API download
    // This is best-effort; actual file access may need the completed dir path
    const base = cfg.sabnzbd.url.endsWith('/') ? cfg.sabnzbd.url.slice(0, -1) : cfg.sabnzbd.url
    return `${base}/api?mode=queue&apikey=${cfg.sabnzbd.apiKey}&output=json`
  } else if (cfg.type === 'nzbget') {
    const base = cfg.nzbget.url.endsWith('/') ? cfg.nzbget.url.slice(0, -1) : cfg.nzbget.url
    return `${base}/download/${id}`
  } else {
    return await getNzbDavStreamUrl(cfg.nzbdav, id)
  }
}

async function getNzbDavStreamUrl(config: NzbDavConfig, id: string): Promise<string | null> {
  const baseUrl = config.url.endsWith('/') ? config.url.slice(0, -1) : config.url

  // Get completed download info from history
  const historyRes = await fetch(`${baseUrl}/api?mode=history&apikey=${config.apiKey}&output=json&start=0&limit=100`)
  const historyData = await historyRes.json()
  const slot = historyData?.history?.slots?.find((s: any) => s.nzo_id === id)
  if (!slot || slot.status !== 'Completed') return null

  const category = slot.category || ''
  const name = slot.name || ''
  if (!category || !name) return null

  // Try WebDAV PROPFIND to list files in the content directory
  // The WebDAV path is: /{category}/{name}/
  const webdavPath = `/${encodeURIComponent(category)}/${encodeURIComponent(name)}/`
  const contentBase = new URL(baseUrl).origin

  try {
    const auth = Buffer.from(`${config.webdavUser}:${config.webdavPass}`).toString('base64')
    const propfindRes = await fetch(`${contentBase}${webdavPath}`, {
      method: 'PROPFIND',
      headers: {
        Authorization: `Basic ${auth}`,
        Depth: '1',
      },
    })

    if (propfindRes.ok) {
      const xml = await propfindRes.text()
      const hrefs = extractHrefs(xml)
      const videoExts = ['.mkv', '.mp4', '.avi', '.mov', '.webm', '.m4v', '.ts', '.mts']
      const videoFile = hrefs.find(h => {
        const lower = h.toLowerCase()
        return videoExts.some(ext => lower.endsWith(ext))
      })

      if (videoFile) {
        const cleanPath = videoFile.startsWith('/') ? videoFile.slice(1) : videoFile
        const contentPath = `content/${cleanPath}`
        const downloadKey = computeDownloadKey(contentPath, config.apiKey)
        return `${baseUrl}/view/${contentPath}?downloadKey=${downloadKey}`
      }
    }
  } catch {
    // WebDAV PROPFIND failed, fall through to filename guessing
  }

  // Fallback: try common filename patterns
  const nameClean = name.replace(/[-_.]+$/, '')
  const candidates = ['.mkv', '.mp4', '.avi']
  for (const ext of candidates) {
    const filename = `${nameClean}${ext}`
    const path = `content/${category}/${encodeURIComponent(name)}/${encodeURIComponent(filename)}`
    const downloadKey = computeDownloadKey(path, config.apiKey)
    const url = `${baseUrl}/view/${path}?downloadKey=${downloadKey}`

    // Test if the file exists via HEAD
    try {
      const headRes = await fetch(url, { method: 'HEAD' })
      if (headRes.ok || headRes.status === 206) return url
    } catch {
      continue
    }
  }

  return null
}

function extractHrefs(xml: string): string[] {
  const hrefs: string[] = []
  const regex = /<D:href>(.*?)<\/D:href>|<d:href>(.*?)<\/d:href>|<href>(.*?)<\/href>/gi
  let match
  while ((match = regex.exec(xml)) !== null) {
    const href = match[1] || match[2] || match[3]
    if (href) hrefs.push(decodeURIComponent(href))
  }
  return hrefs
}

export function isConfigured(): boolean {
  const cfg = getConfig()
  if (!cfg) return false
  if (cfg.type === 'sabnzbd') return !!cfg.sabnzbd.url && !!cfg.sabnzbd.apiKey
  if (cfg.type === 'nzbget') return !!cfg.nzbget.url
  return !!cfg.nzbdav.url && !!cfg.nzbdav.apiKey
}

export async function checkConnection(): Promise<{ connected: boolean; error?: string }> {
  const cfg = getConfig()
  if (!cfg) return { connected: false, error: 'Not configured' }

  try {
    if (cfg.type === 'sabnzbd') {
      const baseUrl = cfg.sabnzbd.url.endsWith('/') ? cfg.sabnzbd.url.slice(0, -1) : cfg.sabnzbd.url
      const response = await fetch(`${baseUrl}/api?mode=version&apikey=${cfg.sabnzbd.apiKey}&output=json`)
      const data = await response.json()
      if (data?.version) return { connected: true }
      return { connected: false, error: 'Invalid response' }
    } else if (cfg.type === 'nzbget') {
      const baseUrl = cfg.nzbget.url.endsWith('/') ? cfg.nzbget.url.slice(0, -1) : cfg.nzbget.url
      const auth = Buffer.from(`${cfg.nzbget.username}:${cfg.nzbget.password}`).toString('base64')
      const response = await fetch(`${baseUrl}/jsonrpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'version', params: [], id: 1 }),
      })
      const data = await response.json()
      if (data?.result) return { connected: true }
      return { connected: false, error: 'Invalid response' }
    } else {
      const baseUrl = cfg.nzbdav.url.endsWith('/') ? cfg.nzbdav.url.slice(0, -1) : cfg.nzbdav.url
      const response = await fetch(`${baseUrl}/api?mode=version&apikey=${cfg.nzbdav.apiKey}&output=json`)
      const data = await response.json()
      if (data?.version) return { connected: true }
      return { connected: false, error: 'Invalid response' }
    }
  } catch (err: any) {
    return { connected: false, error: err?.message || 'Connection failed' }
  }
}
