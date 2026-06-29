import * as CacheService from './cache.service'

class CachedCheckFailedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CachedCheckFailedError'
  }
}

const REAL_DEBRID_BASE = 'https://api.real-debrid.com/rest/1.0'
const TORBOX_BASE = 'https://api.torbox.app/v1/api'
const PREMIUMIZE_BASE = 'https://www.premiumize.me/api'
const ALLDEBRID_BASE = 'https://api.alldebrid.com/v4'
const PREMIUMIZE_CLIENT_ID = 'fynix_hub'
const ALLDEBRID_AGENT = 'fynix-hub'
const TORBOX_SETTINGS_URL = 'https://torbox.app/settings'
const OAUTH_BASE = 'https://api.real-debrid.com/oauth/v2'

let realDebridKey: string | null = null
let torboxKey: string | null = null
let premiumizeToken: string | null = null
let alldebridToken: string | null = null

export function loadKeys() {
  realDebridKey = CacheService.getSetting<string>('realDebridApiKey') || null
  torboxKey = CacheService.getSetting<string>('torboxApiKey') || null
  premiumizeToken = CacheService.getSetting<string>('premiumizeAccessToken') || null
  alldebridToken = CacheService.getSetting<string>('alldebridAccessToken') || null
}

export function setRealDebridKey(key: string | null) { realDebridKey = key }
export function setTorboxKey(key: string | null) { torboxKey = key }

export function isConfigured(service: string): boolean {
  const configured = service === 'real-debrid' ? !!realDebridKey
    : service === 'torbox' ? !!torboxKey
    : service === 'premiumize' ? !!premiumizeToken
    : service === 'alldebrid' ? !!alldebridToken
    : false
  if (configured) console.log(`[Debrid] ${service} is configured`)
  return configured
}

export function getPreferred(): string | null {
  const pref = CacheService.getSetting<string>('preferredDebrid')
  if (pref && isConfigured(pref)) return pref
  if (isConfigured('real-debrid')) return 'real-debrid'
  if (isConfigured('torbox')) return 'torbox'
  if (isConfigured('premiumize')) return 'premiumize'
  if (isConfigured('alldebrid')) return 'alldebrid'
  return null
}

const SERVICE_ORDER = ['real-debrid', 'torbox', 'premiumize', 'alldebrid'] as const

export function getServices(): string[] {
  return SERVICE_ORDER.filter(s => isConfigured(s))
}

