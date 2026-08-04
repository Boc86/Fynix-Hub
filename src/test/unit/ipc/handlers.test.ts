import { describe, it, expect, vi, beforeEach } from 'vitest'

const { handlers, svc } = vi.hoisted(() => {
  const handlers = new Map<string, Function>()
  const svc = (methods: Record<string, any> = {}) => ({
    loadApiKey: vi.fn(), loadCredentials: vi.fn(), loadKeys: vi.fn(),
    init: vi.fn(), shouldRefreshCatalog: vi.fn().mockReturnValue(false),
    ensureEpgLoaded: vi.fn().mockResolvedValue(undefined), setApiKey: vi.fn(),
    setRealDebridKey: vi.fn(), setTorboxKey: vi.fn(),
    clearChannelsCache: vi.fn(), clearCache: vi.fn(),
    ...methods,
  })
  return { handlers, svc }
})

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn((ch: string, fn: Function) => handlers.set(ch, fn)) },
  BrowserWindow: { fromWebContents: vi.fn(() => ({ minimize: vi.fn() })), getAllWindows: vi.fn(() => []) },
  app: { getPath: vi.fn(() => '/tmp'), getVersion: vi.fn(() => '1.3.9'), quit: vi.fn() },
  shell: { openExternal: vi.fn() },
}))

vi.mock('@/main/services/tmdb.service', () => svc({ getDetails: vi.fn(), getSeason: vi.fn(), getEpisode: vi.fn(), getTrending: vi.fn(), getPopular: vi.fn(), search: vi.fn(), getImageUrl: vi.fn(), getMovieGenres: vi.fn(), getTvGenres: vi.fn(), discoverByGenre: vi.fn(), getSimilar: vi.fn(), getRecommendations: vi.fn() }))
vi.mock('@/main/services/trakt.service', () => svc({ getWatchedMovies: vi.fn(), getWatchedShows: vi.fn(), scrobble: vi.fn(), markWatched: vi.fn(), markUnwatched: vi.fn(), isAuthenticated: vi.fn(), getPlayback: vi.fn(), getPlaybackMovies: vi.fn(), getPlaybackEpisodes: vi.fn(), getWatchedShowsWithProgress: vi.fn(), getTokens: vi.fn(), getDeviceCode: vi.fn(), pollForToken: vi.fn(), setTokens: vi.fn() }))
vi.mock('@/main/services/webtorrent.service', () => svc({ addTorrent: vi.fn(), removeTorrent: vi.fn(), getTorrent: vi.fn(), getStreamUrl: vi.fn(), removeAllTorrents: vi.fn(), prioritizeResume: vi.fn(), prefetchBatch: vi.fn() }))
vi.mock('@/main/services/torrent-search.service', () => svc({ searchTorrents: vi.fn().mockResolvedValue([]), refreshTrackers: vi.fn().mockResolvedValue([]), getDefaultEnabledIndexers: vi.fn().mockReturnValue([]), getBuiltInIndexerDefinitions: vi.fn().mockReturnValue([]) }))
vi.mock('@/main/services/debrid.service', () => svc({ isConfigured: vi.fn().mockReturnValue(false), getServices: vi.fn().mockReturnValue([]), checkAccountStatus: vi.fn(), checkBatchCached: vi.fn(), addAndWait: vi.fn(), realDebridGetDeviceCode: vi.fn(), realDebridPollForCredentials: vi.fn(), torboxGetDeviceCode: vi.fn(), torboxPollForToken: vi.fn(), premiumizeGetDeviceCode: vi.fn(), premiumizePollForToken: vi.fn(), alldebridGetDevicePin: vi.fn(), alldebridPollForToken: vi.fn() }))
vi.mock('@/main/services/cache.service', () => svc({ getCache: vi.fn(), setCache: vi.fn(), getSetting: vi.fn(), setSetting: vi.fn(), getAllSettings: vi.fn().mockReturnValue({}), updateWatchProgress: vi.fn(), getWatchProgress: vi.fn(), deleteWatchProgress: vi.fn(), clearImageCache: vi.fn() }))

