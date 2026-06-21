import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'

let db: Database.Database | null = null

function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'fynix-cache.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    initSchema()
  }
  return db
}

function initSchema() {
  db!.exec(`
    CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS watch_history (
      tmdb_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      season INTEGER,
      episode INTEGER,
      progress REAL DEFAULT 0,
      watched_at TEXT,
      PRIMARY KEY (tmdb_id, media_type, season, episode)
    );
  `)
}

export function getCache(key: string): string | null {
  const row = getDb().prepare(
    'SELECT value FROM cache WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)'
  ).get(key, Date.now()) as { value: string } | undefined
  return row?.value ?? null
}

export function setCache(key: string, value: string, ttlMs?: number) {
  getDb().prepare(
    'INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)'
  ).run(key, value, ttlMs ? Date.now() + ttlMs : null)
}

export function getSetting<T>(key: string): T | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  if (!row) return null
  try { return JSON.parse(row.value) as T }
  catch { return row.value as unknown as T }
}

export function setSetting(key: string, value: unknown) {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value))
}

export function getAllSettings(): Record<string, unknown> {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const result: Record<string, unknown> = {}
  for (const row of rows) {
    try { result[row.key] = JSON.parse(row.value) }
    catch { result[row.key] = row.value }
  }
  return result
}

export function updateWatchProgress(tmdbId: number, mediaType: string, progress: number, season?: number, episode?: number) {
  getDb().prepare(`
    INSERT OR REPLACE INTO watch_history (tmdb_id, media_type, season, episode, progress, watched_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(tmdbId, mediaType, season ?? null, episode ?? null, progress, new Date().toISOString())
}

export function getWatchProgress(tmdbId: number, mediaType: string, season?: number, episode?: number): number | null {
  const row = getDb().prepare(
    'SELECT progress FROM watch_history WHERE tmdb_id = ? AND media_type = ? AND season IS ? AND episode IS ?'
  ).get(tmdbId, mediaType, season ?? null, episode ?? null) as { progress: number } | undefined
  return row?.progress ?? null
}

export function closeDb() {
  if (db) {
    db.close()
    db = null
  }
}
