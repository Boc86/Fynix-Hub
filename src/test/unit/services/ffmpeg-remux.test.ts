import { describe, it, expect } from 'vitest'
import { buildFFmpegArgs } from '@/main/services/ffmpeg-remux.service'

describe('buildFFmpegArgs (live chunk remux)', () => {
  const base = buildFFmpegArgs('http://example.com/stream.ts', '/tmp/out')

  it('adds aresample=async=1 (audio follows video clock — Kodi A/V sync model)', () => {
    expect(base).toContain('-af')
    const i = base.indexOf('-af')
    expect(base[i + 1]).toBe('aresample=async=1')
  })

  it('caps live http(s) remuxes at the 5-minute chunk boundary', () => {
    const live = buildFFmpegArgs('http://example.com/live.ts', '/tmp/out', [], false, 0, false, 300)
    expect(live).toContain('-t')
    expect(live[live.indexOf('-t') + 1]).toBe('300')
    // VOD/local inputs are NOT chunked
    const file = buildFFmpegArgs('file:///tmp/movie.mkv', '/tmp/out')
    expect(file).not.toContain('-t')
  })

  it('uses append_list on rotation respawns so the playlist keeps growing', () => {
    const respawn = buildFFmpegArgs('http://example.com/live.ts', '/tmp/out', [], false, 0, true, 300)
    const flags = respawn[respawn.indexOf('-hls_flags') + 1]
    expect(flags).toContain('append_list')
    expect(flags).toContain('independent_segments')
    expect(flags).toContain('omit_endlist')
  })

  it('writes MPEG-TS segments with muxdelay 0 (PTS continuity across rotations)', () => {
    const live = buildFFmpegArgs('http://example.com/live.ts', '/tmp/out', [], false, 0, false, 300)
    expect(live[live.indexOf('-hls_segment_filename') + 1]).toMatch(/segment%05d\.ts$/)
    expect(live).toContain('-muxdelay')
    expect(live[live.indexOf('-muxdelay') + 1]).toBe('0')
    expect(live).not.toContain('-hls_fmp4_init_filename')
  })

  it('applies -output_ts_offset only when a rotation offset is given', () => {
    const plain = buildFFmpegArgs('http://example.com/live.ts', '/tmp/out', [], false, 0, false, 300)
    expect(plain).not.toContain('-output_ts_offset')
    const rotated = buildFFmpegArgs('http://example.com/live.ts', '/tmp/out', [], false, 0, true, 300, 120.5)
    expect(rotated).toContain('-output_ts_offset')
    expect(rotated[rotated.indexOf('-output_ts_offset') + 1]).toBe('120.5')
  })

  it('treats localhost http (torrent server) as a finite file — no rotation, no reconnect', () => {
    const torrent = buildFFmpegArgs('http://127.0.0.1:45678/webtorrent/abc123/0', '/tmp/out')
    // Finite torrent file: never chunked (would replay from 0:00 on respawn)
    expect(torrent).not.toContain('-t')
    // No reconnect_at_eof either (would loop the file at EOF)
    expect(torrent).not.toContain('-reconnect')
  })
})
