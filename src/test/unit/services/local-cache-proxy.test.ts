// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import * as http from 'node:http'
import * as fs from 'node:fs'
import type { IncomingMessage, ServerResponse, IncomingHttpHeaders } from 'node:http'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))

import { init, destroy, createProxySession, getPort } from '@/main/services/local-cache.service'

// Upstream fixture: a live-style playlist with a relative segment URI (like the
// real cdnlivetv master), plus a binary segment. The proxy must rewrite the
// segment URI to a /proxy/<id>/<encoded-url> path and serve the bytes back.
const SEGMENT = Buffer.from([0x47, 0x00, 0x00, 0x01, 0x47, 0x1f, 0xff, 0x10]) // fake MPEG-TS
const PLAYLIST = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:10.000000,
/stream-segment/abc123?d=TOKEN1&token=TOKEN2
`

let upstream: http.Server
let upstreamUrl = ''

function waitForPort(): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setInterval(() => {
      if (getPort() > 0) { clearInterval(t); resolve() }
    }, 10)
    setTimeout(() => { clearInterval(t); reject(new Error('server never started')) }, 3000)
  })
}

function get(path: string, port: number, host = '127.0.0.1'): Promise<{ status: number; body: Buffer; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: host, port, path, method: 'GET', headers: { Connection: 'close' } }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks), headers: res.headers }))
    })
    req.on('error', reject)
    req.end()
  })
}

beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    if (req.url?.includes('/stream-segment/')) {
      res.writeHead(200, { 'Content-Type': 'video/mp2t', 'Content-Length': SEGMENT.length })
      res.end(SEGMENT)
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/x-mpegURL; charset=utf-8' })
    res.end(PLAYLIST)
  })
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const addr = upstream.address() as { port: number }
  upstreamUrl = `http://127.0.0.1:${addr.port}/secure/api/v1/abc/playlist.m3u8?token=x`
  init()
  await waitForPort()
})

afterAll(() => {
  destroy()
  upstream?.close()
  try { fs.rmSync('/tmp/torrent-cache', { recursive: true, force: true }) } catch {}
})

describe('LocalCache proxy (live-TV CDN playback)', () => {
  it('serves the playlist with segment URLs rewritten through the proxy', async () => {
    const { proxyUrl } = createProxySession(upstreamUrl)
    const u = new URL(proxyUrl)
    const { status, body } = await get(u.pathname, Number(u.port))
    expect(status).toBe(200)
    const text = body.toString('utf-8')
    expect(text).toContain('#EXTM3U')
    // Segment URI rewritten to the local proxy with the remote URL encoded
    expect(text).toContain(`/proxy/`)
    // The remote segment URL (root-relative /stream-segment/...?d=...&token=...)
    // must be resolved to absolute and fully encoded — including ? and &.
    expect(text).toContain('stream-segment%2Fabc123')
    expect(text).toContain('%3Fd%3DTOKEN1')
    expect(text).not.toContain('/stream-segment/')
  })

  it('serves segment bytes back through the rewritten proxy URL', async () => {
    const { proxyUrl } = createProxySession(upstreamUrl)
    const u = new URL(proxyUrl)
    const playlist = await get(u.pathname, Number(u.port))
    const text = playlist.body.toString('utf-8')
    const segUrl = text.split('\n').find((l) => l && !l.startsWith('#'))!
    expect(segUrl).toContain('/proxy/')
    const segPath = new URL(segUrl).pathname
    const { status, body, headers } = await get(segPath, Number(u.port))
    expect(status).toBe(200)
    expect(headers['content-type']).toBe('video/mp2t')
    expect(body.equals(SEGMENT)).toBe(true)
  })

  it('survives a client abort without ERR_HTTP_HEADERS_SENT (unhandled rejection)', async () => {
    // Upstream fixture responds instantly; make the abort happen between the
    // client disconnect and the async proxy write by hanging the upstream.
    const slow = http.createServer((_req, res) => {
      setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/x-mpegURL' }); res.end(PLAYLIST) }, 300)
    })
    await new Promise<void>((resolve) => slow.listen(0, '127.0.0.1', resolve))
    const slowPort = (slow.address() as { port: number }).port
    const { proxyUrl } = createProxySession(`http://127.0.0.1:${slowPort}/slow.m3u8`)
    const u = new URL(proxyUrl)

    // Fire the request, then destroy the socket immediately (simulates hls.js
    // aborting on retry/src-change). The proxy's fetch is still in flight.
    await new Promise<void>((resolve) => {
      const req = http.request({ hostname: u.hostname, port: Number(u.port), path: u.pathname, method: 'GET' }, () => {})
      req.on('error', () => {})
      req.end()
      setTimeout(() => { req.destroy(); resolve() }, 30)
    })
    // Wait for the in-flight fetch to resolve and the handler to attempt writes
    await new Promise((r) => setTimeout(r, 700))
    // Server must still work after the abort:
    const { status, body } = await get(u.pathname, Number(u.port))
    expect(status).toBe(200)
    expect(body.toString('utf-8')).toContain('#EXTM3U')
    slow.close()
  })
})
