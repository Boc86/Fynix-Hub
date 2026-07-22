// @vitest-environment node
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

vi.mock('@/main/services/cache.service', () => ({
  default: {},
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}))

vi.mock('@/main/services/cache-helpers.service', () => ({
  withCache: vi.fn((_key: string, _ttl: number, fn: () => Promise<any>) => fn()),
  TTL: { DEBRID_CACHE: 120000 },
}))

import * as CacheService from '@/main/services/cache.service'
import * as DebridService from '@/main/services/debrid.service'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterAll(() => server.close())
afterEach(() => { server.resetHandlers(); vi.clearAllMocks() })

function setKeys(overrides: Record<string, string | null> = {}) {
  vi.mocked(CacheService.getSetting).mockImplementation((key: string) => overrides[key] ?? null)
  DebridService.loadKeys()
}

describe('DebridService configuration', () => {
  it('no services configured by default', () => {
    setKeys()
    expect(DebridService.isConfigured('real-debrid')).toBe(false)
    expect(DebridService.isConfigured('torbox')).toBe(false)
    expect(DebridService.isConfigured('premiumize')).toBe(false)
    expect(DebridService.isConfigured('alldebrid')).toBe(false)
    expect(DebridService.getPreferred()).toBeNull()
    expect(DebridService.getServices()).toEqual([])
  })

  it('isConfigured returns false for unknown service', () => {
    expect(DebridService.isConfigured('unknown')).toBe(false)
  })

  it('real-debrid configured via loadKeys', () => {
    setKeys({ realDebridApiKey: 'rd_key' })
    expect(DebridService.isConfigured('real-debrid')).toBe(true)
    expect(DebridService.getPreferred()).toBe('real-debrid')
    expect(DebridService.getServices()).toEqual(['real-debrid'])
  })

  it('torbox configured via loadKeys', () => {
    setKeys({ torboxApiKey: 'tb_key' })
    expect(DebridService.isConfigured('torbox')).toBe(true)
    expect(DebridService.getPreferred()).toBe('torbox')
  })

  it('premiumize configured via loadKeys', () => {
    setKeys({ premiumizeAccessToken: 'pm_key' })
    expect(DebridService.isConfigured('premiumize')).toBe(true)
  })

  it('alldebrid configured via loadKeys', () => {
    setKeys({ alldebridAccessToken: 'ad_key' })
    expect(DebridService.isConfigured('alldebrid')).toBe(true)
  })

  it('setRealDebridKey configures real-debrid', () => {
    DebridService.setRealDebridKey('manual_key')
    expect(DebridService.isConfigured('real-debrid')).toBe(true)
    DebridService.setRealDebridKey(null)
    expect(DebridService.isConfigured('real-debrid')).toBe(false)
  })

  it('setTorboxKey configures torbox', () => {
    DebridService.setTorboxKey('manual_key')
    expect(DebridService.isConfigured('torbox')).toBe(true)
    DebridService.setTorboxKey(null)
    expect(DebridService.isConfigured('torbox')).toBe(false)
  })

  it('getPreferred respects preferredDebrid setting', () => {
    setKeys({ preferredDebrid: 'torbox', torboxApiKey: 'tb', realDebridApiKey: 'rd' })
    expect(DebridService.getPreferred()).toBe('torbox')
  })

  it('getPreferred falls back to priority order when preferred not configured', () => {
    setKeys({ preferredDebrid: 'alldebrid', realDebridApiKey: 'rd' })
    expect(DebridService.getPreferred()).toBe('real-debrid')
  })

  it('getServices returns configured services in priority order', () => {
    DebridService.setRealDebridKey('rd')
    DebridService.setTorboxKey('tb')
    expect(DebridService.getServices()).toEqual(['real-debrid', 'torbox'])
  })

  it('getTorboxSettingsUrl returns correct URL', () => {
    expect(DebridService.getTorboxSettingsUrl()).toBe('https://torbox.app/settings')
  })
})

