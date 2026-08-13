import { ipcMain, BrowserWindow, app, shell } from 'electron'
import { handle } from './handler-wrapper'
import fs from 'fs'
import path from 'path'

const TMDB_CACHE_VERSION = 2 // bump when TMDB append_to_response fields change

import * as TmdbService from '../services/tmdb.service'
import * as MdbListService from '../services/mdblist.service'
import * as WebTorrentService from '../services/webtorrent.service'
import * as TorrentSearchService from '../services/torrent-search.service'
import * as DebridService from '../services/debrid.service'
import * as CacheService from '../services/cache.service'
import * as FanartService from '../services/fanart.service'
import * as IndexerCatalogService from '../services/indexer-catalog.service'
import * as IntroDBService from "../services/introdb.service";
import * as YoutubeService from '../services/youtube.service'
import * as LocalCacheService from '../services/local-cache.service'
import * as FfmpegRemux from '../services/ffmpeg-remux.service'
import * as PlayerService from '../services/player.service'
import * as OpenSubtitlesService from '../services/opensubtitles.service'
import * as SportsService from '../services/sports.service'
import * as ReplayZoneService from '../services/replayzone.service'
import * as StreamedPkService from '../services/streamedpk.service'
import * as ExtractorService from '../services/extractor.service'
import * as DamiTVService from '../services/dami-tv.service'
import { getProvider, type LiveTVServerId } from '../services/livetv-providers'
import * as EpgService from '../services/epg.service'
import * as ChannelMergeService from '../services/channel-merge.service'
import * as UsenetSearchService from '../services/usenet-search.service'
import * as UsenetService from '../services/usenet.service'
import * as UpdaterService from '../services/updater.service'
import { getDlhdEmbedUrl } from '../services/dlhd-window'
import * as RecordingsService from '../services/recordings.service'
import * as NetworkApiService from '../services/network-api.service'

