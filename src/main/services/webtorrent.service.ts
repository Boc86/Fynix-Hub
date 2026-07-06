import WebTorrentType from 'webtorrent'
import * as path from 'path'
import { app } from 'electron'
import * as LocalCacheService from './local-cache.service'

const CACHE_DIR = path.join(app.getPath('userData'), 'torrent-cache')

const torrentMap = new Map<string, any>()

let WebTorrent: typeof WebTorrentType
let client: InstanceType<typeof WebTorrentType> | null = null

async function getClient(): Promise<InstanceType<typeof WebTorrentType>> {
  if (client) return client
  WebTorrent = (await import('webtorrent')).default
  client = new WebTorrent({ utp: false })
  return client
}

function debug(...args: any[]) {
  console.log('[WebTorrent]', ...args)
}

function debugError(...args: any[]) {
  console.error('[WebTorrent]', ...args)
}

function createReadStream(
  infoHash: string,
  fileIndex: number,
  range?: { start: number; end?: number },
): LocalCacheService.TorrentStreamInfo | null {
  const torrent = torrentMap.get(infoHash)
  if (!torrent || !torrent.files[fileIndex]) return null
  const file = torrent.files[fileIndex]
  const opts: any = {}
  if (range) {
    opts.start = range.start
    if (range.end !== undefined) opts.end = range.end
  }
  const stream = file.createReadStream(opts)
  return { stream, size: file.length, name: file.name }
}

export async function init(): Promise<void> {
  debug('Initialized (WebTorrent v3)')
  LocalCacheService.setTorrentStreamFactory(createReadStream)
}

export async function prefetchMetadata(infoHash: string, magnetUri: string): Promise<void> {
  debug(`prefetchMetadata: ${infoHash}`)
}

export async function prefetchBatch(results: { infoHash: string; magnetUri: string }[], limit = 15): Promise<void> {
  debug(`prefetchBatch: ${results.length} results, limit ${limit}`)
}

export async function addTorrent(magnetUri: string, options?: any): Promise<any> {
  debug(`Adding torrent: ${magnetUri.slice(0, 80)}...`)
  const c = await getClient()
  const infoHash = (magnetUri.match(/xt=urn:btih:([a-fA-F0-9]+)/) || [])[1]?.toLowerCase()

  return new Promise((resolve, reject) => {
    const torrent = c.add(magnetUri, {
      path: CACHE_DIR,
      ...options,
    })

    torrent.on('error', (err) => {
      debugError(`Torrent error: ${err.message}`)
      reject(err)
    })

    torrent.on('metadata', () => {
      debug(`Got metadata for ${torrent.infoHash} (${torrent.files.length} files)`)
      torrentMap.set(torrent.infoHash, torrent)
      resolve({
        infoHash: torrent.infoHash,
        get progress() { return torrent.progress },
        get numPeers() { return torrent.numPeers },
        get downloadSpeed() { return torrent.downloadSpeed },
        get files() { return torrent.files },
        ready: true,
        destroy: () => removeTorrent(torrent.infoHash),
      })
    })

    torrent.on('ready', () => {
      debug(`Torrent ready: ${torrent.infoHash}`)
    })

    // Timeout after 60 seconds
    setTimeout(() => {
      if (infoHash && !torrentMap.has(infoHash)) {
        reject(new Error('Torrent add timeout after 60s'))
      }
    }, 60000)
  })
}

export async function removeTorrent(infoHash: string) {
  const c = await getClient()
  const torrent = torrentMap.get(infoHash) || c.get(infoHash)
  if (torrent) {
    c.remove(infoHash)
    torrentMap.delete(infoHash)
    debug(`Removed torrent ${infoHash}`)
  }
}

export async function removeAllTorrents() {
  const c = await getClient()
  c.torrents.forEach(t => c.remove(t.infoHash))
  torrentMap.clear()
  debug('All torrents removed')
}

export async function getTorrent(infoHash: string) {
  const c = await getClient()
  const torrent = torrentMap.get(infoHash) || c.get(infoHash)
  if (!torrent) return null
  return {
    infoHash: torrent.infoHash,
    get progress() { return torrent.progress },
    get numPeers() { return torrent.numPeers },
    get downloadSpeed() { return torrent.downloadSpeed },
    get files() { return torrent.files },
    ready: torrent.ready,
    destroy: () => removeTorrent(torrent.infoHash),
  }
}

export async function getStreamUrl(infoHash: string, fileIndex?: number) {
  const c = await getClient()

  let torrent = torrentMap.get(infoHash) || c.get(infoHash)
  if (!torrent) {
    throw new Error(`Torrent ${infoHash} not found`)
  }

  // Wait for torrent to be ready (up to 30s)
  let attempts = 0
  while (!torrent.ready && attempts < 30) {
    await new Promise(r => setTimeout(r, 1000))
    torrent = torrentMap.get(infoHash) || c.get(infoHash)
    attempts++
  }

  if (!torrent.ready) {
    throw new Error(`Torrent ${infoHash} did not become ready after 30s`)
  }

  const index = fileIndex ?? 0
  const file = torrent.files[index]
  if (!file) {
    throw new Error(`File index ${index} not found in torrent ${infoHash}`)
  }

  const streamUrl = `http://127.0.0.1:${LocalCacheService.getPort()}/webtorrent/${infoHash}/${index}`
  return { url: streamUrl }
}

export function prioritizeResume(infoHash: string, resumePositionSec: number, estimatedDurationSec: number) {
  debug(`Prioritizing resume for ${infoHash} at ${resumePositionSec}s`)
}

export async function destroy() {
  const c = await getClient()
  c.destroy()
  debug('Destroyed')
}
