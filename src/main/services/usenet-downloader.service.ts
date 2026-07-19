import * as path from 'path'
import * as http from 'http'
import * as https from 'https'
import * as NzbgetService from './nzbget.service'
import * as CacheService from './cache.service'

interface ActiveDownload {
  nzbId: number
  title: string
  nzbUrl: string
  completedDir?: string
}

const activeDownloads = new Map<string, ActiveDownload>()

export function loadConfig(): void {
  // Config is read live from CacheService in each call; nothing to init
}

export function isConfigured(): boolean {
  return NzbgetService.isConfigured()
}

export async function sendNzb(nzbUrl: string, title: string, sizeBytes?: number): Promise<{ id: string; name: string; status: string; progress: number; nzbUrl?: string; error?: string } | null> {
  if (!isConfigured()) return null

  const id = `usenet-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

  let nzbContent: string | undefined

  const maxSizeGb = CacheService.getSetting<number>('maxDownloadSize') || 0
  if (maxSizeGb > 0 || true) { // Always fetch the NZB to pass content directly to nzbget
    try {
      console.log(`[UDB] sendNzb: fetching NZB from ${nzbUrl}`)
      const fetched = await fetchNzbContent(nzbUrl)
      nzbContent = fetched.content
      console.log(`[UDB] sendNzb: fetched NZB content ${nzbContent.length} bytes, ${fetched.size} bytes estimated`)
      const effectiveSize = fetched.size || sizeBytes || 0
      if (maxSizeGb > 0 && effectiveSize > 0) {
        const sizeGb = effectiveSize / 1073741824
        if (sizeGb > maxSizeGb) {
          console.log(`[UDB] sendNzb: skipping "${title}" — ${sizeGb.toFixed(1)}GB exceeds ${maxSizeGb}GB limit`)
          return { id, name: title, status: 'failed', progress: 0, nzbUrl, error: `Exceeds ${maxSizeGb}GB download size limit` }
        }
      }
    } catch (fetchErr: any) {
      console.warn(`[UDB] sendNzb: failed to fetch NZB for "${title}": ${fetchErr?.message}`)
    }
  }

  try {
    const payload = nzbContent || nzbUrl
    console.log(`[UDB] sendNzb: appending to nzbget, url=${nzbUrl}, payloadType=${nzbContent ? 'content' : 'url'}, payloadLength=${payload.length}`)
    const nzbId = await NzbgetService.appendNzb(payload, title)
    console.log(`[UDB] sendNzb: appended "${title}" to nzbget, NZBID=${nzbId}`)

    activeDownloads.set(id, { nzbId, title, nzbUrl })

    return { id, name: title, status: 'downloading', progress: 0, nzbUrl }
  } catch (err: any) {
    console.error(`[UDB] sendNzb: exception: ${err?.message}`)
    // If content was rejected and we haven't tried URL, retry with URL
    if (nzbContent && err?.message?.includes('rejected append')) {
      console.log(`[UDB] sendNzb: retrying with URL instead of content`)
      try {
        const nzbId = await NzbgetService.appendNzb(nzbUrl, title)
        console.log(`[UDB] sendNzb: URL fallback succeeded, NZBID=${nzbId}`)
        activeDownloads.set(id, { nzbId, title, nzbUrl })
        return { id, name: title, status: 'downloading', progress: 0, nzbUrl }
      } catch (urlErr: any) {
        console.error(`[UDB] sendNzb: URL fallback also failed: ${urlErr?.message}`)
      }
    }
    activeDownloads.delete(id)
    return null
  }
}

async function fetchNzbContent(url: string): Promise<{ content: string; size: number }> {
  const parsedUrl = new URL(url)
  const client = parsedUrl.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const req = client.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return resolve(fetchNzbContent(res.headers.location))
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      let total = 0
      let fullContent = ''
      let parseBuf = ''
      res.setEncoding('utf-8')
      res.on('data', (chunk: string) => {
        fullContent += chunk
        if (fullContent.length > 10 * 1024 * 1024) {
          req.destroy()
          return reject(new Error('NZB exceeded 10MB scan limit'))
        }
        parseBuf += chunk
        let idx = 0
        while (true) {
          const start = parseBuf.indexOf('bytes="', idx)
          if (start === -1) break
          const end = parseBuf.indexOf('"', start + 7)
          if (end === -1) break
          const val = parseInt(parseBuf.substring(start + 7, end), 10)
          if (!isNaN(val)) total += val
          idx = end + 1
        }
        parseBuf = parseBuf.substring(idx)
      })
      res.on('end', () => resolve({ content: fullContent, size: total }))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout fetching NZB')) })
  })
}

export async function getDownloadStatus(id: string): Promise<{
  id: string; name: string; status: string; progress: number;
  size: number; downloaded: number; speed: number; eta: string;
  nzbUrl?: string; error?: string
} | null> {
  const active = activeDownloads.get(id)
  if (!active) return null

  try {
    const groups = await NzbgetService.listGroups()
    const match = groups.find(g => g.NZBID === active.nzbId)
    if (!match) {
      // Check history for completed
      const histItems = await NzbgetService.history()
      const histMatch = histItems.find(h => h.NZBID === active.nzbId)
      if (histMatch) {
        const status = histMatch.ParStatus === 'FAILURE' || histMatch.Status === 'FAILURE' ? 'failed' : 'completed'
        active.completedDir = histMatch.FinalDir || histMatch.DestDir
        return {
          id, name: active.title, status,
          progress: 100, size: histMatch.FileSizeMB * 1048576,
          downloaded: histMatch.FileSizeMB * 1048576,
          speed: 0, eta: '', nzbUrl: active.nzbUrl,
          error: status === 'failed' ? 'Download failed in nzbget' : undefined,
        }
      }
      // Not in groups or history — might have been deleted
      activeDownloads.delete(id)
      return null
    }

    const sizeMB = parseFloat(String(match.FileSizeMB)) || 0
    const downloadedMB = parseFloat(String(match.DownloadedSizeMB)) || 0
    const size = sizeMB * 1048576
    const downloaded = downloadedMB * 1048576
    const progress = sizeMB > 0 ? Math.min(100, (downloadedMB / sizeMB) * 100) : 0

    // Get speed from global status
    const globalStatus = await NzbgetService.getStatus()
    const speed = globalStatus.DownloadRate || 0

    const remaining = match.RemainingSizeMB * 1048576
    const etaStr = speed > 0 ? formatEta(remaining / speed) : ''

    const status = match.Status === 'DELETED' ? 'failed' as const
      : match.Status === 'QUEUED' ? 'downloading' as const
      : match.Status === 'DOWNLOADING' ? 'downloading' as const
      : progress >= 100 ? 'completed' as const
      : 'downloading' as const

    if (status === 'completed') {
      active.completedDir = match.DestDir || match.FinalDir
    }

    return { id, name: active.title, status, progress, size, downloaded, speed, eta: etaStr, nzbUrl: active.nzbUrl }
  } catch (err: any) {
    console.error(`[UDB] getDownloadStatus: ${err?.message}`)
    return { id, name: active.title, status: 'downloading', progress: 0, size: 0, downloaded: 0, speed: 0, eta: '', nzbUrl: active.nzbUrl }
  }
}

export async function getStreamUrl(id: string): Promise<string | null> {
  const active = activeDownloads.get(id)
  // The active entry can be cleared by the status-poller by the time a
  // completed download is replayed. Fall back to resolving the directory from
  // nzbget history by NZBID so completed downloads still resolve.
  const nzbId = active?.nzbId ?? Number(id)

  try {
    // Cached completed dir from getDownloadStatus
    if (active?.completedDir) {
      console.log(`[UDB] getStreamUrl checking completedDir="${active.completedDir}"`)
      const videoFile = await findVideoFile(active.completedDir)
      console.log(`[UDB] getStreamUrl completedDir result: ${videoFile || 'null'}`)
      if (videoFile) return `file://${videoFile}`
    }

    // Lookup NZB name and list of files for this NZB ID
    const nzbName = active?.title || ''  // used for fallback dir names

    // Get per-file info from nzbget (confirmed filenames, per-file destdirs)
    console.log(`[UDB] getStreamUrl calling listFiles for NZBID=${nzbId}`)
    const files = await NzbgetService.listFiles(nzbId)
    const confirmedFile = files.find((f: any) => f.FilenameConfirmed && f.Filename)
    console.log(`[UDB] getStreamUrl listFiles confirmed: ${confirmedFile ? `Filename="${confirmedFile.Filename}" DestDir="${confirmedFile.DestDir}"` : `none — raw files: ${JSON.stringify(files).slice(0, 300)}`}`)

    // Get nzbget config to find base DestDir/InterDir
    console.log(`[UDB] getStreamUrl calling getConfig`)
    const config = await NzbgetService.getConfig()
    const configDestDir = (config.find((c: any) => c.Name === 'DestDir')?.Value || '').replace(/\/+$/, '')
    const configInterDir = (config.find((c: any) => c.Name === 'InterDir')?.Value || '').replace(/\/+$/, '')
    console.log(`[UDB] getStreamUrl config: DestDir="${configDestDir}" InterDir="${configInterDir}"`)

    // Collect all directories to search
    const searchDirs: string[] = []

    // Active downloads (listgroups)
    console.log(`[UDB] getStreamUrl calling listGroups for NZBID=${nzbId}`)
    const groups = await NzbgetService.listGroups()
    const group = groups.find(g => g.NZBID === nzbId)
    console.log(`[UDB] getStreamUrl listGroups found group: ${group ? `DestDir="${group.DestDir}" FinalDir="${group.FinalDir}" NZBFilename="${group.NZBFilename}"` : 'null'}`)
    if (group) {
      const base = group.DestDir || group.FinalDir
      if (base) searchDirs.push(base)
      // DestDir with .#<digits> stripped (nzbget appends .#NgetID during download)
      const stripped = base.replace(/\.#\d+$/, '')
      if (stripped && stripped !== base) searchDirs.push(stripped)
      // DestDir/NZBName/ subdirectory
      if (group.NZBFilename) {
        const subdir = path.join(base, group.NZBFilename.replace(/\.nzb$/i, ''))
        if (subdir !== base) searchDirs.push(subdir)
        const subdirStripped = path.join(stripped, group.NZBFilename.replace(/\.nzb$/i, ''))
        if (subdirStripped !== stripped && subdirStripped !== subdir) searchDirs.push(subdirStripped)
      }
    }

    // Completed path from config (without intermedate .# suffix)
    const nzbSafeName = nzbName.replace(/[<>:"/\\|?*]/g, '_')
    if (configDestDir) {
      searchDirs.push(path.join(configDestDir, nzbSafeName))
    }
    if (configInterDir) {
      searchDirs.push(path.join(configInterDir, nzbSafeName))
    }

    // User-configured download directory (overrides RPC-reported paths)
    const customDir = CacheService.getSetting<string>('nzbgetDownloadDir') || ''
    console.log(`[UDB] getStreamUrl customDir="${customDir}"`)
    if (customDir) {
      const customDirClean = customDir.replace(/\/+$/, '')
      searchDirs.push(path.join(customDirClean, nzbSafeName))
      searchDirs.push(customDirClean)
      const customInterDir = customDirClean.replace(/\/completed\/?$/i, '/intermediate')
      if (customInterDir !== customDirClean) {
        searchDirs.push(path.join(customInterDir, nzbSafeName))
      }
    }

    // Also use per-file DestDir from listFiles if available
    if (confirmedFile && confirmedFile.DestDir) {
      searchDirs.push(confirmedFile.DestDir)
      // Stripped version too
      const strippedFile = confirmedFile.DestDir.replace(/\.#\d+$/, '')
      if (strippedFile !== confirmedFile.DestDir) searchDirs.push(strippedFile)
    }

    // History (completed) — last resort
    console.log(`[UDB] getStreamUrl checking history for NZBID=${nzbId}`)
    const histItems = await NzbgetService.history()
    const histMatch = histItems.find(h => h.NZBID === nzbId)
    console.log(`[UDB] getStreamUrl history match: ${histMatch ? `DestDir="${histMatch.DestDir}" FinalDir="${histMatch.FinalDir}"` : 'null'}`)
    if (histMatch) {
      const dir = histMatch.FinalDir || histMatch.DestDir
      if (dir) {
        searchDirs.push(dir)
        if (active) active.completedDir = dir
      }
    }

    // Deduplicate and try each directory
    const seen = new Set<string>()
    for (const dir of searchDirs) {
      if (!dir || seen.has(dir)) continue
      seen.add(dir)
      console.log(`[UDB] getStreamUrl searching dir="${dir}"`)
      const videoFile = await findVideoFile(dir)
      console.log(`[UDB] getStreamUrl dir result: ${videoFile || 'null'}`)
      if (videoFile) return `file://${videoFile}`
      // If listFiles told us a confirmed filename, also try exact match with .nzbget.tmp
      if (confirmedFile && confirmedFile.Filename) {
        const exactPath = path.join(dir, confirmedFile.Filename + '.nzbget.tmp')
        console.log(`[UDB] getStreamUrl trying exact tmp path="${exactPath}"`)
        try {
          const fs = await import('fs/promises')
          await fs.access(exactPath)
          console.log(`[UDB] getStreamUrl exact tmp found!`)
          return `file://${exactPath}`
        } catch {
          console.log(`[UDB] getStreamUrl exact tmp not found`)
        }
        const exactPathClean = path.join(dir, confirmedFile.Filename)
        console.log(`[UDB] getStreamUrl trying exact clean path="${exactPathClean}"`)
        try {
          const fs = await import('fs/promises')
          await fs.access(exactPathClean)
          console.log(`[UDB] getStreamUrl exact clean found!`)
          return `file://${exactPathClean}`
        } catch {
          console.log(`[UDB] getStreamUrl exact clean not found`)
        }
      }
    }

    return null
  } catch (err: any) {
    console.error(`[UDB] getStreamUrl error: ${err?.message}`)
    return null
  }
}

async function findVideoFile(dir: string): Promise<string | null> {
  const fs = await import('fs/promises')
  console.log(`[UDB] findVideoFile reading dir="${dir}"`)
  const entries = await fs.readdir(dir).catch((err) => {
    console.log(`[UDB] findVideoFile readdir failed: ${err?.message}`)
    return [] as string[]
  })
  console.log(`[UDB] findVideoFile entries: [${entries.join(', ')}]`)
  const videoFile = entries.find(e => /\.(mkv|mp4|avi|mov|wmv|flv|webm)(\.nzbget\.tmp)?$/i.test(e))
  console.log(`[UDB] findVideoFile matched: ${videoFile || 'none'}`)
  if (!videoFile) return null
  return path.join(dir, videoFile)
}

export async function listDownloads(): Promise<any[]> {
  try {
    const histItems = await NzbgetService.history()
    return histItems.map(h => ({
      id: String(h.NZBID),
      name: h.NZBNicename || h.NZBFilename,
      size: h.FileSizeMB * 1048576,
      status: h.ParStatus === 'FAILURE' ? 'failed' : 'completed',
      completedAt: '',
    }))
  } catch {
    return []
  }
}

// Recursively delete a download's files from disk. Only deletes a per-download
// subfolder, never the shared nzbget DestDir root, to avoid wiping other
// downloads. `nzbid` is the nzbget NZBID used to locate FinalDir/DestDir.
async function deleteDownloadDirectory(nzbid: number): Promise<void> {
  let dir: string | undefined
  try {
    // Prefer the per-download completed folder from history.
    const histItems = await NzbgetService.history()
    const hist = histItems.find(h => h.NZBID === nzbid)
    if (hist) dir = hist.FinalDir || hist.DestDir
    if (!dir) {
      const groups = await NzbgetService.listGroups()
      const g = groups.find(x => x.NZBID === nzbid)
      if (g) dir = g.FinalDir || g.DestDir
    }
  } catch { /* ignore */ }

  if (!dir) return

  // Safety: never delete the shared base DestDir (would remove all downloads).
  try {
    const config = await NzbgetService.getConfig()
    const baseDest = (config.find((c: any) => c.Name === 'DestDir')?.Value || '').replace(/\/+$/, '')
    const baseInter = (config.find((c: any) => c.Name === 'InterDir')?.Value || '').replace(/\/+$/, '')
    const dirClean = dir.replace(/\/+$/, '')
    if ((baseDest && dirClean === baseDest) || (baseInter && dirClean === baseInter)) return
  } catch { /* ignore */ }

  try {
    const fsPromises = await import('fs/promises')
    await fsPromises.rm(dir, { recursive: true, force: true })
    console.log(`[UDB] deleted download directory: ${dir}`)
  } catch (e: any) {
    console.warn(`[UDB] failed to delete directory ${dir}: ${e?.message}`)
  }
}

export async function removeDownload(id: string): Promise<boolean> {
  // id may be the internal active id OR an nzbget NZBID (from the cache list).
  const active = activeDownloads.get(id)
  const nzbId = active?.nzbId ?? Number(id)

  try {
    await NzbgetService.deleteNzb(nzbId).catch(() => {})
    await NzbgetService.historyDelete(nzbId).catch(() => {})
    await deleteDownloadDirectory(nzbId)
    activeDownloads.delete(id)
    return true
  } catch {
    return false
  }
}

export async function deleteUsenetByPath(filePath: string): Promise<boolean> {
  try {
    const fsPromises = await import('fs/promises')
    const dir = path.dirname(filePath.replace(/^file:\/\//, ''))

    // Find the nzbget history/group entry whose FinalDir/DestDir contains this
    // file, then delete the whole folder + the matching history entry.
    const candidates = [
      ...(await NzbgetService.listGroups()),
      ...(await NzbgetService.history()),
    ]
    const match = candidates.find((c: any) => {
      const base = (c.FinalDir || c.DestDir || '').replace(/\/+$/, '')
      return base && dir.startsWith(base)
    })

    if (match) {
      const nzbId = match.NZBID
      await NzbgetService.deleteNzb(nzbId).catch(() => {})
      await NzbgetService.historyDelete(nzbId).catch(() => {})
      await deleteDownloadDirectory(nzbId).catch(() => {})
      // also remove any active entry keyed by this NZBID
      for (const [k, v] of activeDownloads) {
        if (v.nzbId === nzbId) activeDownloads.delete(k)
      }
    } else {
      // No nzbget entry — just delete the folder on disk.
      await fsPromises.rm(dir, { recursive: true, force: true }).catch(() => {})
    }
    return true
  } catch (e: any) {
    console.warn(`[UDB] deleteUsenetByPath failed for ${filePath}: ${e?.message}`)
    return false
  }
}

export async function clearAllDownloads(): Promise<void> {
  try {
    const groups = await NzbgetService.listGroups()
    for (const g of groups) {
      await NzbgetService.deleteNzb(g.NZBID).catch(() => {})
    }
    const histItems = await NzbgetService.history()
    for (const h of histItems) {
      await NzbgetService.historyDelete(h.NZBID).catch(() => {})
      await deleteDownloadDirectory(h.NZBID).catch(() => {})
    }
  } catch { /* ignore */ }
}

export async function checkConnection(): Promise<{ connected: boolean; error?: string }> {
  return NzbgetService.checkConnection()
}

function fuzzyMatch(search: string, target: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[._\-\[\]() ]+/g, ' ').trim()
  const searchNorm = normalize(search)
  const targetNorm = normalize(target)
  if (targetNorm.includes(searchNorm)) return true

  // Token overlap: check if most search tokens appear in target
  const searchTokens = searchNorm.split(/\s+/).filter(Boolean)
  const targetTokens = new Set(targetNorm.split(/\s+/).filter(Boolean))
  if (searchTokens.length > 1) {
    const matchCount = searchTokens.filter(t => targetTokens.has(t)).length
    if (matchCount >= Math.min(searchTokens.length, 2)) return true
  }

  // Character subsequence (fuzzy): all chars of search appear in order
  let si = 0
  for (let ti = 0; ti < targetNorm.length && si < searchNorm.length; ti++) {
    if (targetNorm[ti] === searchNorm[si]) si++
  }
  return si >= searchNorm.length
}

// Extract an SxxExx (or x) token from a release name, returning {season,episode}.
function parseEpisodeToken(name: string): { season: number; episode: number } | null {
  const patterns = [
    /[ ._\[]s(\d{1,2})[ ._]?e(\d{1,3})/i,
    /[ ._\[](\d{1,2})x(\d{1,3})[ ._]/i,
    /[ ._](\d{1,2})(\d{2})[ ._]/, // e.g. " 0102 " -> S01E02
  ]
  for (const p of patterns) {
    const m = name.match(p)
    if (m) {
      const season = parseInt(m[1], 10)
      const episode = parseInt(m[2], 10)
      if (season >= 0 && season <= 99 && episode >= 0 && episode <= 999) return { season, episode }
    }
  }
  return null
}

export async function searchDownloadCache(query: string, opts?: { title?: string; year?: number; type?: 'movie' | 'tv'; season?: number; episode?: number }): Promise<any[]> {
  try {
    const histItems = await NzbgetService.history()
    const searchLower = (opts?.title || query || '').toLowerCase()
    if (!searchLower) return []

    const yearStr = opts?.year ? String(opts.year) : ''
    const wantSeason = opts?.type === 'tv' ? opts?.season : undefined
    const wantEpisode = opts?.type === 'tv' ? opts?.episode : undefined
    const candidates: any[] = []
    for (const h of histItems) {
      const name = h.NZBNicename || h.NZBFilename
      if (!name) continue
      if (!fuzzyMatch(searchLower, name)) continue

      // Year check if provided
      if (yearStr && !name.includes(yearStr)) continue

      const dir = h.FinalDir || h.DestDir
      if (!dir) continue
      const fs = await import('fs/promises')
      const pathMod = await import('path')
      const entries = await fs.readdir(dir).catch(() => [])
      const videoFile = entries.find(e => /\.(mkv|mp4|avi|mov|wmv|flv|webm)(\.nzbget\.tmp)?$/i.test(e))
      if (videoFile) {
        let episodeMatch = -1
        if (wantSeason != null && wantEpisode != null) {
          const tok = parseEpisodeToken(name)
          if (tok && tok.season === wantSeason && tok.episode === wantEpisode) episodeMatch = 1
          else if (tok && tok.season === wantSeason) episodeMatch = 0 // right season, wrong episode
        }
        candidates.push({
          name,
          streamUrl: `file://${pathMod.join(dir, videoFile)}`,
          size: h.FileSizeMB * 1048576,
          episodeScore: episodeMatch,
        })
      }
    }
    if (candidates.length === 0) return []
    // Prefer an exact SxxExx match; then same-season; then any title match.
    candidates.sort((a, b) => (b.episodeScore) - (a.episodeScore))
    return candidates
  } catch {
    return []
  }
}

export async function reloadConfig(): Promise<void> {
  // no-op: config is read live from CacheService
}

function formatEta(seconds: number): string {
  if (seconds <= 0) return ''
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

