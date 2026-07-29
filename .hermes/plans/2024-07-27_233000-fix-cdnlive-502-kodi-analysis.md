# Fix CDNLive 502 — Kodi Addon Analysis + Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Fix CDNLive 502 errors by understanding how Kodi addons successfully play these streams, then applying the same approach in Fynix Media Hub.

**Architecture:** Kodi addons (JetProxy, JetExtractors, live.streamspro) play CDNLive streams by attaching headers (Referer, Origin) to each request. JetProxy forwards original request headers through a local proxy. JetExtractors uses `manifest_headers`/`stream_headers` on the inputstream. Our web player (HLS.js) doesn't send these headers, causing the CDN to reject requests with 502.

**Tech Stack:** HLS.js, Electron session interceptors, TypeScript, React

---

## Root Cause Analysis

### How MPV played CDNLive (worked)
```python
# From old mpv.service.ts — MPV used libcurl which:
# 1. Sends --referrer=https://cdnlivetv.is/ (Referer header)
# 2. Does NOT send an Origin header (libcurl default)
# 3. Sends standard User-Agent
mpvArgs.push(`--referrer=${_referer}`)  # _referer = 'https://cdnlivetv.is/'
```

### How our HTML5 player fails
1. HLS.js makes XHR requests from `http://localhost:5173`
2. Browser sends `Origin: http://localhost:5173` automatically
3. Browser sends `Referer: http://localhost:5173/` (page origin)
4. CDN checks headers → rejects (502) because Origin doesn't match
5. Even with our session interceptor, the CORS `Access-Control-Allow-Origin` header conflict causes failures

### How Kodi addons solve it
- **JetProxy** (`server.py` line 34-40): Forwards ALL original request headers through a local proxy
- **JetExtractors** (`models.py` line 107,110): Uses `manifest_headers` and `stream_headers` properties on inputstream.adaptive
- **live.streamspro** (`default.py` line 62-80): Sets `User-Agent` header and supports custom headers via `url|Header=value` syntax

### The correct fix
Configure HLS.js to send the correct Referer header on every request (manifest + segments). This is equivalent to inputstream.adaptive's `stream_headers`. The session-level interceptor approach has been causing CORS conflicts and should be removed.

---

## Task 1: Remove session-level CORS interceptors

**Objective:** Remove the `onBeforeSendHeaders` and `onHeadersReceived` interceptors that are causing CORS header conflicts.

**Files:**
- Modify: `src/main/index.ts:140-160`

**Step 1:** Delete the CDNLive interceptor block (the entire `onBeforeSendHeaders` + `onHeadersReceived` section added for cdnlivetv.tv)

**Step 2:** Verify no other code depends on these interceptors

**Step 3:** Commit
```bash
git add src/main/index.ts
git commit -m "revert: remove CDNLive session interceptors — caused CORS conflicts"
```

---

## Task 2: Configure HLS.js to send Referer header via xhrSetup

**Objective:** Make HLS.js send `Referer: https://cdnlivetv.is/` on every request to cdnlivetv.tv, matching what MPV did with `--referrer`.

**Files:**
- Modify: `src/renderer/components/VideoPlayer/VideoJsPlayer.tsx`

**Step 1:** Find the HlsJsVideo component usage and add HLS.js config with xhrSetup

The `HlsJsVideo` component from `@videojs/react` accepts an `hlsConfig` prop. Add `xhrSetup` to inject the Referer header:

```tsx
<HlsJsVideo
  key={src}
  ref={videoRef}
  className={styles.video}
  src={src}
  poster={poster}
  autoPlay
  playsInline
  preload="auto"
  hlsConfig={{
    xhrSetup: (xhr: XMLHttpRequest, url: string) => {
      if (/cdnlivetv\.tv/i.test(url)) {
        xhr.setRequestHeader('Referer', 'https://cdnlivetv.is/')
      }
    },
  }}
  onTimeUpdate={handleTimeUpdateInternal}
  onDurationChange={handleDurationChange}
  onEnded={onEnded}
  onError={(e: React.SyntheticEvent<HTMLVideoElement>) => onError?.(e.currentTarget.error as MediaError)}
  onPlay={handlePlayInternal}
  onPause={handlePauseInternal}
  onCanPlay={onCanPlay}
  onClick={handleVideoClick}
  onDoubleClick={handleVideoDoubleClick}
/>
```

**Step 2:** Verify TypeScript compiles
```bash
cd "/home/boc/Documents/Fynix Media Hub/fynix-hub" && npx tsc --noEmit --skipLibCheck 2>&1 | grep -v "src/test/" | grep "error"
```

**Step 3:** Commit
```bash
git add src/renderer/components/VideoPlayer/VideoJsPlayer.tsx
git commit -m "fix: send Referer header on CDNLive HLS requests via xhrSetup"
```

---

## Task 3: Verify and test

**Objective:** Ensure the fix works and no regressions.

**Step 1:** Run tests
```bash
cd "/home/boc/Documents/Fynix Media Hub/fynix-hub" && npm test 2>&1 | grep -E "Test Files|Tests"
```
Expected: 341+ passed, 1 pre-existing failure

**Step 2:** TypeScript check
```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep -v "src/test/" | grep "error"
```

---

## Why this works

| Approach | Headers sent | Result |
|----------|-------------|--------|
| MPV | `Referer: cdnlivetv.is` via `--referrer` | ✅ Works |
| Current (no headers) | No Referer, wrong Origin | ❌ 502 |
| Session interceptor (old) | Adds Referer + CORS | ❌ CORS conflict |
| HLS.js xhrSetup (proposed) | Referer on every request | ✅ Should work |

The `xhrSetup` approach is the cleanest because:
1. It sends headers exactly when needed (per-request)
2. No CORS conflicts (no `onHeadersReceived` manipulation)
3. Equivalent to what inputstream.adaptive does with `stream_headers`
4. Only affects cdnlivetv.tv URLs (scoped regex match)
