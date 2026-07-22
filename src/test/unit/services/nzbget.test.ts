import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'

vi.mock('http', () => ({ request: vi.fn() }))
vi.mock('https', () => ({ request: vi.fn() }))
vi.mock('@/main/services/cache.service', () => ({
  default: {},
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}))

import * as http from 'http'
import * as CacheService from '@/main/services/cache.service'
import * as NzbgetService from '@/main/services/nzbget.service'

function mockOk(data: any) {
  return (options: any, cb: Function) => {
    const res = new PassThrough()
    process.nextTick(() => res.end(JSON.stringify({ jsonrpc: '2.0', result: data, id: 1 })))
    cb(res)
    const req = new EventEmitter() as any
    req.write = vi.fn()
    req.end = vi.fn()
    req.destroy = vi.fn()
    return req
  }
}

function mockRpcError(message: string) {
  return (options: any, cb: Function) => {
    const res = new PassThrough()
    process.nextTick(() => res.end(JSON.stringify({ jsonrpc: '2.0', error: { message }, id: 1 })))
    cb(res)
    const req = new EventEmitter() as any
    req.write = vi.fn()
    req.end = vi.fn()
    req.destroy = vi.fn()
    return req
  }
}

function mockConnectionError(message: string) {
  return (_options: any, _cb: Function) => {
    const req = new EventEmitter() as any
    req.write = vi.fn()
    req.end = vi.fn(() => process.nextTick(() => req.emit('error', new Error(message))))
    req.destroy = vi.fn()
    return req
  }
}

function setupConfig(host = 'localhost', port = '6789') {
  vi.mocked(CacheService.getSetting).mockImplementation((key: string) => {
    if (key === 'nzbgetHost') return host
    if (key === 'nzbgetPort') return port
    if (key === 'nzbgetUsername') return 'nzbget'
    if (key === 'nzbgetPassword') return 'tegbzn6789'
    return null
  })
}

describe('NzbgetService', () => {
  beforeEach(() => { vi.clearAllMocks() })

  describe('isConfigured', () => {
    it('returns true when host setting exists', () => {
      vi.mocked(CacheService.getSetting).mockImplementation((key: string) => key === 'nzbgetHost' ? '192.168.1.1' : null)
      expect(NzbgetService.isConfigured()).toBe(true)
    })
    it('returns false when host setting is missing', () => {
      vi.mocked(CacheService.getSetting).mockReturnValue(null)
      expect(NzbgetService.isConfigured()).toBe(false)
    })
  })

  describe('checkConnection', () => {
    it('returns connected on successful version', async () => {
      setupConfig()
      vi.mocked(http.request).mockImplementation(mockOk('21.1') as any)
      const r = await NzbgetService.checkConnection()
      expect(r.connected).toBe(true)
    })
    it('returns disconnected on network error', async () => {
      setupConfig('unreachable')
      vi.mocked(http.request).mockImplementation(mockConnectionError('ECONNREFUSED') as any)
      const r = await NzbgetService.checkConnection()
      expect(r.connected).toBe(false)
      expect(r.error).toContain('ECONNREFUSED')
    })
    it('returns disconnected on RPC error', async () => {
      setupConfig()
      vi.mocked(http.request).mockImplementation(mockRpcError('unauthorized') as any)
      const r = await NzbgetService.checkConnection()
      expect(r.connected).toBe(false)
      expect(r.error).toContain('unauthorized')
    })
  })

  describe('appendNzb', () => {
    it('returns NZB ID on success', async () => {
      setupConfig()
      vi.mocked(http.request).mockImplementation(mockOk(42) as any)
      const id = await NzbgetService.appendNzb('http://example.com/file.nzb', 'Test')
      expect(id).toBe(42)
    })
    it('throws on negative ID', async () => {
      setupConfig()
      vi.mocked(http.request).mockImplementation(mockOk(-1) as any)
      await expect(NzbgetService.appendNzb('<?xml test>', 'Test')).rejects.toThrow('NZBGet rejected append')
    })
    it('throws on RPC error', async () => {
      setupConfig()
      vi.mocked(http.request).mockImplementation(mockRpcError('disk full') as any)
      await expect(NzbgetService.appendNzb('http://url', 'T')).rejects.toThrow('disk full')
    })
  })

  describe('listGroups', () => {
    it('returns groups', async () => {
      setupConfig()
      vi.mocked(http.request).mockImplementation(mockOk([{ NZBID: 1, NZBFilename: 'a.nzb' }]) as any)
      const g = await NzbgetService.listGroups()
      expect(g).toHaveLength(1)
      expect(g[0].NZBID).toBe(1)
    })
    it('returns empty on null', async () => {
      setupConfig()
      vi.mocked(http.request).mockImplementation(mockOk(null) as any)
      expect(await NzbgetService.listGroups()).toEqual([])
    })
  })

  describe('history', () => {
    it('returns history entries', async () => {
      setupConfig()
      vi.mocked(http.request).mockImplementation(mockOk([{ NZBID: 1 }]) as any)
      expect(await NzbgetService.history()).toHaveLength(1)
    })
  })

  describe('getStatus', () => {
    it('returns status object', async () => {
      setupConfig()
      vi.mocked(http.request).mockImplementation(mockOk({ DownloadRate: 5000, ServerStandBy: false }) as any)
      const s = await NzbgetService.getStatus()
      expect(s.DownloadRate).toBe(5000)
      expect(s.ServerStandBy).toBe(false)
    })
  })

  describe('pauseDownload / resumeDownload', () => {
    it('sends pause command', async () => {
      setupConfig()
      vi.mocked(http.request).mockImplementation(mockOk(true) as any)
      await expect(NzbgetService.pauseDownload()).resolves.toBeUndefined()
    })
    it('sends resume command', async () => {
      setupConfig()
      vi.mocked(http.request).mockImplementation(mockOk(true) as any)
      await expect(NzbgetService.resumeDownload()).resolves.toBeUndefined()
    })
  })

  describe('historyDelete / deleteNzb', () => {
    it('sends HistoryDelete', async () => {
      setupConfig()
      vi.mocked(http.request).mockImplementation(mockOk(true) as any)
      await expect(NzbgetService.historyDelete(5)).resolves.toBeUndefined()
      expect(http.request).toHaveBeenCalled()
    })
    it('sends GroupDelete', async () => {
      setupConfig()
      vi.mocked(http.request).mockImplementation(mockOk(true) as any)
      await expect(NzbgetService.deleteNzb(5)).resolves.toBeUndefined()
    })
  })

  describe('listFiles / getConfig', () => {
    it('returns files', async () => {
      setupConfig()
      vi.mocked(http.request).mockImplementation(mockOk([{ Name: 'file1.nzb' }]) as any)
      const f = await NzbgetService.listFiles(1)
      expect(f).toHaveLength(1)
    })
    it('returns config', async () => {
      setupConfig()
      vi.mocked(http.request).mockImplementation(mockOk([{ Name: 'MainDir', Value: '/data' }]) as any)
      const c = await NzbgetService.getConfig()
      expect(c[0].Name).toBe('MainDir')
    })
  })
})
