import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import zlib from 'zlib'

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fynix-epg-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir },
}))

vi.mock('@/main/services/cache.service', () => ({
  getSetting: vi.fn().mockImplementation((key: string) => {
    if (key === 'epgLastRefresh') return Date.now()
    return null
  }),
  setSetting: vi.fn(),
}))

import * as EpgService from '@/main/services/epg.service'

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="bbc1"><display-name>BBC One</display-name><icon src="https://example.com/bbc1.png"/></channel>
  <channel id="bbc2"><display-name>BBC Two</display-name></channel>
  <programme start="20260101120000 +0000" stop="20260101130000 +0000" channel="bbc1">
    <title>News at Noon</title>
    <desc>Midday news bulletin</desc>
    <category>News</category>
    <episode-num system="onscreen">S01E01</episode-num>
    <icon src="https://example.com/img1.png"/>
  </programme>
  <programme start="20260101130000 +0000" stop="20260101140000 +0000" channel="bbc1">
    <title>Afternoon Show</title>
    <desc>An afternoon programme</desc>
    <category>Entertainment</category>
  </programme>
  <programme start="20260101120000 +0000" stop="20260101130000 +0000" channel="bbc2">
    <title>Winterwatch</title>
    <desc>Nature documentary</desc>
    <category>Nature</category>
  </programme>
