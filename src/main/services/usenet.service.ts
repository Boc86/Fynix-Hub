import * as fs from 'fs'
import * as pathMod from 'path'
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

async function sendToSabnzbd(config: SabnzbdConfig, nzbUrl: string, title: string): Promise<DownloadStatus | null> {
  if (!nzbUrl || !nzbUrl.startsWith('http')) {
    console.error('[Usenet] SABnzbd: invalid NZB URL', nzbUrl?.slice(0, 80))
    return null
  }
  const baseUrl = config.url.endsWith('/') ? config.url.slice(0, -1) : config.url
  const addUrl = `${baseUrl}/api?mode=addurl&name=${encodeURIComponent(nzbUrl)}&apikey=${config.apiKey}&output=json`
  console.log('[Usenet] SABnzbd: sending NZB URL (len=%d)', nzbUrl.length)
  const response = await fetch(addUrl)
  const data = await response.json()

  if (data?.status === false) {
    console.error('[Usenet] SABnzbd: addurl rejected:', data?.error || 'unknown error')
    return null
  }

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
  console.log('[Usenet] SABnzbd: download queued, id=%s, nzo_ids=%s', id, JSON.stringify(data?.nzo_ids))
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

  // First check the active queue
  const queueRes = await fetch(`${baseUrl}/api?mode=queue&apikey=${config.apiKey}&output=json&start=0&limit=50`)
  const queueData = await queueRes.json()
  const queueSlot = queueData?.queue?.slots?.find((s: any) => s.nzo_id === id)
  if (queueSlot) {
    return {
      id,
      name: queueSlot.filename || queueSlot.title || 'Unknown',
      status: queueSlot.status || 'unknown',
      progress: parseFloat(queueSlot.percentage || '0'),
      size: parseInt(queueSlot.size || '0', 10),
      downloaded: parseInt(queueSlot.mb || '0', 10) * 1048576,
      speed: parseInt(queueSlot.speed || '0', 10),
      eta: queueSlot.timeleft || '',
    }
  }

  // Not in queue — check history (completed)
  const histRes = await fetch(`${baseUrl}/api?mode=history&apikey=${config.apiKey}&output=json&start=0&limit=100`)
  const histData = await histRes.json()
  const histSlot = histData?.history?.slots?.find((s: any) => s.nzo_id === id)
  if (histSlot && histSlot.status === 'Completed') {
    const status: DownloadStatus = {
      id,
      name: histSlot.name || 'Unknown',
      status: 'completed',
      progress: 100,
      size: parseInt(histSlot.bytes || '0', 10) || parseInt(histSlot.size || '0', 10),
      downloaded: parseInt(histSlot.bytes || '0', 10) || parseInt(histSlot.size || '0', 10),
      speed: 0,
      eta: '',
    }
    activeDownloads.set(id, status)
    return status
  }

  return null
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

  console.log('[Usenet] getStreamUrl called for id=%s, type=%s', id, cfg.type)
  const status = activeDownloads.get(id)
  if (!status || status.progress < 100) return null

  if (cfg.type === 'sabnzbd') {
    const base = cfg.sabnzbd.url.endsWith('/') ? cfg.sabnzbd.url.slice(0, -1) : cfg.sabnzbd.url
    // Get completed download path from history
    const histRes = await fetch(`${base}/api?mode=history&apikey=${cfg.sabnzbd.apiKey}&output=json&start=0&limit=100`)
    const histData = await histRes.json()
    const slot = histData?.history?.slots?.find((s: any) => s.nzo_id === id)
    if (!slot || slot.status !== 'Completed') {
      console.log('[Usenet] getStreamUrl: history slot not found for %s', id)
      return null
    }
    const downloadPath: string = slot.storage || slot.path || ''
    if (!downloadPath) {
      console.log('[Usenet] getStreamUrl: no storage/path for %s', id)
      return null
    }

    // Try local filesystem first (SABnzbd on same machine)
    try {
      if (fs.existsSync(downloadPath)) {
        const entries = fs.readdirSync(downloadPath)
        const videoExts = ['.mkv', '.mp4', '.avi', '.mov', '.webm', '.m4v', '.ts', '.mts']
        const videoFile = entries.find(e => videoExts.some(ext => e.toLowerCase().endsWith(ext)))
        if (videoFile) {
          const fullPath = pathMod.join(downloadPath, videoFile)
          console.log('[Usenet] getStreamUrl: local file %s', fullPath)
          return `file://${fullPath}`
        }
      }
    } catch { /* not local — fall through to API */ }

    // Remote SABnzbd: list files via history API
    try {
      const listRes = await fetch(`${base}/api?mode=history&name=list&nzo_id=${slot.nzo_id}&apikey=${cfg.sabnzbd.apiKey}&output=json`)
      const listData = await listRes.json()
      const files: any[] = listData?.files || []
      const videoExts = ['.mkv', '.mp4', '.avi', '.mov', '.webm', '.m4v', '.ts', '.mts']
      const videoFile = files.find((f: any) => videoExts.some(ext => f.filename?.toLowerCase().endsWith(ext)))
      if (videoFile) {
        const fullPath = pathMod.join(downloadPath, videoFile.filename)
        console.log('[Usenet] getStreamUrl: remote file %s', fullPath)
        return `${base}/api?mode=download_file&filename=${encodeURIComponent(fullPath)}&apikey=${cfg.sabnzbd.apiKey}`
      }
    } catch { /* file listing failed */ }

    // If NzbDav WebDAV config is available, try WebDAV as fallback
    if (cfg.nzbdav?.url && cfg.nzbdav?.webdavUser && cfg.nzbdav?.webdavPass) {
      console.log('[Usenet] getStreamUrl: falling back to NzbDav WebDAV')
      const davUrl = await getNzbDavStreamUrl(cfg.nzbdav, id)
      if (davUrl) console.log('[Usenet] getStreamUrl: NzbDav WebDAV returned %s', davUrl.slice(0, 80))
      return davUrl
    }

    console.log('[Usenet] getStreamUrl: all attempts failed for %s', id)
    return null
  } else if (cfg.type === 'nzbget') {
    const base = cfg.nzbget.url.endsWith('/') ? cfg.nzbget.url.slice(0, -1) : cfg.nzbget.url
    return `${base}/download/${id}`
  } else {
    return await getNzbDavStreamUrl(cfg.nzbdav, id)
  }
}

