import { ipcMain, BrowserWindow } from 'electron'
import * as TmdbService from '../services/tmdb.service'
import * as TraktService from '../services/trakt.service'
import * as WebTorrentService from '../services/webtorrent.service'
import * as TorrentSearchService from '../services/torrent-search.service'
import * as DebridService from '../services/debrid.service'
import * as IntrosService from '../services/intros.service'
import * as CacheService from '../services/cache.service'

export function registerIpcHandlers(): void {
  WebTorrentService.init()

  ipcMain.handle('app:get-version', () => '1.0.0')

  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      win.isMaximized() ? win.unmaximize() : win.maximize()
    }
  })

  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle('window:is-maximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })

  ipcMain.handle('tmdb:get-trending', async (_event, type, timeWindow) => {
    return TmdbService.getTrending(type, timeWindow)
  })

  ipcMain.handle('tmdb:get-popular', async (_event, type, page) => {
    return TmdbService.getPopular(type, page)
  })

  ipcMain.handle('tmdb:get-details', async (_event, type, id) => {
    const cacheKey = `tmdb:details:${type}:${id}`
    const cached = CacheService.getCache(cacheKey)
    if (cached) return JSON.parse(cached)
    const data = await TmdbService.getDetails(type, id)
    CacheService.setCache(cacheKey, JSON.stringify(data), 3600000)
    return data
  })

  ipcMain.handle('tmdb:search', async (_event, query, type) => {
    return TmdbService.search(query, type)
  })

  ipcMain.handle('tmdb:get-season', async (_event, tvId, seasonNumber) => {
    const cacheKey = `tmdb:season:${tvId}:${seasonNumber}`
    const cached = CacheService.getCache(cacheKey)
    if (cached) return JSON.parse(cached)
    const data = await TmdbService.getSeason(tvId, seasonNumber)
    CacheService.setCache(cacheKey, JSON.stringify(data), 3600000)
    return data
  })

  ipcMain.handle('tmdb:get-episode', async (_event, tvId, seasonNumber, episodeNumber) => {
    const cacheKey = `tmdb:episode:${tvId}:${seasonNumber}:${episodeNumber}`
    const cached = CacheService.getCache(cacheKey)
    if (cached) return JSON.parse(cached)
    const data = await TmdbService.getEpisode(tvId, seasonNumber, episodeNumber)
    CacheService.setCache(cacheKey, JSON.stringify(data), 3600000)
    return data
  })

  ipcMain.handle('tmdb:get-image-url', (_event, path, size) => {
    return TmdbService.getImageUrl(path, size)
  })

  ipcMain.handle('trakt:get-device-code', async () => {
    return TraktService.getDeviceCode()
  })

  ipcMain.handle('trakt:poll-for-token', async (_event, deviceCode) => {
    const result = await TraktService.pollForToken(deviceCode)
    if (result.access_token) {
      CacheService.setSetting('traktAccessToken', result.access_token)
      CacheService.setSetting('traktRefreshToken', result.refresh_token)
    }
    return result
  })

  ipcMain.handle('trakt:get-watched-movies', async () => {
    return TraktService.getWatchedMovies()
  })

  ipcMain.handle('trakt:get-watched-shows', async () => {
    return TraktService.getWatchedShows()
  })

  ipcMain.handle('trakt:scrobble', async (_event, action, media) => {
    return TraktService.scrobble(action, media)
  })

  ipcMain.handle('trakt:mark-watched', async (_event, media) => {
    return TraktService.markWatched(media)
  })

  ipcMain.handle('trakt:mark-unwatched', async (_event, media) => {
    return TraktService.markUnwatched(media)
  })

  ipcMain.handle('trakt:get-auth-status', () => {
    return { authenticated: TraktService.isAuthenticated() }
  })

  ipcMain.handle('torrent:search', async (_event, query) => {
    return TorrentSearchService.searchTorrents(query)
  })

  ipcMain.handle('torrent:add', async (_event, magnetUri) => {
    const torrent = await WebTorrentService.addTorrent(magnetUri)
    return { infoHash: torrent.infoHash, name: torrent.name }
  })

  ipcMain.handle('torrent:remove', (_event, infoHash) => {
    WebTorrentService.removeTorrent(infoHash)
  })

  ipcMain.handle('torrent:get-progress', async (_event, infoHash) => {
    const torrent = await WebTorrentService.getTorrent(infoHash)
    if (!torrent) return null
    return {
      progress: torrent.progress,
      downloaded: torrent.downloaded,
      total: torrent.length,
      downloadSpeed: torrent.downloadSpeed,
      numPeers: torrent.numPeers,
      timeRemaining: torrent.timeRemaining,
    }
  })

  ipcMain.handle('torrent:get-stream-url', async (_event, infoHash, fileIndex) => {
    const torrent = await WebTorrentService.getTorrent(infoHash)
    if (!torrent) throw new Error('Torrent not found')
    const file = torrent.files[fileIndex]
    if (!file) throw new Error('File not found')
    file.select()
    return { url: file.streamURL }
  })

  ipcMain.handle('intros:get-segments', async (_event, params) => {
    return IntrosService.getSegments(params)
  })

  ipcMain.handle('debrid:get-status', (_event, service) => {
    return { configured: false }
  })

  ipcMain.handle('debrid:check-cached', async (_event, _service, hash) => {
    return { cached: false }
  })

  ipcMain.handle('debrid:add-magnet', async (_event, _service, _magnet) => {
    throw new Error('Not configured')
  })

  ipcMain.handle('debrid:get-download-url', async () => {
    throw new Error('Not configured')
  })

  ipcMain.handle('settings:get', (_event, key) => {
    return CacheService.getSetting(key)
  })

  ipcMain.handle('settings:set', (_event, key, value) => {
    CacheService.setSetting(key, value)
  })

  ipcMain.handle('settings:get-all', () => {
    return CacheService.getAllSettings()
  })
}
