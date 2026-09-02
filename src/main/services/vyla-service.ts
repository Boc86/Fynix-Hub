import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn, execSync } from 'child_process'
import { getEncryptedSetting, setEncryptedSetting } from './cache.service'

// --- Paths ---

function getVylaSourceDir(): string {
  // Packaged app: extraResources are placed alongside the executable
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'vyla-api-source')
  }
  // Development: Vite compiles to .vite/build/index.js, so __dirname = .vite/build/
  // project root is 2 levels up: .vite/build → .vite → fynix-hub/
  // from vyla-service.ts → src/main/services → go up 3 levels to project root
  return path.resolve(__dirname, '..', '..', 'vyla-api-source')
}

const VYLA_DIR = path.join(app.getPath('userData'), 'vyla-api')
const DATA_DIR = path.join(VYLA_DIR, 'data')

// --- State ---

let vylaProcess: ReturnType<typeof spawn> | null = null
let vylaPort = 0
export let vylaBaseUrl = ''

// --- File extraction ---

function ensureVylaFiles(): void {
  if (fs.existsSync(path.join(VYLA_DIR, 'server.js'))) return

  console.log('[Vyla] Extracting server files to', VYLA_DIR)
  fs.mkdirSync(VYLA_DIR, { recursive: true })
  fs.mkdirSync(DATA_DIR, { recursive: true })

  const sourceDir = getVylaSourceDir()
  if (!fs.existsSync(path.join(sourceDir, 'server.js'))) {
    throw new Error(
      `Vyla server source not found at ${sourceDir}. ` +
      `Ensure vyla-api-source/ is present in the app package or project root.`
    )
  }

  const files = fs.readdirSync(sourceDir)
  for (const file of files) {
    const src = path.join(sourceDir, file)
    const dest = path.join(VYLA_DIR, file)
    const stat = fs.statSync(src)
    if (stat.isDirectory()) {
      fs.cpSync(src, dest, { recursive: true })
    } else {
      fs.copyFileSync(src, dest)
    }
  }

  // Install Vyla's npm deps on first run if not already present
  // (normally shipped in-repo so npm install is only a fallback)
  if (!fs.existsSync(path.join(VYLA_DIR, 'node_modules'))) {
    console.log('[Vyla] Installing dependencies — first run only, may take a moment…')
    try {
      execSync('npm install', {
        cwd: VYLA_DIR,
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'production' },
      })
      console.log('[Vyla] Dependencies installed')
    } catch (err: any) {
      console.error('[Vyla] npm install failed — Vyla server may not start correctly:', err.message)
      throw err
    }
  }
}

// --- Token secret ---

function generateTokenSecret(): string {
  try {
    return execSync('openssl rand -hex 32', { encoding: 'utf-8' }).trim()
  } catch {
    const crypto = require('crypto')
    return crypto.randomBytes(32).toString('hex')
  }
}

// --- Public API ---

export function isVylaAvailable(): boolean {
  return !!vylaBaseUrl
}

export function getVylaBaseUrl(): string {
  return vylaBaseUrl
}

export async function startVyla(tmdbApiKey: string): Promise<boolean> {
  ensureVylaFiles()

  let tokenSecret = getEncryptedSetting('vylaTokenSecret')
  if (!tokenSecret) {
    tokenSecret = generateTokenSecret()
    setEncryptedSetting('vylaTokenSecret', tokenSecret)
  }

  // Provision the standard API key into the DB BEFORE starting the server,
  // so Vyla's initAuth() loads it from the database on startup.
  const apiKey = await provisionStandardKey()
  if (!apiKey) {
    console.error('[Vyla] Failed to provision API key before server start')
    return false
  }
  setEncryptedSetting('vylaApiKey', apiKey)
  console.log('[Vyla] Standard API key provisioned')

  vylaPort = findAvailablePort(7860)
  console.log(`[Vyla] Starting server on port ${vylaPort}`)
  vylaBaseUrl = `http://127.0.0.1:${vylaPort}`

  const env = {
    ...process.env,
    TOKEN_SECRET: tokenSecret,
    TMDB_API_KEY: tmdbApiKey || '',
    PORT: String(vylaPort),
    WORKER_COUNT: '1',
    ENABLE_DEBUG_ROUTE: 'false',
    PROXY_STREAMS: 'false',
    PROXY_URL: '',
    GA_MEASUREMENT_ID: '',
    GA_API_SECRET: '',
    BYPASS_AUTH: '',
  }

  vylaProcess = spawn('node', ['server.js'], {
    cwd: VYLA_DIR,
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
    detached: false,
  })

  vylaProcess.on('error', (err: any) => {
    console.error('[Vyla] Server process error:', err?.message || err)
  })

  vylaProcess.on('exit', (code, signal) => {
    console.log(`[Vyla] Server exited: code=${code} signal=${signal}`)
    if (vylaProcess) {
      vylaProcess = null
      vylaBaseUrl = ''
    }
  })

  const healthy = await waitForHealth(vylaBaseUrl, 30_000)
  if (!healthy) {
    console.error('[Vyla] Server failed to become healthy within 30s')
    return false
  }
  console.log('[Vyla] Server is healthy')

  return true
}

