import * as WebTorrentService from './webtorrent.service'

interface PreloadRequest {
  magnetUri: string
  infoHash: string
  fileIndex: number
}

const preloadQueue: Map<string, PreloadRequest> = new Map()

export function queuePreload(magnetUri: string, infoHash: string, fileIndex: number = 0) {
  if (preloadQueue.has(infoHash)) return
  preloadQueue.set(infoHash, { magnetUri, infoHash, fileIndex })
  startPreload(infoHash)
}

async function startPreload(infoHash: string) {
  const request = preloadQueue.get(infoHash)
  if (!request) return

  try {
    const torrent = await WebTorrentService.addTorrent(request.magnetUri, {
      path: '/tmp/fynix-precache',
    })

    torrent.on('done', () => {
      preloadQueue.delete(infoHash)
    })
  } catch (err) {
    console.error('Preload failed:', err)
    preloadQueue.delete(infoHash)
  }
}

export function cancelPreload(infoHash: string) {
  if (preloadQueue.has(infoHash)) {
    WebTorrentService.removeTorrent(infoHash)
    preloadQueue.delete(infoHash)
  }
}

export async function getPreloadStatus(infoHash: string) {
  const torrent = await WebTorrentService.getTorrent(infoHash)
  if (!torrent) return null
  return {
    progress: torrent.progress,
    downloaded: torrent.downloaded,
    total: torrent.length,
    timeRemaining: torrent.timeRemaining,
  }
}
