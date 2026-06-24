import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import https from 'https'

const TIZENTUBE_NPM_PACKAGE = '@foxreis/tizentube'
const NPM_REGISTRY_URL = `https://registry.npmjs.org/${TIZENTUBE_NPM_PACKAGE}`
const TIZENTUBE_DIR = () => path.join(app.getPath('userData'), 'tizentube')

function getScriptsDir() {
  return TIZENTUBE_DIR()
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'FynixHub/1.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchText(res.headers.location!).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        res.resume()
        return
      }
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve(data))
      res.on('error', reject)
    }).on('error', reject)
  })
}

function fetchBinary(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'FynixHub/1.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchBinary(res.headers.location!).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        res.resume()
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function getLatestVersion(): Promise<string> {
  const json = await fetchText(NPM_REGISTRY_URL)
  const registry = JSON.parse(json)
  const latest = registry['dist-tags']?.latest
  if (!latest) throw new Error('Could not determine latest TizenTube version')
  return latest
}

async function downloadPackage(version: string): Promise<void> {
  const dir = getScriptsDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const scope = TIZENTUBE_NPM_PACKAGE.split('/')[0]
  const name = TIZENTUBE_NPM_PACKAGE.split('/')[1]
  const tarballUrl = `https://registry.npmjs.org/${scope}%2F${name}/-/${name}-${version}.tgz`
  const tarPath = path.join(dir, 'package.tgz')

  const tarballData = await fetchBinary(tarballUrl)
  fs.writeFileSync(tarPath, tarballData)

  const { execSync } = require('child_process')
  execSync(`tar -xzf "${tarPath}" -C "${dir}"`, { stdio: 'pipe' })
  fs.unlinkSync(tarPath)

  const extractedDir = path.join(dir, 'package')
  if (fs.existsSync(extractedDir)) {
    const distDir = path.join(extractedDir, 'dist')
    if (fs.existsSync(distDir)) {
      const userScript = path.join(distDir, 'userScript.js')
      if (fs.existsSync(userScript)) {
        fs.copyFileSync(userScript, path.join(dir, 'userScript.js'))
      }
      const serviceScript = path.join(distDir, 'service.js')
      if (fs.existsSync(serviceScript)) {
        fs.copyFileSync(serviceScript, path.join(dir, 'service.js'))
      }
    }
    fs.rmSync(extractedDir, { recursive: true, force: true })
  }

  fs.writeFileSync(path.join(dir, 'version.json'), JSON.stringify({ version }, null, 2))
}

export const TizenTubeService = {
  async init() {
    const dir = getScriptsDir()
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const versionFile = path.join(dir, 'version.json')
    if (!fs.existsSync(versionFile) || !fs.existsSync(path.join(dir, 'userScript.js'))) {
      console.log('[TizenTubeService] No scripts found, downloading...')
      try {
        const version = await getLatestVersion()
        await downloadPackage(version)
        console.log(`[TizenTubeService] Downloaded v${version}`)
      } catch (err: any) {
        console.error('[TizenTubeService] Initial download failed:', err.message)
      }
    } else {
      console.log('[TizenTubeService] Scripts found on disk')
      this.checkForUpdates().catch(() => {})
    }
  },

  async checkForUpdates(): Promise<{ hasUpdate: boolean; currentVersion?: string; latestVersion?: string }> {
    const dir = getScriptsDir()
    const versionFile = path.join(dir, 'version.json')
    let currentVersion = '0.0.0'
    if (fs.existsSync(versionFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(versionFile, 'utf8'))
        currentVersion = data.version || '0.0.0'
      } catch {}
    }

    try {
      const latestVersion = await getLatestVersion()
      const hasUpdate = latestVersion !== currentVersion
      return { hasUpdate, currentVersion, latestVersion }
    } catch (err: any) {
      console.error('[TizenTubeService] Update check failed:', err.message)
      return { hasUpdate: false, currentVersion }
    }
  },

  async updateScripts(): Promise<{ success: boolean; version?: string; error?: string }> {
    try {
      const version = await getLatestVersion()
      await downloadPackage(version)
      console.log(`[TizenTubeService] Updated to v${version}`)
      return { success: true, version }
    } catch (err: any) {
      console.error('[TizenTubeService] Update failed:', err.message)
      return { success: false, error: err.message }
    }
  },

  getScripts(): string[] {
    const dir = getScriptsDir()
    const scripts: string[] = []

    const userScript = path.join(dir, 'userScript.js')
    if (fs.existsSync(userScript)) {
      scripts.push(fs.readFileSync(userScript, 'utf8'))
    }

    const serviceScript = path.join(dir, 'service.js')
    if (fs.existsSync(serviceScript)) {
      scripts.push(fs.readFileSync(serviceScript, 'utf8'))
    }

    return scripts
  },

  getVersion(): string | null {
    const dir = getScriptsDir()
    const versionFile = path.join(dir, 'version.json')
    if (fs.existsSync(versionFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(versionFile, 'utf8'))
        return data.version || null
      } catch {}
    }
    return null
  },
}
