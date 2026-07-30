import * as http from 'http'
import * as https from 'https'
import * as CacheService from './cache.service'

interface NzbgetGroup {
  NZBID: number
  NZBFilename: string
  NZBNicename: string
  FileSizeMB: number
  RemainingSizeMB: number
  DownloadedSizeMB: number
  Progress: number
  Status: string
  DestDir: string
  FinalDir: string
}

interface NzbgetHistory {
  NZBID: number
  NZBFilename: string
  NZBNicename: string
  FileSizeMB: number
  DestDir: string
  FinalDir: string
  Status: string
  ParStatus: string
}

interface NzbgetStatus {
  DownloadRate: number
  DownloadPaused: boolean
  DownloadedSizeMB: number
  QueueSizeMB: number
  RemainingSizeMB: number
  ServerStandBy: boolean
}

function getHost(): string {
  return CacheService.getSetting<string>('nzbgetHost') || 'localhost'
}

function getPort(): number {
  return parseInt(CacheService.getSetting<string>('nzbgetPort') || '6789', 10)
}

function getUsername(): string {
  return CacheService.getSetting<string>('nzbgetUsername') || 'nzbget'
}

function getPassword(): string {
  return CacheService.getSetting<string>('nzbgetPassword') || 'tegbzn6789'
}

function jsonRpcCall(method: string, params: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const host = getHost()
    const port = getPort()
    const user = getUsername()
    const pass = getPassword()

    const body = JSON.stringify({ method, params, jsonrpc: '2.0', id: 1 })
    console.log(`[NZB] jsonRpcCall: ${method}`, JSON.stringify(params))
    const auth = Buffer.from(`${user}:${pass}`).toString('base64')

    const options: http.RequestOptions = {
      hostname: host,
      port,
      path: '/jsonrpc',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 10000,
    }

    const client = port === 443 ? https : http
    const req = client.request(options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8')
        try {
          console.log(`[NZB] response ${method}:`, raw.slice(0, 300))
          const parsed = JSON.parse(raw)
          if (parsed.error) reject(new Error(parsed.error.message || parsed.error))
          else resolve(parsed.result)
        } catch {
          reject(new Error(`Invalid JSON-RPC response: ${raw.slice(0, 200)}`))
        }
      })
      res.on('error', reject)
    })

    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('NZBGet request timeout')) })
    req.write(body)
    req.end()
  })
}

export async function checkConnection(): Promise<{ connected: boolean; error?: string }> {
  try {
    const version = await jsonRpcCall('version', [])
    return { connected: !!version }
  } catch (err: any) {
    return { connected: false, error: err?.message || 'Connection failed' }
  }
}

export async function appendNzb(nzbContentOrUrl: string, title: string): Promise<number> {
  const isUrl = !nzbContentOrUrl.startsWith('<?xml') && !nzbContentOrUrl.startsWith('<')
  console.log(`[NZB] appendNzb: host=${getHost()}:${getPort()}, type=${isUrl ? 'URL' : 'XML'}, ${isUrl ? `url=${nzbContentOrUrl.slice(0, 200)}` : `length=${nzbContentOrUrl.length}`}`)
  const nzbId = await jsonRpcCall('append', ['', nzbContentOrUrl, '', 0, false, false, '', 0, 'SCORE', false, []])
  if (typeof nzbId === 'number' && nzbId < 0) {
    throw new Error(`NZBGet rejected append (result: ${nzbId})`)
  }
  return nzbId as number
}

export async function listGroups(): Promise<NzbgetGroup[]> {
  const result = await jsonRpcCall('listgroups', [])
  return (result || []) as NzbgetGroup[]
}

export async function history(limit = 100): Promise<NzbgetHistory[]> {
  const result = await jsonRpcCall('history', [limit])
  return (result || []) as NzbgetHistory[]
}

export async function historyDelete(nzbId: number): Promise<void> {
  await jsonRpcCall('editqueue', ['HistoryDelete', 0, [{ id: nzbId }]])
}

export async function deleteNzb(nzbId: number): Promise<void> {
  await jsonRpcCall('editqueue', ['GroupDelete', 0, [{ id: nzbId }]])
}

export async function getStatus(): Promise<NzbgetStatus> {
  return (await jsonRpcCall('status', [])) as NzbgetStatus
}

export async function listFiles(nzbId: number): Promise<any[]> {
  const result = await jsonRpcCall('listfiles', [0, 0, nzbId])
  return (result || []) as any[]
}

export async function getConfig(): Promise<{ Name: string; Value: string }[]> {
  const result = await jsonRpcCall('config', [])
  return (result || []) as { Name: string; Value: string }[]
}

export async function pauseDownload(): Promise<void> {
  await jsonRpcCall('pausedownload', [])
}

export async function resumeDownload(): Promise<void> {
  await jsonRpcCall('resumedownload', [])
}

export function isConfigured(): boolean {
  const host = CacheService.getSetting<string>('nzbgetHost')
  return !!host
}
