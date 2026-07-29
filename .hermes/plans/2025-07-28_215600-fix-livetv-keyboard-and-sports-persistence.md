# Fix LiveTV Modal Keyboard Navigation & Sports Settings Persistence

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Fix two persistent bugs: (1) LiveTV's source selection modal is not navigable with arrow keys despite using `window.addEventListener`, and (2) sports category selections reset on app restart.

**Architecture:** Both bugs are in the renderer process. Bug 1 involves LiveTV's keyboard event handler pattern and how it interacts with App.tsx's own global handler. Bug 2 involves the settings load/save cycle and how profiles interact with top-level settings keys in `cache.service.ts` (SQLite-backed).

**Tech Stack:** Electron 42, React 19, Zustand, TypeScript, CSS Modules

---

## Investigation Summary

### Bug 1: LiveTV Modal Keyboard Navigation

**Current approach:** LiveTV uses `window.addEventListener('keydown', handleKey)` (same pattern as SearchModal, which works). The handler checks `selectedChannel` to branch between grid navigation and source modal navigation.

**What was found:**
- App.tsx registers its own `window.addEventListener('keydown', ...)` at `src/renderer/App.tsx:1500`. Both handlers fire on every keypress. The App handler does NOT intercept arrow keys when `view === 'live-tv'` (it only handles Escape, Backspace, s, Enter-on-input, c). So App's handler is not the cause.
- The effect dependency array includes `selectedChannel`, `focusedSourceIndex`, `getSources`, etc. — a long list that causes frequent add/remove cycles of the listener.
- **Key finding: the CSS class referenced in the JSX doesn't exist.** The TSX uses `styles['source-item-focused']` but the CSS module (`LiveTV.module.css`) only defines `.sourceItem.focused` (camelCase). When CSS Modules processes `.sourceItem.focused`, it creates the camelCase key `sourceItemFocused` — NOT `sourceItemFocused` from kebab-case `source-item-focused`. The focused class is never applied, so **there is no visual feedback** for which source is selected — but this alone shouldn't break keyboard functionality.
- **Most likely root cause**: The `window.addEventListener` callback closes over `selectedChannel` from the render scope. When the component re-renders (e.g., because `m3uSources` arrives from the async M3U fetch, or `focusedSourceIndex` changes), the effect cleanup/add cycle briefly leaves the handler with a stale `selectedChannel = null` closure. During this gap, arrow keys enter the grid navigation branch instead of the modal branch — which matches user's description "pressing the keys move the selection around the Live TV screen instead."

### Bug 2: Sports Settings Not Persisting

**Current approach:** `setSportsSelected(ids)` calls `set({ sportsSelected: ids })`, then `await window.api.settings.set('sportsSelected', ids)` (IPC to main process, writes to SQLite), then `get().saveToDisk()` (fire-and-forget, writes ALL settings). On restart, `loadFromDisk()` reads from DB and restores.

**What was found:**
- The `saveToDisk()` function writes settings in a single `Promise.all(...)` with 30+ IPC calls. It's called without `await` in many setters, including the sports setters. The app close handler might kill the process before all writes complete.
- However, `setSportsSelected` now does `await window.api.settings.set('sportsSelected', ids)` directly before calling `saveToDisk()`. This single IPC write should complete before the setter returns.
- **Critical finding: profile/top-level conflict.** The `UserProfile` interface (line 7-15 in settingsStore.ts) includes `sportsSelected: string[]`. When a profile exists, the top-level `sportsSelected` key AND the profile's `sportsSelected` are both stored in the DB. On load:
  1. `getAllSettings()` returns both `sportsSelected` and `profiles` from DB
  2. At line 403-408: profiles are backfilled with `p.sportsSelected || settings.sportsSelected || []` — but `p.sportsSelected` (an empty array `[]`) is **truthy**, so a profile with `sportsSelected: []` would NOT fall through to `settings.sportsSelected`
  3. At line 414: `set(settings)` sets both the top-level and profiles from DB
  4. At line 469-476: explicit restore reads `sportsSelected` from DB again — BUT the condition `savedSportsSelected.length > 0 || (settings as any).sportsSelected?.length === undefined` means an empty array `[]` from DB won't overwrite the (already-correct) Zustand state
