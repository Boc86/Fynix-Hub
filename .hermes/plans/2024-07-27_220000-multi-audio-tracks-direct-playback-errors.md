# Multi-Audio Track Support + Direct Playback Error Handling

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** (1) Allow users to switch audio tracks during FFmpeg-remuxed playback, and (2) add loading timeout + error surfacing for direct (non-FFmpeg) playback.

**Architecture:** Probe audio tracks via ffprobe before starting FFmpeg. Show all tracks in the player UI. On track selection, kill the current FFmpeg session and restart with the selected audio stream index. For direct playback, add a loading timeout that surfaces an error if the stream never starts.

**Tech Stack:** Electron IPC, TypeScript, React, FFmpeg/ffprobe, Video.js

---

## Problem Analysis

### Multi-Audio Tracks
- `ffmpeg-remux.service.ts` line 128-130 hardcodes `-map 0:v:0 -map 0:a:0` — only first audio stream
- `VideoJsPlayer.tsx` reads audio tracks from `video.audioTracks` — but the remuxed HLS only has 1 audio track
- Result: User sees "No other audio tracks" even when the source has 5+ audio tracks

### Direct Playback Errors
- Our recent ErrorModal changes handle video element errors
- But if a direct stream (HLS manifest, CDN) fails to load, there's no timeout — the player shows "Preparing stream…" indefinitely
- Need a loading timeout + onCanPlay guard

---

## Task 1: Add audio track probing to ffmpeg-remux.service.ts

**Objective:** Extract all audio stream metadata from a file before starting FFmpeg.

**Files:**
- Modify: `src/main/services/ffmpeg-remux.service.ts`

**Step 1: Add `AudioTrackInfo` interface and `probeAudioTracks` function**

After the existing `Chapter` interface (line 481-485), add:

```typescript
/** Audio track metadata extracted from ffprobe. */
export interface AudioTrackInfo {
  index: number        // stream index in the source file
  language: string     // ISO 639 language code (e.g. "eng", "spa")
  title: string        // track title tag (e.g. "Director's Commentary")
  codec: string        // codec name (e.g. "aac", "ac3", "dts")
  channels: number     // number of audio channels
  isDefault: boolean   // whether this is the default track
}
```

After the `probeChapters` function (after line 518), add:

```typescript
/** Probe a URL for audio track metadata. Returns track list. */
export function probeAudioTracks(inputUrl: string): AudioTrackInfo[] {
  try {
    const result = require('child_process').execSync(
      `ffprobe -v error -select_streams a -show_entries stream=index,codec_name:stream_tags=language,title -of json "${inputUrl}"`,
      { timeout: 20000, stdio: ['pipe', 'pipe', 'ignore'] },
    )
    const data = JSON.parse(result.toString())
    if (!data.streams || !Array.isArray(data.streams)) return []
    return data.streams.map((s: any, i: number) => ({
      index: s.index ?? i,
      language: s.tags?.language || '',
      title: s.tags?.title || '',
      codec: s.codec_name || '',
      channels: s.channels ?? 0,
      isDefault: i === 0, // first audio stream is default
    }))
  } catch {
    return []
  }
}
```

**Step 2: Verify**

Run: `cd "/home/boc/Documents/Fynix Media Hub/fynix-hub" && npx tsc --noEmit --skipLibCheck 2>&1 | grep "ffmpeg-remux" | head -5`
Expected: No errors

**Step 3: Commit**

```bash
git add src/main/services/ffmpeg-remux.service.ts
git commit -m "feat: add audio track probing to ffmpeg-remux service"
```

---

## Task 2: Pass audio tracks through player.service.ts and IPC

**Objective:** Expose probed audio tracks to the renderer via StartPlaybackResult and IPC.

**Files:**
- Modify: `src/main/services/player.service.ts`
- Modify: `src/main/ipc/handlers.ts`
- Modify: `src/preload/index.ts`

**Step 1: Add `audioTracks` to `StartPlaybackResult` in `player.service.ts`**

Update the interface (line 22-29):

```typescript
import type { AudioTrackInfo } from './ffmpeg-remux.service'

export interface StartPlaybackResult {
  streamUrl: string
  duration: number | null
  chapters: Chapter[]
  audioTracks: AudioTrackInfo[]  // ADD THIS
  isRemux: boolean               // ADD THIS — true if FFmpeg remux was used
}
```

**Step 2: Probe audio tracks in `startPlayback()` in `player.service.ts`**

In the FFmpeg remux path (around line 156, after `probeChapters`), add:

```typescript
const audioTracks = FfmpegRemux.probeAudioTracks(resolvedUrl)
```

In the direct playback paths (lines 114, 122), set `audioTracks: []` and `isRemux: false`.

In the FFmpeg path return (line 161), add `audioTracks, isRemux: true`.