</tv>`

function gzipSync(text: string): Buffer {
  return zlib.gzipSync(Buffer.from(text, 'utf-8'))
}

function mockFetchXml(xml: string) {
  const gzipped = gzipSync(xml)
  const ab = gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength)
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: () => Promise.resolve(ab),
  })
}

function mockFetchFail(status: number) {
  global.fetch = vi.fn().mockResolvedValue({ ok: false, status })
}

describe('EPG Service', () => {
  beforeAll(async () => {
    mockFetchXml(SAMPLE_XML)
    await EpgService.refreshEpg(['gb'])
  })

  afterAll(() => {
    try { fs.unlinkSync(path.join(tempDir, 'epg-cache.db')) } catch {}
    try { fs.rmdirSync(tempDir) } catch {}
  })

  describe('refreshEpg', () => {
    it('populates channels and programmes', () => {
      const channels = EpgService.getChannels()
      expect(channels.length).toBeGreaterThanOrEqual(2)
      const ids = channels.map(c => c.id)
      expect(ids).toContain('bbc1')
      expect(ids).toContain('bbc2')
    })

    it('parses channel display names and icons', () => {
      const channels = EpgService.getChannels()
      const bbc1 = channels.find(c => c.id === 'bbc1')
      expect(bbc1?.displayName).toBe('BBC One')
      expect(bbc1?.icon).toBe('https://example.com/bbc1.png')
    })

    it('handles XML fetch failure', async () => {
      mockFetchFail(503)
      await expect(EpgService.refreshEpg(['gb'])).resolves.not.toThrow()
      mockFetchXml(SAMPLE_XML)
    })

    it('uses default country gb when none specified', async () => {
      mockFetchXml(SAMPLE_XML)
      await EpgService.refreshEpg()
    })
  })

  describe('getChannels', () => {
    it('returns channels sorted by display name', () => {
      const ch = EpgService.getChannels()
      expect(ch[0].displayName < ch[1].displayName).toBe(true)
    })
  })

  describe('getSchedule', () => {
    it('returns programmes for a specific day', () => {
      const progs = EpgService.getSchedule('bbc1', '2026-01-01')
      expect(progs).toHaveLength(2)
      expect(progs[0].title).toBe('News at Noon')
      expect(progs[1].title).toBe('Afternoon Show')
    })

    it('returns empty for wrong channel', () => {
      expect(EpgService.getSchedule('bbc99', '2026-01-01')).toEqual([])
    })

    it('returns empty for wrong date', () => {
      expect(EpgService.getSchedule('bbc1', '2025-06-15')).toEqual([])
    })

    it('returns correct programme fields', () => {
      const progs = EpgService.getSchedule('bbc1', '2026-01-01')
      expect(progs[0].channelId).toBe('bbc1')
      expect(progs[0].category).toBe('News')
      expect(progs[0].episode).toBe('S01E01')
      expect(progs[0].description).toBe('Midday news bulletin')
      expect(progs[0].image).toBe('https://example.com/img1.png')
      expect(progs[0].start).toBeGreaterThan(0)
      expect(progs[0].stop).toBeGreaterThan(progs[0].start)
    })

    it('handles programmes across different channels', () => {
      const progs = EpgService.getSchedule('bbc2', '2026-01-01')
      expect(progs).toHaveLength(1)
      expect(progs[0].title).toBe('Winterwatch')
    })
  })

  describe('getNowNext', () => {
    it('returns current programme during broadcast', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T12:30:00Z'))
      const r = EpgService.getNowNext('bbc1')
      expect(r.now?.title).toBe('News at Noon')
      vi.useRealTimers()
    })

    it('returns next programme', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T12:30:00Z'))
      const r = EpgService.getNowNext('bbc1')
      expect(r.next?.title).toBe('Afternoon Show')
      vi.useRealTimers()
    })

    it('returns null when nothing airing', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T06:00:00Z'))
      const r = EpgService.getNowNext('bbc1')
      expect(r.now).toBeNull()
      expect(r.next?.title).toBe('News at Noon')
      vi.useRealTimers()
    })

    it('returns null for unknown channel', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T12:30:00Z'))
      expect(EpgService.getNowNext('bbc99').now).toBeNull()
      vi.useRealTimers()
    })
  })

  describe('shouldRefresh', () => {
    it('returns false when data exists', () => {
      expect(EpgService.shouldRefresh()).toBe(false)
    })
  })

  describe('normalizeChannelName', () => {
    it('lowercases and trims', () => {
      expect(EpgService.normalizeChannelName('  BBC One  ')).toBe('bbc 1')
    })

    it('strips HD/SD/UHD', () => {
      expect(EpgService.normalizeChannelName('BBC One HD')).toBe('bbc 1')
      expect(EpgService.normalizeChannelName('ITV1 SD')).toBe('itv 1')
      expect(EpgService.normalizeChannelName('Channel 4 UHD')).toBe('channel 4')
    })

    it('strips +N suffixes', () => {
      expect(EpgService.normalizeChannelName('ITV1+1')).toBe('itv 1')
      expect(EpgService.normalizeChannelName('Channel 4+2')).toBe('channel 4')
    })

    it('strips FTA/live/online', () => {
      expect(EpgService.normalizeChannelName('BBC One Live')).toBe('bbc 1')
      expect(EpgService.normalizeChannelName('Sky FTA')).toBe('sky')
    })

    it('collapses whitespace and special chars', () => {
      expect(EpgService.normalizeChannelName('BBC___One')).toBe('bbc 1')
      expect(EpgService.normalizeChannelName('BBC-One')).toBe('bbc 1')
    })

    it('strips country prefixes', () => {
      expect(EpgService.normalizeChannelName('UK: BBC One')).toBe('bbc 1')
      expect(EpgService.normalizeChannelName('US|CNN')).toBe('cnn')
      expect(EpgService.normalizeChannelName('FR : TF1')).toBe('tf 1')
    })

    it('converts number words to digits', () => {
      expect(EpgService.normalizeChannelName('Channel Four')).toBe('channel 4')
      expect(EpgService.normalizeChannelName('BBC Two')).toBe('bbc 2')
    })

    it('splits letter-digit boundaries so BBC One matches BBC1', () => {
      expect(EpgService.normalizeChannelName('BBC1')).toBe('bbc 1')
      expect(EpgService.normalizeChannelName('C4')).toBe('c 4')
      expect(EpgService.normalizeChannelName('BBC One')).toBe('bbc 1')
    })

    it('drops parentheticals', () => {
      expect(EpgService.normalizeChannelName('Sky News (UK)')).toBe('sky news')
      expect(EpgService.normalizeChannelName('BBC One (HD)')).toBe('bbc 1')
    })
  })

  describe('channelNameMatch', () => {
    it('matches exact normalized names', () => {
      expect(EpgService.channelNameMatch('BBC One', 'BBC One')).toBe(true)
    })

    it('matches when EPG is prefix of LiveTV', () => {
      expect(EpgService.channelNameMatch('BBC One HD', 'BBC One')).toBe(true)
    })

    it('matches when LiveTV is prefix of EPG', () => {
      expect(EpgService.channelNameMatch('BBC', 'BBC One')).toBe(true)
    })

    it('matches by token overlap', () => {
      expect(EpgService.channelNameMatch('Sky Sports News', 'Sky Sports News HQ')).toBe(true)
    })

    it('does not match unrelated names', () => {
      expect(EpgService.channelNameMatch('BBC One', 'ITV1')).toBe(false)
    })

    it('does not match single-token partials', () => {
      expect(EpgService.channelNameMatch('Sky', 'ITV')).toBe(false)
    })
  })

  describe('buildChannelMap', () => {
    it('maps LiveTV channels to EPG channels by name', () => {
      const liveTvChannels = [
        { id: 'lt1', name: 'BBC One', countryCode: 'gb' },
        { id: 'lt2', name: 'BBC Two', countryCode: 'gb' },
      ]
      EpgService.buildChannelMap(liveTvChannels)

      const mapped = EpgService.getMappedChannels(liveTvChannels)
      expect(mapped.length).toBe(2)
      expect(mapped[0].liveTvChannelId).toBe('lt1')
      expect(mapped[0].epgChannelId).toBe('bbc1')
      expect(mapped[1].liveTvChannelId).toBe('lt2')
      expect(mapped[1].epgChannelId).toBe('bbc2')
    })

    it('skips channels with no EPG match', () => {
      const liveTvChannels = [
        { id: 'lt1', name: 'BBC One', countryCode: 'gb' },
        { id: 'lt3', name: 'Random Channel XYZ', countryCode: 'gb' },
      ]
      EpgService.buildChannelMap(liveTvChannels)

      const mapped = EpgService.getMappedChannels(liveTvChannels)
      expect(mapped.length).toBe(1)
      expect(mapped[0].liveTvChannelId).toBe('lt1')
    })

    it('matches with quality suffixes stripped', () => {
      const liveTvChannels = [
        { id: 'lt1', name: 'BBC One HD', countryCode: 'gb' },
      ]
      EpgService.buildChannelMap(liveTvChannels)

      const mapped = EpgService.getMappedChannels(liveTvChannels)
      expect(mapped.length).toBe(1)
      expect(mapped[0].epgChannelId).toBe('bbc1')
    })

    it('populates LiveTV metadata in mapped results', () => {
      const liveTvChannels = [
        { id: 'lt1', name: 'BBC One', countryCode: 'gb', logoImage: 'https://logo.png', playerUrl: 'https://play.url' },
      ]
      EpgService.buildChannelMap(liveTvChannels)

      const mapped = EpgService.getMappedChannels(liveTvChannels)
      expect(mapped[0].liveTvName).toBe('BBC One')
      expect(mapped[0].liveTvLogo).toBe('https://logo.png')
      expect(mapped[0].liveTvPlayerUrl).toBe('https://play.url')
      expect(mapped[0].liveTvCountryCode).toBe('gb')
      expect(mapped[0].displayName).toBe('BBC One')
    })

    it('returns empty for no channels', () => {
      EpgService.buildChannelMap([])
      const mapped = EpgService.getMappedChannels([])
      expect(mapped).toEqual([])
    })
  })
})