- **The actual problem:** When `setSportsSelected(ids)` updates the top-level state, it does NOT update the **active profile's** `sportsSelected`. So if the user has a Default profile (which most users do — see line 387), the profile's `sportsSelected` stays `[]` permanently. On app restart:
  1. DB has `sportsSelected=['basketball','football']` (top-level, from `window.api.settings.set`)
  2. DB has `profiles=[{..., sportsSelected: []}]` (profile, never updated)
  3. `loadFromDisk` reads both, sets Zustand state, then explicit restore sets `sportsSelected` correctly... **unless auto-login profile overrides it**

---

## Proposed Approach

### Bug 1 Fix: LiveTV Modal Keyboard
- Follow SearchModal's exact pattern exactly: register a single `window.addEventListener` in `useEffect` with minimal dependency array
- Remove the React `onKeyDown` props from all LiveTV divs entirely (already done)
- Add proper CSS class for source-item-focused styling
- Consider moving the keyboard handler into `App.tsx` itself for the live-tv view (like SearchModal does from App), rather than having it inside the LiveTV child component — this avoids the child mount/unmount issue

### Bug 2 Fix: Sports Settings Persistence
- Sync the top-level `sportsSelected` into the active profile whenever `setSportsSelected` is called
- On `loadFromDisk`, always use the top-level `sportsSelected` from the DB (which is written directly via IPC), ignoring the profile's stale value
- Alternatively, store `sportsSelected` ONLY at the top level and remove it from the `UserProfile` interface (YAGNI — profiles were meant to have per-profile sports selections but this feature is unused)

---

## Step-by-Step Plan

### Task 1: Create CSS class for source-item-focused

**Objective:** Add the missing CSS module class so focused sources are visually highlighted

**Files:**
- Modify: `src/renderer/components/LiveTV/LiveTV.module.css`

**Changes:**
```css
/* Add this block — replaces the non-existent .sourceItem.focused compound selector */
.source-item-focused {
  background: rgba(var(--accent-rgb), 0.15);
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}
```

**Verification:** `npm run typecheck` — CSS doesn't affect TypeScript, should pass.

---

### Task 2: Add keyboard handler directly in App.tsx for live-tv view

**Objective:** Follow SearchModal's pattern — App.tsx owns the keyboard handler and delegates to LiveTV via a ref or callback. This eliminates the child mount/unmount and stale-closure issues.

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/LiveTV/LiveTV.tsx`

**Step 1: Add a ref-based callback in LiveTV**

```typescript
// In LiveTV.tsx — add at top of component
export interface LiveTVAPI {
  handleKeyDown: (e: KeyboardEvent) => boolean  // returns true if handled
}

export default function LiveTV({ onPlayUrl, onBack, apiRef }:
  { onPlayUrl: (url: string) => Promise<void>; onBack: () => void; apiRef?: React.MutableRefObject<LiveTVAPI | null> }) {
  
  // ... existing code ...
  
  // Expose keyboard handler via ref
  const handleKeyDown = useCallback((e: KeyboardEvent): boolean => {
    if (selectedChannel) {
      const sources = getSources()
      if (sources.length === 0) return false
      if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedSourceIndex(i => (i + 1) % sources.length); return true }
      if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedSourceIndex(i => (i - 1 + sources.length) % sources.length); return true }
      if (e.key === 'Enter') { e.preventDefault(); /* play selected source */; return true }
      if (e.key === 'Backspace' || e.key === 'Escape') { e.preventDefault(); setSelectedChannel(null); return true }
      return false
    }
    // Grid navigation...
    return false
  }, [selectedChannel, focusedSourceIndex, getSources, ...])
  
  useEffect(() => {
    if (apiRef) { apiRef.current = { handleKeyDown }; return () => { if (apiRef) apiRef.current = null } }
  })
  
  // Remove the window.addEventListener useEffect entirely (lines 235-306 in current code)
```

**Step 2: Update App.tsx to delegate to LiveTV**

In App.tsx's global keyboard handler (lines 1422-1502), add before the existing logic:

```typescript
// LiveTV keyboard delegation
if (view === 'live-tv') {
  if (liveTvApiRef.current?.handleKeyDown(e)) return
}
```

And at the top of the App component:

```typescript
const liveTvApiRef = useRef<{ handleKeyDown: (e: KeyboardEvent) => boolean } | null>(null)
```

Pass `apiRef={liveTvApiRef}` to LiveTV:

```tsx
<LiveTV
  onPlayUrl={...}
  onBack={...}
  apiRef={liveTvApiRef}