async function realDebridFetch(path: string, options: RequestInit = {}) {
  if (!realDebridKey) throw new Error('Real-Debrid not configured')
  const res = await fetch(`${REAL_DEBRID_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${realDebridKey}`,
      ...(options.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`Real-Debrid error: ${res.status}`)
  if (res.status === 204) return null
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (e: any) {
    throw new Error(`Real-Debrid JSON parse error: ${e.message}`)
  }
}

async function torboxFetch(path: string, options: RequestInit = {}) {
  if (!torboxKey) throw new Error('TorBox not configured')
  const res = await fetch(`${TORBOX_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${torboxKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`TorBox error: ${res.status}`)
  return res.json()
}

// --- Real-Debrid ---

export async function realDebridCheckCached(hashes: string[], magnets?: string[]): Promise<Record<string, boolean>> {
  console.log(`[Debrid] realDebridCheckCached: checking ${hashes.length} hashes, key present: ${!!realDebridKey}`)
  if (!realDebridKey) return {}

  const result: Record<string, boolean> = {}
  const toCheck = hashes.slice(0, 20)
  const BATCH = 10
  for (let i = 0; i < toCheck.length; i += BATCH) {
    const batch = toCheck.slice(i, i + BATCH)
    const out = await Promise.allSettled(batch.map(async (hash) => {
      try {
        const infoRes = await fetch(`${REAL_DEBRID_BASE}/torrents/instantAvailability/${hash}`, {
          headers: { Authorization: `Bearer ${realDebridKey}` },
        })
        if (!infoRes.ok) {
          console.log(`[Debrid] instantAvailability ${hash.slice(0, 8)}: ${infoRes.status}`)
          return { hash, cached: false }
        }
        const data = await infoRes.json() as any
        // Real-Debrid instantAvailability returns { hash: { rd: [{ filename, filesize }] } } when cached
        const variants = data?.[hash.toUpperCase()]
        const cached = !!(variants?.rd?.length || variants?.[hash.toUpperCase()]?.rd?.length)
        if (cached) {
          console.log(`[Debrid] hash ${hash.slice(0, 8)}: CACHED`)
        }
        return { hash, cached }
      } catch (e: any) {
        console.log(`[Debrid] hash ${hash.slice(0, 8)}: instantAvailability error ${e.message}`)
        return { hash, cached: false }
      }
    }))
    for (const s of out) {
      if (s.status === 'fulfilled') {
        result[s.value.hash] = s.value.cached
      }
    }
    if (i + BATCH < toCheck.length) await new Promise(r => setTimeout(r, 200))
  }
  const cachedCount = Object.values(result).filter(Boolean).length
  console.log(`[Debrid] cached: ${cachedCount}/${hashes.length}`)
  return result
}

export async function realDebridAddMagnet(magnet: string) {
  const formData = new URLSearchParams({ magnet })
  return realDebridFetch('/torrents/addMagnet', {
    method: 'POST',
    body: formData.toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
}

export async function realDebridSelectFiles(torrentId: string, fileIds: string[] = ['all']) {
  if (!realDebridKey) throw new Error('Real-Debrid not configured')
  const formData = new URLSearchParams({ files: fileIds.join(',') })
  const res = await fetch(`${REAL_DEBRID_BASE}/torrents/selectFiles/${torrentId}`, {
    method: 'POST',
    body: formData.toString(),
    headers: {
      Authorization: `Bearer ${realDebridKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })
  if (!res.ok) throw new Error(`Real-Debrid selectFiles error: ${res.status}`)
  // selectFiles returns 204 No Content on success
  if (res.status === 204) return null
  return res.json()
}

export async function realDebridTorrentInfo(torrentId: string) {
  return realDebridFetch(`/torrents/info/${torrentId}`)
}

export async function realDebridUnrestrict(link: string) {
  const formData = new URLSearchParams({ link })
  return realDebridFetch('/unrestrict/link', {
    method: 'POST',
    body: formData.toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
}

async function waitForRealDebridReady(torrentId: string, maxPollMs = 60000): Promise<string> {
  const pollInterval = 1500
  const maxAttempts = maxPollMs / pollInterval
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, pollInterval))
    const info = await realDebridTorrentInfo(torrentId)
    if (info.status === 'downloaded' || (info.progress >= 100 && info.links?.length > 0)) {
      const link = info.links[0]
      const unrestricted = await realDebridUnrestrict(link)
      return unrestricted.download
    }
  }
  throw new Error('Real-Debrid: timed out waiting for torrent to be ready')
}

export async function realDebridAddAndWait(magnet: string): Promise<string> {
  try {
    const added = await realDebridAddMagnet(magnet)
    if (!added?.id) throw new Error('Real-Debrid: no torrent ID returned')
    await realDebridSelectFiles(added.id)
    return waitForRealDebridReady(added.id)
  } catch (err: any) {
    if (err?.message?.includes('451')) {
      throw new CachedCheckFailedError('Real-Debrid reports this torrent is unavailable (451). Try using a different debrid service or direct torrent.')
    }
    throw err
  }
}

// --- Real-Debrid OAuth (device-code flow) ---

export async function realDebridGetDeviceCode(): Promise<{ device_code: string; user_code: string; verification_url: string; interval: number; expires_in: number }> {
  const res = await fetchWithTimeout(
    `${OAUTH_BASE}/device/code?client_id=X245A4XAIBGVM&new_credentials=yes`,
    { timeout: 15000 }
  )
  if (!res.ok) throw new Error(`Real-Debrid device code error: ${res.status}`)
  return res.json()
}

export async function realDebridPollForCredentials(deviceCode: string): Promise<string> {
  try {
    const res = await fetchWithTimeout(
      `${OAUTH_BASE}/device/credentials?client_id=X245A4XAIBGVM&code=${deviceCode}`,
      { timeout: 15000 }
    )
    if (res.status === 401) return ''
    if (!res.ok) return ''
    const creds = await res.json()
    if (!creds.client_secret) return ''
    const tokenRes = await fetchWithTimeout(`${OAUTH_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `client_id=${creds.client_id}&client_secret=${creds.client_secret}&code=${deviceCode}&grant_type=http://oauth.net/grant_type/device/1.0`,
      timeout: 15000,
    })
    if (!tokenRes.ok) throw new Error(`Real-Debrid token error: ${tokenRes.status}`)
    const tokenData = await tokenRes.json()
    return tokenData.access_token || ''
  } catch (err: any) {
    if (err?.message?.includes('token error')) throw err
    return ''
  }
}

