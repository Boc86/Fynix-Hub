import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'api_keys.db');

if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

// Use node:sqlite (native Node.js builtin, available in Electron's bundled Node.js)
// Fall back to better-sqlite3 if node:sqlite is unavailable
let Database;
try {
    const sqlite = await import('node:sqlite');
    Database = sqlite.DatabaseSync;
} catch {
    try {
        const bs3 = await import('better-sqlite3');
        Database = bs3.default;
    } catch {
        throw new Error('No SQLite module available — neither node:sqlite nor better-sqlite3 could be loaded');
    }
}

const db = new Database(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA busy_timeout = 5000;');

export async function ensureApiKeysTable() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS api_keys (
            key TEXT PRIMARY KEY,
            type TEXT NOT NULL DEFAULT 'standard',
            rpm INTEGER NOT NULL DEFAULT 100,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);
}

export async function fetchDisabledApiKeys() {
    return db.prepare(`
        SELECT key
        FROM api_keys
        WHERE active = 0
    `).all();
}

export async function fetchActiveApiKeys() {
    return db.prepare(`
        SELECT key, type, rpm
        FROM api_keys
        WHERE active = 1
    `).all();
}

export async function ensurePublicKey() {
    const existing = db.prepare(`
        SELECT key FROM api_keys WHERE key = 'public_api_key'
    `).get();

    if (!existing) {
        db.prepare(`
            INSERT INTO api_keys (key, type, rpm, active)
            VALUES ('public_api_key', 'public', 10, 1)
        `).run();
    }
}

export default db;
