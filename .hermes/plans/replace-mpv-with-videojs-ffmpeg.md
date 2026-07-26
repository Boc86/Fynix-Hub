# Plan: Replace MPV with Video.js + FFmpeg

## Goal

Replace the external mpv process (and its Lua OSC script) with an in-app HTML5 player built on **Video.js v10 React** (`@videojs/react`) and an **FFmpeg HLS remux** layer. The player renders inside the Electron renderer window — no external process, no separate window, no IPC socket polling.

---

## Architecture Overview

### Current (MPV-based)
```
App.tsx → window.api.mpv.start(url, ...)
  → mpv.service.ts spawns external mpv process
  → mpv opens its own fullscreen window with Lua OSC
  → VideoPlayer.tsx polls mpv via IPC every 2.5s for time/duration/paused
  → Trakt scrobble, skip-intro, up-next all driven by poll loop
  → Subtitles loaded via mpv IPC sub-add
```

### Target (Video.js + FFmpeg)
```
App.tsx → setStreamUrl(hlsUrl) → VideoPlayer.tsx
  → VideoPlayer renders <Player.Provider><VideoSkin><HlsJsVideo src={hlsUrl}/></VideoSkin></Player.Provider>
  → Video.js handles all UI controls (play/pause/seek/volume/fullscreen/subtitles)
  → usePlayer hook subscribes to state (currentTime, duration, paused) — no polling
  → Trakt scrobble driven by onTimeUpdate/onPlay/onPause/onEnded events
  → Skip-intro & up-next are React overlays positioned above the Video.js skin
  → FFmpeg remux service converts torrent/remote streams to HLS fMP4 for browser playback
```

### Key Decisions

1. **Video.js v10 `@videojs/react`** (not legacy `video.js` v8):
   - `createPlayer({ features: videoFeatures })` → typed `Player.Provider`, `usePlayer` hook
   - `VideoSkin` provides the full default UI (play button, seek bar, volume, fullscreen, captions, settings menu)
   - `HlsJsVideo` media element plays `.m3u8` via hls.js (MSE-backed, cross-browser)
   - No custom React OSD overlay — use the built-in `VideoSkin` as-is

2. **FFmpeg HLS remux** (main process):
   - For torrent/remote streams that aren't already HLS: spawn `ffmpeg -i <url> -c:v copy -c:a copy -f hls ...`
   - Serves `playlist.m3u8` + `init.mp4` + `segmentNNNNN.m4s` from a temp dir
   - Local-cache HTTP server routes `/remux/<sessionId>/playlist.m3u8` to the remux service
   - For streams that are already HLS/MP4 and browser-playable: skip remux, pass URL directly

3. **No custom React OSD** (lesson from the failed attempt):
   - Video.js v10's `VideoSkin` provides a complete, accessible, styled control bar out of the box
   - Skip-intro and up-next remain as minimal React button overlays (positioned absolutely) — they are not part of the control bar
   - No `ReactOSD.tsx`, no `controls: false`, no manual play/pause/seek/volume/track state

---

## Phase 1: Install Video.js & Create the Player Component

### 1.1 Install dependencies
```bash
npm install @videojs/react
```
This pulls in `@videojs/react` (React components, hooks, `createPlayer`), the `VideoSkin`, and `HlsJsVideo` (which bundles `hls.js` internally).

### 1.2 Create `src/renderer/components/VideoPlayer/VideoJsPlayer.tsx`

