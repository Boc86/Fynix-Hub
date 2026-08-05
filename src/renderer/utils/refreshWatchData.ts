import { useMediaStore } from '../store/mediaStore'

/**
 * Force the watched-status / up-next UI to reflect reality immediately:
 * bust the main-process MDBList cache (5-min TTL would otherwise serve stale
 * data), then bump refreshVersion so Browser re-fetches.
 */
export async function forceRefreshWatchData(): Promise<void> {
  try {
    await window.api.mdblist.clearCache()
  } catch { /* ignore */ }
  useMediaStore.getState().triggerRefresh()
}
