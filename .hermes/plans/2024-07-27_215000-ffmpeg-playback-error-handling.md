# Robust FFmpeg Playback Error Handling via ErrorModal

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Surface all FFmpeg playback failures (crashes, codec errors, network issues) to the user via the existing ErrorModal — no silent failures.

**Architecture:** Bridge the gap between FFmpeg session errors (main process) and the VideoPlayer component (renderer) via a new IPC channel + error polling. Enhance the renderer's video error handler to show ErrorModal instead of silently navigating back. Add FFmpeg-specific friendly messages to ErrorModal.

**Tech Stack:** Electron IPC, TypeScript, React, Zustand, Video.js, FFmpeg

---

## Current Gap Analysis

The current error flow has three silent-failure paths:

1. **FFmpeg crashes after session creation** — `ffmpeg-remux.service.ts` captures stderr in `session.lastError` but nothing reads it. The video just freezes or the player navigates back silently.
2. **Video element errors during playback** — `VideoPlayer.handleError` calls `finishPlayback(false)` (goes back) without showing any error to the user.
3. **FFmpeg errors not in ErrorModal** — `friendlyMessage()` doesn't handle FFmpeg/codec/network patterns.

---

## Task 1: Add IPC handler for FFmpeg session errors

**Objective:** Allow the renderer to query FFmpeg session errors after playback starts.

**Files:**
- Modify: `src/main/ipc/handlers.ts:565-573`
- Modify: `src/preload/index.ts:174-181`

**Step 1: Add `player:get-session-error` handler in `handlers.ts`**

After the existing `player:stop` handler (line 577), add:

```typescript
handle('player:get-session-error', async () => {
  const sessionId = PlayerService.getCurrentSessionId()
  if (!sessionId) return null
  return FfmpegRemux.getSessionError(sessionId)
})
```

**Step 2: Expose `getSessionError` in preload `index.ts`**

In the `player` object (after `getChapters`), add:

```typescript
getSessionError: () => ipcRenderer.invoke('player:get-session-error'),
```

**Step 3: Verify TypeScript compiles**

Run: `cd /home/boc/Documents/Fynix\ Media\ Hub/fynix-hub && npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "handlers\.ts|index\.ts" | head -10`
Expected: No errors in the modified files

**Step 4: Commit**

```bash
git add src/main/ipc/handlers.ts src/preload/index.ts
git commit -m "feat: add IPC handler for FFmpeg session error retrieval"
```

---

## Task 2: Add IPC event for unexpected FFmpeg exit

**Objective:** Push FFmpeg crash notifications to the renderer in real-time instead of requiring polling.

**Files:**
- Modify: `src/main/services/player.service.ts:146-162`
- Modify: `src/preload/index.ts:174-181`

**Step 1: Emit event when FFmpeg exits unexpectedly in `player.service.ts`**

In `startPlayback()`, after `FfmpegRemux.createSession()` succeeds (around line 155), add a watcher that emits an IPC event if the FFmpeg process exits non-zero:

```typescript
// Watch for unexpected FFmpeg exit and notify renderer
if (currentSessionId) {
  const checkInterval = setInterval(() => {
    if (!currentSessionId) { clearInterval(checkInterval); return }
    const err = FfmpegRemux.getSessionError(currentSessionId)
    if (err) {
      clearInterval(checkInterval)
      // Emit to all renderer windows
      const { BrowserWindow } = require('electron') as typeof import('electron')
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('player:ffmpeg-error', err)
        }
      }
    }
  }, 2000)
}
```

**Step 2: Expose `onFfmpegError` listener in preload `index.ts`**

In the `player` object, add:

```typescript
onFfmpegError: (callback: (error: string) => void) => {
  const handler = (_event: any, error: string) => callback(error)
  ipcRenderer.on('player:ffmpeg-error', handler)
  return () => { ipcRenderer.removeListener('player:ffmpeg-error', handler) }
},
```

**Step 3: Verify TypeScript compiles**

Run: `cd /home/boc/Documents/Fynix\ Media\ Hub/fynix-hub && npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "player\.service\.ts|index\.ts" | head -10`
Expected: No errors in the modified files

**Step 4: Commit**

```bash
git add src/main/services/player.service.ts src/preload/index.ts
git commit -m "feat: emit IPC event on unexpected FFmpeg process exit"
```

---

## Task 3: Enhance ErrorModal friendly messages for FFmpeg errors

**Objective:** Map FFmpeg-specific error patterns to user-friendly messages.