```tsx
import '@videojs/react/video/skin.css'
import { createPlayer, videoFeatures } from '@videojs/react'
import { VideoSkin, HlsJsVideo } from '@videojs/react/video'

const Player = createPlayer({ features: videoFeatures })

interface VideoJsPlayerProps {
  src: string
  startTime?: number
  onTimeUpdate?: (time: number) => void
  onDurationChange?: (duration: number) => void
  onEnded?: () => void
  onError?: (err: any) => void
  onPlay?: () => void
  onPause?: () => void
}

export const VideoJsPlayer = forwardRef<VideoJsPlayerHandle, VideoJsPlayerProps>(
  ({ src, startTime, onTimeUpdate, onDurationChange, onEnded, onError, onPlay, onPause }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null)
    const media = Player.useMedia()

    // Expose imperative API to parent (VideoPlayer.tsx)
    useImperativeHandle(ref, () => ({
      getPosition: () => videoRef.current?.currentTime ?? 0,
      getDuration: () => videoRef.current?.duration ?? 0,
      seek: (t: number) => { if (videoRef.current) videoRef.current.currentTime = t },
      pause: () => videoRef.current?.pause(),
      play: () => videoRef.current?.play(),
      isPaused: () => videoRef.current?.paused ?? true,
      setVolume: (v: number) => { if (videoRef.current) videoRef.current.volume = v },
      getVolume: () => videoRef.current?.volume ?? 1,
      addSubtitle: (url: string, label: string) => { /* add <track> element */ },
    }))

    // Seek to resume position on load
    useEffect(() => {
      if (startTime && startTime > 0 && videoRef.current) {
        const onLoaded = () => { videoRef.current!.currentTime = startTime }
        videoRef.current.addEventListener('loadedmetadata', onLoaded, { once: true })
      }
    }, [startTime])

    return (
      <Player.Provider>
        <VideoSkin>
          <HlsJsVideo
            ref={videoRef}
            src={src}
            autoPlay
            playsInline
            onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
            onDurationChange={(e) => onDurationChange?.(e.currentTarget.duration)}
            onEnded={onEnded}
            onError={(e) => onError?.(e)}
            onPlay={onPlay}
            onPause={onPause}
          />
        </VideoSkin>
      </Player.Provider>
    )
  }
)
```

### Key Video.js v10 concepts applied (from the docs):
- **`createPlayer({ features: videoFeatures })`** creates a typed player with `Provider`, `Container`, `usePlayer`, `useMedia` — **not** the old `videojs(el, options)` imperative API
- **`Player.Provider`** is the state boundary — wraps all UI + media components
- **`VideoSkin`** is the complete pre-built UI skin (play button, seek bar, volume, fullscreen, captions, settings menu) — no need to build controls from scratch
- **`HlsJsVideo`** is the HLS media element powered by hls.js — handles `.m3u8` sources via MSE, with `audioRenditions`, `videoRenditions`, `audioTracks` support
- **`Player.useMedia()`** returns the media object for imperative access
- **`usePlayer(selector)`** subscribes to state reactively (e.g. `usePlayer(s => s.paused)`) — eliminates the 2.5s poll loop
- **Events**: `HlsJsVideo` accepts standard React media event props (`onTimeUpdate`, `onPlay`, `onPause`, `onEnded`, `onError`, etc.)

### 1.3 CSP requirements
Electron's CSP must allow:
- `media-src 'self' blob: http://127.0.0.1:*` (for HLS segments + torrent streams)
- `connect-src 'self' http://127.0.0.1:*` (for HLS manifest/segment fetches)
- `worker-src 'self' blob:` (hls.js uses a Web Worker)
- `style-src 'self' 'unsafe-inline'` (Video.js UI styling)

Update `src/renderer/index.html` CSP meta tag accordingly.

---

## Phase 2: FFmpeg HLS Remux Service (Main Process)

### 2.1 Create `src/main/services/ffmpeg-remux.service.ts`

**Responsibility:** For URLs that the browser can't play directly (torrent streams, non-HLS remote URLs), spawn FFmpeg to trans remux to HLS fMP4.

```typescript
export function createSession(inputUrl: string, resumePosition?: number): string
export function getStreamUrl(sessionId: string): string  // returns http://127.0.0.1:<port>/remux/<id>/playlist.m3u8
export function handleRemuxRequest(sessionId, filename, req, res): void
export function killSession(sessionId: string): void
export function probeDuration(inputUrl: string): number | null
export function shutdown(): void
```

