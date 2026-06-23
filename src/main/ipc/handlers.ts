import { ipcMain, BrowserWindow, app, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import * as TmdbService from '../services/tmdb.service'
import * as TraktService from '../services/trakt.service'
import * as WebTorrentService from '../services/webtorrent.service'
import * as TorrentSearchService from '../services/torrent-search.service'
import * as DebridService from '../services/debrid.service'
import * as IntrosService from '../services/intros.service'
import * as CacheService from '../services/cache.service'
import * as MpvService from '../services/mpv.service'
import * as TranscoderService from '../services/transcoder.service'
import * as FanartService from '../services/fanart.service'
import * as IndexerCatalogService from '../services/indexer-catalog.service'
import * as YoutubeService from '../services/youtube.service'
import * as SportsApiService from '../services/sportsapi.service'

export async function registerIpcHandlers(): Promise<void> {
  TmdbService.loadApiKey()
  TraktService.loadCredentials()
  DebridService.loadKeys()
  FanartService.loadApiKey()
  SportsApiService.loadApiKey()
  await WebTorrentService.init()
  if (IndexerCatalogService.shouldRefreshCatalog()) {
    IndexerCatalogService.refreshIndexerCatalog().catch(err => {
      console.error('[Handler] Background indexer catalog refresh failed:', err.message)
    })
  }

  ipcMain.handle('app:get-version', () => '1.0.0')

  ipcMain.handle('app:write-debug-file', (_event, data) => {
    try {
      const filePath = path.join(app.getPath('userData'), 'fynix-search-debug.json')
      let logs: any[] = []
      try {
        logs = JSON.parse(fs.readFileSync(filePath, 'utf8'))
        if (!Array.isArray(logs)) logs = []
      } catch {
        logs = []
      }
      logs.push({ timestamp: new Date().toISOString(), ...data })
      fs.writeFileSync(filePath, JSON.stringify(logs, null, 2))
      return { success: true, path: filePath }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('app:clear-image-cache', () => {
    try {
      CacheService.clearImageCache()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('youtube:get-stream-url', async (_event, videoUrl) => {
    try {
      const { url, fileType } = await YoutubeService.getStreamUrl(videoUrl)
      return { success: true, url, fileType }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('app:select-file', async (event, options) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { canceled: true, filePaths: [] }
    const result = await dialog.showOpenDialog(win, options || {})
    return result
  })

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
    if (cached) {
      const data = JSON.parse(cached)
      // Backward-compat: old cache entries for TV may lack normalized title/releaseDate
      if (data.title) return data
    }
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

  ipcMain.handle('tmdb:get-movie-genres', async () => {
    const cacheKey = 'tmdb:genres:movie'
    const cached = CacheService.getCache(cacheKey)
    if (cached) return JSON.parse(cached)
    const data = await TmdbService.getMovieGenres()
    CacheService.setCache(cacheKey, JSON.stringify(data), 86400000)
    return data
  })

  ipcMain.handle('tmdb:get-tv-genres', async () => {
    const cacheKey = 'tmdb:genres:tv'
    const cached = CacheService.getCache(cacheKey)
    if (cached) return JSON.parse(cached)
    const data = await TmdbService.getTvGenres()
    CacheService.setCache(cacheKey, JSON.stringify(data), 86400000)
    return data
  })

  ipcMain.handle('tmdb:discover-by-genre', async (_event, type, genreId, page) => {
    const cacheKey = `tmdb:discover:${type}:${genreId}:${page || 1}`
    const cached = CacheService.getCache(cacheKey)
    if (cached) return JSON.parse(cached)
    const data = await TmdbService.discoverByGenre(type, genreId, page || 1)
    CacheService.setCache(cacheKey, JSON.stringify(data), 3600000)
    return data
  })

  ipcMain.handle('tmdb:get-similar', async (_event, type, id, page) => {
    const cacheKey = `tmdb:similar:${type}:${id}:${page || 1}`
    const cached = CacheService.getCache(cacheKey)
    if (cached) return JSON.parse(cached)
    const data = await TmdbService.getSimilar(type, id, page || 1)
    CacheService.setCache(cacheKey, JSON.stringify(data), 3600000)
    return data
  })

  ipcMain.handle('tmdb:get-recommendations', async (_event, type, id, page) => {
    const cacheKey = `tmdb:recommendations:${type}:${id}:${page || 1}`
    const cached = CacheService.getCache(cacheKey)
    if (cached) return JSON.parse(cached)
    const data = await TmdbService.getRecommendations(type, id, page || 1)
    CacheService.setCache(cacheKey, JSON.stringify(data), 3600000)
    return data
  })

  ipcMain.handle('trakt:get-device-code', async () => {
    return TraktService.getDeviceCode()
  })

  ipcMain.handle('trakt:poll-for-token', async (_event, deviceCode) => {
    return TraktService.pollForToken(deviceCode)
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

  ipcMain.handle('trakt:get-watchlist', async (_event, type) => {
    return TraktService.getWatchlist(type)
  })

  ipcMain.handle('trakt:get-playback', async () => {
    return TraktService.getPlayback()
  })

  ipcMain.handle('trakt:get-playback-movies', async () => {
    return TraktService.getPlaybackMovies()
  })

  ipcMain.handle('trakt:get-playback-episodes', async () => {
    return TraktService.getPlaybackEpisodes()
  })

  ipcMain.handle('trakt:set-tokens', async (_event, accessToken, refreshToken) => {
    TraktService.setTokens(accessToken, refreshToken)
  })

  ipcMain.handle('trakt:get-tokens', () => {
    return TraktService.getTokens()
  })

  ipcMain.handle('torrent:search', async (_event, query) => {
    console.log('[Handler] torrent:search', JSON.stringify(query).slice(0, 200))
    const enabledIndexers = CacheService.getSetting<string[]>('enabledIndexers') || TorrentSearchService.getDefaultEnabledIndexers()
    const customIndexers = CacheService.getSetting<TorrentSearchService.CustomIndexer[]>('customIndexers') || []
    try {
      const results = await TorrentSearchService.searchTorrents(query, enabledIndexers, customIndexers)
      console.log('[Handler] torrent:search returned', results.length, 'results')
      return results
    } catch (err: any) {
      console.error('[Handler] torrent:search failed:', err.message)
      throw err
    }
  })

  ipcMain.handle('torrent:refresh-trackers', async () => {
    try {
      const trackers = await TorrentSearchService.refreshTrackers()
      return { count: trackers.length }
    } catch (err: any) {
      console.error('[Handler] torrent:refresh-trackers failed:', err.message)
      throw new Error(err?.message || 'Failed to refresh tracker list')
    }
  })

  ipcMain.handle('indexer-catalog:get', () => {
    return {
      catalog: IndexerCatalogService.getStoredCatalog(),
      lastUpdated: IndexerCatalogService.getCatalogLastUpdated(),
    }
  })

  ipcMain.handle('indexer-catalog:should-refresh', () => {
    return IndexerCatalogService.shouldRefreshCatalog()
  })

  ipcMain.handle('indexer-catalog:refresh', async () => {
    try {
      const catalog = await IndexerCatalogService.refreshIndexerCatalog()
      return { count: catalog.length }
    } catch (err: any) {
      console.error('[Handler] indexer-catalog:refresh failed:', err.message)
      throw new Error(err?.message || 'Failed to refresh indexer catalog')
    }
  })

  ipcMain.handle('indexer-catalog:built-ins', () => {
    return TorrentSearchService.getBuiltInIndexerDefinitions().map(i => ({ id: i.id, name: i.name, type: i.type }))
  })

  ipcMain.handle('torrent:add', async (_event, magnetUri) => {
    console.log('[Handler] torrent:add', magnetUri.slice(0, 80) + '...')
    try {
      const torrent = await WebTorrentService.addTorrent(magnetUri)
      console.log('[Handler] torrent:add success', torrent.infoHash, torrent.name)
      return { infoHash: torrent.infoHash, name: torrent.name }
    } catch (err: any) {
      console.error('[Handler] torrent:add failed:', err.message)
      throw err
    }
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
    console.log('[Handler] torrent:get-stream-url', infoHash, 'fileIndex:', fileIndex)
    try {
      const result = await WebTorrentService.getStreamUrl(infoHash, fileIndex)
      console.log('[Handler] torrent:get-stream-url success:', result.url)
      return result
    } catch (err: any) {
      console.error('[Handler] torrent:get-stream-url failed:', err.message)
      throw err
    }
  })

  ipcMain.handle('intros:get-segments', async (_event, params) => {
    return IntrosService.getSegments(params)
  })

  ipcMain.handle('debrid:get-status', (_event, service) => {
    return { configured: DebridService.isConfigured(service) }
  })

  ipcMain.handle('debrid:get-preferred', () => {
    return { service: DebridService.getPreferred() }
  })

  ipcMain.handle('debrid:check-cached', async (_event, service, hash) => {
    const result = await DebridService.checkBatchCached([hash], service)
    return { cached: result[hash] ?? false }
  })

  ipcMain.handle('debrid:check-cached-batch', async (_event, service, hashes, magnets) => {
    const result = await DebridService.checkBatchCached(hashes, service, magnets)
    const keys = Object.keys(result)
    const count = keys.filter(k => result[k]).length
    console.log(`[Handler] check-cached-batch returning ${keys.length} keys, ${count} cached`)
    return result
  })

  ipcMain.handle('debrid:add-and-wait', async (_event, magnet, service) => {
    console.log('[Handler] debrid:add-and-wait', service, magnet.slice(0, 60) + '...')
    try {
      const url = await DebridService.addAndWait(magnet, service || undefined)
      console.log('[Handler] debrid:add-and-wait success:', url?.slice(0, 80) || 'empty')
      return { url }
    } catch (err: any) {
      console.error('[Handler] debrid:add-and-wait failed:', err.message)
      throw err
    }
  })

  // Premiumize OAuth
  ipcMain.handle('debrid:premiumize-get-device-code', async () => {
    try {
      return await DebridService.premiumizeGetDeviceCode()
    } catch (err: any) {
      throw new Error(err?.message || 'Premiumize: failed to get device code')
    }
  })

  ipcMain.handle('debrid:premiumize-poll-token', async (_event, deviceCode) => {
    try {
      return await DebridService.premiumizePollForToken(deviceCode)
    } catch (err: any) {
      throw new Error(err?.message || 'Premiumize: failed to poll for token')
    }
  })

  // AllDebrid OAuth
  ipcMain.handle('debrid:alldebrid-get-device-pin', async () => {
    try {
      return await DebridService.alldebridGetDevicePin()
    } catch (err: any) {
      throw new Error(err?.message || 'AllDebrid: failed to get device pin')
    }
  })

  ipcMain.handle('debrid:alldebrid-poll-token', async (_event, pin, deviceId) => {
    try {
      return await DebridService.alldebridPollForToken(pin, deviceId)
    } catch (err: any) {
      throw new Error(err?.message || 'AllDebrid: failed to poll for token')
    }
  })

  // Real-Debrid
  ipcMain.handle('debrid:real-debrid-device-code', async () => {
    try {
      return await DebridService.realDebridGetDeviceCode()
    } catch (err: any) {
      throw new Error(err?.message || 'Real-Debrid: failed to get device code')
    }
  })

  ipcMain.handle('debrid:real-debrid-poll-credentials', async (_event, deviceCode) => {
    try {
      return await DebridService.realDebridPollForCredentials(deviceCode)
    } catch (err: any) {
      throw new Error(err?.message || 'Real-Debrid: failed to poll for credentials')
    }
  })

  // TorBox
  ipcMain.handle('debrid:torbox-get-device-code', async () => {
    try {
      return await DebridService.torboxGetDeviceCode()
    } catch (err: any) {
      throw new Error(err?.message || 'TorBox: failed to get device code')
    }
  })

  ipcMain.handle('debrid:torbox-poll-token', async (_event, deviceCode) => {
    try {
      return await DebridService.torboxPollForToken(deviceCode)
    } catch (err: any) {
      throw new Error(err?.message || 'TorBox: failed to poll for token')
    }
  })

  ipcMain.handle('debrid:torbox-settings-url', async () => {
    return { url: DebridService.getTorboxSettingsUrl() }
  })

  ipcMain.handle('fanart:get-images', async (_event, tmdbId, type) => {
    return FanartService.getImages(tmdbId, type)
  })

  ipcMain.handle('settings:get', (_event, key) => {
    return CacheService.getSetting(key)
  })

  ipcMain.handle('settings:set', (_event, key, value) => {
    CacheService.setSetting(key, value)
    if (key === 'tmdbApiKey') TmdbService.setApiKey(String(value))
    if (key === 'realDebridApiKey') DebridService.setRealDebridKey(String(value) || null)
    if (key === 'torboxApiKey') DebridService.setTorboxKey(String(value) || null)
    if (key === 'premiumizeAccessToken') DebridService.loadKeys()
    if (key === 'alldebridAccessToken') DebridService.loadKeys()
    if (key === 'fanartApiKey') FanartService.setApiKey(String(value))
  })

  ipcMain.handle('settings:get-all', () => {
    return CacheService.getAllSettings()
  })

  ipcMain.handle('watch:update-progress', (_event, tmdbId, mediaType, progress, season, episode) => {
    CacheService.updateWatchProgress(tmdbId, mediaType, progress, season, episode)
  })

  ipcMain.handle('watch:get-progress', (_event, tmdbId, mediaType, season, episode) => {
    return CacheService.getWatchProgress(tmdbId, mediaType, season, episode)
  })

  ipcMain.handle('watch:get-history', () => {
    return CacheService.getFullWatchHistory()
  })

  ipcMain.handle('mpv:play', async (event, url) => {
    console.log('[Handler] mpv:play', url.slice(0, 80) + '...')
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      await MpvService.play(url)
      MpvService.onExit(() => {
        win?.webContents.send('mpv:exited')
      })
    } catch (err: any) {
      console.error('[Handler] mpv:play failed:', err.message)
      throw err
    }
  })

  ipcMain.handle('mpv:stop', () => {
    MpvService.stop()
  })

  ipcMain.handle('mpv:get-time-pos', async () => {
    return MpvService.getTimePos()
  })

  ipcMain.handle('mpv:get-duration', () => {
    return MpvService.getDuration()
  })

  ipcMain.handle('mpv:get-paused', async () => {
    return MpvService.getPaused()
  })

  ipcMain.handle('mpv:is-running', () => {
    return MpvService.isRunning()
  })

  ipcMain.handle('mpv:is-available', () => {
    return MpvService.isAvailable()
  })

  ipcMain.handle('mpv:set-paused', async (_event, paused) => {
    await MpvService.setPaused(paused)
  })

  ipcMain.handle('mpv:seek', async (_event, seconds) => {
    await MpvService.seek(seconds)
  })

  ipcMain.handle('sportsdb:get-sports', async () => {
    return SportsApiService.getAllSports()
  })

  ipcMain.handle('sportsdb:get-countries', async (_event, sportSlug: string) => {
    const cacheKey = `sportsapi:countries:${sportSlug}`
    const cached = CacheService.getCache(cacheKey)
    if (cached) return JSON.parse(cached)
    const data = await SportsApiService.getCountries(sportSlug)
    CacheService.setCache(cacheKey, JSON.stringify(data), 86400000)
    return data
  })

  ipcMain.handle('sportsdb:get-competitions', async (_event, sportSlug: string, sportId: number, countrySlug?: string) => {
    const cacheKey = `sports:competitions:${sportSlug}:${sportId}:${countrySlug || ''}`
    const cached = CacheService.getCache(cacheKey)
    if (cached) return JSON.parse(cached)
    const data = await SportsApiService.getCompetitions(sportSlug, sportId, countrySlug)
    CacheService.setCache(cacheKey, JSON.stringify(data), 86400000)
    return data
  })

  ipcMain.handle('sportsdb:get-seasons', async (_event, sportSlug: string, tournamentId: number) => {
    const cacheKey = `sportsapi:seasons:${sportSlug}:${tournamentId}`
    const cached = CacheService.getCache(cacheKey)
    if (cached) return JSON.parse(cached)
    const data = await SportsApiService.getTournamentSeasons(sportSlug, tournamentId)
    CacheService.setCache(cacheKey, JSON.stringify(data), 86400000)
    return data
  })

  ipcMain.handle('sportsdb:get-fixtures', async (_event, sportSlug: string, tournamentId: number, seasonId: number, page: number, direction: 'last' | 'next') => {
    const data = await SportsApiService.getTournamentEvents(sportSlug, tournamentId, seasonId, page, direction)
    return data
  })

  ipcMain.handle('sportsdb:search-clubs', async (_event, sportSlug: string, searchTerm: string) => {
    const data = await SportsApiService.searchTeams(sportSlug, searchTerm)
    return data
  })

  ipcMain.handle('sportsdb:get-club', async (_event, sportSlug: string, teamId: number) => {
    const cacheKey = `sportsapi:team:${sportSlug}:${teamId}`
    const cached = CacheService.getCache(cacheKey)
    if (cached) return JSON.parse(cached)
    const data = await SportsApiService.getTeamProfile(sportSlug, teamId)
    CacheService.setCache(cacheKey, JSON.stringify(data), 3600000)
    return data
  })

  ipcMain.handle('sportsdb:get-club-fixtures', async (_event, sportSlug: string, teamId: number, page: number, direction: 'last' | 'next') => {
    const data = await SportsApiService.getTeamEvents(sportSlug, teamId, page, direction)
    return data
  })

  ipcMain.handle('transcoder:is-available', () => {
    return TranscoderService.isAvailable()
  })

  ipcMain.handle('transcoder:start', async (_event, sourceUrl) => {
    console.log('[Handler] transcoder:start', sourceUrl.slice(0, 80) + '...')
    try {
      const result = await TranscoderService.startProxy(sourceUrl)
      console.log('[Handler] transcoder:start success:', result.proxyUrl)
      return result
    } catch (err: any) {
      console.error('[Handler] transcoder:start failed:', err.message)
      throw err
    }
  })

  ipcMain.handle('transcoder:stop', () => {
    TranscoderService.stopProxy()
  })

  ipcMain.handle('transcoder:is-running', () => {
    return TranscoderService.isRunning()
  })
}