**Step 3: Add `player:set-audio-track` IPC handler**

In `handlers.ts`, after the `player:get-session-error` handler, add:

```typescript
handle('player:set-audio-track', async (_event, audioIndex: number) => {
  const sessionId = PlayerService.getCurrentSessionId()
  if (!sessionId) return { error: 'No active session' }
  // Kill current session and restart with new audio track
  const newUrl = await PlayerService.switchAudioTrack(audioIndex)
  return { streamUrl: newUrl }
})
```

**Step 4: Add `switchAudioTrack()` to `player.service.ts`**

```typescript
export async function switchAudioTrack(audioIndex: number): Promise<string | null> {
  if (!currentSessionId) return null
  
  // Get the current session's input URL before killing
  const session = FfmpegRemux.getSessionInfo(currentSessionId)
  if (!session) return null
  
  const inputUrl = session.inputUrl
  const resumePosition = session.resumePosition
  
  // Kill current session
  await stopPlayback()
  
  // Restart with new audio track
  const result = await startPlayback(inputUrl, resumePosition, undefined, false, audioIndex)
  return result.streamUrl
}
```

Note: We need to add `getSessionInfo()` to ffmpeg-remux.service.ts that returns `{ inputUrl, resumePosition }` for the current session.

**Step 5: Expose in preload**

In `src/preload/index.ts`, add to the `player` object:

```typescript
setAudioTrack: (audioIndex: number) => ipcRenderer.invoke('player:set-audio-track', audioIndex),
```

**Step 6: Verify**

Run: `cd "/home/boc/Documents/Fynix Media Hub/fynix-hub" && npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "player\.service|handlers\.ts|preload/index" | head -10`
Expected: No errors

**Step 7: Commit**

```bash
git add src/main/services/player.service.ts src/main/ipc/handlers.ts src/preload/index.ts src/main/services/ffmpeg-remux.service.ts
git commit -m "feat: expose audio tracks from player service via IPC"
```

---

## Task 3: Wire audio tracks into VideoPlayer and VideoJsPlayer

**Objective:** Display probed audio tracks in the player UI and handle track switching.

**Files:**
- Modify: `src/renderer/components/VideoPlayer/VideoPlayer.tsx`
- Modify: `src/renderer/components/VideoPlayer/VideoJsPlayer.tsx`

**Step 1: Pass audio tracks from VideoPlayer to VideoJsPlayer**

In `VideoPlayer.tsx`, the `startPlayerUrl` call in App.tsx returns a result that now includes `audioTracks`. Store this in state and pass down.

Add state:
```typescript
const [audioTracksInfo, setAudioTracksInfo] = useState<{ index: number; language: string; title: string; codec: string; channels: number; isDefault: boolean }[]>([])
const [isRemux, setIsRemux] = useState(false)
```

These need to be set when playback starts. The cleanest way is to pass them from App.tsx via the VideoPlayer props. Add props:

```typescript
audioTracks?: { index: number; language: string; title: string; codec: string; channels: number; isDefault: boolean }[]
isRemux?: boolean
```

In App.tsx, store the audio tracks from `startPlayerUrl` result and pass to VideoPlayer.

**Step 2: Update VideoJsPlayer props**

Add to `VideoJsPlayerProps`:
```typescript
audioTracks?: { index: number; language: string; title: string; codec: string; channels: number; isDefault: boolean }[]
isRemux?: boolean
onAudioTrackSelect?: (trackIndex: number) => void
```

**Step 3: Override audio track list with probed tracks**

In VideoJsPlayer, when `isRemux` is true and `audioTracks` prop has entries, use those instead of `video.audioTracks`:

```typescript
// In refreshTracks or a new useEffect:
if (isRemux && audioTracks && audioTracks.length > 0) {
  setAudioTracks(audioTracks.map(t => ({
    index: t.index,
    label: t.title || t.language || `Track ${t.index + 1}`,
    language: t.language,
    enabled: t.isDefault,
  })))
}
```

**Step 4: Handle track selection**

When user selects a track (in `cycleAudioTrack` or `selectAudioTrack`), if `isRemux` is true, call `onAudioTrackSelect` instead of trying to switch the HTML5 audio track:

```typescript
const selectAudioTrack = useCallback((idx: number) => {
  if (isRemux && onAudioTrackSelect) {
    const track = displayAudioTracks[idx]
    if (track) {
      onAudioTrackSelect(track.index)
      showOsdMessage(`Switching to: ${track.label}`)
    }
    setAudioMenuOpen(false)
    return
  }
  // ... existing HTML5 audio track switching code
}, [isRemux, onAudioTrackSelect, displayAudioTracks, showOsdMessage])
```

**Step 5: Wire onAudioTrackSelect in VideoPlayer.tsx**