**FFmpeg command:**
```bash
ffmpeg -i <inputUrl> \
  -c:v copy -c:a copy \
  -max_muxing_queue_size 4096 \
  -f hls \
  -hls_time 4 \
  -hls_list_size 0 \
  -hls_playlist_type event \
  -hls_segment_type fmp4 \
  -hls_fmp4_init_filename init.mp4 \
  -hls_flags independent_segments+append_list \
  -hls_segment_filename /tmp/fynix-remux/<id>/segment%05d.m4s \
  /tmp/fynix-remux/<id>/playlist.m3u8
```

**Request handling rules** (lessons from previous failures):
- Write an empty `#EXTM3U\n#EXT-X-VERSION:6\n` placeholder playlist immediately so the first HLS request never sees a 503 — Video.js/VHS retries and gets real content once FFmpeg produces segments
- For `init.mp4` and `segment*.m4s`: wait up to 10s for the file to appear, return 503 if the client is still waiting
- Check `responseIsOpen()` before writing headers — if the client disconnected during the wait, silently abort
- Support `Range` headers on segment files (finite files, seekable)
- Serve with `Cache-Control: no-store` and proper `Content-Type` (`.m3u8` → `application/x-mpegURL`, `.m4s`/`.mp4` → `video/mp4`)

### 2.2 Route in `local-cache.service.ts`

Add route before the `/webtorrent/` handler:
```typescript
const remuxMatch = url.match(/^\/remux\/([a-fA-F0-9]+)\/(playlist\.m3u8|init\.mp4|segment\d{5}\.m4s)$/)
if (remuxMatch) {
  FfmpegRemux.handleRemuxRequest(remuxMatch[1], remuxMatch[2], req, res)
  return
}
```

### 2.3 Init/shutdown
- `MpvService.init()` in `index.ts` → add `FfmpegRemux.init(LocalCacheService.getPort)` alongside
- `MpvService.shutdown()` in `index.ts` → add `FfmpegRemux.shutdown()`

---

## Phase 3: New `PlayerService` (replaces mpv.service.ts API surface)

### 3.1 Create `src/main/services/player.service.ts`

This provides the same `startPlayback`/`stopPlayback` API that `mpv:start` IPC handler needs, but delegates to FFmpeg remux instead of spawning mpv:

```typescript
import * as FfmpegRemux from './ffmpeg-remux.service'

let currentSessionId: string | null = null

export async function startPlayback(
  inputUrl: string,
  resumePosition?: number
): Promise<{ streamUrl: string; duration: number | null }> {
  await stopPlayback()

  // If the URL is already an HLS stream or a direct browser-playable URL,
  // skip remux and pass it directly to the renderer.
  const needsRemux = !/\.m3u8(\?|$)/.test(inputUrl) &&
                     !/^https?:\/\/.*\.(mp4|webm|mkv|mp3|aac|m4a)(\?|$)/i.test(inputUrl) &&
                     !/^https?:\/\/127\.0\.0\.1:\d+\/remux\//.test(inputUrl)

  let streamUrl: string
  let duration: number | null = null

  if (needsRemux) {
    const pos = resumePosition && resumePosition > 0 ? resumePosition : 0
    const sessionId = FfmpegRemux.createSession(inputUrl, pos)
    streamUrl = FfmpegRemux.getStreamUrl(sessionId)!
    currentSessionId = sessionId
    duration = FfmpegRemux.probeDuration(inputUrl)
  } else {
    streamUrl = inputUrl
    currentSessionId = null
  }

  return { streamUrl, duration }
}

export async function stopPlayback(): Promise<void> {
  if (currentSessionId) {
    FfmpegRemux.killSession(currentSessionId)
    currentSessionId = null
  }
}

export async function seekTo(positionSeconds: number): Promise<void> {
  // For remux sessions: kill + recreate with new start position
  // For direct streams: no-op (renderer handles seek)
}

export function shutdown() {
  stopPlayback()
  FfmpegRemux.shutdown()
}
```

### 3.2 Update IPC handlers (`handlers.ts`)

Replace the `mpv:*` handlers with `player:*` handlers:

