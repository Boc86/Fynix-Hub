import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import { XMLParser } from 'fast-xml-parser'
import fs from 'fs'
import zlib from 'zlib'
import * as CacheService from './cache.service'

const EPG_BASE = 'https://epg.pw/xmltv'
const REFRESH_INTERVAL = 86400000
const DB_VERSION = 3

interface EPGChannel {
  id: string
  displayName: string
  icon: string
}

interface EPGProgramme {
  channelId: string
  start: number
  stop: number
  title: string
  description: string
  category: string
  episode: string
  image: string
}

export interface MappedChannel {
  epgChannelId: string
  liveTvChannelId: string
  displayName: string
  icon: string
  liveTvName: string
  liveTvLogo: string
  liveTvCountryCode: string
  liveTvCountryName: string
  liveTvCountryFlag: string
  liveTvPlayerUrl: string
}

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'epg-cache.db')
    const versionOk = (() => {
      try {
        const existing = new Database(dbPath)
        const v = existing.pragma('user_version', { simple: true }) as number
        existing.close()
        return v === DB_VERSION
      } catch { return false }
    })()
    if (!versionOk) {
      try { fs.unlinkSync(dbPath) } catch {}
    }
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = OFF')
    db.pragma(`user_version = ${DB_VERSION}`)
    db.exec(`
      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        icon TEXT,
        country_code TEXT
      );
      CREATE TABLE IF NOT EXISTS programmes (
        channel_id TEXT NOT NULL,
        start INTEGER NOT NULL,
        stop INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT,
        episode TEXT,
        image TEXT,
        PRIMARY KEY (channel_id, start)
      );
      CREATE INDEX IF NOT EXISTS idx_programmes_channel ON programmes(channel_id);
      CREATE INDEX IF NOT EXISTS idx_programmes_start ON programmes(start);
      CREATE INDEX IF NOT EXISTS idx_programmes_channel_start ON programmes(channel_id, start);
      CREATE TABLE IF NOT EXISTS channel_map (
        live_tv_id TEXT PRIMARY KEY,
        epg_channel_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `)
  }
  return db
}

function parseXmltvDate(dateStr: string): number {
  if (!dateStr) return 0
  const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?$/)
  if (!match) return 0
  const [, y, M, d, h, min, s, tz] = match
  const iso = `${y}-${M}-${d}T${h}:${min}:${s}${tz ? tz.slice(0, 3) + ':' + tz.slice(3) : 'Z'}`
  const date = new Date(iso)
  return isNaN(date.getTime()) ? 0 : Math.floor(date.getTime() / 1000)
}

export function normalizeChannelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(hd|sd|uhd|4k|fhd)\b/g, '')
    .replace(/\+\d+/g, '')
    .replace(/\b(fta|live|online|free|stream)\b/g, '')
    .replace(/[._\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function channelNameMatch(livetvName: string, epgName: string): boolean {
  const ltNorm = normalizeChannelName(livetvName)
  const epgNorm = normalizeChannelName(epgName)

  if (ltNorm === epgNorm) return true
  if (epgNorm.startsWith(ltNorm) || ltNorm.startsWith(epgNorm)) return true

  const ltTokens = new Set(ltNorm.split(' ').filter(Boolean))
  const epgTokens = epgNorm.split(' ').filter(Boolean)
  const overlap = epgTokens.filter(t => ltTokens.has(t)).length
  if (overlap >= Math.min(ltTokens.size, epgTokens.length) && overlap >= 2) return true

  return false
}

function extractText(val: any): string {
  if (!val) return ''
  if (typeof val === 'string') return val
  if (val['#text']) return val['#text']
  if (Array.isArray(val)) return extractText(val[0])
  return String(val)
}

async function fetchAndParseXmltv(countryCode: string): Promise<{ channels: any[], programmes: any[] }> {
  const url = `${EPG_BASE}/epg_${countryCode.toUpperCase()}.xml.gz`
  console.log(`[EPG] Fetching ${url}`)

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`EPG HTTP ${res.status} for ${countryCode}`)

  const buffer = Buffer.from(await res.arrayBuffer())
  const xml = zlib.gunzipSync(buffer).toString('utf-8')
  console.log(`[EPG] Parsed ${(xml.length / 1024 / 1024).toFixed(1)}MB for ${countryCode}`)

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['channel', 'programme'].includes(name),
  })
  const data = parser.parse(xml)
  const tv = data.tv || {}

  const channels: any[] = []
  const rawChannels = tv.channel || []
  for (const ch of rawChannels) {
    const id = ch['@_id'] || ''
    const name = ch['display-name'] || ch['display_name'] || ''
    const displayName = extractText(name)
    const iconNode = ch.icon
    const icon = iconNode?.['@_src'] || (typeof iconNode === 'string' ? iconNode : '')
    channels.push({ id, displayName, icon, countryCode })
  }

  const programmes: any[] = []
  const rawProgrammes = tv.programme || []
  for (const p of rawProgrammes) {
    const chId = p['@_channel'] || ''
    const start = parseXmltvDate(p['@_start'] || '')
    const stop = parseXmltvDate(p['@_stop'] || '')
    const title = extractText(p.title)
    const desc = extractText(p.desc)
    const cat = extractText(p.category)
    const ep = extractText(p['episode-num'])
    const iconNode = p.icon
    const img = iconNode?.['@_src'] || (typeof iconNode === 'string' ? iconNode : '')
    if (chId && start) {
      programmes.push({ chId, start, stop, title, desc, cat, ep, img })
    }
  }

  return { channels, programmes }
}

