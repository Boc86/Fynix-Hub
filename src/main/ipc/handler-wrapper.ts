import { ipcMain, type IpcMainInvokeEvent } from 'electron';

export function handle<TReturn>(
  channel: string,
  fn: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<TReturn> | TReturn,
) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(event as IpcMainInvokeEvent, ...args);
    } catch (err: any) {
      console.error(`[IPC Error] ${channel}:`, err?.message || String(err));
      throw err;
    }
  });
}

/* IPC handlers for IPTV M3U */
import { getAllSources, getAllM3UChannels, findChannelInSources } from '../../main/services/iptv-m3u.service';
import * as XtreamService from '../../main/services/xtream-portal.service';

handle('iptv-m3u:get-all-sources', async (_event, forceRefresh?: boolean) => {
  return getAllSources(forceRefresh);
});

handle('iptv-m3u:get-all-channels', async (_event, forceRefresh?: boolean) => {
  return getAllM3UChannels(forceRefresh);
});

handle('iptv-m3u:find-channel', async (_event, query: string) => {
  return findChannelInSources(query);
});

/* IPC handlers for Xtream portals */
handle('xtream:get-portals', async () => {
  return XtreamService.getPortals();
});

handle('xtream:add-portal', async (_event, url: string, user: string, pass: string) => {
  return XtreamService.addPortal(url, user, pass);
});

handle('xtream:remove-portal', async (_event, url: string, user: string, pass: string) => {
  return XtreamService.removePortal(url, user, pass);
});

handle('xtream:import-portals', async (_event, portals: { url: string; user: string; pass: string }[]) => {
  return XtreamService.importPortals(portals);
});

handle('xtream:auto-import', async (_event, portals: { url: string; user: string; pass: string }[]) => {
  const result = XtreamService.importPortals(portals);
  await getAllSources(true);
  return result;
});

/* IPC handlers for channel logo fallback (tv-logo/tv-logos GitHub repo) */
import { resolveChannelLogo, prewarmChannelLogos, clearChannelLogoCache } from '../../main/services/channel-logos.service';

handle('channel-logo:resolve', async (_event, channelName: string, countryCode: string) => {
  return resolveChannelLogo(channelName, countryCode);
});

handle('channel-logo:prewarm', async (_event, channels: { name: string; countryCode: string }[]) => {
  await prewarmChannelLogos(channels);
});

handle('channel-logo:clear-cache', async () => {
  clearChannelLogoCache();
});
