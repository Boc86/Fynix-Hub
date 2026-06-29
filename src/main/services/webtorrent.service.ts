import type WebTorrent from 'webtorrent'
import * as LocalCacheService from './local-cache.service'

let client: WebTorrent | null = null
let WebTorrentClass: typeof WebTorrent | null = null
let serverPort = 0
let serverRef: any = null

const torrentMap = new Map<string, any>()

function debug(...args: any[]) {
  console.log('[WebTorrent]', ...args)
}

function debugError(...args: any[]) {
  console.error('[WebTorrent]', ...args)
}

export async function init(): Promise<void> {
  if (client) return
  if (!WebTorrentClass) {
    WebTorrentClass = (await import('webtorrent')).default
  }
  client = new WebTorrentClass({
    maxConns: 55,
    utp: true,
    downloadLimit: -1,
    uploadLimit: -1,
  })
  debug('Client initialized')

  serverRef = client.createServer()
  serverRef.listen(0, '127.0.0.1', () => {
    const addr = serverRef.address()
    if (addr && typeof addr === 'object') {
      serverPort = addr.port
      debug(`HTTP server listening on port ${serverPort}`)
    }
  })
}

function parseInfoHash(magnetUri: string): string | null {
  const match = magnetUri.match(/urn:btih:([a-fA-F0-9]{40})/)
  return match ? match[1].toLowerCase() : null
}

export async function addTorrent(magnetUri: string, options?: any) {
  if (!client) throw new Error('WebTorrent not initialized')
  debug(`Adding torrent: ${magnetUri.slice(0, 80)}...`)
  const start = Date.now()

  const infoHash = parseInfoHash(magnetUri)

  for (let attempt = 0; attempt < 2; attempt++) {
    if (infoHash) {
      const mapped = torrentMap.get(infoHash.toLowerCase())
      if (mapped) {
        debug(`Torrent already exists in map, returning existing: ${infoHash}`)
        return mapped
      }
    }

    try {
      const torrent = await client.add(magnetUri, {
        ...options,
        path: LocalCacheService.getCacheDir(),
      })
      debug(`Torrent added in ${Date.now() - start}ms, infoHash: ${torrent.infoHash}`)

      if (!torrent.ready && (!torrent.files || torrent.files.length === 0)) {
        debug(`Waiting for torrent ready event...`)
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Torrent ready timeout (30s)')), 30000)
          torrent.once('ready', () => {
            clearTimeout(timeout)
            debug(`Torrent ready, files: ${torrent.files?.length || 0}`)
            resolve()
          })
          torrent.once('error', (err: Error) => {
            clearTimeout(timeout)
            debugError(`Torrent error: ${err.message}`)
            reject(err)
          })
        })
      }

      if (torrent.files) {
        debug(`Torrent has ${torrent.files.length} files:`)
        for (const f of torrent.files) {
          debug(`  - ${f.name} (${(f.length / 1048576).toFixed(1)} MB)`)
        }
      } else {
        debugError(`Torrent has no files after ready!`)
      }

      // Prioritize initial pieces for fast playback start (smaller buffer = faster start)
      try {
        if (torrent.pieceLength && torrent.pieces && typeof (torrent as any).critical === 'function') {
          const fileLen = torrent.files?.[0]?.length || torrent.length
          const lastPiece = Math.ceil(fileLen / torrent.pieceLength)
          ;(torrent as any).critical(0, Math.min(lastPiece, 10))
          torrent.select(0, Math.min(lastPiece, 25), 0)
          debug(`Critical pieces 0-${Math.min(lastPiece, 10)}, selected 0-${Math.min(lastPiece, 25)}`)
        }
      } catch (e) { /* best-effort */ }

      const key = torrent.infoHash.toLowerCase()
      torrentMap.set(key, torrent)

      return torrent
    } catch (err: any) {
      if (attempt === 0 && infoHash && err.message?.includes('duplicate')) {
        debug(`Duplicate torrent, force-removing stale entry: ${infoHash}`)
        forceRemoveFromClient(infoHash)
        continue
      }
      throw err
    }
  }

  throw new Error(`Failed to add torrent after retry: ${magnetUri.slice(0, 60)}`)
}