export async function refreshEpg(countryCodes?: string[]): Promise<void> {
  if (!countryCodes) {
    const stored = CacheService.getSetting<string[]>('selectedLiveTvCountries')
    countryCodes = (stored && stored.length > 0) ? stored : ['gb']
  }
  console.log('[EPG] Refreshing for countries:', countryCodes)

  const d = getDb()
  const insertChannel = d.prepare('INSERT OR REPLACE INTO channels (id, display_name, icon, country_code) VALUES (?, ?, ?, ?)')
  const insertProgramme = d.prepare('INSERT OR REPLACE INTO programmes (channel_id, start, stop, title, description, category, episode, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  const setMeta = d.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')

  const allChannels: { id: string; displayName: string; icon: string; countryCode: string }[] = []
  const allProgrammes: { chId: string; start: number; stop: number; title: string; desc: string; cat: string; ep: string; img: string }[] = []

  for (const cc of countryCodes) {
    try {
      const { channels, programmes } = await fetchAndParseXmltv(cc)
      allChannels.push(...channels)
      allProgrammes.push(...programmes)
    } catch (err: any) {
      console.warn(`[EPG] Failed to fetch ${cc}: ${err.message}`)
    }
  }

  const deleteProgrammesForChannels = d.prepare('DELETE FROM programmes WHERE channel_id = ?')
  const deleteChannelsByCountry = d.prepare('DELETE FROM channels WHERE country_code = ?')

  const tx = d.transaction(() => {
    for (const cc of countryCodes) {
      const ccChannels = d.prepare('SELECT id FROM channels WHERE country_code = ?').all(cc) as any[]
      for (const ch of ccChannels) {
        deleteProgrammesForChannels.run(ch.id)
      }
      deleteChannelsByCountry.run(cc)
    }

    for (const ch of allChannels) {
      insertChannel.run(ch.id, ch.displayName, ch.icon, ch.countryCode)
    }
    console.log(`[EPG] Inserted ${allChannels.length} channels`)

    let inserted = 0
    for (const p of allProgrammes) {
      insertProgramme.run(p.chId, p.start, p.stop, p.title, p.desc, p.cat, p.ep, p.img)
      inserted++
    }
    console.log(`[EPG] Inserted ${inserted} programmes`)

    setMeta.run('loaded_countries', JSON.stringify(countryCodes))
    setMeta.run('last_refresh', String(Date.now()))
  })
  tx()
}

export function buildChannelMap(liveTvChannels: { id: string; name: string; countryCode: string }[]): void {
  const d = getDb()
  const epgChannels = d.prepare('SELECT id, display_name, country_code FROM channels').all() as any[]

  const insert = d.prepare('INSERT OR REPLACE INTO channel_map (live_tv_id, epg_channel_id) VALUES (?, ?)')
  const clear = d.prepare('DELETE FROM channel_map')

  const tx = d.transaction(() => {
    clear.run()

    for (const ltCh of liveTvChannels) {
      const ltNorm = normalizeChannelName(ltCh.name)
      let bestMatch: { id: string; display_name: string } | null = null
      let bestScore = 0

      for (const epgCh of epgChannels) {
        const epgNorm = normalizeChannelName(epgCh.display_name)

        if (ltNorm === epgNorm) { bestMatch = epgCh; bestScore = 10; break }

        if (epgNorm.startsWith(ltNorm) || ltNorm.startsWith(epgNorm)) {
          const score = 8 - Math.abs(epgNorm.length - ltNorm.length)
          if (score > bestScore) { bestMatch = epgCh; bestScore = score }
        }

        if (channelNameMatch(ltCh.name, epgCh.display_name)) {
          const score = 5 - Math.abs(epgNorm.length - ltNorm.length)
          if (score > bestScore) { bestMatch = epgCh; bestScore = score }
        }
      }

      if (bestMatch && bestScore > 0) {
        insert.run(ltCh.id, bestMatch.id)
      }
    }
  })
  tx()
  const count = (d.prepare('SELECT COUNT(*) as c FROM channel_map').get() as any).c
  console.log(`[EPG] Mapped ${count}/${liveTvChannels.length} LiveTV channels to EPG`)
}

