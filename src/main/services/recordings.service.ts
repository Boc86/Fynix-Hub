import { app } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import * as path from 'path'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Recording {
  id: string
  title: string
  channelName: string
  startTime: number  // epoch ms
  endTime: number    // epoch ms
  actualStartTime: number  // epoch ms (start - 5min)
  actualEndTime: number    // epoch ms (end + 5min)
  filePath: string
  status: 'scheduled' | 'recording' | 'completed' | 'failed'
  error?: string
  durationSec: number
  sizeBytes: number
  source: string
}

interface ScheduledRecording {
  id: string
  timeout: ReturnType<typeof setTimeout>
  ffmpeg?: ChildProcess
}

// ─── State ───────────────────────────────────────────────────────────────────

const recordings = new Map<string, Recording>()
const scheduled = new Map<string, ScheduledRecording>()

let recordingsFilePath = ''
let recordingsOutputDir = ''
let loaded = false

// ─── Helpers ─────────────────────────────────────────────────────────────────

function debug(...args: unknown[]) {
  console.log('[Recordings]', ...args)
}

function generateId(): string {
  return `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function getRecordingDir(id: string): string {
  return path.join(recordingsOutputDir, id)
}

// ─── Persistence ─────────────────────────────────────────────────────────────

async function loadRecordings(): Promise<void> {
  try {
    const fs = await import('fs/promises')
    const data = await fs.readFile(recordingsFilePath, 'utf-8')
    const arr: Recording[] = JSON.parse(data)
    recordings.clear()
    for (const r of arr) {
      recordings.set(r.id, r)
    }
    debug(`Loaded ${recordings.size} recordings from disk`)
  } catch {
    // File doesn't exist yet or is corrupt — start fresh
    recordings.clear()
    debug('No existing recordings file found, starting fresh')
  }
}

async function saveRecordings(): Promise<void> {
  try {
    const fs = await import('fs/promises')
    const arr = Array.from(recordings.values())
    await fs.writeFile(recordingsFilePath, JSON.stringify(arr, null, 2), 'utf-8')
  } catch (err: any) {
    console.error(`[Recordings] Failed to save recordings: ${err?.message}`)
  }
}

// ─── FFmpeg ──────────────────────────────────────────────────────────────────

function spawnFfmpeg(
  sourceUrl: string,
  outputDir: string,
  durationSec: number,
  id: string,
): ChildProcess {
  const outputPath = path.join(outputDir, `${id}.mkv`)

  const args = [
    '-hide_banner',
    '-loglevel', 'warning',
    '-y',
    '-i', sourceUrl,
    '-t', String(durationSec),
    '-c', 'copy',
    outputPath,
  ]

  debug(`Spawning FFmpeg: ffmpeg ${args.join(' ')}`)

  const proc = spawn('ffmpeg', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stderr = ''
  proc.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })

  proc.on('error', (err) => {
    debug(`FFmpeg error for ${id}: ${err.message}`)
  })

  proc.on('close', (code) => {
    const outPath = outputPath
    if (code === 0) {
      debug(`FFmpeg completed for ${id}, file: ${outPath}`)
      // Update status to completed
      const rec = recordings.get(id)
      if (rec) {
        rec.status = 'completed'
        rec.filePath = outPath
        updateFileSize(rec).catch(() => {})
        saveRecordings()
      }
    } else {
      debug(`FFmpeg failed for ${id} with code ${code}, stderr: ${stderr.slice(0, 500)}`)
      const rec = recordings.get(id)
      if (rec) {
        rec.status = 'failed'
        rec.error = `FFmpeg exited with code ${code}: ${stderr.slice(0, 200)}`
        saveRecordings()
      }
    }
    scheduled.get(id)?.ffmpeg?.removeAllListeners?.()
    scheduled.get(id)?.ffmpeg?.kill?.()
    scheduled.delete(id)
  })

  // Also update status to 'recording' once we get first data
  proc.stdout?.on('data', () => {
    const rec = recordings.get(id)
    if (rec && rec.status === 'scheduled') {
      rec.status = 'recording'
      rec.filePath = outputPath
      saveRecordings()
    }
  })

  return proc
}

async function updateFileSize(rec: Recording): Promise<void> {
  try {
    const fs = await import('fs/promises')
    const stat = await fs.stat(rec.filePath)
    rec.sizeBytes = stat.size
    saveRecordings()
  } catch {
    // ignore
  }
}

// ─── Scheduled Recording Runner ─────────────────────────────────────────────

async function startRecording(
  id: string,
  sourceUrls: string[],
  actualStartTime: number,
  actualEndTime: number,
): Promise<void> {
  const durationSec = Math.round((actualEndTime - actualStartTime) / 1000)
  const recDir = getRecordingDir(id)
  const fs = await import('fs/promises')

  // Ensure output directory exists
  await fs.mkdir(recDir, { recursive: true })

  let lastError: string | undefined
  let proc: ChildProcess | undefined

  for (const url of sourceUrls) {
    debug(`Trying source URL for recording ${id}: ${url.slice(0, 100)}`)

    const child = spawnFfmpeg(url, recDir, durationSec, id)

    proc = child

    // Update the scheduled entry with the ffmpeg process
    const entry = scheduled.get(id)
    if (entry) {
      entry.ffmpeg = child
    }

    // Wait for the process to finish
    const exitCode = await new Promise<number | null>((resolve) => {
      child.on('close', resolve)
      child.on('error', () => resolve(null))
    })

    if (exitCode === 0) {
      debug(`Recording ${id} succeeded with source: ${url.slice(0, 100)}`)
      const rec = recordings.get(id)
      if (rec) {
        rec.status = 'completed'
        rec.source = url
        updateFileSize(rec).catch(() => {})
        saveRecordings()
      }
      // Clean up timeout reference (remove it since recording completed)
      scheduled.delete(id)
      return
    }

    lastError = `FFmpeg exit code ${exitCode}`
    debug(`Source failed for ${id}, trying next...`)
  }

  // All sources failed
  debug(`All sources failed for recording ${id}`)
  const rec = recordings.get(id)
  if (rec) {
    rec.status = 'failed'
    rec.error = lastError || 'All sources failed'
    saveRecordings()
  }
  scheduled.delete(id)
}

// ─── Exported Functions ─────────────────────────────────────────────────────

export async function scheduleRecording(params: {
  title: string
  channelName: string
  startTime: number
  endTime: number
  sourceUrls: string[]
}): Promise<string> {
  const id = generateId()
  const actualStartTime = params.startTime - 300_000  // 5 min before
  const actualEndTime = params.endTime + 300_000      // 5 min after
  const durationSec = Math.round((actualEndTime - actualStartTime) / 1000)

  const recDir = getRecordingDir(id)
  const filePath = path.join(recDir, `${id}.mkv`)

  const recording: Recording = {
    id,
    title: params.title,
    channelName: params.channelName,
    startTime: params.startTime,
    endTime: params.endTime,
    actualStartTime,
    actualEndTime,
    filePath,
    status: 'scheduled',
    durationSec,
    sizeBytes: 0,
    source: '',
  }

  recordings.set(id, recording)
  await saveRecordings()

  // Calculate delay until actual start
  const now = Date.now()
  const delay = Math.max(0, actualStartTime - now)

  debug(`Scheduled recording "${params.title}" (${id}) in ${Math.round(delay / 1000)}s`)

  const timeout = setTimeout(async () => {
    debug(`Starting scheduled recording ${id} ("${params.title}")`)
    await startRecording(id, params.sourceUrls, actualStartTime, actualEndTime)
  }, delay)

  scheduled.set(id, { id, timeout })

  return id
}

export async function cancelRecording(id: string): Promise<void> {
  const sr = scheduled.get(id)
  if (sr) {
    clearTimeout(sr.timeout)
    if (sr.ffmpeg) {
      sr.ffmpeg.kill('SIGTERM')
      // Give it a moment to terminate gracefully, then SIGKILL
      setTimeout(() => {
        try { sr.ffmpeg?.kill('SIGKILL') } catch {}
      }, 5000)
    }
    scheduled.delete(id)
  }

  const rec = recordings.get(id)
  if (rec) {
    if (rec.status === 'scheduled' || rec.status === 'recording') {
      rec.status = 'failed'
      rec.error = 'Cancelled by user'
      await saveRecordings()
    }
  }
}

export async function deleteRecording(id: string): Promise<void> {
  // Cancel any running recording
  const sr = scheduled.get(id)
  if (sr) {
    clearTimeout(sr.timeout)
    if (sr.ffmpeg) {
      sr.ffmpeg.kill('SIGTERM')
      setTimeout(() => {
        try { sr.ffmpeg?.kill('SIGKILL') } catch {}
      }, 5000)
    }
    scheduled.delete(id)
  }

  // Delete the recording directory from disk
  const recDir = getRecordingDir(id)
  try {
    const fs = await import('fs/promises')
    await fs.rm(recDir, { recursive: true, force: true })
    debug(`Deleted recording directory: ${recDir}`)
  } catch (err: any) {
    debug(`Failed to delete recording directory ${recDir}: ${err?.message}`)
  }

  // Remove from in-memory state + persist
  recordings.delete(id)
  await saveRecordings()
}

export async function listRecordings(): Promise<Recording[]> {
  return Array.from(recordings.values()).sort((a, b) => b.startTime - a.startTime)
}

export async function init(): Promise<void> {
  if (loaded) return

  recordingsFilePath = path.join(app.getPath('userData'), 'recordings.json')
  recordingsOutputDir = path.join(app.getPath('userData'), 'recordings')

  // Create output directory
  try {
    const fs = await import('fs')
    fs.mkdirSync(recordingsOutputDir, { recursive: true })
  } catch (err: any) {
    console.error(`[Recordings] Failed to create output dir: ${err?.message}`)
  }

  // Load persisted recordings
  await loadRecordings()
  loaded = true

  // Reschedule any recordings that were 'scheduled' (they were pending when app closed)
  // Only reschedule those whose actualStartTime is still in the future
  const now = Date.now()
  for (const rec of recordings.values()) {
    if (rec.status === 'scheduled' && rec.actualStartTime > now) {
      const delay = rec.actualStartTime - now
      debug(`Rescheduling recording ${rec.id} ("${rec.title}") in ${Math.round(delay / 1000)}s`)
      const timeout = setTimeout(async () => {
        debug(`Starting rescheduled recording ${rec.id} ("${rec.title}")`)
        // Source URLs are not persisted — the caller will need to re-schedule
        // We mark it as failed since we don't have the source URLs on reload
        const r = recordings.get(rec.id)
        if (r) {
          r.status = 'failed'
          r.error = 'Source URLs not available after app restart - please re-schedule'
          await saveRecordings()
        }
        scheduled.delete(rec.id)
      }, delay)
      scheduled.set(rec.id, { id: rec.id, timeout })
    } else if (rec.status === 'scheduled' || rec.status === 'recording') {
      // Recording was in progress when app closed — mark as failed
      rec.status = 'failed'
      rec.error = 'App was closed during recording'
    }
  }
  await saveRecordings()
}