describe('DebridService TorBox API', () => {
  beforeEach(() => { DebridService.setTorboxKey('tb_test_key') })

  it('torboxGetDeviceCode returns device code data', async () => {
    server.use(http.get('**/user/auth/device/start', () => HttpResponse.json({
      success: true,
      data: { device_code: 'abc123', code: 'XYZ789', verification_url: 'https://torbox.app/link', interval: 5, expires_at: '2026-01-01T00:00:00Z' },
    })))
    const result = await DebridService.torboxGetDeviceCode()
    expect(result.device_code).toBe('abc123')
    expect(result.user_code).toBe('XYZ789')
    expect(result.interval).toBe(5)
  })

  it('torboxGetDeviceCode throws on failure', async () => {
    server.use(http.get('**/user/auth/device/start', () => HttpResponse.json({ success: false, detail: 'Service unavailable' })))
    await expect(DebridService.torboxGetDeviceCode()).rejects.toThrow('Service unavailable')
  })

  it('torboxPollForToken returns token on success', async () => {
    server.use(http.post('**/user/auth/device/token', () => HttpResponse.json({
      success: true, data: { api_token: 'tb_token_123' },
    })))
    const token = await DebridService.torboxPollForToken('abc123')
    expect(token).toBe('tb_token_123')
  })

  it('torboxPollForToken returns empty on DEVICE_CODE_NOT_USED', async () => {
    server.use(http.post('**/user/auth/device/token', () => HttpResponse.json({ error: 'DEVICE_CODE_NOT_USED' })))
    const token = await DebridService.torboxPollForToken('abc123')
    expect(token).toBe('')
  })

  it('torboxPollForToken throws on missing device code', async () => {
    await expect(DebridService.torboxPollForToken('')).rejects.toThrow('missing device code')
  })

  it('torboxCheckCached returns cached mapping', async () => {
    server.use(http.get('**/torrents/checkcached', () => HttpResponse.json({
      success: true, data: { 'HASH1': { cached: true }, 'hash2': null },
    })))
    const result = await DebridService.torboxCheckCached(['hash1', 'hash2'])
    expect(result['hash1']).toBe(true)
    expect(result['hash2']).toBe(false)
  })

  it('torboxCheckCached returns empty on HTTP error', async () => {
    server.use(http.get('**/torrents/checkcached', () => new HttpResponse(null, { status: 500 })))
    const result = await DebridService.torboxCheckCached(['hash1'])
    expect(result).toEqual({})
  })

  it('torboxCheckCached returns false for missing data on 200', async () => {
    server.use(http.get('**/torrents/checkcached', () => HttpResponse.json({ success: false })))
    const result = await DebridService.torboxCheckCached(['hash1'])
    expect(result['hash1']).toBe(false)
  })

  it('torboxCheckCached handles multiple chunks', async () => {
    const hashes = Array.from({ length: 30 }, (_, i) => `hash${i}`)
    server.use(http.get('**/torrents/checkcached', () => HttpResponse.json({
      success: true, data: { 'HASH0': {}, 'HASH15': {} },
    })))
    const result = await DebridService.torboxCheckCached(hashes)
    expect(result['hash0']).toBe(true)
    expect(result['hash15']).toBe(true)
    expect(result['hash5']).toBe(false)
  })
})