async function forceRemoveFromClient(infoHash: string) {
  const key = infoHash.toLowerCase()
  torrentMap.delete(key)
  if (!client) return
  try {
    const existing = await client.get(infoHash)
    if (existing) {
      existing.destroy()
    }
  } catch {}
  // Direct removal from client's internal array as insurance
  if (Array.isArray((client as any).torrents)) {
    ;(client as any).torrents = (client as any).torrents.filter(
      (t: any) => t.infoHash?.toLowerCase() !== key
    )
  }
}

export async function removeTorrent(infoHash: string) {
  await forceRemoveFromClient(infoHash)
}

export function removeAllTorrents() {
  const keys = Array.from(torrentMap.keys())
  for (const key of keys) {
    forceRemoveFromClient(key).catch(() => {})
  }
}

export function prioritizeResume(infoHash: string, resumePositionSec: number, estimatedDurationSec: number) {
  const key = infoHash.toLowerCase()
  const torrent = torrentMap.get(key)
  if (!torrent || !torrent.files) return

  // Prioritize pieces around the resume position so mpv can seek there without waiting
  const found = findVideoFile(torrent)
  if (!found) return

  const file = found.file
  const ratio = estimatedDurationSec > 0 ? Math.min(Math.max(resumePositionSec / estimatedDurationSec, 0), 1) : 0
  const targetByte = Math.floor(ratio * file.length)

  // Select a window around the target: ~4MB before, ~4MB after
  const windowBytes = 4 * 1024 * 1024
  const startByte = Math.max(0, targetByte - windowBytes)
  const endByte = Math.min(file.length, targetByte + windowBytes)

  debug(`Prioritizing bytes ${startByte}-${endByte} for resume position ${resumePositionSec}s (ratio=${ratio.toFixed(3)})`)
  file.select(startByte, endByte, 1)
}

export async function getTorrent(infoHash: string) {
  const key = infoHash.toLowerCase()
  return torrentMap.get(key) || undefined
}

function findVideoFile(torrent: any): { file: any; index: number } | null {
  if (!torrent.files) return null
  const videoExts = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.flv', '.wmv'])

  for (let i = 0; i < torrent.files.length; i++) {
    const name = torrent.files[i].name || ''
    const ext = '.' + name.split('.').pop()?.toLowerCase()
    if (videoExts.has(ext)) {
      debug(`Selected video file #${i}: ${name}`)
      return { file: torrent.files[i], index: i }
    }
  }

  let largest = torrent.files[0]
  let largestIdx = 0
  for (let i = 1; i < torrent.files.length; i++) {
    if (torrent.files[i].length > largest.length) {
      largest = torrent.files[i]
      largestIdx = i
    }
  }
  debug(`No video extension found, falling back to largest file #${largestIdx}: ${largest?.name}`)
  return largest ? { file: largest, index: largestIdx } : null
}

export async function getStreamUrl(infoHash: string, _fileIndex?: number) {
  if (!serverPort) throw new Error('HTTP server not ready')
  debug(`getStreamUrl called for ${infoHash}`)

  const key = infoHash.toLowerCase()
  const torrent = torrentMap.get(key)
  if (!torrent) throw new Error(`Torrent not found: ${infoHash}`)
  debug(`Torrent found, progress: ${(torrent.progress * 100).toFixed(1)}%, peers: ${torrent.numPeers}`)

  if (!torrent.files || torrent.files.length === 0) throw new Error('No files in torrent')

  const found = findVideoFile(torrent)
  if (!found) throw new Error('No video file found in torrent')

  found.file.select()

  // Use file.streamURL from WebTorrent for correct path encoding
  let filePath: string
  try {
    filePath = found.file.streamURL
    debug(`file.streamURL: ${filePath}`)
  } catch {
    // Fallback: construct manually if streamURL fails
    filePath = `/webtorrent/${key}/${encodeURIComponent(found.file.path).replace(/%2F/g, '/')}`
    debug(`Manual streamURL fallback: ${filePath}`)
  }

  const url = `http://localhost:${serverPort}${filePath}`
  debug(`streamURL: ${url}`)
  return { url }
}

export function destroy() {
  if (serverRef) {
    try { serverRef.close() } catch {}
    serverRef = null
  }
  if (client) {
    debug('Destroying client')
    client.destroy()
    client = null
  }
  torrentMap.clear()
}
