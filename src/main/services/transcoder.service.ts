import { spawn, type ChildProcess } from 'child_process'
import * as http from 'http'

let server: http.Server | null = null
let ffmpegProcess: ChildProcess | null = null

export function isAvailable(): boolean {
  try {
    require('child_process').execSync('which ffmpeg', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export function startProxy(sourceUrl: string): Promise<{ proxyUrl: string }> {
  stopProxy()

  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      if (ffmpegProcess) {
        ffmpegProcess.kill('SIGTERM')
        ffmpegProcess = null
      }

      const ffmpeg = spawn('ffmpeg', [
        '-i', sourceUrl,
        '-map', '0:v:0?',
        '-map', '0:a:0?',
        '-c', 'copy',
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov',
        '-loglevel', 'error',
        'pipe:1',
      ], { stdio: ['ignore', 'pipe', 'pipe'] })

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
