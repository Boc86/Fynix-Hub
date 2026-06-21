const REAL_DEBRID_BASE = 'https://api.real-debrid.com/rest/1.0'
const TORBOX_BASE = 'https://api.torbox.app/v1'

let realDebridKey: string | null = null
let torboxKey: string | null = null

export function setRealDebridKey(key: string | null) { realDebridKey = key }
export function setTorboxKey(key: string | null) { torboxKey = key }

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
  return res.json()
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

export async function realDebridAddMagnet(magnet: string) {
  const formData = new URLSearchParams({ magnet })
  const result = await realDebridFetch('/torrents/addMagnet', {
    method: 'POST',
    body: formData.toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return result
}

export async function realDebridSelectFiles(torrentId: string, fileIds: string[] = ['all']) {
  const formData = new URLSearchParams({ files: fileIds.join(',') })
  return realDebridFetch(`/torrents/selectFiles/${torrentId}`, {
    method: 'POST',
    body: formData.toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
}

export async function realDebridTorrentInfo(torrentId: string) {
  return realDebridFetch(`/torrents/info/${torrentId}`)
}

export async function torboxAddMagnet(magnet: string) {
  return torboxFetch('/torrents/createtorrent', {
    method: 'POST',
    body: JSON.stringify({ magnet }),
  })
}

export async function torboxCheckCached(hash: string) {
  return torboxFetch(`/torrents/checkcached?hash=${hash}`)
}