// --- TorBox ---

export function getTorboxSettingsUrl(): string {
  return TORBOX_SETTINGS_URL
}

export async function torboxGetDeviceCode(): Promise<{ device_code: string; user_code: string; verification_url: string; interval: number; expires_at: string }> {
  const res = await fetchWithTimeout(`${TORBOX_BASE}/user/auth/device/start?app=${encodeURIComponent('Fynix Hub')}`, { timeout: 15000 })
  if (!res.ok) throw new Error(`TorBox device code error: ${res.status}`)
  const data = await res.json()
  if (!data.success) throw new Error(data.detail || data.error || 'TorBox device code request failed')
  const d = data.data || {}
  return {
    device_code: d.device_code,
    user_code: d.code,
    verification_url: d.verification_url || d.friendly_verification_url,
    interval: d.interval || 5,
    expires_at: d.expires_at,
  }
}

export async function torboxPollForToken(deviceCode: string): Promise<string> {
  if (!deviceCode) throw new Error('TorBox: missing device code')
  const body = JSON.stringify({ device_code: deviceCode })
  console.log('[Debrid] TorBox poll token request:', { deviceCode, body })
  const res = await fetchWithTimeout(`${TORBOX_BASE}/user/auth/device/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    timeout: 15000,
  })
  const responseText = await res.text()
  console.log('[Debrid] TorBox poll token response:', res.status, responseText)
  let data: any
  try {
    data = JSON.parse(responseText)
  } catch {
    data = null
  }
  // TorBox may return DEVICE_CODE_NOT_USED as either 200 or 400 while waiting
  if (data?.error === 'DEVICE_CODE_NOT_USED') return ''
  if (!res.ok) throw new Error(`TorBox token error: ${res.status} - ${responseText}`)
  if (!data?.success) {
    throw new Error(data?.detail || data?.error || 'TorBox token request failed')
  }
  const token = data.data?.api_token || data.data?.token || data.data?.access_token || data.data
  if (!token || typeof token !== 'string') {
    console.log('[Debrid] TorBox token response data:', data.data)
    throw new Error('TorBox: no token in response')
  }
  return token
}

export async function torboxCheckCached(hashes: string[]): Promise<Record<string, boolean>> {
  try {
    const result: Record<string, boolean> = {}
    const CHUNK = 25
    for (let i = 0; i < hashes.length; i += CHUNK) {
      const chunk = hashes.slice(i, i + CHUNK)
      const data = await torboxFetch(`/torrents/checkcached?hash=${chunk.join(',')}`)
      console.log('[Debrid] TorBox checkcached chunk response:', { chunkSize: chunk.length, data: data.data })
      const cachedData = (data.data as Record<string, any>) || {}
      for (const hash of chunk) {
        const entry = cachedData[hash.toUpperCase()] || cachedData[hash.toLowerCase()] || cachedData[hash]
        result[hash] = !!entry
      }
    }
    const cachedCount = Object.values(result).filter(Boolean).length
    console.log(`[Debrid] TorBox checkcached total: ${cachedCount}/${hashes.length}`)
    return result
  } catch (err: any) {
    console.error('[Debrid] TorBox checkcached error:', err.message)
    return {}
  }
}

export async function torboxAddMagnet(magnet: string) {
  return torboxFetch('/torrents/createtorrent', {
    method: 'POST',
    body: JSON.stringify({ magnet }),
  })
}

export async function torboxTorrentInfo(torrentId: string) {
  return torboxFetch(`/torrents/mytorrents?bypass_cache=true&id=${torrentId}`)
}

export async function torboxRequestDownloadLink(torrentId: string, fileId?: number) {
  const body: Record<string, any> = { torrent_id: torrentId }
  if (fileId !== undefined) body.file_id = fileId
  return torboxFetch('/torrents/requestdl', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

async function waitForTorboxReady(torrentId: string, maxPollMs = 60000): Promise<string> {
  const pollInterval = 1500
  const maxAttempts = maxPollMs / pollInterval
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, pollInterval))
    const info = await torboxTorrentInfo(torrentId)
    if (info?.data?.download_present) {
      const dl = await torboxRequestDownloadLink(torrentId)
      return dl?.data?.download_url || ''
    }
    if (info?.data?.download_finished) {
      const dl = await torboxRequestDownloadLink(torrentId)
      return dl?.data?.download_url || ''
    }
  }
  throw new Error('TorBox: timed out waiting for torrent to be ready')
}

export async function torboxAddAndWait(magnet: string): Promise<string> {
  const added = await torboxAddMagnet(magnet)
  const torrentId = String(added.data?.torrent_id || added.id || added.torrent_id)
  if (!torrentId) throw new Error('TorBox: failed to get torrent ID')
  return waitForTorboxReady(torrentId)
}

// --- Premiumize OAuth ---

async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 10000, ...fetchOptions } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, { ...fetchOptions, signal: controller.signal })
    return res
  } finally {
    clearTimeout(timer)
  }
}

export async function premiumizeGetDeviceCode(): Promise<{ device_code: string; user_code: string; verification_uri: string; interval: number; expires_in: number }> {
  const res = await fetchWithTimeout('https://www.premiumize.me/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=device_code&client_id=${PREMIUMIZE_CLIENT_ID}`,
  })
  if (!res.ok) throw new Error(`Premiumize device code error: ${res.status}`)
  return res.json()
}