**Files:**
- Modify: `src/renderer/components/ErrorModal/ErrorModal.tsx:10-29`
- Modify: `src/test/unit/components/ErrorModal.test.tsx`

**Step 1: Add FFmpeg error patterns to `friendlyMessage()` in `ErrorModal.tsx`**

Add these checks BEFORE the `return raw` fallback (line 28):

```typescript
if (lower.includes('ffmpeg') && lower.includes('not found'))
  return 'FFmpeg is not installed or not in PATH. Check your installation.'
if (lower.includes('ffmpeg') && (lower.includes('exit') || lower.includes('crashed')))
  return 'FFmpeg process failed — the stream may be corrupted or unsupported.'
if (lower.includes('codec') || lower.includes('decoder'))
  return 'Video codec is not supported by your system. Try a different source.'
if (lower.includes('network') || lower.includes('connection refused') || lower.includes('connection reset'))
  return 'Network error — the stream server may be unreachable.'
if (lower.includes('no such file') || lower.includes('file not found'))
  return 'The stream file could not be found — it may have been removed.'
if (lower.includes('permission denied'))
  return 'Permission denied — check file permissions.'
if (lower.includes('invalid data') || lower.includes('corrupt'))
  return 'The stream data appears to be corrupted or invalid.'
if (lower.includes('protocol') || lower.includes('not supported'))
  return 'The stream protocol is not supported. Try a different source.'
```

**Step 2: Add tests for new friendly messages in `ErrorModal.test.tsx`**

Add these test cases inside the `'friendlyMessage mapping'` describe block:

```typescript
it('maps ffmpeg not found to installation message', () => {
  render(<ErrorModal message="FFmpeg not found or failed to start" />)
  expect(screen.getByText(/FFmpeg is not installed/)).toBeInTheDocument()
})

it('maps ffmpeg crash to failure message', () => {
  render(<ErrorModal message="FFmpeg exited with code 1" />)
  expect(screen.getByText(/FFmpeg process failed/)).toBeInTheDocument()
})

it('maps codec error to unsupported message', () => {
  render(<ErrorModal message="Video codec not supported" />)
  expect(screen.getByText(/Video codec is not supported/)).toBeInTheDocument()
})

it('maps network error to unreachable message', () => {
  render(<ErrorModal message="Connection refused" />)
  expect(screen.getByText(/Network error/)).toBeInTheDocument()
})

it('maps corrupt data to corrupted message', () => {
  render(<ErrorModal message="Invalid data found" />)
  expect(screen.getByText(/corrupted or invalid/)).toBeInTheDocument()
})
```

**Step 3: Run ErrorModal tests**

Run: `cd /home/boc/Documents/Fynix\ Media\ Hub/fynix-hub && npm test -- src/test/unit/components/ErrorModal.test.tsx`
Expected: All tests pass (including new FFmpeg error tests)

**Step 4: Commit**

```bash
git add src/renderer/components/ErrorModal/ErrorModal.tsx src/test/unit/components/ErrorModal.test.tsx
git commit -m "feat: add FFmpeg error friendly messages to ErrorModal"
```

---

## Task 4: Enhance VideoPlayer error handling to show ErrorModal

**Objective:** Show ErrorModal for video element errors instead of silently navigating back.

**Files:**
- Modify: `src/renderer/components/VideoPlayer/VideoPlayer.tsx:422-433`

**Step 1: Update `handleError` in `VideoPlayer.tsx` to show ErrorModal**

Replace the existing `handleError` callback (lines 422-433):

```typescript
const handleError = useCallback((error?: MediaError) => {
  if (exitedRef.current) return

  // Build descriptive error message from MediaError code
  let errorMsg = 'Playback error'
  if (error) {
    switch (error.code) {
      case 1: errorMsg = 'Playback was aborted'; break
      case 2: errorMsg = 'A network error occurred while loading the stream'; break
      case 3: errorMsg = 'The video could not be decoded — the format may be unsupported'; break
      case 4: errorMsg = 'The video source is not supported or unavailable'; break
      default: errorMsg = error.message || 'Unknown playback error'
    }
  }

  if (isReconnectableStream() && retryCountRef.current < 1 && onRetryStream) {
    retryCountRef.current++
    window.api.log(`[VP] stream error, auto-reconnect attempt ${retryCountRef.current}`)
    exitedRef.current = false
    onRetryStream()
  } else {
    exitedRef.current = true
    // Show error modal via streamError prop — parent will display it
    setStreamErrorForDisplay(errorMsg)
  }
}, [isReconnectableStream, onRetryStream])
```