describe('DebridService AllDebrid API', () => {
  beforeEach(() => { setKeys({ alldebridAccessToken: 'ad_token' }) })

  it('alldebridGetDevicePin returns pin data', async () => {
    server.use(http.get('**/oauth/device/authorize', () => HttpResponse.json({
      status: 'success',
      data: { pin: '123456', user_code: 'ABCDEF', base_url: 'https://alldebrid.com', expires_in: 300, interval: 5, device_id: 'dev123' },
    })))
    const result = await DebridService.alldebridGetDevicePin()
    expect(result.pin).toBe('123456')
    expect(result.device_id).toBe('dev123')
  })

  it('alldebridGetDevicePin throws on error status', async () => {
    server.use(http.get('**/oauth/device/authorize', () => HttpResponse.json({
      status: 'error', error: 'rate_limited',
    })))
    await expect(DebridService.alldebridGetDevicePin()).rejects.toThrow('rate_limited')
  })

  it('alldebridPollForToken returns token on success', async () => {
    server.use(http.get('**/oauth/device/poll', () => HttpResponse.json({
      status: 'success', data: { token: 'ad_token_123', user: { username: 'test' } },
    })))
    const result = await DebridService.alldebridPollForToken('123456')
    expect(result?.token).toBe('ad_token_123')
  })

  it('alldebridPollForToken returns null on authorization_pending', async () => {
    server.use(http.get('**/oauth/device/poll', () => HttpResponse.json({
      status: 'error', error: 'authorization_pending',
    })))
    const result = await DebridService.alldebridPollForToken('123456')
    expect(result).toBeNull()
  })

  it('alldebridPollForToken returns null on 403', async () => {
    server.use(http.get('**/oauth/device/poll', () => new HttpResponse(null, { status: 403 })))
    const result = await DebridService.alldebridPollForToken('123456')
    expect(result).toBeNull()
  })

  it('alldebridPollForToken throws on expired PIN', async () => {
    server.use(http.get('**/oauth/device/poll', () => HttpResponse.json({
      status: 'error', error_code: 'EXPIRED_PIN',
    })))
    await expect(DebridService.alldebridPollForToken('123456')).rejects.toThrow('PIN expired')
  })

  it('alldebridCheckCached returns cached mapping', async () => {
    server.use(http.get('**/magnet/instant', () => HttpResponse.json({
      status: 'success',
      data: { magnets: [{ hash: 'hash1', instant: true }, { hash: 'hash2', instant: false }] },
    })))
    const result = await DebridService.alldebridCheckCached(['hash1', 'hash2'])
    expect(result['hash1']).toBe(true)
    expect(result['hash2']).toBe(false)
  })

  it('alldebridCheckCached returns empty on error', async () => {
    server.use(http.get('**/magnet/instant', () => HttpResponse.json({ status: 'error', error: 'not_logged_in' })))
    const result = await DebridService.alldebridCheckCached(['hash1'])
    expect(result).toEqual({})
  })
})

describe('DebridService Premiumize API', () => {
  beforeEach(() => { setKeys({ premiumizeAccessToken: 'pm_token' }) })

  it('premiumizeGetDeviceCode returns device code', async () => {
    server.use(http.post('**/token', () => HttpResponse.json({
      device_code: 'pm_dc', user_code: 'PM123', verification_uri: 'https://premiumize.com/verify', interval: 5, expires_in: 600,
    })))
    const result = await DebridService.premiumizeGetDeviceCode()
    expect(result.device_code).toBe('pm_dc')
    expect(result.user_code).toBe('PM123')
  })

  it('premiumizePollForToken returns token on success', async () => {
    server.use(http.post('**/token', () => HttpResponse.json({
      access_token: 'pm_at_123', token_type: 'bearer', scope: 'read write',
    })))
    const result = await DebridService.premiumizePollForToken('pm_dc')
    expect(result?.access_token).toBe('pm_at_123')
  })

  it('premiumizePollForToken returns null on 400', async () => {
    server.use(http.post('**/token', () => new HttpResponse(null, { status: 400 })))
    const result = await DebridService.premiumizePollForToken('pm_dc')
    expect(result).toBeNull()
  })

  it('premiumizeCheckCached returns cached mapping', async () => {
    server.use(http.get('**/cache/check', () => HttpResponse.json({ response: [true, false, true] })))
    const result = await DebridService.premiumizeCheckCached(['h1', 'h2', 'h3'])
    expect(result['h1']).toBe(true)
    expect(result['h2']).toBe(false)
    expect(result['h3']).toBe(true)
  })

  it('premiumizeCheckCached returns empty on error', async () => {
    server.use(http.get('**/cache/check', () => new HttpResponse(null, { status: 401 })))
    const result = await DebridService.premiumizeCheckCached(['h1'])
    expect(result).toEqual({})
  })
})

