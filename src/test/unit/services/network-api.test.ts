// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Save original fetch before any mocking
const originalFetch = globalThis.fetch.bind(globalThis)

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', getVersion: () => '2.1.10' },
}))
vi.mock('../../../main/services/cache.service', () => ({
  getSetting: vi.fn(() => undefined),
  setSetting: vi.fn(),
}))
vi.mock('../../../main/services/channel-merge.service', () => ({
  getMergedChannels: vi.fn(),
  searchMergedChannels: vi.fn(),
}))
vi.mock('../../../main/services/livetv-providers', () => ({
  getProvider: vi.fn(),
  extractUrlWithFallback: vi.fn(),
}))
vi.mock('../../../main/services/player.service', () => ({
  startPlayback: vi.fn(),
  stopPlayback: vi.fn(),
}))

import { init, destroy, setConfig, getStatus, clearAuthFailures, startIdleSweep, stopIdleSweep, rewritePlaylist } from '@/main/services/network-api.service'
import * as cache from '@/main/services/cache.service'
import * as channelMerge from '@/main/services/channel-merge.service'
import * as livetvProviders from '@/main/services/livetv-providers'
import * as playerService from '@/main/services/player.service'

const { getSetting } = vi.mocked(cache)
const { getMergedChannels, searchMergedChannels } = vi.mocked(channelMerge)
const { extractUrlWithFallback } = vi.mocked(livetvProviders)
const { startPlayback, stopPlayback } = vi.mocked(playerService)

const FIXTURE_CH = [
  { id: 'c1', name: 'BBC One', sources: ['cdnlive'], countryCode: 'gb' },
  { id: 'c2', name: 'Channel 4', sources: ['m3u'], countryCode: 'gb' },
  { id: 'c3', name: 'ESPN', sources: ['cdnlive'], countryCode: 'us' },
]

beforeEach(async () => {
  vi.clearAllMocks()
  getSetting.mockReturnValue(undefined)
  getMergedChannels.mockResolvedValue(FIXTURE_CH)
  searchMergedChannels.mockResolvedValue([])
  extractUrlWithFallback.mockResolvedValue({ hlsUrl: 'http://example.com/stream.m3u8' })
  startPlayback.mockResolvedValue({ streamUrl: 'http://127.0.0.1:9999/proxy/abc/', duration: null, chapters: [], audioTracks: [], isRemux: false })
  stopIdleSweep()
  await destroy()
})

afterEach(async () => {
  stopIdleSweep()
  await setConfig({ enabled: false, port: 0, username: '', password: '' })
  clearAuthFailures()
})

describe('lifecycle', () => {
  it('is stopped by default', () => {
    expect(getStatus().running).toBe(false)
  })

  it('starts when enabled and stops when disabled', async () => {
    await setConfig({ enabled: true, port: 0, username: 'u', password: 'p' })
    expect(getStatus().running).toBe(true)
    expect(getStatus().port).toBeGreaterThan(0)

    await setConfig({ enabled: false, port: 0, username: 'u', password: 'p' })
    expect(getStatus().running).toBe(false)
  })
})

describe('auth', () => {
  it('returns 401 without credentials', async () => {
    await setConfig({ enabled: true, port: 0, username: 'u', password: 'p' })
    const port = getStatus().port
    const res = await originalFetch(`http://127.0.0.1:${port}/api/verify`)
    expect(res.status).toBe(401)
  })

  it('returns 200 with valid Basic credentials', async () => {
    await setConfig({ enabled: true, port: 0, username: 'u', password: 'p' })
    const port = getStatus().port
    const res = await originalFetch(`http://127.0.0.1:${port}/api/verify`, {
      headers: { Authorization: 'Basic ' + Buffer.from('u:p').toString('base64') },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, user: 'u' })
  })

  it('returns 401 with wrong credentials', async () => {
    await setConfig({ enabled: true, port: 0, username: 'u', password: 'p' })
    const port = getStatus().port
    const res = await originalFetch(`http://127.0.0.1:${port}/api/verify`, {
      headers: { Authorization: 'Basic ' + Buffer.from('u:wrong').toString('base64') },
    })
    expect(res.status).toBe(401)
  })

  it('429 after repeated auth failures from same IP', async () => {
    await setConfig({ enabled: true, port: 0, username: 'u', password: 'p' })
    const port = getStatus().port
    let last = 0
    for (let i = 0; i < 12; i++) {
      const res = await originalFetch(`http://127.0.0.1:${port}/api/verify`, {
        headers: { Authorization: 'Basic ' + Buffer.from('u:wrong').toString('base64') },
      })
      last = res.status
    }
    expect(last).toBe(429)
  })
})

