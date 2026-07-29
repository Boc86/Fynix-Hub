/**
 * Xtream Codes Portal Service
 *
 * Persists portal credentials (url + user + pass) so the IPTV M3U fetcher
 * can pull M3U playlists from them via get.php.
 *
 * Caching is handled by iptv-m3u.service.ts — the fetched M3U data goes
 * through the same 24h memory + disk cache as the MAD TITAN txt source.
 * This file only manages the portal list itself (separate persistence).
 */

import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export interface XtreamPortal {
  url: string
  user: string
  pass: string
}

const PORTALS_PATH = () => path.join(app.getPath('userData'), 'xtream-portals.json')

let portals: XtreamPortal[] = []

function load(): void {
  try {
    const raw = fs.readFileSync(PORTALS_PATH(), 'utf-8')
    const data = JSON.parse(raw)
    portals = Array.isArray(data) ? data : []
  } catch {
    portals = []
  }
}

function save(): void {
  try {
    const dir = path.dirname(PORTALS_PATH())
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(PORTALS_PATH(), JSON.stringify(portals, null, 2), 'utf-8')
  } catch (e) {
    console.error('[Xtream] Failed to save portals:', e)
  }
}

export function getPortals(): XtreamPortal[] {
  if (portals.length === 0) load()
  return [...portals]
}

export function addPortal(url: string, user: string, pass: string): XtreamPortal[] {
  if (portals.length === 0) load()
  // Normalize: strip trailing /get.php or /player_api.php, trailing slashes
  let clean = url.replace(/\/get\.php$/i, '').replace(/\/player_api\.php$/i, '')
  while (clean.endsWith('/')) clean = clean.slice(0, -1)
  if (!/^https?:/i.test(clean)) clean = 'http://' + clean

  const exists = portals.some(p => p.url === clean && p.user === user && p.pass === pass)
  if (!exists) {
    portals.push({ url: clean, user, pass })
    save()
  }
  return getPortals()
}

export function removePortal(url: string, user: string, pass: string): XtreamPortal[] {
  if (portals.length === 0) load()
  portals = portals.filter(p => !(p.url === url && p.user === user && p.pass === pass))
  save()
  return getPortals()
}

export function importPortals(newPortals: XtreamPortal[]): { added: number; total: number } {
  if (portals.length === 0) load()
  let added = 0
  for (const np of newPortals) {
    let clean = np.url.replace(/\/get\.php$/i, '').replace(/\/player_api\.php$/i, '')
    while (clean.endsWith('/')) clean = clean.slice(0, -1)
    if (!/^https?:/i.test(clean)) clean = 'http://' + clean

    if (!portals.some(p => p.url === clean && p.user === np.user && p.pass === np.pass)) {
      portals.push({ url: clean, user: np.user, pass: np.pass })
      added++
    }
  }
  if (added > 0) save()
  return { added, total: portals.length }
}

/**
 * Fetch the M3U playlist from an Xtream portal.
 * Returns { label, url, channels } shape matching IPTVSource, or null.
 */
export async function fetchPortalM3U(
  portal: XtreamPortal,
): Promise<{ label: string; url: string; channels: { name: string; url: string }[] } | null> {
  const m3uUrl =
    `${portal.url}/get.php?username=${encodeURIComponent(portal.user)}&password=${encodeURIComponent(portal.pass)}&type=m3u_plus&output=ts`

  try {
    const response = await fetch(m3uUrl, { signal: AbortSignal.timeout(15000) })
    if (!response.ok) {
      console.warn(`[Xtream] HTTP ${response.status} for ${portal.url}`)
      return null
    }
    const text = await response.text()
    if (!text || text.length < 50) {
      console.warn(`[Xtream] Empty/short response from ${portal.url}`)
      return null
    }

    // Reuse the M3U parser from iptv-m3u.service
    const { parseM3U } = await import('./iptv-m3u.service')
    const channels = parseM3U(text)

    // Derive label from hostname + username
    let label: string
    try {
      const u = new URL(portal.url)
      label = `${u.hostname} (${portal.user})`
    } catch {
      label = `${portal.user}@xtream`
    }

    console.log(`[Xtream] ${label}: ${channels.length} channels`)
    return { label, url: m3uUrl, channels }
  } catch (err: any) {
    console.warn(`[Xtream] Failed to fetch ${portal.url}: ${err.message}`)
    return null
  }
}

/**
 * Fetch M3U from every saved portal. Called by iptv-m3u.service's doFetch()
 * so all sources share the same 24h cache.
 */
export async function refreshAllPortalM3Us(): Promise<
  { label: string; url: string; channels: { name: string; url: string }[] }[]
> {
  const list = getPortals()
  if (list.length === 0) return []

  const results = await Promise.allSettled(list.map(p => fetchPortalM3U(p)))
  const sources: { label: string; url: string; channels: { name: string; url: string }[] }[] = []
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) sources.push(r.value)
  }
  return sources
}

/**
 * Force-reload the portal list from disk (used by IPC handlers).
 */
export function reloadPortals(): void {
  load()
}
