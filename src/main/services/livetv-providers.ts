import type { LiveTVProvider, LiveTVChannel, LiveTVStreamResult } from './livetv-provider.types';
import { cdnliveProvider } from './dami-tv.service';
import { ondemandProvider } from './ondemand-tv.service';
import { dlhdProvider } from './dlhd-tv.service';
import { iptvM3uProvider } from './iptv-m3u.provider';

export type LiveTVServerId = 'cdnlive' | 'ondemand' | 'dlhd' | 'iptv-m3u';

const providers: Record<LiveTVServerId, LiveTVProvider> = {
  cdnlive: cdnliveProvider,
  ondemand: ondemandProvider,
  dlhd: dlhdProvider,
  'iptv-m3u': iptvM3uProvider
};

export function getProvider(id: LiveTVServerId): LiveTVProvider {
  return providers[id];
}

export function getAllProviders(): LiveTVProvider[] {
  return Object.values(providers);
}

export function getServerLabel(id: LiveTVServerId): string {
  return providers[id]?.label ?? id;
}

/**
 * Get channels from all providers, merge and deduplicate.
 * Primary provider's version is preferred on conflicts.
 */
export async function getChannelsWithFallback(
  primaryId: LiveTVServerId,
): Promise<LiveTVChannel[]> {
  const allIds: LiveTVServerId[] = ['cdnlive', 'ondemand', 'dlhd', 'iptv-m3u'];

  const results = await Promise.allSettled(
    allIds.map(async (id) => {
      try {
        return await providers[id].getChannels();
      } catch {
        return [];
      }
    })
  );

  const channels = results
    .filter((r): r is PromiseFulfilledResult<LiveTVChannel[]> => r.status === 'fulfilled')
    .flatMap(r => r.value);

  const seen = new Map<string, LiveTVChannel>();
  for (const ch of channels) {
    const key = `${ch.name}|${ch.countryCode}`;
    if (!seen.has(key) || ch.provider === primaryId) {
      seen.set(key, ch);
    }
  }

  return Array.from(seen.values());
}

/**
 * Extract URL: try primary provider first, fallback to others.
 */
export async function extractUrlWithFallback(
  primaryId: LiveTVServerId,
  ch: { id: string; name: string; countryCode: string; playerUrl?: string },
): Promise<LiveTVStreamResult> {
  try {
    const result = await providers[primaryId].extractUrl(ch);
    if (result.hlsUrl) return result;
  } catch {}

  const allIds: LiveTVServerId[] = ['cdnlive', 'ondemand', 'dlhd', 'iptv-m3u'];
  for (const id of allIds) {
    if (id === primaryId) continue;
    try {
      const result = await providers[id].extractUrl(ch);
      if (result.hlsUrl) return result;
    } catch {}
  }

  return { error: 'All providers failed to extract stream URL' };
}