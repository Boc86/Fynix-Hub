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
import { getAllSources, findChannelInSources } from '../../main/services/iptv-m3u.service';

handle('iptv-m3u:get-all-sources', async (_event, forceRefresh?: boolean) => {
  return getAllSources(forceRefresh);
});

handle('iptv-m3u:find-channel', async (_event, query: string) => {
  return findChannelInSources(query);
});
