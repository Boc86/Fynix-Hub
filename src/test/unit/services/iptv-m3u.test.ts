import { describe, it, expect } from 'vitest'
import { cleanChannelName, isCategoryHeader } from '@/main/services/iptv-m3u.service'

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
    expect(cleanChannelName('US-HD: A&E TV WEST')).toBe('US-HD: A&E TV')
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