| Old (mpv) | New (player) | Implementation |
|---|---|---|
| `mpv:start` | `player:start` | `PlayerService.startPlayback(url, resume)` → returns `{ streamUrl, duration }` |
| `mpv:stop` | `player:stop` | `PlayerService.stopPlayback()` |
| `mpv:seek` | `player:seek` | `PlayerService.seekTo(position)` (remux: kill+recreate session) |
| `mpv:get-time-pos` | — | **Removed.** Renderer reads `currentTime` from the `<video>` element directly |
| `mpv:get-duration` | — | **Removed.** Renderer reads `duration` from the `<video>` element directly |
| `mpv:get-paused` | — | **Removed.** Renderer reads `paused` from the `<video>` element directly |
| `mpv:is-running` | — | **Removed.** Player lifecycle is entirely renderer-side now |
| `mpv:add-subtitle` | `player:add-subtitle` | Returns subtitle file URL → renderer adds `<track>` element |
| `mpv:show-skip-intro` | — | **Removed.** Skip-intro is a React overlay, not an mpv script message |
| `mpv:hide-skip-intro` | — | **Removed.** |
| `mpv:show-splash` | — | **Removed.** Splash screen is React state in VideoPlayer.tsx |
| `mpv:hide-splash` | — | **Removed.** |
| `mpv:set-has-next` | — | **Removed.** Up-next is React state in VideoPlayer.tsx |
| `mpv:set-auto-play-next` | — | **Removed.** |
| `mpv:set-plot` | — | **Removed.** |
| `mpv:set-up-next` | — | **Removed.** Up-next is React overlay |
| `mpv:clear-up-next` | — | **Removed.** |
| `mpv:get-last-exit-code` | — | **Removed.** No external process to crash |
| `mpv:get-sub-action` | — | **Removed.** |
| `mpv:clear-sub-action` | — | **Removed.** |
| `mpv:verify-url` | `player:verify-url` | Keep (validates URL is reachable) |
| `mpv:verify-playback-quality` | — | **Removed.** (was mpv-specific) |
| `mpv:onExited` | `player:on-exited` | **Removed.** `onEnded` callback from `<video>` replaces this |

### 3.3 Update preload (`src/preload/index.ts`)

Replace the `mpv:` section with a simpler `player:` section:

```typescript
player: {
  start: (url: string, resumePosition?: number) =>
    ipcRenderer.invoke('player:start', url, resumePosition),
  stop: () => ipcRenderer.invoke('player:stop'),
  seek: (positionSeconds: number) => ipcRenderer.invoke('player:seek', positionSeconds),
  addSubtitle: (filePath: string) => ipcRenderer.invoke('player:add-subtitle', filePath),
},
```

The `onExited` callback is removed — the renderer handles `onEnded` directly.
The `onSeekReady` event is removed for the same reason.

---

## Phase 4: Rewrite `VideoPlayer.tsx`

### 4.1 Rewrite using Video.js + event-driven scrobbling

The new `VideoPlayer.tsx`:
- Receives `streamUrl` (HLS URL from PlayerService) as a prop
- Renders `<VideoJsPlayer>` (Phase 1 component)
- Uses `onTimeUpdate` / `onPlay` / `onPause` / `onEnded` events instead of the 2.5s poll loop
- Scrobble logic moves from the poll loop to event callbacks
- Skip-intro and up-next remain as React overlays (buttons positioned absolutely over the video)

### Key changes vs the old VideoPlayer:

| Old (mpv poll loop) | New (Video.js events) |
|---|---|
| `setInterval(2500)` polls `mpv.getTimePos()` etc. | `onTimeUpdate` fires directly from `<video>` element |
| `mpv.getPaused()` → `isPlayingRef` | `onPlay` / `onPause` events set `isPlayingRef` |
| `mpv.onExited` callback → `finishPlayback()` | `onEnded` callback → `finishPlayback()` |
| `mpv.showSkipIntro()` / `hideSkipIntro()` | `activeSkip` state → React overlay button |
| `mpv.setUpNext()` / `clearUpNext()` | `showUpNext` state → React overlay button |
| `mpv.addSubtitle(filePath)` | `VideoJsPlayer.addSubtitle(url, label)` adds `<track>` |
| `mpv.showSplash()` / `hideSplash()` | `playerLoading` prop → splash overlay |
| `mpv.setPlot(text)` | — (removed) |
| Poll-based `scrobble('start')` every 60s | Throttled `scrobble('start')` in `onTimeUpdate` |
| `retryCountRef` for live stream reconnect | `onError` → if reconnectable, call `onRetryStream` |