export async function registerIpcHandlers(): Promise<void> {
  TmdbService.loadApiKey()
  MdbListService.loadCredentials()
  DebridService.loadKeys()
  FanartService.loadApiKey()
  OpenSubtitlesService.loadApiKey()
  // SportsService uses public Sportarr API, no key needed
  EpgService.ensureEpgLoaded().catch(err => console.error('[Handler] EPG init error:', err?.message))
  await WebTorrentService.init()
  LocalCacheService.init()
  FfmpegRemux.init(() => LocalCacheService.getPort())
  await NetworkApiService.init()
  NetworkApiService.startIdleSweep()
  if (IndexerCatalogService.shouldRefreshCatalog()) {
    IndexerCatalogService.refreshIndexerCatalog().catch(err => {
      console.error('[Handler] Background indexer catalog refresh failed:', err.message)
    })
  }

  handle('app:get-version', () => app.getVersion())

  handle('app:check-for-updates', () => UpdaterService.checkForUpdates())
  handle('app:get-update-status', () => UpdaterService.getStatus())
  handle('app:download-update', () => UpdaterService.downloadUpdate())
  handle('app:install-update', () => UpdaterService.installUpdate())

  // Forward renderer logs to main process stdout (visible in terminal)
  handle('log:info', (_event, ...args: unknown[]) => {
    console.log('[Renderer]', ...args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)))
  })

  handle('app:write-debug-file', (_event, data) => {
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

  handle('app:clear-image-cache', () => {
    try {
      CacheService.clearImageCache()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  handle('app:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  handle('app:quit', async () => {
    try {
      WebTorrentService.removeAllTorrents()
    } catch {}
    app.quit()
  })
  handle('app:open-external', async (_event, url: string) => {
    await shell.openExternal(url)
  })
  handle('tmdb:get-trending', async (_event, type, timeWindow) => {
    return TmdbService.getTrending(type, timeWindow)
  })

  handle('tmdb:get-popular', async (_event, type, page) => {
      return TmdbService.getPopular(type, page);
    });

    handle('tmdb:get-top-rated', async (_event, type, page) => {
      return TmdbService.getTopRated(type, page);
    });

  handle('tmdb:get-details', async (_event, type, id) => {
    const cacheKey = `tmdb:details:${TMDB_CACHE_VERSION}:${type}:${id}`
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

  handle('tmdb:search', async (_event, query, type) => {
    return TmdbService.search(query, type)
  })

  handle('tmdb:get-season', async (_event, tvId, seasonNumber) => {
    const cacheKey = `tmdb:season:${tvId}:${seasonNumber}`
    const cached = CacheService.getCache(cacheKey)
    if (cached) return JSON.parse(cached)
    const data = await TmdbService.getSeason(tvId, seasonNumber)
    CacheService.setCache(cacheKey, JSON.stringify(data), 3600000)
    return data
  })

  handle('tmdb:get-episode', async (_event, tvId, seasonNumber, episodeNumber) => {
    const cacheKey = `tmdb:episode:${tvId}:${seasonNumber}:${episodeNumber}`
    const cached = CacheService.getCache(cacheKey)
    if (cached) return JSON.parse(cached)
    const data = await TmdbService.getEpisode(tvId, seasonNumber, episodeNumber)
    CacheService.setCache(cacheKey, JSON.stringify(data), 3600000)
    return data
  })

  handle('tmdb:get-image-url', (_event, path, size) => {
    return TmdbService.getImageUrl(path, size)
  })

  handle('tmdb:get-movie-genres', async () => {
    const cacheKey = 'tmdb:genres:movie'
    const cached = CacheService.getCache(cacheKey)
    if (cached) return JSON.parse(cached)
    const data = await TmdbService.getMovieGenres()
    CacheService.setCache(cacheKey, JSON.stringify(data), 86400000)
    return data
  })

  handle('tmdb:get-tv-genres', async () => {
    const cacheKey = 'tmdb:genres:tv'
    const cached = CacheService.getCache(cacheKey)
    if (cached) return JSON.parse(cached)
    const data = await TmdbService.getTvGenres()
    CacheService.setCache(cacheKey, JSON.stringify(data), 86400000)
    return data
  })

  handle('tmdb:discover-by-genre', async (_event, type, genreId, page) => {
    const cacheKey = `tmdb:discover:${type}:${genreId}:${page || 1}`
    const cached = CacheService.getCache(cacheKey)
    if (cached) return JSON.parse(cached)
    const data = await TmdbService.discoverByGenre(type, genreId, page || 1)
    CacheService.setCache(cacheKey, JSON.stringify(data), 3600000)
    return data
  })

  handle('tmdb:get-watch-providers', async (_event, type) => {
    const cacheKey = `tmdb:providers:${type}`
    const cached = CacheService.getCache(cacheKey)
    if (cached) return JSON.parse(cached)
    const data = await TmdbService.getWatchProviders(type)
    CacheService.setCache(cacheKey, JSON.stringify(data), 86400000) // 24h
    return data
  })

  handle('tmdb:discover-by-provider', async (_event, type, providerId, page) => {
    const cacheKey = `tmdb:provider-discover:${type}:${providerId}:${page || 1}`
    const cached = CacheService.getCache(cacheKey)
    if (cached) return JSON.parse(cached)
    const data = await TmdbService.discoverByProvider(type, providerId, page || 1)
    CacheService.setCache(cacheKey, JSON.stringify(data), 3600000) // 1h
    return data
  })

  handle('tmdb:discover-filtered', async (_event, type, opts, page) => {
    const cacheKey = `tmdb:discover-filtered:${type}:${opts?.sortBy || ''}:${opts?.genreId || 0}:${opts?.providerId || 0}:${page || 1}`
    const cached = CacheService.getCache(cacheKey)
    if (cached) return JSON.parse(cached)
    const data = await TmdbService.discoverFiltered(type, opts || {}, page || 1)
    CacheService.setCache(cacheKey, JSON.stringify(data), 3600000) // 1h
    return data
  })

  handle('tmdb:get-similar', async (_event, type, id, page) => {
    const cacheKey = `tmdb:similar:${type}:${id}:${page || 1}`
    const cached = CacheService.getCache(cacheKey)
    if (cached) return JSON.parse(cached)
    const data = await TmdbService.getSimilar(type, id, page || 1)
    CacheService.setCache(cacheKey, JSON.stringify(data), 3600000)
    return data
  })

  handle('tmdb:get-recommendations', async (_event, type, id, page) => {
    const cacheKey = `tmdb:recommendations:${type}:${id}:${page || 1}`
    const cached = CacheService.getCache(cacheKey)
    if (cached) return JSON.parse(cached)
    const data = await TmdbService.getRecommendations(type, id, page || 1)
    CacheService.setCache(cacheKey, JSON.stringify(data), 3600000)
    return data
  })

  handle('tmdb:find-by-imdb', async (_event, imdbId: string) => {
    return TmdbService.findByImdb(imdbId)
  })

  handle('mdblist:poll-for-token', async (_event, deviceCode) => {
    return MdbListService.pollForToken(deviceCode)
  })

  handle('mdblist:get-watched-movies', async () => {
    return MdbListService.getWatchedMovies()
  })

  handle('mdblist:get-watched-shows', async () => {
    return MdbListService.getWatchedShows()
  })

  handle('mdblist:scrobble', async (_event, action, media) => {
    console.log('[MDBList] IPC scrobble called:', action)
    return MdbListService.scrobble(action, media)
  })

  handle('mdblist:mark-watched', async (_event, media) => {
    return MdbListService.markWatched(media)
  })

  handle('mdblist:mark-unwatched', async (_event, media) => {
    return MdbListService.markUnwatched(media)
  })

  handle('mdblist:get-auth-status', () => {
    return { authenticated: MdbListService.isAuthenticated() }
  })

  handle('mdblist:get-playback', async () => {
    return MdbListService.getPlayback()
  })

  handle('mdblist:get-playback-movies', async () => {
    return MdbListService.getPlaybackMovies()
  })

  handle('mdblist:get-playback-episodes', async () => {
    return MdbListService.getPlaybackEpisodes()
  })

  handle('mdblist:get-watched-progress', async () => {
    try {
      return await MdbListService.getWatchedShowsWithProgress()
    } catch (err: any) {
      console.error('[Handler] mdblist:get-watched-progress failed:', err.message)
      return []
    }
  })

  handle('mdblist:get-tokens', async () => {
    return MdbListService.getTokens()
  })

  handle('mdblist:get-device-code', async () => {
    return MdbListService.getDeviceCode()
  })

  handle('mdblist:get-settings', async () => {
    return MdbListService.getSettings()
  })

  handle('mdblist:set-tokens', async (_event, accessToken, refreshToken) => {
    MdbListService.setTokens(accessToken, refreshToken)
  })

  handle('mdblist:clear-cache', async () => {
    MdbListService.clearCache()
  })

  handle('torrent:search', async (event, query) => {
    console.log('[Handler] torrent:search', JSON.stringify(query).slice(0, 200))
    const providers = query.providers || {}
    const searchTorrents = providers.torrent !== false
    const searchVyla = providers.vyla !== false

    const enabledIndexers = searchTorrents
      ? (CacheService.getSetting<string[]>('enabledIndexers') || TorrentSearchService.getDefaultEnabledIndexers())
      : []
    console.log('[Handler] enabledIndexers count:', enabledIndexers.length, 'searchTorrents:', searchTorrents, 'searchVyla:', searchVyla)
    const customIndexers = searchTorrents
      ? (CacheService.getSetting<TorrentSearchService.CustomIndexer[]>('customIndexers') || [])
      : []

    // Kick off Vyla search immediately (in parallel with torrent indexers)
    const vylaPromise = searchVyla && query.tmdbId
      ? ExtractorService.searchStreams(
          { tmdbId: query.tmdbId, type: query.type, season: query.season, episode: query.episode },
          (source) => event.sender.send('torrent:rive-result', source)
        ).catch(err => console.error('[Handler] Vyla streaming search failed:', err))
      : Promise.resolve()

    try {
      const torrentResults = searchTorrents
        ? await TorrentSearchService.searchTorrents(query, enabledIndexers, customIndexers, (result) => {
            event.sender.send('torrent:indexer-result', result)
          })
        : []

      console.log('[Handler] torrent:search returned', torrentResults.length, 'torrents')
      // Log raw results for debugging (first 30)
      console.log('[Handler] RAW RESULTS:')
      for (const r of torrentResults.slice(0, 30)) {
        console.log(`  [${r.indexer}] seeds=${r.seeders} leechers=${r.leechers} size=${r.size} title="${r.title.slice(0, 80)}" infoHash=${r.infoHash.slice(0, 16)}`)
    }

    // Asynchronously pre-cache metadata for top 15 results (fire-and-forget, don't block response)
    if (torrentResults.length > 0) {
      setImmediate(() => {
        WebTorrentService.prefetchBatch(torrentResults.slice(0, 15)).catch(err => {
          console.error('[Handler] prefetchBatch failed (non-critical):', err?.message || err)
        })
      })
    }

    return {
      torrents: torrentResults,
      rive: []
    }
  } catch (err: any) {
    console.error('[Handler] torrent:search failed:', err.message)
    throw err
  }
})

  handle('torrent:refresh-trackers', async () => {
    try {
      const trackers = await TorrentSearchService.refreshTrackers()
      return { count: trackers.length }
    } catch (err: any) {
      console.error('[Handler] torrent:refresh-trackers failed:', err.message)
      throw new Error(err?.message || 'Failed to refresh tracker list')
    }
  })

  handle('indexer-catalog:get', () => {
    return {
      catalog: IndexerCatalogService.getStoredCatalog(),
      lastUpdated: IndexerCatalogService.getCatalogLastUpdated(),
    }
  })

  handle('indexer-catalog:refresh', async () => {
    try {
      const catalog = await IndexerCatalogService.refreshIndexerCatalog()
      return { count: catalog.length }
    } catch (err: any) {
      console.error('[Handler] indexer-catalog:refresh failed:', err.message)
      throw new Error(err?.message || 'Failed to refresh indexer catalog')
    }
  })

  handle('indexer-catalog:built-ins', () => {
    return TorrentSearchService.getBuiltInIndexerDefinitions().map(i => ({ id: i.id, name: i.name, type: i.type }))
  })

  handle('torrent:add', async (_event, magnetUri) => {
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

  handle('torrent:remove', (_event, infoHash) => {
    WebTorrentService.removeTorrent(infoHash)
  })

  handle('torrent:prioritize-resume', (_event, infoHash, resumePositionSec, estimatedDurationSec) => {
    WebTorrentService.prioritizeResume(infoHash, resumePositionSec, estimatedDurationSec)
  })

  handle('torrent:get-progress', async (_event, infoHash) => {
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

  handle('torrent:get-stream-url', async (_event, infoHash, fileIndex) => {
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
  handle("intros:get-segments", async (_event, params) => {
    return IntroDBService.getSegments(params)
  })

  handle('debrid:get-status', (_event, service) => {
    return { configured: DebridService.isConfigured(service) }
  })

  handle('debrid:check-all-account-status', async () => {
    const services = DebridService.getServices()
    const results: Record<string, { valid: boolean; expiry?: string; error?: string }> = {}
    await Promise.all(services.map(async (svc) => {
      results[svc] = await DebridService.checkAccountStatus(svc)
    }))
    return results
  })

  handle('debrid:check-cached', async (_event, service, hash) => {
    const result = await DebridService.checkBatchCached([hash], service)
    return { cached: result[hash] ?? false }
  })

  handle('debrid:check-cached-batch', async (_event, service, hashes, magnets) => {
    const result = await DebridService.checkBatchCached(hashes, service, magnets)
    const keys = Object.keys(result)
    const count = keys.filter(k => result[k]).length
    console.log(`[Handler] check-cached-batch returning ${keys.length} keys, ${count} cached`)
    return result
  })

  handle('debrid:add-and-wait', async (_event, magnet, service) => {
    console.log('[Handler] debrid:add-and-wait', service, magnet.slice(0, 60) + '...')
    try {
      const url = await DebridService.addAndWait(magnet, service || undefined)
      console.log('[Handler] debrid:add-and-wait success:', url?.slice(0, 80) || 'empty')
      return { url }
    } catch (err: any) {
      console.error('[Handler] debrid:add-and-wait failed:', err.message)
      // If it's a known cached-check failure, we can return a specific error
      if (err.name === 'CachedCheckFailedError' || err.message.includes('451')) {
         throw new Error('This torrent is not currently available on the debrid service. Try a different source.')
      }
      throw err
    }
  })

  // Premiumize OAuth
  handle('debrid:premiumize-get-device-code', async () => {
    try {
      return await DebridService.premiumizeGetDeviceCode()
    } catch (err: any) {
      throw new Error(err?.message || 'Premiumize: failed to get device code')
    }
  })

  handle('debrid:premiumize-poll-token', async (_event, deviceCode) => {
    try {
      return await DebridService.premiumizePollForToken(deviceCode)
    } catch (err: any) {
      throw new Error(err?.message || 'Premiumize: failed to poll for token')
    }
  })

  // AllDebrid OAuth
  handle('debrid:alldebrid-get-device-pin', async () => {
    try {
      return await DebridService.alldebridGetDevicePin()
    } catch (err: any) {
      throw new Error(err?.message || 'AllDebrid: failed to get device pin')
    }
  })

  handle('debrid:alldebrid-poll-token', async (_event, pin, deviceId) => {
    try {
      return await DebridService.alldebridPollForToken(pin, deviceId)
    } catch (err: any) {
      throw new Error(err?.message || 'AllDebrid: failed to poll for token')
    }
  })

  // Real-Debrid
  handle('debrid:real-debrid-device-code', async () => {
    try {
      return await DebridService.realDebridGetDeviceCode()
    } catch (err: any) {
      throw new Error(err?.message || 'Real-Debrid: failed to get device code')
    }
  })

  handle('debrid:real-debrid-poll-credentials', async (_event, deviceCode) => {
    try {
      return await DebridService.realDebridPollForCredentials(deviceCode)
    } catch (err: any) {
      throw new Error(err?.message || 'Real-Debrid: failed to poll for credentials')
    }
  })

  // TorBox
  handle('debrid:torbox-get-device-code', async () => {
    try {
      return await DebridService.torboxGetDeviceCode()
    } catch (err: any) {
      throw new Error(err?.message || 'TorBox: failed to get device code')
    }
  })

  handle('debrid:torbox-poll-token', async (_event, deviceCode) => {
    try {
      return await DebridService.torboxPollForToken(deviceCode)
    } catch (err: any) {
      throw new Error(err?.message || 'TorBox: failed to poll for token')
    }
  })

  handle('fanart:get-images', async (_event, tmdbId, type) => {
    return FanartService.getImages(tmdbId, type)
  })

  handle('settings:get', (_event, key) => {
    return CacheService.getSetting(key)
  })

  handle('settings:set', (_event, key, value) => {
    CacheService.setSetting(key, value)
    if (key === 'tmdbApiKey') TmdbService.setApiKey(String(value))
    if (key === 'realDebridApiKey') DebridService.setRealDebridKey(String(value) || null)
    if (key === 'torboxApiKey') DebridService.setTorboxKey(String(value) || null)
    if (key === 'premiumizeAccessToken') DebridService.loadKeys()
    if (key === 'alldebridAccessToken') DebridService.loadKeys()
    if (key === 'fanartApiKey') FanartService.setApiKey(String(value))
    if (key === 'opensubtitlesApiKey') OpenSubtitlesService.setApiKey(String(value))
    if (key === 'liveTvUser' || key === 'liveTvPlan') DamiTVService.clearChannelsCache()
    if (key === 'networkEnabled' || key === 'networkPort' || key === 'networkUsername' || key === 'networkPassword') NetworkApiService.reload()
    // SportsService uses public Sportarr API, no key needed
})

  handle('settings:get-all', () => {
    return CacheService.getAllSettings()
  })

  handle('network:get-status', () => NetworkApiService.getStatus())
  handle('network:set-config', (_e, cfg: any) => NetworkApiService.setConfig(cfg))

  handle('watch:update-progress', (_event, tmdbId, mediaType, progress, season, episode) => {
    CacheService.updateWatchProgress(tmdbId, mediaType, progress, season, episode)
  })

  handle('watch:get-progress', (_event, tmdbId, mediaType, season, episode) => {
    return CacheService.getWatchProgress(tmdbId, mediaType, season, episode)
  })

  handle('watch:delete-progress', (_event, tmdbId, mediaType, season, episode) => {
    CacheService.deleteWatchProgress(tmdbId, mediaType, season, episode)
  })

  // ── HTML5 Player (Video.js + FFmpeg remux) ──────────────────────────────

  handle('player:start', async (_event, url: string, resumePosition?: number, referer?: string, forceRemux?: boolean) => {
    try {
      console.log('[Handler] player:start resumePosition=', resumePosition, 'url=', url?.slice(0, 80))
      const result = await PlayerService.startPlayback(url, resumePosition, referer, forceRemux)
      return result
    } catch (err: any) {
      console.error('[Handler] player:start failed:', err?.message)
      throw err
    }
  })

  handle('player:stop', async () => {
    await PlayerService.stopPlayback()
  })

  handle('player:get-session-error', async () => {
    const sessionId = PlayerService.getCurrentSessionId()
    if (!sessionId) return null
    return FfmpegRemux.getSessionError(sessionId)
  })

  handle('player:add-subtitle', async (_event, filePath: string) => {
    // For the HTML5 player, subtitles are loaded as <track> elements.
    // The renderer handles this directly — this IPC is just for
    // compatibility. The filePath is returned to the renderer as-is.
    return { filePath }
  })

  handle('torrent:get-sidecar-subs', async (_event, infoHash: string, fileIndex: number) => {
    return WebTorrentService.getSidecarSubtitles(infoHash, fileIndex)
  })

  handle('player:verify-url', async (_event, url: string) => {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const resp = await fetch(url, { method: 'HEAD', signal: controller.signal })
      clearTimeout(timeout)
      return { ok: resp.ok, status: resp.status }
    } catch (err: any) {
      console.error('[Handler] player:verify-url failed for', url.slice(0, 80), err?.message)
      return { ok: false, status: 0, error: err?.message }
    }
  })

  handle('player:get-chapters', async () => {
    return PlayerService.getChapters()
  })

  handle('player:set-audio-track', async (_event, audioIndex: number) => {
    const newUrl = await PlayerService.switchAudioTrack(audioIndex)
    return { streamUrl: newUrl }
  })

  // ── Local Cache ─────────────────────────────────────────────────────────

  handle('local-cache:get-url', async (_event, infoHash) => {
    const url = LocalCacheService.getCacheUrl(infoHash)
    return { url }
  })

  handle('local-cache:status', () => {
    return LocalCacheService.getCacheStatus()
  })

  handle('local-cache:clear', async () => {
    await LocalCacheService.clearCache()
  })

  handle('opensubtitles:search', async (_event, params) => {
    return OpenSubtitlesService.searchSubtitles(params)
  })

  handle('opensubtitles:download-and-save', async (_event, fileId: number) => {
    const content = await OpenSubtitlesService.downloadSubtitle(fileId)
    if (!content) return null
    const filePath = `/tmp/fynix-sub-${fileId}.srt`
    await fs.promises.writeFile(filePath, content, 'utf-8')
    return filePath
  })

  handle('sports:get-leagues-by-sport', async (_event, sport: string) => {
    const leagues = await SportsService.getLeaguesBySport(sport)
    console.log(`[Sports] getLeaguesBySport(${sport}):`, leagues.length, 'leagues, first logoUrl:', leagues[0] ? `${leagues[0].name}=${leagues[0].logoUrl}` : 'NONE')
    return leagues
  })

  handle('youtube:get-stream-url', async (_event, videoUrl: string) => {
    try {
      const url = await YoutubeService.resolveStreamUrl(videoUrl)
      return { success: true, url }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to resolve stream URL' }
    }
  })

  handle('sports:get-seasons', async (_event, leagueId: string) => {
    return SportsService.getSeasons(leagueId)
  })

  handle('sports:get-sports-list', async () => {
    const list = await SportsService.getSportsList()
    console.log('[Sports] getSportsList:', list.length, 'sports, first iconUrl:', list[0] ? `${list[0].name}=${list[0].iconUrl}` : 'NONE')
    return list
  })

  handle('sports:get-events-in-range', async (_event, leagueId: string, seasonId: string, from: string, to: string) => {
    return SportsService.getEventsInRange(leagueId, seasonId, from, to)
  })

  handle('sports:get-team-details', async (_event, teamId: string) => {
    const team = await SportsService.getTeamDetails(teamId)
    console.log(`[Sports] getTeamDetails(${teamId}):`, team ? `${team.name} logoUrl=${team.logoUrl}` : 'null')
    return team
  })

  handle('replayzone:search', async (_event, query: string) => {
    return ReplayZoneService.searchReplays(query)
  })

  handle('streamedpk:get-matches-for-sports', async (_event, sports: string[]) => {
    return StreamedPkService.getMatchesForSports(sports)
  })

  handle('dami-tv:get-channels', async (_event, server?: LiveTVServerId) => {
    const serverId = server || 'cdnlive'
    // Only fetch from the requested provider — don't wait for all providers
    try {
      return await getProvider(serverId).getChannels()
    } catch {
      return []
    }
  })

  handle('dami-tv:get-available-countries', async () => {
    return DamiTVService.getAvailableCountries()
  })

  handle('dami-tv:extract-url', async (_event, ch: { id: string; name: string; countryCode: string; playerUrl?: string }, server?: LiveTVServerId) => {
    const serverId = server || 'cdnlive'
    // Call the specific provider directly — don't fallback to other providers
    // when the user explicitly chose a source
    try {
      const result = await getProvider(serverId).extractUrl(ch)
      return result
    } catch (err: any) {
      return { error: err?.message || 'Extraction failed' }
    }
  })

  handle('dlhd:get-embed-url', async (_event, url: string) => {
    return getDlhdEmbedUrl(url)
  })

  handle('ondemand:extract-stream', async (_event, embedUrl: string) => {
    try {
      const res = await fetch(embedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const html = await res.text()
      // Look for .m3u8 URLs in the page
      const m3u8Match = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/)
      if (m3u8Match) return m3u8Match[0]
      // Look for iframe src URLs that might contain a stream
      const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/)
      if (iframeMatch) return iframeMatch[1]
      // Look for video source tags
      const videoSrc = html.match(/<source[^>]+src=["']([^"']+)["']/)
      if (videoSrc) return videoSrc[1]
      return null
    } catch {
      return null
    }
  })

  handle('epg:get-channels', async (_event, liveTvChannels?: any[]) => {
    if (liveTvChannels && liveTvChannels.length > 0) {
      return EpgService.getMappedChannels(liveTvChannels)
    }
    return EpgService.getChannels()
  })

  // Merged CDN+M3U channel list, computed in main so the renderer never
  // touches the 700k-row raw M3U payload (that transfer + merge froze the UI
  // thread on every LiveTV/EPG/Settings entry). Returns a bounded slice:
  // CDN first, then M3U by country+name, plus any curated ids.
  handle('channels:get-merged', async (_event, includeIds?: string[]) => {
    return ChannelMergeService.getMergedChannelsForRenderer(includeIds)
  })

  handle('channels:search-merged', async (_event, query: string, limit?: number) => {
    return ChannelMergeService.searchMergedChannels(query, limit)
  })

  handle('channels:invalidate-merged', async () => {
    ChannelMergeService.invalidateMergedChannels()
  })

  // One IPC instead of N×2 (now/next + schedule per channel): the EPG screen
  // renders hundreds of channel rows and round-tripping each one separately
  // made every screen entry visibly slow.
  handle('epg:get-view-data', async (_event, liveTvChannels: any[], date: string) => {
    // Async map build: if the channel list fingerprint changed since the last
    // build (e.g. curated ids were added), rebuild chunked instead of blocking
    // main with a sync O(n×m) pass. When unchanged this is a no-op.
    if (liveTvChannels && liveTvChannels.length > 0) {
      await EpgService.buildChannelMapAsync(liveTvChannels)
    }
    const channels = (liveTvChannels && liveTvChannels.length > 0)
      ? EpgService.getMappedChannels(liveTvChannels)
      : (await EpgService.getChannels()).map((ch: any) => ({
          epgChannelId: ch.id,
          liveTvChannelId: ch.id,
          displayName: ch.displayName,
          icon: ch.icon || '',
          liveTvName: ch.displayName,
          liveTvLogo: '',
          liveTvCountryCode: 'intl',
          liveTvCountryName: 'Unknown',
          liveTvCountryFlag: '',
          liveTvPlayerUrl: '',
        }))
    const nowNext: Record<string, unknown> = {}
    const schedules: Record<string, unknown> = {}
    for (const ch of channels) {
      nowNext[ch.liveTvChannelId] = EpgService.getNowNext(ch.epgChannelId)
      schedules[ch.liveTvChannelId] = EpgService.getSchedule(ch.epgChannelId, date)
    }
    return { channels, nowNext, schedules }
  })

  handle('epg:get-now-next', async (_event, channelId: string) => {
    return EpgService.getNowNext(channelId)
  })

  handle('epg:get-schedule', async (_event, channelId: string, date: string) => {
    return EpgService.getSchedule(channelId, date)
  })

  handle('epg:refresh', async (_event, countryCodes?: string[], options?: { includeAll?: boolean }) => {
    await EpgService.refreshEpg(countryCodes, options)
  })

  handle('epg:build-map', async (_event, liveTvChannels: any[]) => {
    EpgService.buildChannelMap(liveTvChannels)
  })

  handle('epg:ensure-loaded', async () => {
    await EpgService.ensureEpgLoaded()
  })

  handle('usenet:search', async (event, query) => {
    const enabledIds = CacheService.getSetting<string[]>('enabledUsenetIndexers') || UsenetSearchService.getDefaultEnabledIndexerIds()
    const customIndexers = CacheService.getSetting<UsenetSearchService.UsenetIndexerConfig[]>('customUsenetIndexers') || []
    const preferredLanguages = CacheService.getSetting<string[]>('preferredLanguages') || ['English']
    try {
      const [results, cacheResults] = await Promise.all([
        UsenetSearchService.searchUsenet(query, enabledIds, customIndexers, (result) => {
          event.sender.send('usenet:result', result)
        }, preferredLanguages),
        UsenetService.searchWebdavCache(query.query || query.title || '', { title: query.title, year: query.year, type: query.type, season: query.season, episode: query.episode }),
      ])
      // Merge WebDAV cache results (already downloaded — streamable immediately)
      for (const cr of cacheResults) {
        results.push({
          title: cr.name,
          size: cr.size || 0,
          indexer: 'NzbDav Cache',
          quality: 'Unknown',
          nzbUrl: '',
          infoHash: '',
          group: '',
          poster: 0,
          date: '',
          streamUrl: cr.streamUrl,
        })
      }
      return results
    } catch (err: any) {
      console.error('[Handler] usenet:search failed:', err.message)
      return []
    }
  })

  handle('usenet:check-connection', async () => {
    return UsenetService.checkConnection()
  })

  handle('usenet:send-nzb', async (_event, nzbUrl, title, sizeBytes) => {
    console.log('[Handler] usenet:send-nzb', title, sizeBytes ? `(${(sizeBytes / 1073741824).toFixed(1)}GB)` : '')
    return UsenetService.sendNzb(nzbUrl, title, sizeBytes)
  })

  handle('usenet:get-download-status', async (_event, id) => {
    return UsenetService.getDownloadStatus(id)
  })

  handle('usenet:get-free-indexers', () => {
    return UsenetSearchService.getFreeIndexers()
  })

  handle('usenet:get-stream-url', async (_event, id) => {
    return { url: await UsenetService.getStreamUrl(id) }
  })

  handle('usenet:get-sidecar-subs', async (_event, dirPath: string) => {
    return UsenetService.getSidecarSubs(dirPath)
  })

  handle('usenet:reload-config', async () => {
    UsenetService.loadConfig()
    return { success: true }
  })

  handle('usenet:list-downloads', async () => {
    return UsenetService.listDownloads()
  })

  handle('usenet:remove-download', async (_event, id) => {
    return UsenetService.removeDownload(id)
  })

  handle('usenet:clear-all', async () => {
    return UsenetService.clearAll()
  })

  handle('usenet:search-webdav-cache', async (_event, query: string | { query: string; title?: string; year?: number; type?: string; season?: number; episode?: number }) => {
    if (typeof query === 'string') {
      return UsenetService.searchWebdavCache(query)
    }
    return UsenetService.searchWebdavCache(query.query, { title: query.title, year: query.year, type: query.type as 'movie' | 'tv' | undefined, season: query.season, episode: query.episode })
  })

  handle('usenet:delete-by-path', async (_event, filePath: string) => {
    return UsenetService.deleteUsenetByPath(filePath)
  })

  // ── Recordings (PVR) ─────────────────────────────────────────────────────

  handle('recordings:schedule', async (_event, params) => RecordingsService.scheduleRecording(params))
  handle('recordings:cancel', async (_event, id) => RecordingsService.cancelRecording(id))
  handle('recordings:delete', async (_event, id) => RecordingsService.deleteRecording(id))
  handle('recordings:list', async () => RecordingsService.listRecordings())
  handle('recordings:cancel-current', async () => RecordingsService.cancelCurrentRecording())

  // Initialize recordings service (load persisted state, resume pending schedules)
  await RecordingsService.init()
}