vi.mock('@/main/services/fanart.service', () => svc({ getImages: vi.fn() }))
vi.mock('@/main/services/indexer-catalog.service', () => svc({ getStoredCatalog: vi.fn().mockReturnValue([]), getCatalogLastUpdated: vi.fn(), refreshIndexerCatalog: vi.fn().mockResolvedValue([]) }))
vi.mock('@/main/services/introdb.service', () => svc({ getSegments: vi.fn() }))
vi.mock('@/main/services/youtube.service', () => svc({ resolveStreamUrl: vi.fn() }))
vi.mock('@/main/services/local-cache.service', () => svc({ getPort: vi.fn().mockReturnValue(0), getCacheUrl: vi.fn(), getCacheStatus: vi.fn(), clearCache: vi.fn() }))
vi.mock('@/main/services/ffmpeg-remux.service', () => svc({ init: vi.fn(), shutdown: vi.fn(), createSession: vi.fn(), killSession: vi.fn() }))
vi.mock('@/main/services/player.service', () => svc({ startPlayback: vi.fn(), stopPlayback: vi.fn(), getCurrentSessionId: vi.fn() }))
vi.mock('@/main/services/opensubtitles.service', () => svc({ searchSubtitles: vi.fn(), downloadSubtitle: vi.fn(), setApiKey: vi.fn() }))
vi.mock('@/main/services/sports.service', () => svc({ getLeaguesBySport: vi.fn().mockResolvedValue([]), getSeasons: vi.fn(), getSportsList: vi.fn().mockResolvedValue([]), getEventsInRange: vi.fn(), getTeamDetails: vi.fn() }))
vi.mock('@/main/services/replayzone.service', () => svc({ searchReplays: vi.fn() }))
vi.mock('@/main/services/streamedpk.service', () => svc({ getMatchesForSports: vi.fn() }))
vi.mock('@/main/services/dami-tv.service', () => svc({ getChannels: vi.fn(), getAvailableCountries: vi.fn(), extractChannelUrl: vi.fn(), cdnliveProvider: {} }))
vi.mock('@/main/services/ondemand-tv.service', () => svc({ ondemandProvider: {} }))
vi.mock('@/main/services/dlhd-tv.service', () => svc({ dlhdProvider: {} }))
vi.mock('@/main/services/livetv-providers', () => svc({ getChannelsWithFallback: vi.fn().mockResolvedValue([]), extractUrlWithFallback: vi.fn() }))
vi.mock('@/main/services/epg.service', () => svc({ getChannels: vi.fn().mockReturnValue([]), getNowNext: vi.fn(), getSchedule: vi.fn().mockReturnValue([]), refreshEpg: vi.fn() }))
vi.mock('@/main/services/usenet-search.service', () => svc({ searchUsenet: vi.fn().mockResolvedValue([]), getDefaultEnabledIndexerIds: vi.fn().mockReturnValue([]), getFreeIndexers: vi.fn().mockReturnValue([]) }))
vi.mock('@/main/services/usenet.service', () => svc({ checkConnection: vi.fn(), sendNzb: vi.fn(), getDownloadStatus: vi.fn(), getStreamUrl: vi.fn(), loadConfig: vi.fn(), listDownloads: vi.fn(), removeDownload: vi.fn(), clearAll: vi.fn(), searchWebdavCache: vi.fn().mockResolvedValue([]), deleteUsenetByPath: vi.fn() }))
vi.mock('@/main/services/updater.service', () => svc({ checkForUpdates: vi.fn(), getStatus: vi.fn(), downloadUpdate: vi.fn(), installUpdate: vi.fn() }))
vi.mock('@/main/services/extractor.service', () => svc({ searchStreams: vi.fn().mockResolvedValue(undefined) }))

import * as CacheService from '@/main/services/cache.service'
import * as TmdbService from '@/main/services/tmdb.service'
import * as DebridService from '@/main/services/debrid.service'
import * as UsenetService from '@/main/services/usenet.service'
import * as UsenetSearchService from '@/main/services/usenet-search.service'
import { registerIpcHandlers } from '@/main/ipc/handlers'

function h(channel: string) { return handlers.get(channel)! }
function fakeEvent() { return { sender: { send: vi.fn() } } as any }

