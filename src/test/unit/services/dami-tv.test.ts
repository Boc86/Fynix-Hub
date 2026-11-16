import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/main/services/cache.service', () => ({
  getCache: vi.fn(() => null),
  setCache: vi.fn(),
  getSetting: vi.fn((key: string) => (key === 'liveTvUser' ? 'cdnlivetv' : key === 'liveTvPlan' ? 'free' : null)),
}))
vi.mock('@/main/services/tv-logo.service', () => ({ lookupLogo: vi.fn(() => '') }))

import { getChannels } from '@/main/services/dami-tv.service'

const CHANNELS_BODY = {
  total_channels: 2,
  channels: [
    { name: 'BBC One FHD UK', code: '', url: 'https://cdnlivetv.tv/api/v1/channels/player/?name=BBC%20One%20FHD%20UK', image: '', status: 'online', viewers: 0 },
    { name: 'ZDF FHD DE', code: '', url: 'https://cdnlivetv.tv/api/v1/channels/player/?name=ZDF%20FHD%20DE', image: '', status: 'online', viewers: 0 },
  ],
}

function okResponse() {
  return { ok: true, status: 200, json: async () => CHANNELS_BODY } as any
}

describe('dami-tv getChannels resilience', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('succeeds on first attempt and caches the result', async () => {
    fetchMock.mockResolvedValue(okResponse())
    const chs = await getChannels()
    expect(chs).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // country detected from the alpha-2 name suffix via the ISO table
    expect(chs[0].countryCode).toBe('gb')
    expect(chs[1].countryCode).toBe('de')
  })

  it('retries with a fresh connection when the first attempt hangs/fails', async () => {
    fetchMock
      .mockRejectedValueOnce(Object.assign(new Error('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }))
      .mockResolvedValueOnce(okResponse())
    const chs = await getChannels()
    expect(chs).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // both attempts hit the primary API host
    expect(fetchMock.mock.calls[0][0]).toContain('api.cdnlivetv.is')
    expect(fetchMock.mock.calls[1][0]).toContain('api.cdnlivetv.is')
  })

  it('falls back to the cdnlivetv.tv vhost when the primary host keeps failing', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('timeout 1'))
      .mockRejectedValueOnce(new Error('timeout 2'))
      .mockResolvedValueOnce(okResponse())
    const chs = await getChannels()
    expect(chs).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[2][0]).toContain('cdnlivetv.tv/api/v1')
  })

  it('fails soft with [] when every attempt fails (no throw)', async () => {
    fetchMock.mockRejectedValue(new Error('hang'))
    const chs = await getChannels()
    expect(chs).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(3) // 2x primary + 1x fallback
  })

  it('uses a 6s timeout per attempt so a hung connection cannot block startup', async () => {
    fetchMock.mockResolvedValue(okResponse())
    await getChannels()
    const signal = fetchMock.mock.calls[0][1].signal
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal.aborted).toBe(false)
  })
})