### 4.2 The `forwardRef` handle

`VideoPlayer.tsx` still exposes `getPosition()` / `getDuration()` via `useImperativeHandle` (App.tsx uses these for progress saving on back). These delegate to the `VideoJsPlayer` ref.

### 4.3 Skip-intro & up-next overlays

Keep the existing CSS classes (`styles.skipOverlay`, `styles.skipBtn`) for the minimal skip-intro and up-next buttons. These are absolute-positioned buttons over the video — they don't interfere with Video.js controls.

---

## Phase 5: Update `App.tsx` Call Sites

### 5.1 Replace `window.api.mpv.start(...)` with `player:start` + `setStreamUrl`

All ~20 call sites currently do:
```typescript
await window.api.mpv.start(url, resumePosition, accentColor, hasNext, audioLang, playerInfo, referer)
```

New pattern:
```typescript
const result = await window.api.player.start(url, resumePosition)
setStreamUrl(result.streamUrl)
setSourceDuration(result.duration)
```

The `accentColor`, `hasNext`, `audioLang`, `playerInfo`, `referer` parameters are no longer needed by `player:start` — they were mpv-specific (Lua script accent color, OS-level audio lang selection, custom referer headers). The renderer handles accent color in CSS, and the `<video>` element handles audio track selection via Video.js.

### 5.2 Remove `onExited` subscription

`App.tsx` currently subscribes to `window.api.mpv.onExited` to detect when mpv closes. This is replaced by `VideoPlayer.tsx`'s `onEnded` / `onError` callbacks which call `handlePlayerBack` or `onNextEpisode` directly.

### 5.3 Remove `onSeekReady` subscription

The `player:seek` IPC returns a new stream URL. With Video.js, seeking is done client-side on the `<video>` element — no IPC round-trip needed. Remove this.

---

## Phase 6: Cleanup & Remove MPV

### 6.1 Delete mpv-specific files
- `src/main/services/mpv.service.ts` → **delete**
- `assets/bin/mpv/` (mpv binary, scripts, config) → **delete**
- `assets/bin/mpv/scripts/fynix-osc.lua` → **delete**
- `assets/bin/mpv/scripts/thumbfast.lua` → **delete**
- `assets/bin/mpv/mpv.conf` → **delete**
- `assets/bin/mpv/input.conf` → **delete**

### 6.2 Remove mpv IPC handlers
Remove all `handle('mpv:*')` entries from `handlers.ts`. Add `handle('player:*')` entries (see Phase 3.2).

### 6.3 Remove mpv preload bridge
Remove the `mpv:` section from `preload/index.ts`. Add `player:` section (see Phase 3.3).

### 6.4 Remove mpv init/shutdown from `index.ts`
Replace `MpvService.init()` / `MpvService.shutdown()` with `FfmpegRemux.init()` / `FfmpegRemux.shutdown()` + `PlayerService.shutdown()`.

### 6.5 Update tests
- `src/test/unit/ipc/handlers.test.ts` — update mocks from `mpv.service` to `player.service` + `ffmpeg-remux.service`
- Add `src/test/unit/services/ffmpeg-remux.test.ts` — test session creation, HLS URL generation, file routing

### 6.6 Remove `setup-ffmpeg.sh` dependency on mpv
The `scripts/setup-ffmpeg.sh` currently installs mpv + ffmpeg. Keep ffmpeg, remove mpv.

---

## Phase 7: Subtitles