export async function premiumizePollForToken(deviceCode: string): Promise<{ access_token: string; token_type: string; scope: string } | null> {
  const res = await fetchWithTimeout('https://www.premiumize.me/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=device_code&client_id=${PREMIUMIZE_CLIENT_ID}&code=${deviceCode}`,
  })
  if (res.status === 400) return null
  if (!res.ok) throw new Error(`Premiumize poll error: ${res.status}`)
  return res.json()
}

// --- Premiumize API ---

async function premiumizeFetch(path: string, options: RequestInit = {}) {
  if (!premiumizeToken) throw new Error('Premiumize not configured')
  const res = await fetch(`${PREMIUMIZE_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${premiumizeToken}`,
      ...(options.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`Premiumize error: ${res.status}`)
  return res.json()
}

export async function premiumizeCheckCached(hashes: string[]): Promise<Record<string, boolean>> {
  try {
    const params = new URLSearchParams()
    for (const h of hashes) params.append('items[]', h)
    const data = await premiumizeFetch(`/cache/check?${params.toString()}`)
    const result: Record<string, boolean> = {}
    if (data.response) {
      for (let i = 0; i < hashes.length; i++) {
        result[hashes[i]] = data.response[i] === true
      }
    }
    return result
  } catch {
    return {}
  }
}

export async function premiumizeAddMagnet(magnet: string) {
  const formData = new URLSearchParams({ src: magnet })
  return premiumizeFetch('/transfer/directadd', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  })
}

export async function premiumizeTransferList() {
  return premiumizeFetch('/transfer/list')
}

async function waitForPremiumizeReady(transferId: string, maxPollMs = 60000): Promise<string> {
  const pollInterval = 1500
  const maxAttempts = maxPollMs / pollInterval
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, pollInterval))
    const data = await premiumizeTransferList()
    const transfer = (data.transfers || []).find((t: any) => t.id === transferId)
    if (transfer && transfer.status === 'seeding' && transfer.file_id) {
      const dlData = await premiumizeFetch(`/transfer/directdl?id=${transfer.file_id}`)
      return dlData?.content?.[0]?.stream_url || dlData?.content?.[0]?.link || ''
    }
  }
  throw new Error('Premiumize: timed out waiting for torrent to be ready')
}

export async function premiumizeAddAndWait(magnet: string): Promise<string> {
  const added = await premiumizeAddMagnet(magnet)
  const transferId = added.id || added.torrent_id || added.transfer_id
  if (!transferId) throw new Error('Premiumize: failed to get transfer ID')
  return waitForPremiumizeReady(transferId)
}

// --- AllDebrid OAuth ---

export async function alldebridGetDevicePin(): Promise<{ pin: string; user_code: string; base_url: string; expires_in: number; interval: number; device_id: string }> {
  const res = await fetchWithTimeout(`https://api.alldebrid.com/oauth/device/authorize?agent=${ALLDEBRID_AGENT}`)
  if (!res.ok) throw new Error(`AllDebrid device pin error: ${res.status}`)
  const json = await res.json()
  if (json.status === 'error') throw new Error(`AllDebrid: ${json.error || 'device authorization failed'}`)
  return json.data
}