export function getMappedChannels(liveTvChannels: any[]): MappedChannel[] {
  buildChannelMap(liveTvChannels)

  const d = getDb()
  const mapping = d.prepare('SELECT live_tv_id, epg_channel_id FROM channel_map').all() as any[]
  const mapById = new Map(mapping.map((m: any) => [m.live_tv_id, m.epg_channel_id]))
  const epgById = new Map<string, any>()
  const allEpg = d.prepare('SELECT id, display_name, icon FROM channels').all() as any[]
  for (const ch of allEpg) epgById.set(ch.id, ch)

  const COUNTRY_NAMES: Record<string, string> = {
    us: "United States", gb: "United Kingdom", es: "Spain", fr: "France", de: "Germany",
    it: "Italy", pl: "Poland", au: "Australia", pt: "Portugal", ca: "Canada", br: "Brazil",
    mx: "Mexico", ar: "Argentina", in: "India", hk: "Hong Kong", my: "Malaysia", intl: "International",
    ae: "UAE", se: "Sweden", no: "Norway", dk: "Denmark", hr: "Croatia", rs: "Serbia",
    il: "Israel", hu: "Hungary", cz: "Czech Republic", ro: "Romania", bg: "Bulgaria",
    gr: "Greece", tr: "Turkey", za: "South Africa", cy: "Cyprus", si: "Slovenia",
    ie: "Ireland", nz: "New Zealand", pe: "Peru", dz: "Algeria", ru: "Russia",
    id: "Indonesia", nl: "Netherlands", int: "International",
  }

  function countryFlag(code: string): string {
    if (!code || code === 'intl' || code === 'int') return '\uD83C\uDF0D'
    const c = code.toUpperCase()
    if (c.length !== 2) return '\uD83C\uDF0D'
    return String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65) + String.fromCodePoint(0x1F1E6 + c.charCodeAt(1) - 65)
  }

  const result: MappedChannel[] = []
  for (const ltCh of liveTvChannels) {
    const epgId = mapById.get(ltCh.id)
    if (!epgId) continue
    const epgCh = epgById.get(epgId)
    if (!epgCh) continue
    result.push({
      epgChannelId: epgId,
      liveTvChannelId: ltCh.id,
      displayName: epgCh.display_name,
      icon: epgCh.icon || '',
      liveTvName: ltCh.name,
      liveTvLogo: ltCh.logoImage || '',
      liveTvCountryCode: ltCh.countryCode || 'intl',
      liveTvCountryName: COUNTRY_NAMES[ltCh.countryCode] || ltCh.countryCode?.toUpperCase() || 'Unknown',
      liveTvCountryFlag: countryFlag(ltCh.countryCode),
      liveTvPlayerUrl: ltCh.playerUrl,
    })
  }
  return result
}

export function getChannels(): EPGChannel[] {
  const d = getDb()
  const rows = d.prepare('SELECT id, display_name, icon FROM channels ORDER BY display_name').all() as any[]
  return rows.map(r => ({ id: r.id, displayName: r.display_name, icon: r.icon || '' }))
}

export function getNowNext(channelId: string): { now: EPGProgramme | null; next: EPGProgramme | null } {
  const d = getDb()
  const now = Math.floor(Date.now() / 1000)

  const current = d.prepare('SELECT * FROM programmes WHERE channel_id = ? AND start <= ? AND stop > ? ORDER BY start LIMIT 1').get(channelId, now, now) as any
  const following = d.prepare('SELECT * FROM programmes WHERE channel_id = ? AND start > ? ORDER BY start LIMIT 1').get(channelId, now) as any

  return {
    now: current ? rowToProgramme(current) : null,
    next: following ? rowToProgramme(following) : null,
  }
}

export function getSchedule(channelId: string, dateStr: string): EPGProgramme[] {
  const d = getDb()
  const dayStart = Math.floor(new Date(dateStr).getTime() / 1000)
  const dayEnd = dayStart + 86400

  const rows = d.prepare('SELECT * FROM programmes WHERE channel_id = ? AND start >= ? AND start < ? ORDER BY start').all(channelId, dayStart, dayEnd) as any[]
  return rows.map(rowToProgramme)
}

function rowToProgramme(r: any): EPGProgramme {
  return {
    channelId: r.channel_id,
    start: r.start,
    stop: r.stop,
    title: r.title,
    description: r.description || '',
    category: r.category || '',
    episode: r.episode || '',
    image: r.image || '',
  }
}

export function shouldRefresh(): boolean {
  const d = getDb()
  const row = d.prepare('SELECT COUNT(*) as count FROM programmes').get() as any
  if (row.count === 0) return true
  const badCh = d.prepare("SELECT COUNT(*) as count FROM channels WHERE display_name = '[object Object]'").get() as any
  const badPr = d.prepare("SELECT COUNT(*) as count FROM programmes WHERE title = '[object Object]'").get() as any
  if (badCh.count > 0 || badPr.count > 0) {
    console.log('[EPG] Detected stale data from old parser, re-fetching')
    d.exec('DELETE FROM programmes')
    d.exec('DELETE FROM channels')
    return true
  }
  const lastRefresh = CacheService.getSetting<number>('epgLastRefresh') || 0
  if (Date.now() - lastRefresh > REFRESH_INTERVAL) return true
  return false
}

export async function ensureEpgLoaded(): Promise<void> {
  if (shouldRefresh()) {
    try {
      await refreshEpg()
      CacheService.setSetting('epgLastRefresh', Date.now())
    } catch (err: any) {
      console.error('[EPG] Initial refresh failed:', err.message)
    }
  }
}