describe('DebridService Real-Debrid API', () => {
  beforeEach(() => { DebridService.setRealDebridKey('rd_test_key') })

  it('realDebridGetDeviceCode returns device code data', async () => {
    server.use(http.get('**/oauth/v2/device/code', () => HttpResponse.json({
      device_code: 'rd_dc', user_code: 'RD123', verification_url: 'https://real-debrid.com/device', interval: 5, expires_in: 300,
    })))
    const result = await DebridService.realDebridGetDeviceCode()
    expect(result.device_code).toBe('rd_dc')
    expect(result.user_code).toBe('RD123')
  })

  it('realDebridPollForCredentials returns empty on 401', async () => {
    server.use(http.get('**/oauth/v2/device/credentials', () => new HttpResponse(null, { status: 401 })))
    const result = await DebridService.realDebridPollForCredentials('dc123')
    expect(result).toBe('')
  })

  it('realDebridPollForCredentials returns empty when no client_secret', async () => {
    server.use(http.get('**/oauth/v2/device/credentials', () => HttpResponse.json({ client_id: 'cid' })))
    const result = await DebridService.realDebridPollForCredentials('dc123')
    expect(result).toBe('')
  })

  it('realDebridPollForCredentials returns token after credentials', async () => {
    server.use(
      http.get('**/oauth/v2/device/credentials', () => HttpResponse.json({ client_id: 'cid', client_secret: 'csec' })),
      http.post('**/oauth/v2/token', () => HttpResponse.json({ access_token: 'rd_token', refresh_token: 'rd_refresh' }))
    )
    const result = await DebridService.realDebridPollForCredentials('dc123')
    expect(result).toBe('rd_token')
    expect(CacheService.setSetting).toHaveBeenCalledWith('realDebridClientId', 'cid')
    expect(CacheService.setSetting).toHaveBeenCalledWith('realDebridClientSecret', 'csec')
    expect(CacheService.setSetting).toHaveBeenCalledWith('realDebridRefreshToken', 'rd_refresh')
  })

  it('realDebridCheckCached returns empty without key', async () => {
    DebridService.setRealDebridKey(null)
    const result = await DebridService.realDebridCheckCached(['hash1'])
    expect(result).toEqual({})
  })

  it('realDebridCheckCached returns empty for hashes without magnets', async () => {
    const result = await DebridService.realDebridCheckCached(['hash1'])
    expect(result['hash1']).toBe(false)
  })
})

describe('DebridService unified routing', () => {
  it('addAndWait throws when no service configured', async () => {
    setKeys()
    await expect(DebridService.addAndWait('magnet:?xt=urn:test')).rejects.toThrow('No debrid service configured')
  })

  it('checkBatchCached returns empty for empty hashes', async () => {
    expect(await DebridService.checkBatchCached([])).toEqual({})
  })

  it('checkBatchCached returns empty when no service configured', async () => {
    setKeys()
    expect(await DebridService.checkBatchCached(['hash1'])).toEqual({})
  })

  it('addAndWait routes to correct provider', async () => {
    DebridService.setTorboxKey('tb_key')
    server.use(
      http.post('**/torrents/createtorrent', () => HttpResponse.json({ success: true, data: { torrent_id: 123 } })),
      http.get('**/torrents/mytorrents', () => HttpResponse.json({ success: true, data: { download_present: true } })),
      http.post('**/torrents/requestdl', () => HttpResponse.json({ success: true, data: { download_url: 'https://dl.example.com/file' } })),
    )
    const url = await DebridService.torboxAddAndWait('magnet:?xt=urn:test')
    expect(url).toContain('dl.example.com')
  })
})

describe('DebridService checkAccountStatus', () => {
  it('returns not configured for unknown service', async () => {
    setKeys()
    const status = await DebridService.checkAccountStatus('unknown')
    expect(status.valid).toBe(false)
  })

  it('returns not configured when no key for real-debrid', async () => {
    setKeys()
    const status = await DebridService.checkAccountStatus('real-debrid')
    expect(status.valid).toBe(false)
    expect(status.error).toBe('Not configured')
  })

  it('returns valid for torbox with valid account', async () => {
    setKeys({ torboxApiKey: 'tb_key' })
    server.use(http.get('**/me', () => HttpResponse.json({
      success: true, data: { user: { plan: 'premium', expires_at: 1893456000 } },
    })))
    const status = await DebridService.checkAccountStatus('torbox')
    expect(status.valid).toBe(true)
    expect(status.expiry).toBe('2030-01-01')
  })

  it('returns valid for alldebrid with trial', async () => {
    setKeys({ alldebridAccessToken: 'ad_key' })
    server.use(http.get('**/user', () => HttpResponse.json({
      status: 'success', data: { user: { isTrial: true } },
    })))
    const status = await DebridService.checkAccountStatus('alldebrid')
    expect(status.valid).toBe(true)
    expect(status.expiry).toBe('Trial')
  })

  it('returns error on HTTP failure', async () => {
    setKeys({ torboxApiKey: 'bad_key' })
    server.use(http.get('**/me', () => new HttpResponse(null, { status: 401 })))
    const status = await DebridService.checkAccountStatus('torbox')
    expect(status.valid).toBe(false)
  })
})