**Step 2: Add `setStreamErrorForDisplay` state and wire it to parent**

Add a new state in the component:

```typescript
const [displayError, setDisplayError] = useState<string | null>(null)
```

And add it to the render, after the `streamError` check:

```tsx
if (displayError) {
  return (
    <div className={styles.player}>
      <ErrorModal
        message={displayError}
        onBack={onBack}
        onRetry={() => {
          setDisplayError(null)
          onRetryStream?.()
        }}
      />
    </div>
  )
}
```

**Step 3: Verify TypeScript compiles**

Run: `cd /home/boc/Documents/Fynix\ Media\ Hub/fynix-hub && npx tsc --noEmit --skipLibCheck 2>&1 | grep "VideoPlayer\.tsx" | head -10`
Expected: No errors in VideoPlayer.tsx

**Step 4: Commit**

```bash
git add src/renderer/components/VideoPlayer/VideoPlayer.tsx
git commit -m "feat: show ErrorModal for video element playback errors"
```

---

## Task 5: Listen for FFmpeg error events in VideoPlayer

**Objective:** Show ErrorModal when the FFmpeg process crashes during playback.

**Files:**
- Modify: `src/renderer/components/VideoPlayer/VideoPlayer.tsx`

**Step 1: Add useEffect to listen for `player:ffmpeg-error` events**

After the existing `useEffect` that resets state when `streamUrl` changes (line 436), add:

```typescript
// Listen for FFmpeg process errors (unexpected exit during playback)
useEffect(() => {
  if (!streamUrl) return
  const unsubscribe = window.api.player.onFfmpegError?.((errorMsg: string) => {
    if (exitedRef.current) return
    window.api.log(`[VP] FFmpeg error received: ${errorMsg}`)
    exitedRef.current = true
    setDisplayError(errorMsg)
  })
  return unsubscribe
}, [streamUrl])
```

**Step 2: Verify TypeScript compiles**

Run: `cd /home/boc/Documents/Fynix\ Media\ Hub/fynix-hub && npx tsc --noEmit --skipLibCheck 2>&1 | grep "VideoPlayer\.tsx" | head -10`
Expected: No errors

**Step 3: Commit**

```bash
git add src/renderer/components/VideoPlayer/VideoPlayer.tsx
git commit -m "feat: listen for FFmpeg error events and show ErrorModal"
```

---

## Task 6: Run full test suite and verify

**Objective:** Ensure no regressions and all tests pass.

**Files:**
- None (verification only)

**Step 1: Run full test suite**

Run: `cd /home/boc/Documents/Fynix\ Media\ Hub/fynix-hub && npm test`
Expected: 336+ tests pass, 1 pre-existing epg.test.ts failure unchanged

**Step 2: Run TypeScript check**

Run: `cd /home/boc/Documents/Fynix\ Media\ Hub/fynix-hub && npm run typecheck`
Expected: Only pre-existing test-file warnings, no new errors

**Step 3: Verify the app launches without errors**

Run: `cd /home/boc/Documents/Fynix\ Media\ Hub/fynix-hub && npm start`
Expected: App launches, no console errors about missing IPC channels

---

## Files Changed Summary

| File | Change |
|------|--------|
| `src/main/ipc/handlers.ts` | Add `player:get-session-error` handler |
| `src/main/services/player.service.ts` | Add FFmpeg error watcher + IPC emission |
| `src/preload/index.ts` | Expose `getSessionError` and `onFfmpegError` |
| `src/renderer/components/VideoPlayer/VideoPlayer.tsx` | Show ErrorModal for video errors + FFmpeg events |
| `src/renderer/components/ErrorModal/ErrorModal.tsx` | Add FFmpeg error friendly messages |
| `src/test/unit/components/ErrorModal.test.tsx` | Add tests for FFmpeg error messages |

## Risks & Tradeoffs

- **Polling vs events:** The FFmpeg error watcher uses a 2s interval check. This is simple and reliable — the alternative (FFmpeg process emitting events via IPC) would require deeper refactoring of the spawn logic. The 2s delay is acceptable for error reporting.
- **Error message mapping:** The `friendlyMessage()` patterns use keyword matching. This is intentionally simple — the existing patterns already use this approach. A more robust approach would use error codes, but that's over-engineering for this use case.
- **Auto-reconnect preserved:** The existing auto-reconnect logic for reconnectable streams is preserved. Only non-reconnectable streams (or exhausted retries) show the ErrorModal.