describe('IPC handlers', () => {
  beforeAll(() => { registerIpcHandlers() })

  describe('tmdb:get-details', () => {
    it('returns cached data when available', async () => {
      const data = { title: 'Test Movie', id: 1 }
      vi.mocked(CacheService.getCache).mockReturnValue(JSON.stringify(data))
      const result = await h('tmdb:get-details')(fakeEvent(), 'movie', 1)
      expect(result).toEqual(data)
      expect(TmdbService.getDetails).not.toHaveBeenCalled()
    })

    it('fetches and caches on miss', async () => {
      vi.mocked(CacheService.getCache).mockReturnValue(null)
      vi.mocked(TmdbService.getDetails).mockResolvedValue({ title: 'New', id: 2 } as any)
      const result = await h('tmdb:get-details')(fakeEvent(), 'movie', 2)
      expect(result.title).toBe('New')
      expect(CacheService.setCache).toHaveBeenCalledWith('tmdb:details:2:movie:2', expect.any(String), 3600000)
    })

    it('re-fetches when cached entry lacks title (backward-compat)', async () => {
      vi.mocked(CacheService.getCache).mockReturnValue(JSON.stringify({ id: 1 }))
      vi.mocked(TmdbService.getDetails).mockResolvedValue({ title: 'Fixed', id: 1 } as any)
      const result = await h('tmdb:get-details')(fakeEvent(), 'movie', 1)
      expect(result.title).toBe('Fixed')
      expect(TmdbService.getDetails).toHaveBeenCalled()
    })
  })

  describe('settings:set', () => {
    it('stores setting and fires tmdb side-effect', async () => {
      vi.mocked(CacheService.setSetting).mockImplementation(() => {})
      await h('settings:set')(fakeEvent(), 'tmdbApiKey', 'my-key')
      expect(CacheService.setSetting).toHaveBeenCalledWith('tmdbApiKey', 'my-key')
      expect(TmdbService.setApiKey).toHaveBeenCalledWith('my-key')
    })

    it('fires debrid side-effect for realDebridApiKey', async () => {
      await h('settings:set')(fakeEvent(), 'realDebridApiKey', 'rd-key')
      expect(DebridService.setRealDebridKey).toHaveBeenCalledWith('rd-key')
    })

    it('clears empty realDebridApiKey to null', async () => {
      await h('settings:set')(fakeEvent(), 'realDebridApiKey', '')
      expect(DebridService.setRealDebridKey).toHaveBeenCalledWith(null)
    })

    it('fires DamiTV clear for liveTvUser', async () => {
      const DamiTVService = await import('@/main/services/dami-tv.service')
      await h('settings:set')(fakeEvent(), 'liveTvUser', 'user@test.com')
      expect(DamiTVService.clearChannelsCache).toHaveBeenCalled()
    })
  })

  describe('debrid:add-and-wait', () => {
    it('returns URL on success', async () => {
      vi.mocked(DebridService.addAndWait).mockResolvedValue('https://dl.example.com/file')
      const result = await h('debrid:add-and-wait')(fakeEvent(), 'magnet:?xt=urn:test', 'torbox')
      expect(result.url).toBe('https://dl.example.com/file')
    })

    it('translates CachedCheckFailedError to friendly message', async () => {
      const err = new Error('unavailable') as any
      err.name = 'CachedCheckFailedError'
      vi.mocked(DebridService.addAndWait).mockRejectedValue(err)
      await expect(h('debrid:add-and-wait')(fakeEvent(), 'magnet:?xt=urn:test', 'torbox')).rejects.toThrow('not currently available')
    })

    it('translates 451 error to friendly message', async () => {
      vi.mocked(DebridService.addAndWait).mockRejectedValue(new Error('451 Unavailable'))
      await expect(h('debrid:add-and-wait')(fakeEvent(), 'magnet:?xt=urn:test', 'torbox')).rejects.toThrow('not currently available')
    })
  })

  describe('usenet:search-webdav-cache', () => {
    it('handles string input', async () => {
      vi.mocked(UsenetService.searchWebdavCache).mockResolvedValue([])
      await h('usenet:search-webdav-cache')(fakeEvent(), 'test query')
      expect(UsenetService.searchWebdavCache).toHaveBeenCalledWith('test query')
    })

    it('handles object input', async () => {
      vi.mocked(UsenetService.searchWebdavCache).mockResolvedValue([])
      await h('usenet:search-webdav-cache')(fakeEvent(), { query: 'q', title: 'T', year: 2024, type: 'movie', season: 1, episode: 2 })
      expect(UsenetService.searchWebdavCache).toHaveBeenCalledWith('q', { title: 'T', year: 2024, type: 'movie', season: 1, episode: 2 })
    })
  })

  describe('debrid:check-cached', () => {
    it('wraps single hash into batch and returns result', async () => {
      vi.mocked(DebridService.checkBatchCached).mockResolvedValue({ 'abc123': true })
      const result = await h('debrid:check-cached')(fakeEvent(), 'torbox', 'abc123')
      expect(result.cached).toBe(true)
      expect(DebridService.checkBatchCached).toHaveBeenCalledWith(['abc123'], 'torbox')
    })

    it('returns false for missing hash', async () => {
      vi.mocked(DebridService.checkBatchCached).mockResolvedValue({})
      const result = await h('debrid:check-cached')(fakeEvent(), 'torbox', 'missing')
      expect(result.cached).toBe(false)
    })
  })
})
