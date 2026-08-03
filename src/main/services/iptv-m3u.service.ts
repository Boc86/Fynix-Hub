/**
 * IPTV M3U Service — dead simple.
 *
 * Flow:
 *   1. Download the txt file (list of M3U URLs, one per line)
 *   2. For each M3U URL, download and parse into { name, url } pairs
 *   3. Group channels by source (the M3U URL)
 *   4. Cache in memory for 24 hours
 *
 * Exposed via IPC for the renderer to show per-source buttons.
 */

import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { refreshAllPortalM3Us, type XtreamPortal } from './xtream-portal.service'
import { cleanChannelName, channelKey } from '@/shared/cleanChannelName'

export { cleanChannelName, channelKey } from '@/shared/cleanChannelName'

export interface IPTVChannel {
  name: string
  url: string   // play URL (the line after #EXTINF in the M3U)
  logo?: string // tvg-logo URL from the #EXTINF line (optional; old disk caches lack it)
}

export interface IPTVSource {
  label: string      // friendly name derived from the URL
  url: string        // the M3U URL
  channels: IPTVChannel[]
}

const HARDCODED_LIST_URL = 'http://magnetic.website/MAD_TITAN_SPORTS/Keep_m3u_json/zone1.txt'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const CACHE_PATH = () => path.join(app.getPath('userData'), 'iptv-m3u-cache.json')

// Cached state
let cachedSources: IPTVSource[] | null = null
let cacheTimestamp = 0
let fetchPromise: Promise<IPTVSource[]> | null = null // dedupe concurrent fetches

/**
 * Strip quality/format/region suffixes (HD, FHD, FD 50fps, BACKUP, EAST, ...)
 * and filter out category-header lines (===== SPORT =====, - - - NEWS - - -)
 * so they don't appear as fake channels.
 *
 * ponytail: aggressive regex stripping. Trade-off: a real channel literally
 * named "HD" gets misclassified as the quality token. Acceptable risk vs the
 * 70k-channel dumps where noise dominates.
 */
export function isCategoryHeader(name: string): boolean {
  if (!name) return false
  const t = name.trim()
  // Strip a leading country prefix + separator so we can match the body of
  // patterns like `UK: ----- MOVIES -----`, `DE | ----- DE DOKU -----`,
  // `SP| ------ DOCUMENTALES ------`.
  const stripped = t.replace(/^[A-Za-z]{2,3}\s*[:|\-]\s*/, '')
  // Pure punctuation only
  if (/^[-=_*\s]+$/.test(stripped)) return true
  // `- - - - - TURKIYE SPOR - - - - -` style: surrounded by punctuation
  if (/^[-\s=*_]+[a-z][a-z\s]+[-\s=*_]+$/i.test(stripped) && /[-\s]/.test(stripped.slice(1, -1))) return true
  // `========= ... =========` style
  if (/^={2,}\s*.+\s*={2,}$/.test(stripped)) return true
  // `=== IT SPORTS ===`, `=== IT CINEMA ===`
  if (/^={2,}\s*[A-Z][A-Z\s]+\s*={2,}$/.test(stripped)) return true
  return false
}

/**
 * Parse an M3U file's text content into channel entries.
 * Format: #EXTINF:...,<name>\n<play-url>
 * Category-header lines (===== SPORT =====) are filtered out.
 */
export function parseM3U(content: string): IPTVChannel[] {
  const lines = content.split('\n')
  const channels: IPTVChannel[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith('#EXTINF:')) {
      const lastComma = line.lastIndexOf(',')
      if (lastComma !== -1 && i + 1 < lines.length) {
        const name = line.slice(lastComma + 1).trim()
        const url = lines[i + 1].trim()
        if (name && url && !url.startsWith('#') && !isCategoryHeader(name)) {
          const logoMatch = line.match(/tvg-logo="([^"]+)"/i)
          const logo = logoMatch ? logoMatch[1] : ''
          channels.push({ name, url, ...(logo ? { logo } : {}) })
        }
      }
    }
  }
  return channels
}

/**
 * Fetch text content from a URL. Handles http/https and local files.
 */
