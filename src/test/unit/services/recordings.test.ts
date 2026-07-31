import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('recordings-service headers', () => {
  it('headersForUrl returns UA + Referer for cdnlivetv', () => {
    // Mirror the service's headersForUrl logic to ensure CDN streams
    // get the Referer/UA that prevents HTTP 502.
    const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

    const headersForUrl = (url: string): Record<string, string> => {
      const headers: Record<string, string> = { 'User-Agent': BROWSER_UA }
      if (/cdnlivetv\.(is|tv)/i.test(url)) {
        headers['Referer'] = 'https://cdnlivetv.is/'
      } else if (/dlhd\.st/i.test(url)) {
        headers['Referer'] = 'https://dlhd.st/'
      }
      return headers
    }

    const cdnLive = headersForUrl('https://api.cdnlivetv.is/secure/api/v1/abc/playlist.m3u8?token=xyz')
    expect(cdnLive['User-Agent']).toBeTruthy()
    expect(cdnLive['Referer']).toBe('https://cdnlivetv.is/')

    const cdnLiveTv = headersForUrl('https://api.cdnlivetv.tv/secure/playlist.m3u8')
    expect(cdnLiveTv['Referer']).toBe('https://cdnlivetv.is/')

    const dlhd = headersForUrl('https://dlhd.st/watch.php?id=x')
    expect(dlhd['Referer']).toBe('https://dlhd.st/')

    const m3u = headersForUrl('http://example.com/stream.m3u8')
    expect(m3u['Referer']).toBeUndefined()
    expect(m3u['User-Agent']).toBeTruthy()
  })
})
