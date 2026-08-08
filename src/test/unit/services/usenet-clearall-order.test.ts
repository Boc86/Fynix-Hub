import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Regression: clearAllDownloads must delete the on-disk dir BEFORE wiping the
// nzbget entry — resolveDownloadDir queries nzbget, so post-cleanup it finds
// nothing and the files leak forever (the "cleared in NZBGet but folder
// remains in download dir" bug).
const historyDeleteMock = vi.fn()
const deleteNzbMock = vi.fn()

vi.mock('@/main/services/nzbget.service', () => ({
  listGroups: vi.fn(async () => []),
  history: vi.fn(async () => []),
  getConfig: vi.fn(async () => [{ Name: 'DestDir', Value: '/downloads' }, { Name: 'InterDir', Value: '/intermediate' }]),
  historyDelete: (...a: any[]) => historyDeleteMock(...a),
  deleteNzb: (...a: any[]) => deleteNzbMock(...a),
}))

describe('clearAllDownloads ordering (disk before nzbget cleanup)', () => {
  const root = path.join(os.tmpdir(), 'usenet-clearall-order-test')
  const itemDir = path.join(root, 'Test_Movie')
  const entry = { NZBID: 42, NZBFilename: 'Test_Movie.nzb', FinalDir: itemDir, DestDir: itemDir, Status: 'SUCCESS/PAR' }

  beforeEach(async () => {
    historyDeleteMock.mockClear()
    deleteNzbMock.mockClear()
    fs.rmSync(root, { recursive: true, force: true })
    fs.mkdirSync(itemDir, { recursive: true })
    fs.writeFileSync(path.join(itemDir, 'Test_Movie.mkv'), 'x')
    // historyDelete must see the dir ALREADY gone — that's the ordering proof
    historyDeleteMock.mockImplementation(() => {
      expect(fs.existsSync(itemDir)).toBe(false)
      return Promise.resolve(true)
    })
    const mod = await import('@/main/services/nzbget.service')
    ;(mod.history as any).mockResolvedValue([entry])
    ;(mod.listGroups as any).mockResolvedValue([])
  })

  it('removes the folder and only then calls historyDelete', async () => {
    const { clearAllDownloads } = await import('@/main/services/usenet-downloader.service')
    await clearAllDownloads()

    expect(fs.existsSync(itemDir)).toBe(false)
    expect(historyDeleteMock).toHaveBeenCalledWith(42)
    expect(deleteNzbMock).not.toHaveBeenCalled()
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('deletes queue-group folders before GroupDelete', async () => {
    const mod = await import('@/main/services/nzbget.service')
    ;(mod.listGroups as any).mockResolvedValue([{ NZBID: 7, NZBFilename: 'Other.nzb', FinalDir: '', DestDir: itemDir, Status: 'DOWNLOADING' }])
    ;(mod.history as any).mockResolvedValue([])
    deleteNzbMock.mockImplementation(() => {
      expect(fs.existsSync(itemDir)).toBe(false)
      return Promise.resolve(true)
    })

    const { clearAllDownloads } = await import('@/main/services/usenet-downloader.service')
    await clearAllDownloads()

    expect(fs.existsSync(itemDir)).toBe(false)
    expect(deleteNzbMock).toHaveBeenCalledWith(7)
    fs.rmSync(root, { recursive: true, force: true })
  })
})