async function fetchText(url: string): Promise<string> {
  if (url.startsWith('file://') || (url.startsWith('/') && !url.includes('://'))) {
    const filePath = url.startsWith('file://') ? url.slice(7) : url
    const fs = require('fs')
    return fs.readFileSync(filePath, 'utf-8')
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

/**
 * Derive a friendly label from an M3U URL.
 * Prefers domain + first path segment; falls back to numbering.
 */
function labelFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const pathname = u.pathname
    const filename = pathname.split('/').pop() || ''

    // If the filename is generic (php, json, stream, etc), use domain
    if (!filename || /^get\.(php|json)|index\.(php|html)|stream$/i.test(filename)) {
      // Use hostname as label
      let host = u.hostname.replace(/^www\./i, '')
      // If hostname is too long, use first subdomain + TLD
      const parts = host.split('.')
      if (parts.length > 2) {
        host = parts[parts.length - 2] + '.' + parts[parts.length - 1]
      }
      return host
    }
    return filename.replace(/\.m3u\d?$/i, '').replace(/[_-]/g, ' ') || url
  } catch {
    return 'M3U'
  }
}

/**
 * Fetch all M3U sources. Downloads the txt list, then each M3U.
 * Caches for 24 hours. Pass forceRefresh=true to re-download.
 */
export async function getAllSources(forceRefresh = false): Promise<IPTVSource[]> {
  // Memory cache hit
  if (cachedSources && !forceRefresh && (Date.now() - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedSources
  }

  // Check disk cache if memory is cold
  if (!cachedSources && !forceRefresh) {
    const disk = loadDiskCache()
    if (disk) {
      cachedSources = disk.sources
      cacheTimestamp = disk.timestamp
      console.log(`[IPTV-M3U] Loaded ${disk.sources.length} sources from disk cache`)
      return disk.sources
    }
  }

  // Dedupe: if a fetch is already running, wait for it
  if (fetchPromise) {
    return fetchPromise
  }

  fetchPromise = doFetch()

  try {
    return await fetchPromise
  } finally {
    fetchPromise = null
  }
}

// --- Disk cache ---

function saveDiskCache(sources: IPTVSource[]): void {
  try {
    const dir = path.dirname(CACHE_PATH())
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(CACHE_PATH(), JSON.stringify({ sources, timestamp: Date.now() }), 'utf-8')
  } catch {}
}

function loadDiskCache(): { sources: IPTVSource[]; timestamp: number } | null {
  try {
    const raw = fs.readFileSync(CACHE_PATH(), 'utf-8')
    const data = JSON.parse(raw)
    if (data.sources && data.timestamp && (Date.now() - data.timestamp) < CACHE_TTL_MS) {
      return data
    }
  } catch {}
  return null
}

// --- Fetch ---

async function doFetch(): Promise<IPTVSource[]> {
  const sources: IPTVSource[] = []

  // Step 1: Download the txt file (list of M3U URLs)
  let m3uUrls: string[]
  try {
    console.log(`[IPTV-M3U] Fetching M3U list from: ${HARDCODED_LIST_URL}`)
    const txtContent = await fetchText(HARDCODED_LIST_URL)
    m3uUrls = txtContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
    console.log(`[IPTV-M3U] Found ${m3uUrls.length} M3U URLs in list`)
  } catch (err: any) {
    console.error(`[IPTV-M3U] Failed to fetch list: ${err.message}`)
    return cachedSources || []
  }

  // Step 2: Download each M3U file (parallel, skip failures)
  const results = await Promise.allSettled(
    m3uUrls.map(async (m3uUrl) => {
      const content = await fetchText(m3uUrl)
      const channels = parseM3U(content)
      console.log(`[IPTV-M3U] ${labelFromUrl(m3uUrl)}: ${channels.length} channels`)
      return { label: labelFromUrl(m3uUrl), url: m3uUrl, channels }
    })
  )

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.channels.length > 0) {
      sources.push(r.value)
    }
  }

  // Step 3: Fetch from saved Xtream portals (same cache lifecycle)
  try {
    const xtreamSources = await refreshAllPortalM3Us()
    for (const xs of xtreamSources) {
      if (xs.channels.length > 0) sources.push(xs)
    }
    if (xtreamSources.length > 0) {
      console.log(`[IPTV-M3U] Added ${xtreamSources.length} Xtream portal source(s)`)
    }
  } catch (e: any) {
    console.warn(`[IPTV-M3U] Xtream portal fetch failed: ${e.message}`)
  }

  const total = sources.reduce((sum, s) => sum + s.channels.length, 0)
  console.log(`[IPTV-M3U] Cached ${sources.length} sources, ${total} total channels`)

  cachedSources = sources
  cacheTimestamp = Date.now()
  saveDiskCache(sources)
  return sources
}

