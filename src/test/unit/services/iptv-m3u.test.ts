import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanChannelName, isCategoryHeader, parseM3U } from '@/main/services/iptv-m3u.service'

describe('cleanChannelName', () => {
  it('strips quality tokens (HD, FHD, UHD, SD, 4K)', () => {
    expect(cleanChannelName('BBC ONE HD')).toBe('BBC ONE')
    expect(cleanChannelName('BBC ONE FHD')).toBe('BBC ONE')
    expect(cleanChannelName('BBC ONE UHD')).toBe('BBC ONE')
    expect(cleanChannelName('BBC ONE SD')).toBe('BBC ONE')
    expect(cleanChannelName('BBC ONE 4K')).toBe('BBC ONE')
  })

  it('strips dash-prefixed quality tokens (-HD, -FHD, -SD, -UHD)', () => {
    expect(cleanChannelName('Movie-HD')).toBe('Movie')
    expect(cleanChannelName('Channel-FHD')).toBe('Channel')
    expect(cleanChannelName('A -UHD')).toBe('A')
    expect(cleanChannelName('X -SD')).toBe('X')
    expect(cleanChannelName('Movie -HD')).toBe('Movie')
    expect(cleanChannelName('Movie -  HD')).toBe('Movie')
  })

  it('strips FD 50fps / FD 25fps as one token', () => {
    expect(cleanChannelName('SKY SPORTS FD 50FPS')).toBe('SKY SPORTS')
    expect(cleanChannelName('BBC ONE FD 25FPS')).toBe('BBC ONE')
  })

  it('strips region suffixes EAST/WEST', () => {
    expect(cleanChannelName('AMC EAST')).toBe('AMC')
    expect(cleanChannelName('AMC WEST')).toBe('AMC')
    // Dash conversion also applies to the US-HD: prefix (prefix itself is
    // stripped separately at display time via displayName()).
    expect(cleanChannelName('US-HD: A&E TV WEST')).toBe('US HD: A&E TV')
  })

  it('strips BACKUP and BACKUP 2/3', () => {
    expect(cleanChannelName('NBA: NBA TV BACKUP')).toBe('NBA: NBA TV')
    expect(cleanChannelName('Ligue 1 -1 HD Backup')).toBe('Ligue 1 -1')
    expect(cleanChannelName('Channel HD BACKUP 2')).toBe('Channel')
  })

  it('handles combined suffixes', () => {
    expect(cleanChannelName('DAZN PREMIER 1 FHD')).toBe('DAZN PREMIER 1')
    expect(cleanChannelName('TR: TRT 1 HD')).toBe('TR: TRT 1')
  })

  it('leaves clean names unchanged', () => {
    expect(cleanChannelName('BBC One')).toBe('BBC One')
    expect(cleanChannelName('CNN')).toBe('CNN')
    expect(cleanChannelName('Sky News')).toBe('Sky News')
  })

  it('converts word-joining dashes to spaces', () => {
    expect(cleanChannelName('Nat-Geo')).toBe('Nat Geo')
    expect(cleanChannelName('Nat-Geo HD')).toBe('Nat Geo')
    expect(cleanChannelName('X-Files')).toBe('X Files')
    expect(cleanChannelName('Spider-Man')).toBe('Spider Man')
  })

  it('keeps hyphens when the name starts with a digit', () => {
    // Digit guard: titles like "24/7 The X-Files" must keep their hyphens.
    expect(cleanChannelName('24/7 The X-Files')).toBe('24/7 The X-Files')
    expect(cleanChannelName('24/7 Spider-Man')).toBe('24/7 Spider-Man')
  })

  it('returns empty string for empty input', () => {
    expect(cleanChannelName('')).toBe('')
  })
})

describe('isCategoryHeader', () => {
  it('detects dashes-words-dashes patterns', () => {
    expect(isCategoryHeader('- - - - - TURKIYE SPOR - - - - -')).toBe(true)
    expect(isCategoryHeader('- - - - - TURKIYE HABER - - - - -')).toBe(true)
  })

  it('detects equals-words-equals patterns', () => {
    expect(isCategoryHeader('=== IT SPORTS ===')).toBe(true)
    expect(isCategoryHeader('=== UK KIDS ===')).toBe(true)
    expect(isCategoryHeader('========= DAZN EVENT =========')).toBe(true)
    expect(isCategoryHeader('========= IT ITALY =========')).toBe(true)
  })

  it('detects pure punctuation', () => {
    expect(isCategoryHeader('---')).toBe(true)
    expect(isCategoryHeader('===')).toBe(true)
  })

  it('detects country-prefixed category headers', () => {
    // Country prefix + punctuation + words + punctuation
    expect(isCategoryHeader('UK: ----- MOVIES -----')).toBe(true)
    expect(isCategoryHeader('DE | ----- DE DOKU -----')).toBe(true)
    expect(isCategoryHeader('SP| ------ DOCUMENTALES ------')).toBe(true)
    expect(isCategoryHeader('UK: ----- SPORT -----')).toBe(true)
    expect(isCategoryHeader('HU: ----- HUNGARY -----')).toBe(true)
  })

  it('returns false for real channel names', () => {
    expect(isCategoryHeader('BBC ONE')).toBe(false)
    expect(isCategoryHeader('US-HD: ESPN HD')).toBe(false)
    expect(isCategoryHeader('-GALAVISION EAST')).toBe(false) // real channel with leading dash
  })
})

describe('isRealChannel', () => {
  it('is the inverse of isCategoryHeader for non-empty names', () => {
    expect('BBC ONE'.length > 0 && !isCategoryHeader('BBC ONE')).toBe(true)
    expect('=== SPORTS ==='.length > 0 && !isCategoryHeader('=== SPORTS ===')).toBe(false)
  })
})

describe('parseM3U', () => {
  it('captures tvg-logo from the #EXTINF line', () => {
    const channels = parseM3U(
      '#EXTM3U\n' +
      '#EXTINF:-1 tvg-logo="https://example.com/logo.png",BBC One\n' +
      'http://example.com/bbc1.m3u8\n'
    )
    expect(channels).toHaveLength(1)
    expect(channels[0].name).toBe('BBC One')
    expect(channels[0].url).toBe('http://example.com/bbc1.m3u8')
    expect(channels[0].logo).toBe('https://example.com/logo.png')
  })

  it('omits logo when the #EXTINF line has no tvg-logo attribute', () => {
    const channels = parseM3U(
      '#EXTM3U\n' +
      '#EXTINF:-1,BBC One\n' +
      'http://example.com/bbc1.m3u8\n'
    )
    expect(channels).toHaveLength(1)
    expect(channels[0].logo).toBeUndefined()
  })

  it('still filters category-header lines with a tvg-logo present', () => {
    const channels = parseM3U(
      '#EXTM3U\n' +
      '#EXTINF:-1 tvg-logo="https://example.com/header.png",===== SPORT =====\n' +
      'http://example.com/header.m3u8\n' +
      '#EXTINF:-1 tvg-logo="https://example.com/real.png",BBC ONE\n' +
      'http://example.com/bbc1.m3u8\n'
    )
    expect(channels).toHaveLength(1)
    expect(channels[0].name).toBe('BBC ONE')
    expect(channels[0].logo).toBe('https://example.com/real.png')
  })
})
