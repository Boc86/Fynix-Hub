# Live TV Server Selection Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add a server selection dropdown for Live TV with 3 backend options (CDNLive, OnDemand.st, DLHD.st) as primary + fallback sources, so users can switch providers or auto-failover when one is down.

**Architecture:** Create a `LiveTVProvider` interface with `getChannels()` and `extractUrl()` methods. Implement adapters for each server. Add a `liveTvServer` setting (persisted in settingsStore). The existing `dami-tv.service.ts` becomes the CDNLive adapter. OnDemand.st and DLHD.st get their own adapter files. The LiveTV component and EPG/Sports use the selected server (with fallback to others on failure).

**Tech Stack:** TypeScript, React, Zustand, Electron IPC

---

## Current State

- `dami-tv.service.ts` fetches channels from `api.cdnlivetv.is/api/v1/channels/`
- `extractChannelUrl()` scrapes the player page for HLS URLs
- Settings: `liveTvUser` (default "cdnlivetv"), `liveTvPlan` (default "free")
- LiveTV component calls `window.api.damiTv.getChannels()` and `window.api.damiTv.extractUrl()`
- EPG and Sports also use `damiTv.extractUrl()` for stream extraction

## Server APIs (to be confirmed by probing)

- **CDNLive** (`api.cdnlivetv.is`): Already implemented. Channels + player page scraping.
- **OnDemand.st**: API docs at `https://ondemand.st/api-docs` — likely similar channel listing + stream extraction.
- **DLHD.st**: API at `https://dlhd.st/api.php` — likely channel list + HLS stream URLs.

The plan assumes a common pattern: `GET /channels` returns channel list, stream extraction resolves to HLS URL. Adapters normalize to a common `LiveTVChannel` / `LiveTVStreamResult` type.

---

## Task 1: Define LiveTVProvider interface and channel types

**Objective:** Create the shared type definitions that all server adapters will implement.

**Files:**
- Create: `src/main/services/livetv-provider.types.ts`

**Step 1: Create the types file**

```typescript
// src/main/services/livetv-provider.types.ts

/** Normalized channel from any Live TV provider. */
export interface LiveTVChannel {
  id: string
  name: string
  image: string
  logoImage: string
  countryCode: string
  countryName: string
  countryFlag: string
  playerUrl: string
  source: string
  status: string
  /** Which provider served this channel. */
  provider: 'cdnlive' | 'ondemand' | 'dlhd'
}

/** Result of resolving a channel to a playable URL. */
export interface LiveTVStreamResult {
  hlsUrl?: string
  error?: string
}

/** Interface all Live TV providers must implement. */
export interface LiveTVProvider {
  readonly id: 'cdnlive' | 'ondemand' | 'dlhd'
  readonly label: string  // Display name in UI

  /** Fetch all channels. Returns normalized LiveTVChannel[]. */
  getChannels(): Promise<LiveTVChannel[]>

  /** Resolve a channel to a playable HLS URL. */
  extractUrl(ch: { id: string; name: string; countryCode: string; playerUrl?: string }): Promise<LiveTVStreamResult>
}
```

**Step 2: Commit**

```bash
git add src/main/services/livetv-provider.types.ts
git commit -m "feat: define LiveTVProvider interface and channel types"
```

---

## Task 2: Refactor dami-tv.service.ts to implement LiveTVProvider

**Objective:** Make the existing CDNLive service implement the new interface.

**Files:**
- Modify: `src/main/services/dami-tv.service.ts`

**Step 1: Import and implement LiveTVProvider**

At the top of the file, add import:
```typescript
import type { LiveTVProvider, LiveTVChannel as BaseLiveTVChannel, LiveTVStreamResult } from './livetv-provider.types'
```

Add at the bottom of the file (before the last empty line):
```typescript
export const cdnliveProvider: LiveTVProvider = {
  id: 'cdnlive',
  label: 'CDNLive',

  async getChannels(): Promise<BaseLiveTVChannel[]> {
    const channels = await getChannels()
    return channels.map(ch => ({ ...ch, provider: 'cdnlive' as const }))
  },

  async extractUrl(ch: { id: string; name: string; countryCode: string; playerUrl?: string }): Promise<LiveTVStreamResult> {
    const result = await extractChannelUrl(ch)
    return { hlsUrl: result.hlsUrl, error: result.hlsUrl ? undefined : 'No playable source found' }
  },
}
```