describe('/api/health', () => {
  it('returns app info without auth', async () => {
    await setConfig({ enabled: true, port: 0, username: 'u', password: 'p' })
    const port = getStatus().port
    const hRes = await originalFetch(`http://127.0.0.1:${port}/api/health`)
    expect(hRes.status).toBe(200)
    const body = await hRes.json()
    expect(body).toMatchObject({ ok: true, app: 'Fynix Hub', version: '2.1.10', apiVersion: 1 })
  })
})

describe('/api/channels', () => {
  it('paginates with default 500 limit', async () => {
    await setConfig({ enabled: true, port: 0, username: 'u', password: 'p' })
    const port = getStatus().port
    const res = await originalFetch(`http://127.0.0.1:${port}/api/channels`, {
      headers: { Authorization: 'Basic ' + Buffer.from('u:p').toString('base64') },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, total: 3, limit: 500, offset: 0 })
    expect(body.channels).toHaveLength(3)
  })

  it('search returns hits', async () => {
    await setConfig({ enabled: true, port: 0, username: 'u', password: 'p' })
    const port = getStatus().port
    searchMergedChannels.mockResolvedValue([FIXTURE_CH[0]])
    const res = await originalFetch(`http://127.0.0.1:${port}/api/channels/search?q=BBC`, {
      headers: { Authorization: 'Basic ' + Buffer.from('u:p').toString('base64') },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, channels: [{ name: 'BBC One' }] })
  })

  it('search returns 400 without q', async () => {
    await setConfig({ enabled: true, port: 0, username: 'u', password: 'p' })
    const port = getStatus().port
    const res = await originalFetch(`http://127.0.0.1:${port}/api/channels/search`, {
      headers: { Authorization: 'Basic ' + Buffer.from('u:p').toString('base64') },
    })
    expect(res.status).toBe(400)
  })
})

describe('rewritePlaylist', () => {
  it('rewrites relative URIs in playlist', () => {
    const playlist = '#EXTM3U\n#EXTINF:-1,BBC One\nhttp://example.com/stream.m3u8\nsegment1.ts\n'
    const result = rewritePlaylist(playlist, 'c1')
    expect(result).toContain('/api/stream/c1/p/')
    expect(result).toContain(encodeURIComponent('http://example.com/stream.m3u8'))
  })
})

