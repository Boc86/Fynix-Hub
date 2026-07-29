import type { LiveTVProvider, LiveTVChannel, LiveTVStreamResult } from './livetv-provider.types';
import { getAllSources } from './iptv-m3u.service';

export const iptvM3uProvider: LiveTVProvider = {
  label: 'IPTV M3U',
  id: 'iptv-m3u',

  async getChannels(): Promise<LiveTVChannel[]> {
    const sources = await getAllSources();
    const all: LiveTVChannel[] = [];
    for (const source of sources) {
      for (const ch of source.channels) {
        all.push({
          id: `m3u-${source.label}-${ch.name}`,
          name: ch.name,
          image: '',
          logoImage: '',
          countryCode: 'intl',
          countryName: 'International',
          countryFlag: '🌍',
          playerUrl: ch.url,
          source: source.label,
          status: 'active',
          provider: 'iptv-m3u',
        });
      }
    }
    return all;
  },

  async extractUrl(channel: { id: string; name: string; countryCode: string; playerUrl?: string }): Promise<LiveTVStreamResult> {
    return {
      hlsUrl: channel.playerUrl || '',
      error: channel.playerUrl ? undefined : 'No playable URL available',
    };
  },
};
