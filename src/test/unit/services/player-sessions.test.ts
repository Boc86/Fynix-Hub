// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))
vi.mock('@/main/services/ffmpeg-remux.service', () => ({
  createSession: vi.fn(),
  getSessionError: vi.fn().mockReturnValue(null),
  getSessionInfo: vi.fn().mockReturnValue({ inputUrl: '', resumePosition: 0 }),
  probeDuration: vi.fn().mockReturnValue(123),
  probeChapters: vi.fn().mockReturnValue([]),
  probeAudioTracks: vi.fn().mockReturnValue([]),
  killSession: vi.fn(),
  clearAllSessions: vi.fn(),
}))
vi.mock('@/main/services/local-cache.service', () => ({
  createFileSession: vi.fn(),
  createProxySession: vi.fn(),
  removeFileSession: vi.fn(),
  removeProxySession: vi.fn(),
}))
vi.mock('@/main/services/okru-resolver', () => ({
  isOkruReplay: vi.fn().mockReturnValue(false),
  resolveOkruReplay: vi.fn(),
}))
vi.mock('@/main/services/dailymotion-resolver', () => ({
  isDailymotionUrl: vi.fn().mockReturnValue(false),
  resolveDailymotionUrl: vi.fn(),
}))

import * as FfmpegRemux from '@/main/services/ffmpeg-remux.service'
import * as LocalCache from '@/main/services/local-cache.service'
import {
  startPlayback,
  stopPlayback,
  switchAudioTrack,
  getChapters,
  getCurrentSessionId,
} from '@/main/services/player.service'

// Non-browser-playable URLs (not .m3u8/.mp4/...) → always take the FFmpeg
// remux path, which is the path that owns per-session resources + timers.
const REMUX_URL_1 = 'http://cdn.example.com/movie1.mkv'
const REMUX_URL_2 = 'http://cdn.example.com/movie2.mkv'
const STREAM_1 = 'http://localhost:9911/remux/remux-tv1/playlist.m3u8'
const STREAM_2 = 'http://localhost:9911/remux/remux-tv2/playlist.m3u8'
const CHAPTER_A = [{ title: 'Chapter A', startTime: 0, endTime: 60 }]
const CHAPTER_B = [{ title: 'Chapter B', startTime: 0, endTime: 90 }]

function stubRemuxSessions(sessionId1: string, streamUrl1: string, sessionId2: string, streamUrl2: string) {
  vi.mocked(FfmpegRemux.createSession)
    .mockReturnValueOnce({ sessionId: sessionId1, streamUrl: streamUrl1 })
    .mockReturnValueOnce({ sessionId: sessionId2, streamUrl: streamUrl2 })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// Every test must end with all sessions stopped so watchdog timers are cleared.
afterEach(async () => {
  await stopPlayback()
})

describe('player.service keyed playback sessions', () => {
  it('runs independent sessions per clientId and stops them independently', async () => {
    stubRemuxSessions('remux-tv1', STREAM_1, 'remux-tv2', STREAM_2)
    vi.mocked(FfmpegRemux.probeChapters)
      .mockReturnValueOnce(CHAPTER_A)
      .mockReturnValueOnce(CHAPTER_B)

    const r1 = await startPlayback(REMUX_URL_1, undefined, undefined, undefined, undefined, 'tv1')
    const r2 = await startPlayback(REMUX_URL_2, undefined, undefined, undefined, undefined, 'tv2')

    // Both sessions coexist — the second start must NOT tear down the first.
    expect(FfmpegRemux.createSession).toHaveBeenCalledTimes(2)
    expect(getCurrentSessionId('tv1')).toBe('remux-tv1')
    expect(getCurrentSessionId('tv2')).toBe('remux-tv2')
    expect(FfmpegRemux.killSession).not.toHaveBeenCalled()
    expect(r1.isRemux).toBe(true)
    expect(r2.isRemux).toBe(true)

    // Per-session metadata is kept apart.
    expect(getChapters('tv1')).toEqual(CHAPTER_A)
    expect(getChapters('tv2')).toEqual(CHAPTER_B)

    // Stopping tv1 tears down only tv1's remux; tv2 stays alive.
    await stopPlayback('tv1')
    expect(FfmpegRemux.killSession).toHaveBeenCalledTimes(1)
    expect(FfmpegRemux.killSession).toHaveBeenCalledWith('remux-tv1')
    expect(getCurrentSessionId('tv1')).toBeNull()
    expect(getChapters('tv1')).toEqual([])
    expect(getCurrentSessionId('tv2')).toBe('remux-tv2')
    expect(FfmpegRemux.clearAllSessions).not.toHaveBeenCalled()

    // No-arg stop kills everything (renderer player:stop compat).
    await stopPlayback()
    expect(FfmpegRemux.killSession).toHaveBeenCalledTimes(2)
    expect(FfmpegRemux.killSession).toHaveBeenLastCalledWith('remux-tv2')
    expect(getCurrentSessionId('tv2')).toBeNull()
    expect(FfmpegRemux.clearAllSessions).toHaveBeenCalledTimes(1)
    expect(LocalCache.removeProxySession).not.toHaveBeenCalled()
    expect(LocalCache.removeFileSession).not.toHaveBeenCalled()
  })

  it('switchAudioTrack restarts within the same client session, preserving resume position', async () => {
    stubRemuxSessions('remux-a', STREAM_1, 'remux-b', STREAM_2)
    vi.mocked(FfmpegRemux.getSessionInfo).mockReturnValue({ inputUrl: REMUX_URL_1, resumePosition: 0 })

    await startPlayback(REMUX_URL_1, 42, undefined, undefined, undefined, 'tv1')
    const newUrl = await switchAudioTrack(2, 'tv1')

    expect(newUrl).toBe(STREAM_2)
    // Old remux killed, restarted with the same clientId, resume position and
    // the requested audio index — and the session record was re-created.
    expect(FfmpegRemux.killSession).toHaveBeenCalledWith('remux-a')
    const restartCall = vi.mocked(FfmpegRemux.createSession).mock.calls[1]
    expect(restartCall[1]).toBe(42) // resumePosition carried across the switch
    expect(restartCall[3]).toBe(2) // audioTrackIndex
    expect(getCurrentSessionId('tv1')).toBe('remux-b')

    // Desktop session is untouched by tv1's audio switch.
    expect(getCurrentSessionId()).toBeNull()
  })

  it('defaults to the desktop session for existing callers', async () => {
    vi.mocked(FfmpegRemux.createSession).mockReturnValue({
      sessionId: 'remux-desktop',
      streamUrl: 'http://localhost:9911/remux/remux-desktop/playlist.m3u8',
    })

    await startPlayback(REMUX_URL_1)

    expect(getCurrentSessionId()).toBe('remux-desktop')
    expect(getCurrentSessionId('desktop')).toBe('remux-desktop')
    // Desktop stop with no args still clears the desktop session.
    await stopPlayback()
    expect(getCurrentSessionId()).toBeNull()
  })
})
