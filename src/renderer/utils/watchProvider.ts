// Provider routing for watch-tracking (Trakt vs MDBList).
// All renderer call sites that touched window.api.trakt directly should
// use getWatchApi() instead, so the active provider (settingsStore
// `watchProvider`) drives watched status, scrobbling, and playback resume.

import { useSettingsStore } from '../store/settingsStore'

type WatchApi = typeof window.api.trakt

export function getWatchApi(): WatchApi {
  return useSettingsStore.getState().watchProvider === 'mdblist'
    ? window.api.mdblist
    : window.api.trakt
}

/** Reactive hook: true when the ACTIVE provider is connected. */
export function useWatchConnected(): boolean {
  const provider = useSettingsStore((s) => s.watchProvider)
  const traktConnected = useSettingsStore((s) => s.traktConnected)
  const mdblistConnected = useSettingsStore((s) => s.mdblistConnected)
  return provider === 'mdblist' ? mdblistConnected : traktConnected
}
