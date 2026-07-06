import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import { XMLParser } from 'fast-xml-parser'
import fs from 'fs'

const EPG_URL = 'https://epg.pw/xmltv/epg_GB.xml'
const REFRESH_INTERVAL = 86400000
const DB_VERSION = 2

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

let db: Database.Database | null = null

function getDb(): Database.Database {
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
        icon TEXT
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
    `)
  }
  return db
}

function parseXmltvDate(dateStr: string): number {
  if (!dateStr) return 0
  // XMLTV format: YYYYMMDDHHMMSS +ZZZZ
  const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?$/)
  if (!match) return 0
  const [, y, M, d, h, min, s, tz] = match
  const iso = `${y}-${M}-${d}T${h}:${min}:${s}${tz ? tz.slice(0, 3) + ':' + tz.slice(3) : 'Z'}`
  const date = new Date(iso)
  return isNaN(date.getTime()) ? 0 : Math.floor(date.getTime() / 1000)
}

export async function refreshEpg(): Promise<void> {
  console.log('[EPG] Refreshing from', EPG_URL)
  const res = await fetch(EPG_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) throw new Error(`EPG HTTP ${res.status}`)
  const xml = await res.text()
  console.log('[EPG] Downloaded', (xml.length / 1024 / 1024).toFixed(1), 'MB')

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['channel', 'programme'].includes(name),
  })
  const data = parser.parse(xml)
  const tv = data.tv || {}
  const channelsRaw = tv.channel || []
  const programmesRaw = tv.programme || []

  function extractText(val: any): string {
    if (!val) return ''
    if (typeof val === 'string') return val
    if (val['#text']) return val['#text']
    if (Array.isArray(val)) return extractText(val[0])
    return String(val)
  }

  const d = getDb()
  const insertChannel = d.prepare('INSERT OR REPLACE INTO channels (id, display_name, icon) VALUES (?, ?, ?)')
  const insertProgramme = d.prepare('INSERT OR REPLACE INTO programmes (channel_id, start, stop, title, description, category, episode, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')

  const tx = d.transaction(() => {
    d.exec('DELETE FROM programmes')
    d.exec('DELETE FROM channels')

    for (const ch of channelsRaw) {
      const id = ch['@_id'] || ''
      const name = ch['display-name'] || ch['display_name'] || ''
      const displayName = extractText(name)
      const iconNode = ch.icon
      const icon = iconNode?.['@_src'] || (typeof iconNode === 'string' ? iconNode : '')
      insertChannel.run(id, displayName, icon)
    }
    console.log('[EPG] Inserted', channelsRaw.length, 'channels')

    let inserted = 0
    for (const p of programmesRaw) {
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
        insertProgramme.run(chId, start, stop, title, desc, cat, ep, img)
        inserted++
      }
    }
    console.log('[EPG] Inserted', inserted, 'programmes')
  })
  tx()
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
  // Force refresh if DB has bad data from old parser (fast-xml-parser objects stored as strings)
  const badCh = d.prepare("SELECT COUNT(*) as count FROM channels WHERE display_name = '[object Object]'").get() as any
  const badPr = d.prepare("SELECT COUNT(*) as count FROM programmes WHERE title = '[object Object]'").get() as any
  if (badCh.count > 0 || badPr.count > 0) {
    console.log('[EPG] Detected stale data from old parser, re-fetching')
    d.exec('DELETE FROM programmes')
    d.exec('DELETE FROM channels')
    return true
  }
  return false
}

export async function ensureEpgLoaded(): Promise<void> {
  if (shouldRefresh()) {
    try {
      await refreshEpg()
    } catch (err: any) {
      console.error('[EPG] Initial refresh failed:', err.message)
    }
  }
}