/**
 * Get ALL channel names from all M3U sources (flat, deduped).
 * Returns just the channel names and which source label they come from.
 * Used by Settings to build the merged CDN + M3U channel list.
 */
export async function getAllM3UChannels(
  forceRefresh = false,
): Promise<{ name: string; sourceLabel: string; logo?: string }[]> {
  const sources = await getAllSources(forceRefresh)
  const seen = new Set<string>()
  const result: { name: string; sourceLabel: string; logo?: string }[] = []
  for (const src of sources) {
    for (const ch of src.channels) {
      const key = ch.name.toLowerCase().trim()
      if (!seen.has(key)) {
        seen.add(key)
        result.push({ name: ch.name, sourceLabel: src.label, ...(ch.logo ? { logo: ch.logo } : {}) })
      }
    }
  }
  return result
}

/**
 * Search for a channel across all M3U sources.
 * Returns matching sources with the channel highlighted.
 */
export async function findChannelInSources(
  query: string,
): Promise<{ source: IPTVSource; channel: IPTVChannel }[]> {
  const sources = await getAllSources()

  const normalize = (name: string): string => {
    let n = cleanChannelName(name).toLowerCase()
    n = n.replace(/\bzero\b/gi, '0')
    n = n.replace(/\bone\b/gi, '1')
    n = n.replace(/\btwo\b/gi, '2')
    n = n.replace(/\bthree\b/gi, '3')
    n = n.replace(/\bfour\b/gi, '4')
    n = n.replace(/\bfive\b/gi, '5')
    n = n.replace(/\bsix\b/gi, '6')
    n = n.replace(/\bseven\b/gi, '7')
    n = n.replace(/\beight\b/gi, '8')
    n = n.replace(/\bnine\b/gi, '9')
    return n.trim().replace(/\s+/g, ' ')
  }

  const normalisedQuery = normalize(query)
  const matches: { source: IPTVSource; channel: IPTVChannel }[] = []

  for (const source of sources) {
    // Try normalised exact match first
    let match = source.channels.find(ch => normalize(ch.name) === normalisedQuery)
    // Then containment
    if (!match) {
      match = source.channels.find(ch => {
        const cn = normalize(ch.name)
        return cn.includes(normalisedQuery) || normalisedQuery.includes(cn)
      })
    }
    // Last resort: raw lowercase
    if (!match) {
      const rawQuery = query.toLowerCase()
      match = source.channels.find(ch => ch.name.toLowerCase().includes(rawQuery))
    }
    if (match) {
      matches.push({ source, channel: match })
    }
  }

  return matches
}

// ─── Daily auto-import scheduler (01:00 local) ───────────────────────────────
let autoImportTimer: ReturnType<typeof setTimeout> | null = null

function msUntilNext(hour: number, minute = 0): number {
  const now = new Date()
  const next = new Date(now)
  next.setHours(hour, minute, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return next.getTime() - now.getTime()
}

/**
 * Run one auto-scrape pass: scrape Reddit for portals, verify, import, refresh M3U.
 * Scraped portals are merged with the MAD TITAN txt source (see doFetch).
 */
export async function runAutoScrape(): Promise<void> {
  try {
    const { iptvScraperService } = await import('./iptv-scraper.service')
    const added = await iptvScraperService.harvest(5)
    console.log(`[IPTV-M3U] Auto-scrape added ${added} portal(s)`)
    await getAllSources(true)
  } catch (err: any) {
    console.warn(`[IPTV-M3U] Auto-scrape failed: ${err.message}`)
  }
}

/**
 * Arm the 01:00 daily auto-scrape timer. Idempotent — call once at startup.
 */
export function scheduleAutoImport(): void {
  if (autoImportTimer) return
  const arm = () => {
    autoImportTimer = setTimeout(async () => {
      await runAutoScrape()
      arm()
    }, msUntilNext(1, 0))
  }
  arm()
}