describe('/api/stream', () => {
  const AUTH = 'Basic ' + Buffer.from('u:p').toString('base64')
  const HLS_PLAYLIST = '#EXTM3U\n#EXTINF:-1\nsegment1.ts\nsegment2.ts\n'

  beforeEach(async () => {
    await setConfig({ enabled: true, port: 0, username: 'u', password: 'p' })
    extractUrlWithFallback.mockResolvedValue({ hlsUrl: 'http://example.com/stream.m3u8' })
    startPlayback.mockResolvedValue({ streamUrl: 'http://127.0.0.1:9999/proxy/abc/', duration: null, chapters: [], audioTracks: [], isRemux: false })
  })

  afterEach(() => {
    stopIdleSweep()
  })

  it('returns 404 for unknown channel', async () => {
    const port = getStatus().port
    const res = await originalFetch(`http://127.0.0.1:${port}/api/stream/nonexistent/p/`, {
      headers: { Authorization: AUTH },
    })
    expect(res.status).toBe(404)
  })

  it('fetches and rewrites playlist for known channel', async () => {
    const port = getStatus().port
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === 'http://example.com/stream.m3u8' || url === 'http://127.0.0.1:9999/proxy/abc/') {
        return Promise.resolve({
          status: 200,
          headers: { get: (name: string) => name === 'content-type' ? 'application/vnd.apple.mpegurl' : '' },
          text: async () => HLS_PLAYLIST,
          arrayBuffer: async () => new ArrayBuffer(0),
        })
      }
      // Pass through to original fetch for server requests
      if (url.startsWith('http://127.0.0.1:')) {
        return originalFetch(url as any)
      }
      return Promise.resolve({
        status: 200,
        headers: { get: (name: string) => '' },
        arrayBuffer: async () => new ArrayBuffer(0),
      })
    })
    vi.stubGlobal('fetch', mockFetch)

    const res = await originalFetch(`http://127.0.0.1:${port}/api/stream/c1/p/`, {
      headers: { Authorization: AUTH },
    })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('/api/stream/c1/p/')
    expect(startPlayback).toHaveBeenCalled()
    expect(extractUrlWithFallback).toHaveBeenCalled()
  })

  it('passthrough segment when encoded path provided', async () => {
    const port = getStatus().port
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === 'http://example.com/stream.m3u8') {
        return Promise.resolve({
          headers: { get: (name: string) => name === 'content-type' ? 'application/vnd.apple.mpegurl' : '' },
          text: async () => HLS_PLAYLIST,
        })
      }
      // Pass through to original fetch for server requests
      if (url.startsWith('http://127.0.0.1:')) {
        return originalFetch(url as any)
      }
      return Promise.resolve({
        headers: { get: (name: string) => name === 'content-type' ? 'video/MP2T' : '' },
        arrayBuffer: async () => new ArrayBuffer(8),
        status: 200,
      })
    })
    vi.stubGlobal('fetch', mockFetch)

    // First request to create session
    await originalFetch(`http://127.0.0.1:${port}/api/stream/c1/p/`, {
      headers: { Authorization: AUTH },
    })

    // Second request with encoded segment URL
    const encoded = encodeURIComponent('http://example.com/segment.ts')
    const segRes = await originalFetch(`http://127.0.0.1:${port}/api/stream/c1/p/${encoded}`, {
      headers: { Authorization: AUTH },
    })
    expect(segRes.status).toBe(200)
    expect(segRes.headers.get('content-type')).toBe('video/MP2T')
  })

  it('reuse session on second request for same channel', async () => {
    const port = getStatus().port
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === 'http://example.com/stream.m3u8' || url === 'http://127.0.0.1:9999/proxy/abc/') {
        return Promise.resolve({
          status: 200,
          headers: { get: (name: string) => name === 'content-type' ? 'application/vnd.apple.mpegurl' : '' },
          text: async () => HLS_PLAYLIST,
        })
      }
      // Pass through to original fetch for server requests
      if (url.startsWith('http://127.0.0.1:')) {
        return originalFetch(url as any)
      }
      return Promise.resolve({
        status: 200,
        headers: { get: (name: string) => '' },
        arrayBuffer: async () => new ArrayBuffer(0),
      })
    })
    vi.stubGlobal('fetch', mockFetch)

    // First request
    await originalFetch(`http://127.0.0.1:${port}/api/stream/c1/p/`, {
      headers: { Authorization: AUTH },
    })
    const firstCallCount = startPlayback.mock.calls.length

    // Second request for same channel
    await originalFetch(`http://127.0.0.1:${port}/api/stream/c1/p/`, {
      headers: { Authorization: AUTH },
    })

    // startPlayback should only be called once (session reuse)
    expect(startPlayback).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})