async function getNzbDavStreamUrl(config: NzbDavConfig, id: string): Promise<string | null> {
  const baseUrl = config.url.endsWith('/') ? config.url.slice(0, -1) : config.url
  console.log('[Usenet] getNzbDavStreamUrl: baseUrl=%s, id=%s', baseUrl, id)

  // Get completed download info from history
  const historyRes = await fetch(`${baseUrl}/api?mode=history&apikey=${config.apiKey}&output=json&start=0&limit=100`)
  const historyData = await historyRes.json()
  const slots = historyData?.history?.slots || []
  console.log('[Usenet] getNzbDavStreamUrl: history has %d slots', slots.length)

  const slot = slots.find((s: any) => s.nzo_id === id)
  if (!slot) {
    console.log('[Usenet] getNzbDavStreamUrl: slot with nzo_id=%s NOT FOUND in history', id)
    console.log('[Usenet] getNzbDavStreamUrl: available nzo_ids: %s', slots.map((s: any) => s.nzo_id).slice(0, 10).join(', '))
    return null
  }
  console.log('[Usenet] getNzbDavStreamUrl: found slot, status=%s, category=%s, name=%s', slot.status, slot.category, slot.name)

  if (slot.status !== 'Completed') {
    console.log('[Usenet] getNzbDavStreamUrl: slot status is %s, not Completed', slot.status)
    return null
  }

  const category = slot.category || ''
  const name = slot.name || ''
  if (!category || !name) {
    console.log('[Usenet] getNzbDavStreamUrl: missing category or name, category=%s, name=%s', category, name)
    return null
  }

  // Use WebDAV PROPFIND at /content/{category}/{name}/ to discover actual files
  const host = new URL(baseUrl).host
  const protocol = new URL(baseUrl).protocol
  const authHeader = Buffer.from(`${config.webdavUser}:${config.webdavPass}`).toString('base64')
  const videoExts = ['.mkv', '.mp4', '.avi', '.mov', '.webm', '.m4v', '.ts', '.mts']

  const encCategory = encodeURIComponent(category)
  const encName = encodeURIComponent(name)
  const contentBase = new URL(baseUrl).origin

  // Try PROPFIND at /content/{category}/{name}/
  for (const webdavPath of [`/content/${encCategory}/${encName}/`, `/content/${encCategory}/`]) {
    try {
      const propRes = await fetch(`${contentBase}${webdavPath}`, {
        method: 'PROPFIND',
        headers: { Authorization: `Basic ${authHeader}`, Depth: '1' },
      })
      if (!propRes.ok) {
        console.log('[Usenet] getNzbDavStreamUrl: PROPFIND %s = %d', webdavPath, propRes.status)
        continue
      }
      const xml = await propRes.text()
      const hrefs = extractRawHrefs(xml)
      const videoFile = hrefs.find(h => {
        // Decode only the filename part for comparison
        const segments = h.split('/')
        const lastSegment = decodeURIComponent(segments[segments.length - 1] || '')
        return videoExts.some(ext => lastSegment.toLowerCase().endsWith(ext))
      })
      if (videoFile) {
        console.log('[Usenet] getNzbDavStreamUrl: found video file via PROPFIND: %s', videoFile)
        const videoPath = videoFile.startsWith('http') ? new URL(videoFile).pathname : videoFile
        const streamUrl = `${protocol}//${encodeURIComponent(config.webdavUser)}:${encodeURIComponent(config.webdavPass)}@${host}${videoPath}`
        console.log('[Usenet] getNzbDavStreamUrl: WebDAV URL: %s', streamUrl.slice(0, 100))
        return streamUrl
      }
    } catch (e) {
      console.log('[Usenet] getNzbDavStreamUrl: PROPFIND %s error: %s', webdavPath, e)
    }
  }

  // Fallback: try HEAD on guessed filenames via /content/
  console.log('[Usenet] getNzbDavStreamUrl: trying HEAD fallback via /content/...')
  const nameClean = name.replace(/[-_.]+$/, '')
  for (const ext of videoExts) {
    const filename = `${nameClean}${ext}`
    const url = `${protocol}//${encodeURIComponent(config.webdavUser)}:${encodeURIComponent(config.webdavPass)}@${host}/content/${encCategory}/${encName}/${encodeURIComponent(filename)}`
    try {
      const headRes = await fetch(url, { method: 'HEAD' })
      console.log('[Usenet] getNzbDavStreamUrl: HEAD %s = %d', url.slice(0, 120), headRes.status)
      if (headRes.ok || headRes.status === 206) {
        console.log('[Usenet] getNzbDavStreamUrl: found via HEAD /content/')
        return url
      }
    } catch {
      continue
    }
  }

  console.log('[Usenet] getNzbDavStreamUrl: all fallbacks failed')
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

function extractRawHrefs(xml: string): string[] {
  const hrefs: string[] = []
  const regex = /<D:href>(.*?)<\/D:href>|<d:href>(.*?)<\/d:href>|<href>(.*?)<\/href>/gi
  let match
  while ((match = regex.exec(xml)) !== null) {
    const href = match[1] || match[2] || match[3]
    if (href) hrefs.push(href)
  }
  return hrefs
}

export interface CompletedDownload {
  id: string
  name: string
  category: string
  status: string
  storage: string
  size: number
  completedAt: string
}

export async function listDownloads(): Promise<CompletedDownload[]> {
  const cfg = getConfig()
  if (!cfg) return []

  try {
    if (cfg.type === 'sabnzbd') {
      const base = cfg.sabnzbd.url.endsWith('/') ? cfg.sabnzbd.url.slice(0, -1) : cfg.sabnzbd.url
      const res = await fetch(`${base}/api?mode=history&apikey=${cfg.sabnzbd.apiKey}&output=json&start=0&limit=200`)
      const data = await res.json()
      return (data?.history?.slots || []).map((s: any) => ({
        id: s.nzo_id,
        name: s.name || '',
        category: s.category || '',
        status: s.status || '',
        storage: s.storage || '',
        size: parseInt(s.bytes || s.size || '0', 10),
        completedAt: s.completed || '',
      }))
    } else if (cfg.type === 'nzbget') {
      // NZBGet not fully implemented for listing
      return []
    } else {
      const base = cfg.nzbdav.url.endsWith('/') ? cfg.nzbdav.url.slice(0, -1) : cfg.nzbdav.url
      const res = await fetch(`${base}/api?mode=history&apikey=${cfg.nzbdav.apiKey}&output=json&start=0&limit=200`)
      const data = await res.json()
      return (data?.history?.slots || []).map((s: any) => ({
        id: s.nzo_id,
        name: s.name || '',
        category: s.category || '',
        status: s.status || '',
        storage: s.storage || '',
        size: parseInt(s.bytes || s.size || '0', 10),
        completedAt: s.completed || '',
      }))
    }
  } catch {
    return []
  }
}

export async function removeDownload(id: string): Promise<boolean> {
  const cfg = getConfig()
  if (!cfg) return false

  try {
    if (cfg.type === 'sabnzbd' || cfg.type === 'nzbdav') {
      const base = cfg.type === 'sabnzbd'
        ? cfg.sabnzbd.url.endsWith('/') ? cfg.sabnzbd.url.slice(0, -1) : cfg.sabnzbd.url
        : cfg.nzbdav.url.endsWith('/') ? cfg.nzbdav.url.slice(0, -1) : cfg.nzbdav.url
      const apiKey = cfg.type === 'sabnzbd' ? cfg.sabnzbd.apiKey : cfg.nzbdav.apiKey
      const res = await fetch(`${base}/api?mode=history&name=delete&nzo_id=${id}&apikey=${apiKey}&output=json`)
      const data = await res.json()
      return data?.status !== false
    } else if (cfg.type === 'nzbget') {
      return false
    }
    return false
  } catch {
    return false
  }
}

export async function searchWebdavCache(query: string): Promise<any[]> {
  const cfg = getConfig()
  if (!cfg || cfg.type !== 'nzbdav') return []

  const nzbdav = cfg.nzbdav
  if (!nzbdav?.url || !nzbdav?.webdavUser || !nzbdav?.webdavPass) return []

  const baseUrl = nzbdav.url.endsWith('/') ? nzbdav.url.slice(0, -1) : nzbdav.url
  const host = new URL(baseUrl).host
  const protocol = new URL(baseUrl).protocol
  const results: any[] = []
  const authHeader = Buffer.from(`${nzbdav.webdavUser}:${nzbdav.webdavPass}`).toString('base64')
  const videoExts = ['.mkv', '.mp4', '.avi', '.mov', '.webm', '.m4v', '.ts', '.mts']

  try {
    // Get completed downloads from history
    const histRes = await fetch(`${baseUrl}/api?mode=history&apikey=${nzbdav.apiKey}&output=json&start=0&limit=100`)
    const histData = await histRes.json()
    const slots: any[] = histData?.history?.slots || []

    for (const slot of slots) {
      if (slot.status !== 'Completed') continue
      const name: string = slot.name || ''
      const category: string = slot.category || ''
      if (!name || !category) continue

      // Check if name matches query
      const queryLower = query.toLowerCase()
      const nameLower = name.toLowerCase()
      if (!nameLower.includes(queryLower)) continue

      // Try WebDAV PROPFIND at /content/{category}/{name}/ to discover actual files
      const encCategory = encodeURIComponent(category)
      const encName = encodeURIComponent(name)
      const contentBase = new URL(baseUrl).origin

      for (const webdavPath of [`/content/${encCategory}/${encName}/`, `/content/${encCategory}/`]) {
        try {
          const propRes = await fetch(`${contentBase}${webdavPath}`, {
            method: 'PROPFIND',
            headers: { Authorization: `Basic ${authHeader}`, Depth: '1' },
          })
          if (!propRes.ok) continue
          const xml = await propRes.text()
          const hrefs = extractRawHrefs(xml)
          const videoFile = hrefs.find(h => {
            const segments = h.split('/')
            const lastSegment = decodeURIComponent(segments[segments.length - 1] || '')
            return videoExts.some(ext => lastSegment.toLowerCase().endsWith(ext))
          })
          if (!videoFile) continue

          const videoPath = videoFile.startsWith('http') ? new URL(videoFile).pathname : videoFile
          const streamUrl = `${protocol}//${encodeURIComponent(nzbdav.webdavUser)}:${encodeURIComponent(nzbdav.webdavPass)}@${host}${videoPath}`
          const size = parseInt(slot.bytes || slot.size || '0', 10)
          results.push({ name, streamUrl, size, nzoId: slot.nzo_id })
          break // found this slot, move to next
        } catch {
          continue
        }
      }
    }
  } catch {
    // WebDAV search failed silently
  }

  return results
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
