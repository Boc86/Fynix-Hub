import { app } from 'electron'
import * as http from 'http'
import * as path from 'path'
import * as fs from 'fs'
import * as fsp from 'fs/promises'

let server: http.Server | null = null
let serverPort = 0
const CACHE_DIR = path.join(app.getPath('userData'), 'torrent-cache')

function debug(...args: any[]) {
  console.log('[LocalCache]', ...args)
}

export function getCacheDir(): string {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
  }
  return CACHE_DIR
}

export function getCachedFilePath(infoHash: string, fileName?: string): string | null {
  const dir = path.join(CACHE_DIR, infoHash.toLowerCase())
  if (!fs.existsSync(dir)) return null
  if (fileName) {
    const fp = path.join(dir, fileName)
    return fs.existsSync(fp) ? fp : null
  }
  const entries = fs.readdirSync(dir)
  if (entries.length === 0) return null
  // Return the largest file (likely the video)
  let largest = ''
  let largestSize = 0
  for (const e of entries) {
    const fp = path.join(dir, e)
    try {
      const stat = fs.statSync(fp)
      if (stat.isFile() && stat.size > largestSize) {
        largest = e
        largestSize = stat.size
      }
    } catch {}
  }
  return largest ? path.join(dir, largest) : path.join(dir, entries[0])
}

export async function isCached(infoHash: string): Promise<boolean> {
  const infoDir = path.join(CACHE_DIR, infoHash.toLowerCase())
  try {
    await fsp.access(infoDir, fs.constants.R_OK)
    const entries = await fsp.readdir(infoDir)
    return entries.length > 0
  } catch {
    return false
  }
}

export function getCacheUrl(infoHash: string): string | null {
  if (!serverPort) return null
  const fp = getCachedFilePath(infoHash)
  if (!fp) return null
  const relativePath = path.relative(CACHE_DIR, fp)
  return `http://127.0.0.1:${serverPort}/cache/${encodeURIComponent(relativePath)}`
}

function getCacheDirSize(dir: string): number {
  let total = 0
  try {
    const entries = fs.readdirSync(dir)
    for (const e of entries) {
      const fp = path.join(dir, e)
      try {
        const stat = fs.statSync(fp)
        if (stat.isDirectory()) total += getCacheDirSize(fp)
        else total += stat.size
      } catch {}
    }
  } catch {}
  return total
}

export function getCacheStatus(): { count: number; sizeBytes: number; sizeGb: string } {
  try {
    if (!fs.existsSync(CACHE_DIR)) return { count: 0, sizeBytes: 0, sizeGb: '0 GB' }
    const entries = fs.readdirSync(CACHE_DIR)
    let sizeBytes = 0
    let count = 0
    for (const e of entries) {
      const fp = path.join(CACHE_DIR, e)
      if (fs.statSync(fp).isDirectory()) {
        sizeBytes += getCacheDirSize(fp)
        count++
      }
    }
    return { count, sizeBytes, sizeGb: (sizeBytes / (1024 ** 3)).toFixed(1) + ' GB' }
  } catch {
    return { count: 0, sizeBytes: 0, sizeGb: '0 GB' }
  }
}

export async function clearCache(): Promise<void> {
  if (!fs.existsSync(CACHE_DIR)) return
  const entries = await fsp.readdir(CACHE_DIR)
  for (const e of entries) {
    const fp = path.join(CACHE_DIR, e)
    await fsp.rm(fp, { recursive: true, force: true })
  }
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = req.url || '/'
  const match = url.match(/^\/cache\/(.+)/)
  if (!match) {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  const relativePath = decodeURIComponent(match[1])
  const filePath = path.join(CACHE_DIR, relativePath)

  // Prevent path traversal
  if (!filePath.startsWith(CACHE_DIR)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  try {
    if (!fs.existsSync(filePath)) {
      res.writeHead(404)
      res.end('File not found')
      return
    }

    const stat = fs.statSync(filePath)
    const totalSize = stat.size
    const range = req.headers.range

    if (range) {
      // Parse range header
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1
      const chunkSize = end - start + 1

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'no-cache',
      })

      const stream = fs.createReadStream(filePath, { start, end })
      stream.pipe(res)
      stream.on('error', () => { if (!res.writableEnded) res.end() })
    } else {
      res.writeHead(200, {
        'Content-Length': totalSize,
        'Content-Type': 'application/octet-stream',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      })
      const stream = fs.createReadStream(filePath)
      stream.pipe(res)
      stream.on('error', () => { if (!res.writableEnded) res.end() })
    }
  } catch (err: any) {
    debug('Error serving file:', err.message)
    if (!res.writableEnded) res.end()
  }
}

export function init(): void {
  getCacheDir()
  debug(`Cache directory: ${CACHE_DIR}`)

  if (server) return
  server = http.createServer(handleRequest)
  server.listen(0, '127.0.0.1', () => {
    const addr = server!.address()
    if (addr && typeof addr === 'object') {
      serverPort = addr.port
      debug(`HTTP cache server listening on port ${serverPort}`)
    }
  })
}

export function destroy(): void {
  if (server) {
    server.close()
    server = null
  }
}