export async function alldebridPollForToken(pin: string, deviceId?: string): Promise<{ token: string; user: any } | null> {
  let url = `https://api.alldebrid.com/oauth/device/poll?agent=${ALLDEBRID_AGENT}&pin=${pin}`
  if (deviceId) url += `&device_id=${deviceId}`
  const res = await fetchWithTimeout(url)
  if (res.status === 403) return null
  if (!res.ok) throw new Error(`AllDebrid poll error: ${res.status}`)
  const json = await res.json()
  if (json.status === 'error') {
    if (json.error_code === 'EXPIRED_PIN') throw new Error('PIN expired')
    if (json.error === 'authorization_pending') return null
    throw new Error(`AllDebrid: ${json.error || 'poll failed'}`)
  }
  return json.data
}

// --- AllDebrid API ---

async function alldebridApiFetch(path: string, options: RequestInit = {}) {
  if (!alldebridToken) throw new Error('AllDebrid not configured')
  const separator = path.includes('?') ? '&' : '?'
  const res = await fetch(`${ALLDEBRID_BASE}${path}${separator}agent=${ALLDEBRID_AGENT}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${alldebridToken}`,
      ...(options.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`AllDebrid error: ${res.status}`)
  const json = await res.json()
  if (json.status === 'error') throw new Error(`AllDebrid API: ${json.error || json.error_message || 'unknown error'}`)
  return json.data
}

export async function alldebridCheckCached(hashes: string[]): Promise<Record<string, boolean>> {
  try {
    const params = new URLSearchParams()
    for (const h of hashes) params.append('magnets[]', h)
    const data = await alldebridApiFetch(`/magnet/instant?${params.toString()}`)
    const result: Record<string, boolean> = {}
    if (data.magnets) {
      for (const m of data.magnets) {
        const hash = m.hash || m.magnet?.toLowerCase()
        if (hash) result[hash] = m.instant === true || m.cached === true
        for (const h of hashes) {
          if (h.toLowerCase() === hash?.toLowerCase()) {
            result[h] = m.instant === true || m.cached === true
          }
        }
      }
    }
    return result
  } catch {
    return {}
  }
}

export async function alldebridAddMagnet(magnet: string) {
  return alldebridApiFetch(`/magnet/upload/magnet?magnet=${encodeURIComponent(magnet)}`, { method: 'POST' })
}

export async function alldebridMagnetStatus(magnetId: string) {
  return alldebridApiFetch(`/magnet/status?id=${magnetId}`)
}

export async function alldebridUnrestrict(link: string) {
  return alldebridApiFetch(`/link/unlock?link=${encodeURIComponent(link)}`, { method: 'POST' })
}

async function waitForAlldebridReady(magnetId: string, maxPollMs = 60000): Promise<string> {
  const pollInterval = 1500
  const maxAttempts = maxPollMs / pollInterval
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, pollInterval))
    const status = await alldebridMagnetStatus(magnetId)
    if (status.magnets?.[0]?.statusCode === 4 || status.magnets?.[0]?.ready === true) {
      const link = status.magnets[0].links?.[0]?.link
      if (!link) throw new Error('AllDebrid: no link available')
      const unlocked = await alldebridUnrestrict(link)
      return unlocked.link || unlocked
    }
  }
  throw new Error('AllDebrid: timed out waiting for torrent to be ready')
}

export async function alldebridAddAndWait(magnet: string): Promise<string> {
  const added = await alldebridAddMagnet(magnet)
  const magnetId = String(added.magnet || added.id || added.magnet_id)
  if (!magnetId) throw new Error('AllDebrid: failed to get magnet ID')
  return waitForAlldebridReady(magnetId)
}

// --- Unified ---

export async function addAndWait(magnet: string, service?: string): Promise<string> {
  const svc = service || getPreferred()
  if (!svc) throw new Error('No debrid service configured')
  if (svc === 'real-debrid') return realDebridAddAndWait(magnet)
  if (svc === 'torbox') return torboxAddAndWait(magnet)
  if (svc === 'premiumize') return premiumizeAddAndWait(magnet)
  if (svc === 'alldebrid') return alldebridAddAndWait(magnet)
  throw new Error(`Unknown debrid service: ${svc}`)
}

export async function checkBatchCached(hashes: string[], service?: string, magnets?: string[]): Promise<Record<string, boolean>> {
  if (hashes.length === 0) return {}
  const svc = service || getPreferred()
  if (!svc) return {}
  if (svc === 'real-debrid') return realDebridCheckCached(hashes, magnets)
  if (svc === 'torbox') return torboxCheckCached(hashes)
  if (svc === 'premiumize') return premiumizeCheckCached(hashes)
  if (svc === 'alldebrid') return alldebridCheckCached(hashes)
  return {}
}