```typescript
const handleAudioTrackSelect = useCallback(async (trackIndex: number) => {
  try {
    setPlayerLoading(true)
    const result = await (window.api.player as any).setAudioTrack(trackIndex)
    if (result?.streamUrl) {
      setStreamUrl(result.streamUrl)
    }
  } catch (err: any) {
    setDisplayError(err?.message || 'Failed to switch audio track')
  } finally {
    setPlayerLoading(false)
  }
}, [])
```

Pass this to VideoJsPlayer as `onAudioTrackSelect`.

**Step 6: Verify**

Run: `cd "/home/boc/Documents/Fynix Media Hub/fynix-hub" && npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "VideoPlayer|VideoJsPlayer" | head -10`
Expected: No errors

**Step 7: Commit**

```bash
git add src/renderer/components/VideoPlayer/VideoPlayer.tsx src/renderer/components/VideoPlayer/VideoJsPlayer.tsx src/renderer/App.tsx
git commit -m "feat: wire audio track switching into player UI"
```

---

## Task 4: Add loading timeout for direct playback

**Objective:** Surface an error if a direct stream fails to start playing within 30 seconds.

**Files:**
- Modify: `src/renderer/components/VideoPlayer/VideoPlayer.tsx`

**Step 1: Add loading timeout useEffect**

After the existing FFmpeg error listener useEffect (added in previous session), add:

```typescript
// Loading timeout — if stream doesn't start playing within 30s, show error
useEffect(() => {
  if (!playerLoading || !streamUrl) return
  const timeout = setTimeout(() => {
    // Only show error if still loading and no error already displayed
    if (playerLoading && !displayError && !streamError) {
      setDisplayError('Stream took too long to start — the source may be unavailable or too slow.')
    }
  }, 30_000)
  return () => clearTimeout(timeout)
}, [playerLoading, streamUrl, displayError, streamError])
```

**Step 2: Clear timeout when playback starts**

In the `handlePlay` callback (or a new onCanPlay handler), clear the loading state:

```typescript
// In the VideoPlayer component, add onCanPlay handler:
const handleCanPlay = useCallback(() => {
  setPlayerLoading(false)
}, [])
```

Pass `onCanPlay={handleCanPlay}` to VideoJsPlayer.

In VideoJsPlayer, wire it:
```tsx
onCanPlay={onCanPlay}
```

**Step 3: Verify**

Run: `cd "/home/boc/Documents/Fynix Media Hub/fynix-hub" && npx tsc --noEmit --skipLibCheck 2>&1 | grep "VideoPlayer\.tsx" | head -5`
Expected: No errors

**Step 4: Commit**

```bash
git add src/renderer/components/VideoPlayer/VideoPlayer.tsx src/renderer/components/VideoPlayer/VideoJsPlayer.tsx
git commit -m "feat: add loading timeout for direct playback streams"
```

---

## Task 5: Run full test suite and verify

**Objective:** Ensure no regressions.

**Step 1: Run tests**

Run: `cd "/home/boc/Documents/Fynix Media Hub/fynix-hub" && npm test 2>&1 | grep -E "Test Files|Tests"`
Expected: 341+ passed, 1 pre-existing failure

**Step 2: TypeScript check**

Run: `cd "/home/boc/Documents/Fynix Media Hub/fynix-hub" && npx tsc --noEmit --skipLibCheck 2>&1 | grep -v "src/test/" | grep "error" | head -10`
Expected: No source errors

---

## Files Changed Summary

| File | Change |
|------|--------|
| `src/main/services/ffmpeg-remux.service.ts` | Add `AudioTrackInfo`, `probeAudioTracks()`, `getSessionInfo()` |
| `src/main/services/player.service.ts` | Add `audioTracks`/`isRemux` to result, `switchAudioTrack()` |
| `src/main/ipc/handlers.ts` | Add `player:set-audio-track` handler |
| `src/preload/index.ts` | Expose `setAudioTrack` |
| `src/renderer/App.tsx` | Pass audio tracks + isRemux to VideoPlayer |
| `src/renderer/components/VideoPlayer/VideoPlayer.tsx` | Loading timeout, audio track switching, onCanPlay |
| `src/renderer/components/VideoPlayer/VideoJsPlayer.tsx` | Use probed audio tracks, onAudioTrackSelect callback |

## Risks & Tradeoffs

- **Track switching causes ~1-2s interruption**: Killing and restarting FFmpeg is the simplest approach. Alternative (multiple parallel FFmpeg processes) is too complex for this use case.
- **ffprobe may be slow on large files**: 20s timeout is generous. For torrents still downloading, ffprobe may fail — we return empty array and fall back to the single-track behavior.
- **Direct playback has no audio track switching**: Direct streams (HLS, MP4) already expose their audio tracks via the HTML5 video element. The probed tracks are only used for FFmpeg-remuxed content.