### Current (mpv)
```typescript
await window.api.mpv.addSubtitle(filePath)  // mpv loads the .srt/.vtt via IPC
```

### New (Video.js + `<track>`)
```typescript
// In VideoJsPlayer.tsx:
function addSubtitle(url: string, label: string) {
  const video = videoRef.current
  if (!video) return
  const track = document.createElement('track')
  track.kind = 'subtitles'
  track.label = label
  track.srclang = 'en'
  track.src = url
  video.appendChild(track)
  // Auto-enable if it matches preferred language
}
```

Note: Subtitle files from OpenSubtitles are `.srt`. Video.js/hls.js can display `<track>` elements with `.vtt` format. We need to convert `.srt` → `.vtt` (simple format conversion, can be done in the main process when downloading, or use ffmpeg to convert on the fly).

---

## Phase 8: Audio Track Selection

### Current (mpv)
mpv handles multi-track audio natively via `--alang=eng`. The app passes `audioLang` to `mpv:start`.

### New (Video.js)
`HlsJsVideo` exposes `audioTracks` and `audioRenditions` (populated when hls.js MSE engine is active). The Video.js `AudioTrackRadioGroup` component in the settings menu handles selection automatically.

For non-HLS streams (remuxed from MKV/MP4 torrents): FFmpeg's HLS fMP4 output can include multiple audio tracks. The `HlsJsVideo` element will expose them via `audioTracks`.

For preferred language auto-selection: add logic in `VideoJsPlayer.tsx` to check `audioTracks` on load and select the preferred language track.

---

## Phase 9: Live Stream Reconnection

### Current (mpv)
`mpv.service.ts` sends custom user-agent and referrer headers for certain hosts (ok.ru, dailymotion, VK, etc.). The VideoPlayer poll loop detects crashes and calls `onRetryStream`.

### New (Video.js + FFmpeg)
- For remote streams requiring custom headers: FFmpeg can set `--user-agent`, `--headers`, `--referer` flags. The remux service adds these based on URL patterns (same logic as `mpv.service.ts:startPlayback`).
- For live stream reconnection: `onError` in `VideoPlayer.tsx` calls `onRetryStream` if `isReconnectableStream()` returns true (same logic as current).
- URL resolvers (ok.ru, dailymotion) stay in the main process — they resolve the URL before passing it to the remux service.

---

## Phase 10: Testing & Verification

### 10.1 Unit tests
- `ffmpeg-remux.test.ts`: session creation, HLS URL format, request routing
- `player.service.test.ts`: startPlayback returns streamUrl, stopPlayback kills session
- `handlers.test.ts`: player:start/stop/seek IPC handlers

### 10.2 Integration test
- Start app, play a torrent stream, verify:
  - FFmpeg starts and produces HLS segments
  - Video.js player loads and plays the HLS playlist
  - Controls (play/pause/seek/volume/fullscreen) work
  - Trakt scrobble fires on play/pause/stop
  - Skip-intro button appears when in an intro segment
  - Up-next button appears 30s before end of TV episode
  - Subtitles load from OpenSubtitles
  - Back button saves progress and stops FFmpeg

### 10.3 Regression checklist
- [ ] Torrent playback works (MKV/MP4 via FFmpeg HLS remux)
- [ ] Usenet playback works (direct file URL, no remux needed)
- [ ] Vyla embed playback works (embed URL, no remux)
- [ ] Live stream playback works (HLS URL, no remux)
- [ ] YouTube playback works (resolved URL → remux or direct)
- [ ] Resume position works (seek to `startTime` on load)
- [ ] Trakt scrobble works (start/pause/stop events)
- [ ] Skip-intro detection works (React overlay)
- [ ] Up-next works (React overlay)
- [ ] Subtitles work (OpenSubtitles → `<track>` element)
- [ ] Progress saving works (on back, save to DB)
- [ ] App shutdown kills all FFmpeg processes

---

## File Change Summary

