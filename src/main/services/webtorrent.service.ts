import type WebTorrent from 'webtorrent'

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
  client = new WebTorrentClass()
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

export async function addTorrent(magnetUri: string, options?: any) {
  if (!client) throw new Error('WebTorrent not initialized')
  debug(`Adding torrent: ${magnetUri.slice(0, 80)}...`)
  const start = Date.now()

  const torrent = await client.add(magnetUri, options)
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

  // Force critical for first pieces and request sequential download
  try {
    if (torrent.pieceLength && torrent.pieces && typeof (torrent as any).critical === 'function') {
      const fileLen = torrent.files?.[0]?.length || torrent.length
      const lastPiece = Math.ceil(fileLen / torrent.pieceLength)
      ;(torrent as any).critical(0, Math.min(lastPiece, 5))
      torrent.select(0, Math.min(lastPiece, 50), 0)
      debug(`Critical pieces 0-${Math.min(lastPiece, 5)}, selected 0-${Math.min(lastPiece, 50)}`)
    }
  } catch (e) { /* best-effort */ }

  const key = torrent.infoHash.toLowerCase()
  torrentMap.set(key, torrent)

  return torrent
}

export function removeTorrent(infoHash: string) {
  const key = infoHash.toLowerCase()
  const torrent = torrentMap.get(key)
  if (torrent) {
    debug(`Destroying torrent: ${infoHash}`)
    torrent.destroy()
    torrentMap.delete(key)
  }
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