describe('/api/stream/stop', () => {
  const AUTH = 'Basic ' + Buffer.from('u:p').toString('base64')
  const HLS_PLAYLIST = '#EXTM3U\n#EXTINF:-1\nsegment1.ts\n'

  beforeEach(async () => {
    await setConfig({ enabled: true, port: 0, username: 'u', password: 'p' })
    extractUrlWithFallback.mockResolvedValue({ hlsUrl: 'http://example.com/stream.m3u8' })
    startPlayback.mockResolvedValue({ streamUrl: 'http://127.0.0.1:9999/proxy/abc/', duration: null, chapters: [], audioTracks: [], isRemux: false })
    stopIdleSweep()
  })

  it('stops and removes session', async () => {
    const port = getStatus().port
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === 'http://example.com/stream.m3u8' || url === 'http://127.0.0.1:9999/proxy/abc/') {
        return Promise.resolve({
          status: 200,
          headers: { get: (name: string) => name === 'content-type' ? 'application/vnd.apple.mpegurl' : '' },
          text: async () => HLS_PLAYLIST,
        })
      }
      // Pass through to original fetch for server requests
      if (url.startsWith('http://127.0.0.1:')) {
        return originalFetch(url as any)
      }
      return Promise.resolve({
        status: 200,
        headers: { get: (name: string) => '' },
        arrayBuffer: async () => new ArrayBuffer(0),
      })
    })
    vi.stubGlobal('fetch', mockFetch)

    // Create session
    await originalFetch(`http://127.0.0.1:${port}/api/stream/c1/p/`, {
      headers: { Authorization: AUTH },
    })
    // Record that session was created
    const playbackCallCount = startPlayback.mock.calls.length

    // Stop it
    const stopRes = await originalFetch(`http://127.0.0.1:${port}/api/stream/stop`, {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId: 'c1' }),
    })
    expect(stopRes.status).toBe(200)
    const body = await stopRes.json()
    expect(body).toEqual({ ok: true })
    // stopPlayback must have been called for this session's clientId
    expect(stopPlayback).toHaveBeenCalledWith('net:c1')
  })

  it('returns 400 without channelId', async () => {
    const port = getStatus().port
    const res = await originalFetch(`http://127.0.0.1:${port}/api/stream/stop`, {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it('returns ok even if channel not found', async () => {
    const port = getStatus().port
    const res = await originalFetch(`http://127.0.0.1:${port}/api/stream/stop`, {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId: 'nonexistent' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
  })
})

describe('idle sweep', () => {
  const AUTH = 'Basic ' + Buffer.from('u:p').toString('base64')
  const HLS_PLAYLIST = '#EXTM3U\n#EXTINF:-1\nsegment1.ts\n'

  beforeEach(async () => {
    await setConfig({ enabled: true, port: 0, username: 'u', password: 'p' })
    extractUrlWithFallback.mockResolvedValue({ hlsUrl: 'http://example.com/stream.m3u8' })
    startPlayback.mockResolvedValue({ streamUrl: 'http://127.0.0.1:9999/proxy/abc/', duration: null, chapters: [], audioTracks: [], isRemux: false })
    stopIdleSweep()
  })

  afterEach(() => {
    stopIdleSweep()
  })

  it('starts sweep timer and does not kill fresh sessions', async () => {
    const port = getStatus().port
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === 'http://example.com/stream.m3u8' || url === 'http://127.0.0.1:9999/proxy/abc/') {
        return Promise.resolve({
          status: 200,
          headers: { get: (name: string) => name === 'content-type' ? 'application/vnd.apple.mpegurl' : '' },
          text: async () => HLS_PLAYLIST,
        })
      }
      // Pass through to original fetch for server requests
      if (url.startsWith('http://127.0.0.1:')) {
        return originalFetch(url as any)
      }
      return Promise.resolve({
        status: 200,
        headers: { get: (name: string) => '' },
        arrayBuffer: async () => new ArrayBuffer(0),
      })
    })
    vi.stubGlobal('fetch', mockFetch)

    // Create session
    await originalFetch(`http://127.0.0.1:${port}/api/stream/c1/p/`, {
      headers: { Authorization: AUTH },
    })
    expect(stopPlayback).not.toHaveBeenCalled()

    // Start sweep
    startIdleSweep()

    // Session should still exist (just created)
    expect(stopPlayback).not.toHaveBeenCalled()

    stopIdleSweep()
  })

  it('can start and stop idle sweep', async () => {
    expect(() => startIdleSweep()).not.toThrow()
    expect(() => stopIdleSweep()).not.toThrow()
  })
})