Also export the existing `getChannels` and `extractChannelUrl` functions (they're already exported).

**Step 2: Commit**

```bash
git add src/main/services/dami-tv.service.ts
git commit -m "feat: refactor dami-tv to implement LiveTVProvider interface"
```

---

## Task 3: Create OnDemand.st provider adapter

**Objective:** Implement the OnDemand.st server adapter.

**Files:**
- Create: `src/main/services/ondemand-tv.service.ts`

**Step 1: Create the adapter file**

The API structure needs to be confirmed by probing the endpoints. Based on common patterns for these services:

```typescript
// src/main/services/ondemand-tv.service.ts
import type { LiveTVProvider, LiveTVChannel, LiveTVStreamResult } from './livetv-provider.types'

const API_BASE = 'https://ondemand.st/api/v1'
// ponytail: exact endpoints TBD — probe https://ondemand.st/api-docs
// Adjust these once the API structure is confirmed.

function detectCountryCode(name: string): string {
  const t = ' ' + name.toLowerCase() + ' '
  // Reuse same detection logic as dami-tv or extract to shared util
  const CC_MAP: [string, string][] = [
    ['united states', 'us'], ['usa', 'us'], [' uk', 'gb'], ['britain', 'gb'],
    ['spain', 'es'], ['italy', 'it'], ['france', 'fr'], ['germany', 'de'],
    ['portugal', 'pt'], ['brazil', 'br'], ['india', 'in'], ['canada', 'ca'],
    ['australia', 'au'], ['turkey', 'tr'], ['poland', 'pl'],
  ]
  for (const [kw, code] of CC_MAP) {
    if (t.indexOf(kw) >= 0) return code
  }
  return 'intl'
}

function countryFlag(code: string): string {
  if (!code || code === 'intl') return '\uD83C\uDF0D'
  const c = code.toUpperCase()
  if (c.length !== 2) return '\uD83C\uDF0D'
  return String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65) + String.fromCodePoint(0x1F1E6 + c.charCodeAt(1) - 65)
}

export const ondemandProvider: LiveTVProvider = {
  id: 'ondemand',
  label: 'OnDemand',

  async getChannels(): Promise<LiveTVChannel[]> {
    // ponytail: exact endpoint/format TBD — adapt after probing API
    const res = await fetch(`${API_BASE}/channels`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`OnDemand channels HTTP ${res.status}`)
    const data = await res.json()
    const raw = Array.isArray(data) ? data : (data.channels || data.data || [])
    
    return raw.map((item: any) => {
      const name = item.name || item.title || ''
      const code = item.code || item.country || detectCountryCode(name)
      return {
        id: String(item.id || `${name}_${code}`),
        name,
        image: item.image || item.logo || '',
        logoImage: '',
        countryCode: code,
        countryName: code.toUpperCase(),
        countryFlag: countryFlag(code),
        playerUrl: item.url || item.playerUrl || '',
        source: item.source || item.category || '',
        status: item.status || '',
        provider: 'ondemand' as const,
      }
    }).filter((ch: LiveTVChannel) => ch.name)
  },

  async extractUrl(ch: { id: string; name: string; countryCode: string; playerUrl?: string }): Promise<LiveTVStreamResult> {
    try {
      // ponytail: exact extraction logic TBD — adapt after probing API
      const pageUrl = ch.playerUrl || `${API_BASE}/player/${encodeURIComponent(ch.name)}`
      const res = await fetch(pageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000),
      })
      const html = await res.text()
      const m3u8Match = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/)
      if (m3u8Match) return { hlsUrl: m3u8Match[0] }
      return { error: 'No HLS URL found' }
    } catch (err: any) {
      return { error: err?.message || 'Extraction failed' }
    }
  },
}
```

**NOTE:** The exact API endpoints and response format for OnDemand.st need to be confirmed. The plan above is a scaffold — the subagent should probe the API docs page and adjust endpoints/format accordingly. If the API is unavailable, leave the adapter as a stub with TODO comments.

**Step 2: Commit**

```bash
git add src/main/services/ondemand-tv.service.ts
git commit -m "feat: add OnDemand.st LiveTV provider adapter"
```

---

## Task 4: Create DLHD.st provider adapter

**Objective:** Implement the DLHD.st server adapter.

**Files:**
- Create: `src/main/services/dlhd-tv.service.ts`

**Step 1: Create the adapter file**

```typescript
// src/main/services/dlhd-tv.service.ts
import type { LiveTVProvider, LiveTVChannel, LiveTVStreamResult } from './livetv-provider.types'

const API_BASE = 'https://dlhd.st/api'
// ponytail: exact endpoints TBD — probe https://dlhd.st/api.php

function detectCountryCode(name: string): string {
  const t = ' ' + name.toLowerCase() + ' '
  const CC_MAP: [string, string][] = [
    ['united states', 'us'], ['usa', 'us'], [' uk', 'gb'], ['britain', 'gb'],
    ['spain', 'es'], ['italy', 'it'], ['france', 'fr'], ['germany', 'de'],
    ['portugal', 'pt'], ['brazil', 'br'], ['india', 'in'], ['canada', 'ca'],
    ['australia', 'au'], ['turkey', 'tr'], ['poland', 'pl'],
  ]
  for (const [kw, code] of CC_MAP) {
    if (t.indexOf(kw) >= 0) return code
  }
  return 'intl'
}

function countryFlag(code: string): string {
  if (!code || code === 'intl') return '\uD83C\uDF0D'
  const c = code.toUpperCase()
  if (c.length !== 2) return '\uD83C\uDF0D'
  return String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65) + String.fromCodePoint(0x1F1E6 + c.charCodeAt(1) - 65)
}

export const dlhdProvider: LiveTVProvider = {
  id: 'dlhd',
  label: 'DLHD',

  async getChannels(): Promise<LiveTVChannel[]> {
    // ponytail: exact endpoint/format TBD — adapt after probing API
    const res = await fetch(`${API_BASE}.php?action=channels`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`DLHD channels HTTP ${res.status}`)
    const data = await res.json()
    const raw = Array.isArray(data) ? data : (data.channels || data.data || [])

    return raw.map((item: any) => {
      const name = item.name || item.title || ''
      const code = item.code || item.country || detectCountryCode(name)
      return {
        id: String(item.id || `${name}_${code}`),
        name,
        image: item.image || item.logo || '',
        logoImage: '',
        countryCode: code,
        countryName: code.toUpperCase(),
        countryFlag: countryFlag(code),
        playerUrl: item.url || item.playerUrl || item.embed || '',
        source: item.source || item.category || '',
        status: item.status || '',
        provider: 'dlhd' as const,
      }
    }).filter((ch: LiveTVChannel) => ch.name)
  },

  async extractUrl(ch: { id: string; name: string; countryCode: string; playerUrl?: string }): Promise<LiveTVStreamResult> {
    try {
      const pageUrl = ch.playerUrl || `${API_BASE}.php?action=stream&id=${encodeURIComponent(ch.id)}`
      const res = await fetch(pageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000),
      })
      const html = await res.text()
      const m3u8Match = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/)
      if (m3u8Match) return { hlsUrl: m3u8Match[0] }
      return { error: 'No HLS URL found' }
    } catch (err: any) {
      return { error: err?.message || 'Extraction failed' }
    }
  },
}
```

**NOTE:** Same as Task 3 — exact API needs confirmation. Leave as scaffold with TODO if API is unavailable.

**Step 2: Commit**

```bash
git add src/main/services/dlhd-tv.service.ts
git commit -m "feat: add DLHD.st LiveTV provider adapter"
```

---

## Task 5: Create provider registry with fallback logic

**Objective:** Central provider lookup + fallback chain.

**Files:**
- Create: `src/main/services/livetv-providers.ts`

**Step 1: Create the registry**

```typescript
// src/main/services/livetv-providers.ts
import type { LiveTVProvider, LiveTVChannel, LiveTVStreamResult } from './livetv-provider.types'
import { cdnliveProvider } from './dami-tv.service'
import { ondemandProvider } from './ondemand-tv.service'
import { dlhdProvider } from './dlhd-tv.service'

export type LiveTVServerId = 'cdnlive' | 'ondemand' | 'dlhd'

const providers: Record<LiveTVServerId, LiveTVProvider> = {
  cdnlive: cdnliveProvider,
  ondemand: ondemandProvider,
  dlhd: dlhdProvider,
}

export function getProvider(id: LiveTVServerId): LiveTVProvider {
  return providers[id]
}

export function getAllProviders(): LiveTVProvider[] {
  return Object.values(providers)
}

export function getServerLabel(id: LiveTVServerId): string {
  return providers[id]?.label ?? id
}

/**
 * Get channels with fallback: try primary provider, then others on failure.
 * Merges results from all working providers.
 */
export async function getChannelsWithFallback(
  primaryId: LiveTVServerId,
): Promise<LiveTVChannel[]> {
  const allIds: LiveTVServerId[] = ['cdnlive', 'ondemand', 'dlhd']
  const errors: string[] = []

  // Try all providers in parallel, merge successful results
  const results = await Promise.allSettled(
    allIds.map(async (id) => {
      try {
        return await providers[id].getChannels()
      } catch (err: any) {
        errors.push(`${id}: ${err?.message}`)
        return []
      }
    })
  )

  const channels = results
    .filter((r): r is PromiseFulfilledResult<LiveTVChannel[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)

  // Deduplicate by name+countryCode (prefer primary provider's version)
  const seen = new Map<string, LiveTVChannel>()
  for (const ch of channels) {
    const key = `${ch.name}|${ch.countryCode}`
    if (!seen.has(key) || ch.provider === primaryId) {
      seen.set(key, ch)
    }
  }

  return Array.from(seen.values())
}

/**
 * Extract URL with fallback: try primary provider first, then others.
 */
export async function extractUrlWithFallback(
  primaryId: LiveTVServerId,
  ch: { id: string; name: string; countryCode: string; playerUrl?: string },
): Promise<LiveTVStreamResult> {
  // Try primary provider first
  try {
    const result = await providers[primaryId].extractUrl(ch)
    if (result.hlsUrl) return result
  } catch {}

  // Fallback to other providers
  const allIds: LiveTVServerId[] = ['cdnlive', 'ondemand', 'dlhd']
  for (const id of allIds) {
    if (id === primaryId) continue
    try {
      const result = await providers[id].extractUrl(ch)
      if (result.hlsUrl) return result
    } catch {}
  }

  return { error: 'All providers failed to extract stream URL' }
}
```

**Step 2: Commit**

```bash
git add src/main/services/livetv-providers.ts
git commit -m "feat: add LiveTV provider registry with fallback logic"
```

---

## Task 6: Add liveTvServer setting to settingsStore

**Objective:** Persist the selected server in settings.

**Files:**
- Modify: `src/renderer/store/settingsStore.ts`

**Step 1: Add state and setter**

In the `SettingsState` interface (around line 55-65), add:
```typescript
liveTvServer: 'cdnlive' | 'ondemand' | 'dlhd'
```

In the initial state (around line 176), add:
```typescript
liveTvServer: 'cdnlive',
```

In the actions (around line 233), add:
```typescript
setLiveTvServer: (server) => { set({ liveTvServer: server }); get().saveToDisk() },
```

In the `saveToDisk` function (around line 467), add:
```typescript
window.api.settings.set('liveTvServer', state.liveTvServer),
```

In the `loadFromDisk` function (where settings are loaded), add:
```typescript
liveTvServer: loaded.liveTvServer || 'cdnlive',
```

**Step 2: Commit**

```bash
git add src/renderer/store/settingsStore.ts
git commit -m "feat: add liveTvServer setting to settingsStore"
```

---

## Task 7: Update IPC handlers to use provider registry

**Objective:** Route IPC calls through the provider registry instead of directly to dami-tv.

**Files:**
- Modify: `src/main/ipc/handlers.ts`
- Modify: `src/preload/index.ts`

**Step 1: Update handlers.ts**

Import the provider registry:
```typescript
import { getChannelsWithFallback, extractUrlWithFallback, type LiveTVServerId } from '../services/livetv-providers'
```

Update the existing `dami-tv:get-channels` handler to accept an optional server parameter:
```typescript
handle('dami-tv:get-channels', async (_event, server?: LiveTVServerId) => {
  const serverId = server || 'cdnlive'
  return getChannelsWithFallback(serverId)
})
```

Update the `dami-tv:extract-url` handler:
```typescript
handle('dami-tv:extract-url', async (_event, ch: { id: string; name: string; countryCode: string; playerUrl?: string }, server?: LiveTVServerId) => {
  const serverId = server || 'cdnlive'
  return extractUrlWithFallback(serverId, ch)
})
```

**Step 2: Update preload/index.ts**

Update the `damiTv` object to pass server parameter:
```typescript
damiTv: {
  getChannels: (server?: string) => ipcRenderer.invoke('dami-tv:get-channels', server),
  getAvailableCountries: () => ipcRenderer.invoke('dami-tv:get-available-countries'),
  extractUrl: (ch: { id: string; name: string; countryCode: string; playerUrl?: string }, server?: string) =>
    ipcRenderer.invoke('dami-tv:extract-url', ch, server),
},
```

**Step 3: Commit**

```bash
git add src/main/ipc/handlers.ts src/preload/index.ts
git commit -m "feat: route LiveTV IPC through provider registry"
```

---

## Task 8: Add server selector to Settings UI

**Objective:** Let users pick their preferred Live TV server.

**Files:**
- Modify: `src/renderer/components/Settings/Settings.tsx`

**Step 1: Add server selector in the Live TV settings tab**

In the Live TV settings section (around line 1741, after the "Live TV ENABLED" toggle), add a server selector when `liveTvEnabled` is true:

```tsx
{store.liveTvEnabled && (
  <div className={styles.settingGroup}>
    <h3 className={styles.settingTitle}>Server</h3>
    <p className={styles.settingDesc}>Select the primary channel source. Other servers are used as fallback if the primary fails.</p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {[
        { id: 'cdnlive', label: 'CDNLive', desc: 'Default — broadest channel list' },
        { id: 'ondemand', label: 'OnDemand', desc: 'Alternative source' },
        { id: 'dlhd', label: 'DLHD', desc: 'Alternative source' },
      ].map(srv => (
        <button
          key={srv.id}
          tabIndex={0}
          className={`${styles.toggle} ${store.liveTvServer === srv.id ? styles.toggleActive : ''}`}
          onClick={() => store.setLiveTvServer(srv.id as any)}
          style={{ flex: '1 1 120px', textAlign: 'center' }}
        >
          {srv.label}
        </button>
      ))}
    </div>
    {/* Keep existing API Credentials section below */}
  </div>
)}
```

This goes BEFORE the existing "API Credentials" section. The credentials section remains for CDNLive-specific auth.

**Step 2: Commit**

```bash
git add src/renderer/components/Settings/Settings.tsx
git commit -m "feat: add server selector to Live TV settings"
```

---

## Task 9: Update LiveTV component to use selected server

**Objective:** Pass the selected server to API calls.

**Files:**
- Modify: `src/renderer/components/LiveTV/LiveTV.tsx`

**Step 1: Use liveTvServer setting in channel fetching**

In the `useEffect` that loads channels (line 63-70), pass the server:
```typescript
useEffect(() => {
  setLoading(true)
  const server = settingsStore.liveTvServer || 'cdnlive'
  window.api.damiTv.getChannels(server).then(ch => {
    window.api.log(`[LiveTV] ${ch.length} channels loaded from ${server}`)
    setChannels(ch)
    setLoading(false)
  }).catch(() => setLoading(false))
}, [settingsStore.liveTvServer])
```

**Step 2: Use liveTvServer in playChannel**

In `playChannel` (line 158-172), pass the server to extractUrl:
```typescript
const playChannel = useCallback(async (ch: Channel) => {
  setPlaying(ch.id)
  setPlayError(null)
  const server = settingsStore.liveTvServer || 'cdnlive'
  try {
    const result = await window.api.damiTv.extractUrl(
      { id: ch.id, name: ch.name, countryCode: ch.countryCode, playerUrl: ch.playerUrl },
      server
    )
    if (result?.hlsUrl) {
      await onPlayUrl(result.hlsUrl)
    } else {
      setPlayError(`No playable source for ${ch.name}.`)
    }
  } catch (err: any) {
    setPlayError(`Failed to play ${ch.name}: ${err?.message || 'Unknown error'}`)
  }
  setPlaying(null)
}, [onPlayUrl, settingsStore.liveTvServer])
```

**Step 3: Commit**

```bash
git add src/renderer/components/LiveTV/LiveTV.tsx
git commit -m "feat: LiveTV component uses selected server"
```

---

## Task 10: Update EPG and Sports to use selected server

**Objective:** Make EPG and Sports stream extraction server-aware.

**Files:**
- Modify: `src/renderer/components/EPG/EPG.tsx`
- Modify: `src/renderer/components/Sports/Sports.tsx`

**Step 1: EPG.tsx — pass server to extractUrl**

Find where `window.api.damiTv.extractUrl` is called (around line 147) and pass the server from settings:
```typescript
const server = useSettingsStore.getState().liveTvServer || 'cdnlive'
const result = await window.api.damiTv.extractUrl({ ... }, server)
```

**Step 2: Sports.tsx — pass server to extractUrl**

Find where `window.api.damiTv.extractUrl` is called (around line 321) and pass the server:
```typescript
const server = useSettingsStore.getState().liveTvServer || 'cdnlive'
const result = await window.api.damiTv.extractUrl({ ... }, server)
```

**Step 3: Commit**

```bash
git add src/renderer/components/EPG/EPG.tsx src/renderer/components/Sports/Sports.tsx
git commit -m "feat: EPG and Sports use selected LiveTV server"
```

---

## Task 11: Run full test suite and verify

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
| `src/main/services/livetv-provider.types.ts` | NEW — interface + types |
| `src/main/services/dami-tv.service.ts` | Add `cdnliveProvider` export |
| `src/main/services/ondemand-tv.service.ts` | NEW — OnDemand adapter |
| `src/main/services/dlhd-tv.service.ts` | NEW — DLHD adapter |
| `src/main/services/livetv-providers.ts` | NEW — registry + fallback |
| `src/renderer/store/settingsStore.ts` | Add `liveTvServer` state |
| `src/main/ipc/handlers.ts` | Route through provider registry |
| `src/preload/index.ts` | Pass server param |
| `src/renderer/components/Settings/Settings.tsx` | Server selector UI |
| `src/renderer/components/LiveTV/LiveTV.tsx` | Use selected server |
| `src/renderer/components/EPG/EPG.tsx` | Use selected server |
| `src/renderer/components/Sports/Sports.tsx` | Use selected server |

## Risks & Tradeoffs

- **API format uncertainty**: OnDemand.st and DLHD.st API structures are unknown (URLs didn't extract). The adapter files are scaffolds with TODO markers. The subagent should probe the APIs and adjust. If APIs are unavailable, leave as stubs that throw "Not configured".
- **Country code detection duplication**: The `detectCountryCode` function is duplicated across adapters. Could extract to a shared util, but YAGNI — if the adapters converge, refactor then.
- **Fallback merging**: The `getChannelsWithFallback` merges channels from all providers. This means the channel list may be larger than any single provider. Deduplication by name+countryCode prevents duplicates.
- **Backward compatibility**: Default server is 'cdnlive', existing `liveTvUser`/`liveTvPlan` settings remain for CDNLive auth. Other providers may not need credentials.
