import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn, execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { getEncryptedSetting, setEncryptedSetting } from './cache.service'

// --- Paths ---

function getVylaSourceDir(): string {
  // Packaged app: extraResources are placed alongside the executable
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'vyla-api-source')
  }
  // Development: relative to the main process source dir
  // from vyla-service.ts → src/main/services → go up 3 levels to project root
  const sourceFile = import.meta.url
  const srcMainServicesDir = path.dirname(fileURLToPath(sourceFile))
  const projectRoot = path.resolve(srcMainServicesDir, '..', '..', '..')
  return path.join(projectRoot, 'vyla-api-source')
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
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, path.join(VYLA_DIR, file))
    }
  }

  // Install Vyla's npm deps on first run (only @vyla-entertainment/sdk + dotenv)
  if (!fs.existsSync(path.join(VYLA_DIR, 'node_modules'))) {
    console.log('[Vyla] Installing dependencies — first run only, may take a moment…')
    execSync('npm install', {
      cwd: VYLA_DIR,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' },
    })
    console.log('[Vyla] Dependencies installed')
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

  const apiKey = await provisionStandardKey()
  if (!apiKey) {
    console.error('[Vyla] Failed to provision API key')
    return false
  }

  setEncryptedSetting('vylaApiKey', apiKey)
  console.log('[Vyla] Standard API key provisioned')
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
  for (let port = startPort; port < startPort + 100; port++) {
    try {
      const s = require('net').createServer()
      s.bind({ port, host: '127.0.0.1' })
      s.close()
      return port
    } catch {
      // port in use, try next
    }
  }
  throw new Error('No available port found for Vyla server')
}

async function waitForHealth(baseUrl: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/health`, {
        headers: { 'Authorization': 'Bearer public_api_key' },
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
  const dbPath = path.join(DATA_DIR, 'api_keys.db')
  const ready = await waitForFile(dbPath, 10_000)
  if (!ready) {
    console.error('[Vyla] api_keys.db not created within 10s')
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

  // Verify the key works against /health
  try {
    const res = await fetch(`${vylaBaseUrl}/health`, {
      headers: { 'Authorization': `Bearer ${key}` },
    })
    if (!res.ok) {
      console.error(`[Vyla] Provisioned key failed health check: ${res.status}`)
      return null
    }
  } catch (err: any) {
    console.error('[Vyla] Health check with new key failed:', err?.message || err)
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
