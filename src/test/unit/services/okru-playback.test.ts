// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import * as http from 'node:http'
import type { IncomingMessage, ServerResponse, IncomingHttpHeaders } from 'node:http'
import { Buffer } from 'buffer'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))

import { init, destroy, getPort } from '@/main/services/local-cache.service'
import {
  resolveAndCreateOkruProxy,
  handleOkruProxyRequest,
  destroyOkruProxySession,
  isOkruReplay,
} from '@/main/services/okru-playback'
import { isOkruReplay as resolverIsOkruReplay } from '@/main/services/okru-resolver'

const MASTER_PLAYLIST = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:10.000000,
/variant-segment/abc123?token=TOKEN1&expires=999
`
const VARIANT_PLAYLIST = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:5
#EXTINF:5.000000,
/segment-data/xyz789
`
const SEGMENT_BYTES = Buffer.from([0x47, 0x00, 0x00, 0x01, 0x47, 0x1f, 0xff, 0x10])

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

function get(path: string, port: number, host = '127.0.0.1'): Promise<{ status: number; body: Buffer; headers: IncomingHttpHeaders }> {
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
    const url = req.url || '/'
    if (url.includes('/variant-segment/')) {
      res.writeHead(200, { 'Content-Type': 'application/x-mpegURL; charset=utf-8' })
      res.end(VARIANT_PLAYLIST)
      return
    }
    if (url.includes('/segment-data/')) {
      res.writeHead(200, { 'Content-Type': 'video/mp2t', 'Content-Length': SEGMENT_BYTES.length })
      res.end(SEGMENT_BYTES)
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/x-mpegURL; charset=utf-8' })
    res.end(MASTER_PLAYLIST)
  })
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const addr = upstream.address() as { port: number }
  upstreamUrl = `http://127.0.0.1:${addr.port}/secure/api/v1/okru/playlist.m3u8?expires=123&token=abc`
  init()
  await waitForPort()
})

afterAll(() => {
  destroy()
  upstream?.close()
})

describe('OkruPlayback module (v2.0.6 reproduction)', () => {
  it('isOkruReplay matches resolver implementation', () => {
    expect(isOkruReplay('https://ok.ru/video/16060681816748')).toBe(true)
    expect(isOkruReplay('https://ok.ru/videoembed/16060681816748')).toBe(true)
    expect(isOkruReplay('https://vd1.okcdn.ru/video.m3u8?cmd=videoPlayerCdn')).toBe(false)
    expect(isOkruReplay('https://example.com/video.mp4')).toBe(false)
    expect(isOkruReplay('not a url')).toBe(false)
  })

  it('resolveAndCreateOkruProxy creates a proxy session with v2.0.6-style URL shape', async () => {
    const { proxyUrl, proxyId, destroy: sessionDestroy } = await resolveAndCreateOkruProxy(upstreamUrl, getPort(), upstreamUrl)
    expect(proxyUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/proxy\/[a-zA-Z0-9]+\/$/)
    expect(proxyId).toMatch(/^[a-zA-Z0-9]+$/)
    const { status, body } = await get(new URL(proxyUrl).pathname, getPort())
    expect(status).toBe(200)
    const text = body.toString('utf-8')
    expect(text).toContain('#EXTM3U')
    expect(text).toContain('/proxy/')
    expect(text).not.toContain('/variant-segment/')
    const segLine = text.split('\n').find((l) => l && !l.startsWith('#'))!
    expect(segLine).toContain('variant-segment%2Fabc123')
    expect(segLine).toContain('expires%3D123')
    expect(segLine).toContain('token%3Dabc')
    sessionDestroy()
  })

  it('handleOkruProxyRequest intercepts ok.ru sessions before the shared cache', async () => {
    const { proxyUrl, proxyId, destroy: sessionDestroy } = await resolveAndCreateOkruProxy(upstreamUrl, getPort(), upstreamUrl)
    const u = new URL(proxyUrl)
    const { status, body } = await get(u.pathname, getPort())
    expect(status).toBe(200)
    expect(body.toString('utf-8')).toContain('#EXTM3U')
    expect(body.toString('utf-8')).toContain('/proxy/')
    sessionDestroy()
  })

  it('destroyOkruProxySession cleans up the ok.ru-only session', async () => {
    const { proxyId } = await resolveAndCreateOkruProxy(upstreamUrl, getPort(), upstreamUrl)
    expect(destroyOkruProxySession(proxyId)).toBeUndefined()
    const fakeReq = { url: `/proxy/${proxyId}/`, method: 'GET' } as unknown as IncomingMessage
    const fakeRes = {
      writableEnded: false,
      writeHead: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
      setHeader: vi.fn(),
      headersSent: false,
      destroyed: false,
    } as unknown as ServerResponse
    const handled = handleOkruProxyRequest(fakeReq, fakeRes, getPort())
    expect(handled).toBe(false)
  })
})