/>
```

**Step 3: Remove the window.addEventListener from LiveTV**

Delete the entire `useEffect(() => { window.addEventListener('keydown', handleKey) ... })` block from LiveTV.tsx (current lines 235-306).

**Verification:**
1. `npm run typecheck` — should pass
2. Navigate to LiveTV, press Enter on a channel → modal opens
3. Press ArrowDown → source selection moves down (verify visually with Task 1 CSS)
4. Press Enter → source plays
5. Press Backspace → modal closes, grid navigation works

---

### Task 3: Fix sportsSelected to sync with active profile

**Objective:** When `setSportsSelected` is called, also update the active profile so that profile-based reads return the correct value.

**Files:**
- Modify: `src/renderer/store/settingsStore.ts`

**Step 1: Update `setSportsSelected` to sync profile**

```typescript
setSportsSelected: async (ids) => {
  set((state) => {
    // Also update the active profile's sportsSelected
    if (state.activeProfileId) {
      return {
        sportsSelected: ids,
        profiles: state.profiles.map(p =>
          p.id === state.activeProfileId ? { ...p, sportsSelected: ids } : p
        )
      }
    }
    return { sportsSelected: ids }
  });
  try { await window.api.settings.set('sportsSelected', ids); } catch {}
  get().saveToDisk()
},
```

**Step 2: Clean up `loadFromDisk` restore logic**

Replace lines 468-484 with a simpler, unconditional restore:

```typescript
// Restore sports settings from top-level DB keys (unconditional)
const savedSportsSelected = await window.api.settings.get('sportsSelected');
if (Array.isArray(savedSportsSelected)) {
  console.log(`[Settings] Restored ${savedSportsSelected.length} selected sports`);
  set({ sportsSelected: savedSportsSelected });
}
```

**Verification:**
1. `npm run typecheck` — should pass
2. Open Settings → Sports, toggle some sports on/off
3. Close and restart app
4. Open Settings → Sports again — selections should match what was toggled

---

### Task 4: Add debug logging for sports save/load

**Objective:** Add console.log statements so future issues can be diagnosed from terminal output

**Files:**
- Modify: `src/renderer/store/settingsStore.ts`

**Changes:**

In `saveToDisk` (around line 498-500):
```typescript
console.log(`[Settings] Saving sportsSelected:`, JSON.stringify(state.sportsSelected));
window.api.settings.set('sportsEnabled', state.sportsEnabled),
window.api.settings.set('sportsSelected', state.sportsSelected),
window.api.settings.set('sportsTimezone', state.sportsTimezone),
```

**Verification:** Check terminal output for `[Settings] Saving sportsSelected: ["basketball","football"]` etc.

---

### Task 5: Final Verification

**Objective:** Run typecheck and lint, confirm both bugs are fixed

**Verification steps:**
1. `npm run typecheck` — should pass
2. `npm run lint` — should pass
3. Start app, navigate to LiveTV, open source modal, verify arrow keys work and visually show focus
4. Toggle sports in Settings, restart app, verify selections persist

---

## Files Likely to Change

| File | Change |
|------|--------|
| `src/renderer/components/LiveTV/LiveTV.tsx` | Add `apiRef`, ref-based `handleKeyDown`, remove `window.addEventListener` |
| `src/renderer/components/LiveTV/LiveTV.module.css` | Add `.source-item-focused` CSS class |
| `src/renderer/App.tsx` | Add `liveTvApiRef`, delegate keyboard in global handler, pass ref to LiveTV |
| `src/renderer/store/settingsStore.ts` | Sync profile in `setSportsSelected`, simplify `loadFromDisk` restore, add debug logging |

## Tests / Validation

- TypeScript: `npm run typecheck` — pass
- Lint: `npm run lint` — pass
- Manual keyboard test in LiveTV modal
- Manual restart test for sports persistence

## Risks, Tradeoffs, and Open Questions

- **Ref-based delegation vs. window listener in child:** Moving keyboard logic to App.tsx via a ref is the SearchModal pattern. However, it adds complexity with the ref. An alternative simpler fix: keep `window.addEventListener` in LiveTV but remove it from the effect dependency (use refs for all state values inside the handler). This avoids the constant add/remove cycle entirely.
- **Profile sync tradeoff:** Updating the profile's `sportsSelected` on every toggle adds an extra state update. Given that sports toggles are infrequent (not per-frame), this is negligible.
- **SearchModal comparison:** SearchModal's keyboard handler is self-contained (doesn't delegate to App). It works because it captures all state via closures without re-registering on every state change. The difference is that SearchModal uses a **single** `useEffect` with a carefully limited dependency array, while LiveTV's effect re-registered on almost every state change. Moving the handler to App.tsx via ref avoids this entirely.
