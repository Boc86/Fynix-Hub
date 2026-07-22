import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

import { ipcMain } from 'electron'
import { handle } from '@/main/ipc/handler-wrapper'

describe('handler-wrapper', () => {
  beforeEach(() => vi.clearAllMocks())

  it('registers handler via ipcMain.handle', () => {
    handle('test:channel', vi.fn())
    expect(ipcMain.handle).toHaveBeenCalledWith('test:channel', expect.any(Function))
  })

  it('calls wrapped function with event and args', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    handle('test:call', fn)
    const wrapped = vi.mocked(ipcMain.handle).mock.calls[0][1] as Function
    const event = { sender: {} }
    const result = await wrapped(event, 'a', 'b')
    expect(fn).toHaveBeenCalledWith(event, 'a', 'b')
    expect(result).toBe('ok')
  })

  it('logs error and re-throws', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    handle('test:fail', fn)
    const wrapped = vi.mocked(ipcMain.handle).mock.calls[0][1] as Function
    await expect(wrapped({})).rejects.toThrow('boom')
    expect(spy).toHaveBeenCalledWith('[IPC Error] test:fail:', 'boom')
    spy.mockRestore()
  })

  it('handles sync functions', async () => {
    handle('test:sync', () => 42)
    const wrapped = vi.mocked(ipcMain.handle).mock.calls[0][1] as Function
    expect(await wrapped({})).toBe(42)
  })

  it('preserves error with non-Error values', async () => {
    const fn = vi.fn().mockRejectedValue('string error')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    handle('test:strerr', fn)
    const wrapped = vi.mocked(ipcMain.handle).mock.calls[0][1] as Function
    await expect(wrapped({})).rejects.toBe('string error')
    expect(spy).toHaveBeenCalledWith('[IPC Error] test:strerr:', 'string error')
    spy.mockRestore()
  })
})
