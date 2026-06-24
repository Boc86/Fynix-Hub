import { spawn, execSync, type ChildProcess } from 'child_process'
import * as http from 'http'
import * as path from 'path'
import * as fs from 'fs'

let server: http.Server | null = null
let ffmpegProcess: ChildProcess | null = null

function getFfmpegPath(): string {
  const bundled = path.join(process.resourcesPath, 'app', 'bin', 'ffmpeg')
  if (fs.existsSync(bundled)) return bundled
  return 'ffmpeg'
}

function probeVideoCodec(sourceUrl: string, ffmpegBin: string): string | null {
  try {
    const output = execSync(
      `"${ffmpegBin}" -i "${sourceUrl}" -hide_banner -loglevel info -f null -`,
      { encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    const match = output.match(/Video:\s*(\w+)/)
    return match ? match[1].toLowerCase() : null
  } catch (err: any) {
    const stderr = err.stderr || ''
    const match = stderr.match(/Video:\s*(\w+)/)
    return match ? match[1].toLowerCase() : null
  }
}

export function isAvailable(): boolean {
  try {
    const ffmpegBin = getFfmpegPath()
    execSync(`"${ffmpegBin}" -version`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export function startProxy(sourceUrl: string): Promise<{ proxyUrl: string }> {
  stopProxy()

  return new Promise((resolve, reject) => {
    const ffmpegBin = getFfmpegPath()

    const srv = http.createServer((req, res) => {
      if (ffmpegProcess) {
        ffmpegProcess.kill('SIGTERM')
        ffmpegProcess = null
      }

      const codec = probeVideoCodec(sourceUrl, ffmpegBin)
      const needsReencode = codec && !['h264', 'avc', 'vp8', 'vp9', 'av1'].includes(codec)

      console.log(`[Transcoder] Detected video codec: ${codec}, re-encode: ${needsReencode}`)

      const args: string[] = [
        '-i', sourceUrl,
        '-map', '0:v:0?',
        '-map', '0:a:0?',
      ]

      if (needsReencode) {
        args.push(
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-tune', 'zerolatency',
          '-crf', '23',
        )
      } else {
        args.push('-c:v', 'copy')
      }

      args.push(
        '-c:a', 'aac',
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov+delay_moov',
        '-loglevel', 'error',
        'pipe:1',
      )

      const ffmpeg = spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] })

      ffmpegProcess = ffmpeg

      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Transfer-Encoding': 'chunked',
        'Accept-Ranges': 'none',
        'Connection': 'close',
      })

      ffmpeg.stdout.pipe(res)

      req.on('close', () => {
        ffmpeg.kill('SIGTERM')
        ffmpegProcess = null
      })

      ffmpeg.stderr.on('data', (data: Buffer) => {
        console.error('[Transcoder] ffmpeg:', data.toString().trim())
      })

      ffmpeg.on('error', (err: Error) => {
        console.error('[Transcoder] ffmpeg spawn error:', err.message)
        ffmpegProcess = null
        if (!res.writableEnded) res.end()
      })

      ffmpeg.on('close', (code) => {
        console.log('[Transcoder] ffmpeg exited with code', code)
        ffmpegProcess = null
        if (!res.writableEnded) res.end()
      })
    })

    srv.on('error', (err) => {
      reject(err)
    })

    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      if (addr && typeof addr === 'object') {
        server = srv
        console.log('[Transcoder] HTTP proxy listening on port', addr.port)
        resolve({ proxyUrl: `http://127.0.0.1:${addr.port}/` })
      } else {
        reject(new Error('Failed to get proxy server address'))
      }
    })
  })
}

export function stopProxy(): void {
  if (ffmpegProcess) {
    ffmpegProcess.kill('SIGTERM')
    setTimeout(() => {
      if (ffmpegProcess && !ffmpegProcess.killed) ffmpegProcess.kill('SIGKILL')
    }, 2000)
    ffmpegProcess = null
  }
  if (server) {
    server.close()
    server = null
  }
}

export function isRunning(): boolean {
  return server !== null
}