export function stopVyla(): void {
  if (vylaProcess) {
    vylaProcess.kill('SIGTERM')
    vylaProcess = null
  }
  vylaBaseUrl = ''
}

// --- Helpers ---

function findAvailablePort(startPort: number): number {
  const net = require('net')
  for (let port = startPort; port < startPort + 100; port++) {
    try {
      const server = net.createServer()
      server.unref()
      server.listen(port, '127.0.0.1')
      server.close()
      return port
    } catch {
      // port in use, try next
    }
  }
  throw new Error('[Vyla] No available port found in range 7860-7959')
}

async function waitForHealth(baseUrl: string, timeoutMs: number, apiKey?: string): Promise<boolean> {
  const start = Date.now()
  const authKey = apiKey || 'public_api_key'
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/health`, {
        headers: { 'Authorization': `Bearer ${authKey}` },
      })
      if (res.ok) return true
    } catch {
      // not ready yet
    }
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

async function provisionStandardKey(): Promise<string | null> {
  const { DatabaseSync } = require('node:sqlite')
  const dbPath = path.join(DATA_DIR, 'api_keys.db')
  const dbDir = path.dirname(dbPath)
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })

  // Check if a valid key already exists (persisted from a previous session)
  const existingKey = getEncryptedSetting('vylaApiKey')
  if (existingKey) {
    try {
      const db = new DatabaseSync(dbPath)
      const row = db.prepare('SELECT key FROM api_keys WHERE key = ? AND active = 1').get(existingKey)
      db.close()
      if (row) {
        console.log('[Vyla] Reusing previously provisioned key')
        return existingKey
      }
    } catch {
      // DB doesn't exist yet — fall through to create it
    }
  }

  // Create the database and api_keys table if not already present.
  let db: any
  try {
    db = new DatabaseSync(dbPath)
    db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        key TEXT PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'standard',
        rpm INTEGER NOT NULL DEFAULT 100,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    const existing = db.prepare(`SELECT key FROM api_keys WHERE key = 'public_api_key'`).get()
    if (!existing) {
      db.prepare(`INSERT INTO api_keys (key, type, rpm, active) VALUES ('public_api_key', 'public', 10, 1)`).run()
    }
    db.close()
  } catch (err: any) {
    console.error('[Vyla] Failed to initialize DB:', err?.message || err)
    if (db) db.close()
    return null
  }

  const label = `fynix-${Date.now().toString(36)}`
  const child = spawn('node', ['add-key.mjs', 'standard', '100', label], {
    cwd: VYLA_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const out = await new Promise<string>((resolve) => {
    let data = ''
    child.stdout?.on('data', (c: Buffer) => { data += c.toString() })
    child.stderr?.on('data', (c: Buffer) => { data += c.toString() })
    child.on('close', () => resolve(data.trim()))
    child.on('error', () => resolve(''))
  })

  if (child.exitCode !== 0 || !out) {
    console.error(`[Vyla] add-key.mjs failed: ${out}`)
    return null
  }

  // add-key.mjs prints:
  //   Key created:
  //   sk_<hex>
  const key = out.split('\n').find(l => l.startsWith('sk_')) || ''
  if (!key.startsWith('sk_')) {
    console.error(`[Vyla] Unexpected key format: ${out}`)
    return null
  }

  return key
}

function waitForFile(filePath: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now()
    function check() {
      if (Date.now() - start >= timeoutMs) return resolve(false)
      if (fs.existsSync(filePath)) return resolve(true)
      setTimeout(check, 100)
    }
    check()
  })
}
