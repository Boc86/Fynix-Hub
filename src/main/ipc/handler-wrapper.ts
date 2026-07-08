import { ipcMain, type IpcMainInvokeEvent } from 'electron'

// Unified IPC handler registration with automatic error logging.
// Replaces direct ipcMain.handle() calls.
// Errors are logged to console and re-thrown for backward compatibility.
export function handle<TReturn>(
  channel: string,
  fn: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<TReturn> | TReturn,
) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(event as IpcMainInvokeEvent, ...args)
    } catch (err: any) {
      console.error(`[IPC Error] ${channel}:`, err?.message || String(err))
      throw err
    }
  })
}