### New files
- `src/renderer/components/VideoPlayer/VideoJsPlayer.tsx` — Video.js v10 React player component
- `src/main/services/ffmpeg-remux.service.ts` — FFmpeg HLS remux service
- `src/main/services/player.service.ts` — Player lifecycle service (replaces mpv.service.ts API)
- `src/test/unit/services/ffmpeg-remux.test.ts` — Remux service tests
- `src/test/unit/services/player.service.test.ts` — Player service tests

### Modified files
- `src/renderer/components/VideoPlayer/VideoPlayer.tsx` — Rewrite to use VideoJsPlayer + event-driven callbacks (no poll loop)
- `src/renderer/App.tsx` — Replace `window.api.mpv.start()` with `window.api.player.start()` + `setStreamUrl()`
- `src/main/ipc/handlers.ts` — Replace `mpv:*` handlers with `player:*` handlers
- `src/preload/index.ts` — Replace `mpv:` bridge with `player:` bridge
- `src/main/index.ts` — Replace `MpvService.init/shutdown` with `FfmpegRemux.init/shutdown` + `PlayerService.shutdown`
- `src/main/services/local-cache.service.ts` — Add `/remux/<session>/` route
- `src/renderer/components/VideoPlayer/VideoPlayer.module.css` — Remove mpv-OSC styles, keep skip-overlay/splash styles
- `src/renderer/index.html` — Update CSP for Video.js (worker-src blob:, media-src blob:, etc.)
- `package.json` — Add `@videojs/react` dependency
- `src/test/unit/ipc/handlers.test.ts` — Update mocks

### Deleted files
- `src/main/services/mpv.service.ts` — Replaced by `player.service.ts` + `ffmpeg-remux.service.ts`
- `assets/bin/mpv/` — Entire directory (mpv binary, Lua scripts, config)
- `scripts/setup-ffmpeg.sh` — Updated to remove mpv installation (keep ffmpeg)

---

## Risk Mitigation

1. **FFmpeg remux latency**: The first HLS segment takes ~4s to produce. The splash screen (`playerLoading`) must stay visible until `onPlay` fires. If the torrent hasn't downloaded enough data, FFmpeg will stall — the 15s stall timeout in local-cache.service.ts handles this.

2. **Video.js v10 is beta**: The API may evolve. Pin the version in `package.json`: `"@videojs/react": "~10.0.0"`. If v10 proves unstable, fall back to `video.js` v8 (mature, stable, but imperative API — `videojs(el, {fluid: true, controls: true})`).

3. **Format compatibility**: FFmpeg `-c:v copy -c:a copy` only works if the source codec is browser-compatible (H.264/H.265/VP9 video + AAC/Opus audio). For rare codecs, add `-c:v libx264 -c:a aac` fallback (transcode instead of copy — slower but always works).

4. **Subtitles**: SRT → VTT conversion needed. Simple: rename `.srt` to `.vtt`, replace `,` with `.` in timestamps, add `WEBVTT` header. Or use ffmpeg: `ffmpeg -i input.srt output.vtt`.

5. **Keep mpv as fallback**: Don't delete `mpv.service.ts` until the Video.js player is fully verified. Behind a settings toggle: "Player engine: Auto / HTML5 / mpv". If Video.js fails repeatedly, auto-fallback to mpv.

---

## Execution Order

1. **Phase 1** → Install `@videojs/react`, create `VideoJsPlayer.tsx`, update CSP
2. **Phase 2** → Create `ffmpeg-remux.service.ts`, add route to `local-cache.service.ts`
3. **Phase 3** → Create `player.service.ts`, add IPC handlers, update preload
4. **Phase 4** → Rewrite `VideoPlayer.tsx` to use `VideoJsPlayer`
5. **Phase 5** → Update `App.tsx` call sites (~20 locations)
6. Test with a torrent stream — verify playback works end-to-end
7. **Phase 6** → Cleanup: delete mpv files, remove mpv IPC handlers
8. **Phase 7-8** → Subtitles & audio track selection
9. **Phase 9** → Live stream reconnection headers
10. **Phase 10** → Full testing & regression

Each phase is independently testable. **Do not proceed to the next phase until the current one is verified.**
