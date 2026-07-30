import * as CacheService from './cache.service'
import {
  sendNzb as downloaderSendNzb,
  getDownloadStatus as downloaderGetStatus,
  getStreamUrl as downloaderGetStreamUrl,
  listDownloads as downloaderListDownloads,
  removeDownload as downloaderRemoveDownload,
  checkConnection as downloaderCheckConnection,
  searchDownloadCache,
  loadConfig as downloaderLoadConfig,
  clearAllDownloads as downloaderClearAll,
  deleteUsenetByPath as downloaderDeleteByPath,
} from './usenet-downloader.service'

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
  error?: string
  nzbId?: number
}

const ACTIVE_DOWNLOADS = new Map<string, DownloadStatus>()

export function loadConfig(): void {
  downloaderLoadConfig()
}

export async function sendNzb(nzbUrl: string, title: string, sizeBytes?: number): Promise<DownloadStatus | null> {
  const result = await downloaderSendNzb(nzbUrl, title, sizeBytes)
  if (!result) return null

  const status: DownloadStatus = {
    id: result.id,
    name: result.name,
    status: result.status,
    progress: result.progress,
    size: 0,
    downloaded: 0,
    speed: 0,
    eta: '',
    nzbUrl: result.nzbUrl,
  }
  ACTIVE_DOWNLOADS.set(result.id, status)

  pollDownloadStatus(result.id).catch(() => {})
  return status
}

async function pollDownloadStatus(id: string): Promise<void> {
  while (true) {
    const status = await downloaderGetStatus(id)
    if (!status) {
      ACTIVE_DOWNLOADS.delete(id)
      return
    }

    ACTIVE_DOWNLOADS.set(id, status)

    if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
      return
    }

    await new Promise(r => setTimeout(r, 2000))
  }
}

export async function getDownloadStatus(id: string): Promise<DownloadStatus | null> {
  return ACTIVE_DOWNLOADS.get(id) || (await downloaderGetStatus(id)) || null
}

export async function getStreamUrl(id: string): Promise<string | null> {
  return downloaderGetStreamUrl(id)
}

export async function listDownloads(): Promise<any[]> {
  return downloaderListDownloads()
}

export async function removeDownload(id: string): Promise<boolean> {
  ACTIVE_DOWNLOADS.delete(id)
  try {
    return await downloaderRemoveDownload(id)
  } catch (err: any) {
    console.error(`[Usenet] Failed to remove download ${id}:`, err?.message)
    throw err
  }
}

export async function checkConnection(): Promise<{ connected: boolean; error?: string }> {
  return downloaderCheckConnection()
}

export async function deleteUsenetByPath(filePath: string): Promise<boolean> {
  return downloaderDeleteByPath(filePath)
}

export async function searchWebdavCache(
  query: string,
  opts?: { title?: string; year?: number; type?: 'movie' | 'tv'; season?: number; episode?: number },
): Promise<any[]> {
  return searchDownloadCache(query, opts)
}

export function isConfigured(): boolean {
  const host = CacheService.getSetting<string>('nzbgetHost') || ''
  return !!host
}

export async function clearAll(): Promise<void> {
  return downloaderClearAll()
}
