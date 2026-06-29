import { contextBridge, ipcRenderer } from 'electron'

const api = {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    log: (...args: unknown[]) => ipcRenderer.invoke('log:info', ...args),
    onRemoteAction: (callback: (action: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, action: string) => callback(action)
      ipcRenderer.on('remote:action', handler)
      return () => { ipcRenderer.removeListener('remote:action', handler) }
    },
    writeDebugFile: (data: unknown) => ipcRenderer.invoke('app:write-debug-file', data),
    clearImageCache: () => ipcRenderer.invoke('app:clear-image-cache'),
    selectFile: (options: any) => ipcRenderer.invoke('app:select-file', options),
  youtube: {
    getStreamUrl: (videoUrl: string): Promise<{ success: boolean; url?: string; fileType?: string; error?: string }> =>
      ipcRenderer.invoke('youtube:get-stream-url', videoUrl),
    show: () => ipcRenderer.send('youtube:show'),
    hide: () => ipcRenderer.send('youtube:hide'),
    onFocusBack: (callback: () => void) => {
      ipcRenderer.on('youtube:focus-back', callback)
      return () => { ipcRenderer.removeListener('youtube:focus-back', callback) }
    },
    transcoder: {
      isAvailable: () => ipcRenderer.invoke('transcoder:is-available'),
      start: (sourceUrl: string) => ipcRenderer.invoke('transcoder:start', sourceUrl),
      stop: () => ipcRenderer.invoke('transcoder:stop'),
      isRunning: () => ipcRenderer.invoke('transcoder:is-running')
    },
  },
  tizentube: {
    checkUpdates: () => ipcRenderer.invoke('tizentube:check-updates'),
    update: () => ipcRenderer.invoke('tizentube:update'),
    getVersion: () => ipcRenderer.invoke('tizentube:get-version'),
  },
  app: {
    minimize: () => ipcRenderer.invoke('app:minimize'),
    quit: () => ipcRenderer.invoke('app:quit'),
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximizeChange: (callback: (isMaximized: boolean) => void) => {
      ipcRenderer.on('window:maximize-changed', (_event, isMaximized) => callback(isMaximized))
    },
  },
  tmdb: {
    getTrending: (type: string, timeWindow: string) =>
      ipcRenderer.invoke('tmdb:get-trending', type, timeWindow),
    getPopular: (type: string, page: number) =>
      ipcRenderer.invoke('tmdb:get-popular', type, page),
    getDetails: (type: string, id: number) =>
      ipcRenderer.invoke('tmdb:get-details', type, id),
    search: (query: string, type: string) =>
      ipcRenderer.invoke('tmdb:search', query, type),
    getSeason: (tvId: number, seasonNumber: number) =>
      ipcRenderer.invoke('tmdb:get-season', tvId, seasonNumber),
    getEpisode: (tvId: number, seasonNumber: number, episodeNumber: number) =>
      ipcRenderer.invoke('tmdb:get-episode', tvId, seasonNumber, episodeNumber),
    getImageUrl: (path: string, size: string) =>
      ipcRenderer.invoke('tmdb:get-image-url', path, size),
    getMovieGenres: () =>
      ipcRenderer.invoke('tmdb:get-movie-genres'),
    getTvGenres: () =>
      ipcRenderer.invoke('tmdb:get-tv-genres'),
    discoverByGenre: (type: string, genreId: number, page?: number) =>
      ipcRenderer.invoke('tmdb:discover-by-genre', type, genreId, page),
    getSimilar: (type: string, id: number, page?: number) =>
      ipcRenderer.invoke('tmdb:get-similar', type, id, page),
    getRecommendations: (type: string, id: number, page?: number) =>
      ipcRenderer.invoke('tmdb:get-recommendations', type, id, page),
  },
  trakt: {
    getDeviceCode: () => ipcRenderer.invoke('trakt:get-device-code'),
    pollForToken: (deviceCode: string) =>
      ipcRenderer.invoke('trakt:poll-for-token', deviceCode),
    setTokens: (accessToken: string | null, refreshToken: string | null) =>
      ipcRenderer.invoke('trakt:set-tokens', accessToken, refreshToken),
    getTokens: () => ipcRenderer.invoke('trakt:get-tokens'),
    getWatchedMovies: () => ipcRenderer.invoke('trakt:get-watched-movies'),
    getWatchedShows: () => ipcRenderer.invoke('trakt:get-watched-shows'),
    scrobble: (action: string, media: object) =>
      ipcRenderer.invoke('trakt:scrobble', action, media),
    markWatched: (media: object) =>
      ipcRenderer.invoke('trakt:mark-watched', media),
    markUnwatched: (media: object) =>
      ipcRenderer.invoke('trakt:mark-unwatched', media),
    getAuthStatus: () => ipcRenderer.invoke('trakt:get-auth-status'),
    getWatchlist: (type: 'movies' | 'shows') =>
      ipcRenderer.invoke('trakt:get-watchlist', type),
    getPlayback: () => ipcRenderer.invoke('trakt:get-playback'),
    getPlaybackMovies: () => ipcRenderer.invoke('trakt:get-playback-movies'),
    getPlaybackEpisodes: () => ipcRenderer.invoke('trakt:get-playback-episodes'),
    getWatchedProgress: () => ipcRenderer.invoke('trakt:get-watched-progress'),
  },
  torrent: {
    search: (query: object) => ipcRenderer.invoke('torrent:search', query),
    refreshTrackers: () => ipcRenderer.invoke('torrent:refresh-trackers'),
    addTorrent: (magnetUri: string) =>
      ipcRenderer.invoke('torrent:add', magnetUri),
    removeTorrent: (infoHash: string) =>
      ipcRenderer.invoke('torrent:remove', infoHash),
    getTorrentProgress: (infoHash: string) =>
      ipcRenderer.invoke('torrent:get-progress', infoHash),
    getStreamUrl: (infoHash: string, fileIndex?: number) =>
      ipcRenderer.invoke('torrent:get-stream-url', infoHash, fileIndex),
    prioritizeResume: (infoHash: string, resumePositionSec: number, estimatedDurationSec: number) =>
      ipcRenderer.invoke('torrent:prioritize-resume', infoHash, resumePositionSec, estimatedDurationSec),
  },
  indexerCatalog: {
    get: () => ipcRenderer.invoke('indexer-catalog:get'),
    shouldRefresh: () => ipcRenderer.invoke('indexer-catalog:should-refresh'),
    refresh: () => ipcRenderer.invoke('indexer-catalog:refresh'),
    getBuiltIns: () => ipcRenderer.invoke('indexer-catalog:built-ins'),
  },
  fanart: {
    getImages: (tmdbId: number, type: 'movie' | 'tv') =>
      ipcRenderer.invoke('fanart:get-images', tmdbId, type),
  },
  intros: {
    getSegments: (params: object) =>
      ipcRenderer.invoke('intros:get-segments', params),
  },
  debrid: {
    getStatus: (service: string) =>
      ipcRenderer.invoke('debrid:get-status', service),
    getServices: () =>
      ipcRenderer.invoke('debrid:get-services'),
    getPreferred: () =>
      ipcRenderer.invoke('debrid:get-preferred'),
    checkCached: (service: string, hash: string) =>
      ipcRenderer.invoke('debrid:check-cached', service, hash),
    checkCachedBatch: (service: string, hashes: string[], magnets?: string[]) =>
      ipcRenderer.invoke('debrid:check-cached-batch', service, hashes, magnets),
    addAndWait: (magnet: string, service?: string) =>
      ipcRenderer.invoke('debrid:add-and-wait', magnet, service),
    premiumizeGetDeviceCode: () =>
      ipcRenderer.invoke('debrid:premiumize-get-device-code'),
    premiumizePollForToken: (deviceCode: string) =>
      ipcRenderer.invoke('debrid:premiumize-poll-token', deviceCode),
    alldebridGetDevicePin: () =>
      ipcRenderer.invoke('debrid:alldebrid-get-device-pin'),
    alldebridPollForToken: (pin: string, deviceId?: string) =>
      ipcRenderer.invoke('debrid:alldebrid-poll-token', pin, deviceId),
    realDebridGetDeviceCode: () =>
      ipcRenderer.invoke('debrid:real-debrid-device-code'),
    realDebridPollForCredentials: (deviceCode: string) =>
      ipcRenderer.invoke('debrid:real-debrid-poll-credentials', deviceCode),
    getTorboxSettingsUrl: () =>
      ipcRenderer.invoke('debrid:torbox-settings-url'),
    torboxGetDeviceCode: () =>
      ipcRenderer.invoke('debrid:torbox-get-device-code'),
    torboxPollForToken: (deviceCode: string) =>
      ipcRenderer.invoke('debrid:torbox-poll-token', deviceCode),
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown) =>
      ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:get-all'),
  },
  watch: {
    updateProgress: (tmdbId: number, mediaType: string, progress: number, season?: number, episode?: number) =>
      ipcRenderer.invoke('watch:update-progress', tmdbId, mediaType, progress, season, episode),
    getProgress: (tmdbId: number, mediaType: string, season?: number, episode?: number) =>
      ipcRenderer.invoke('watch:get-progress', tmdbId, mediaType, season, episode),
    getHistory: () => ipcRenderer.invoke('watch:get-history'),
  },
  mpv: {
      isAvailable: () => ipcRenderer.invoke('mpv:is-available'),
    addSubtitle: (filePath: string) => ipcRenderer.invoke('mpv:add-subtitle', filePath),
      start: (url: string, resumePosition?: number, accentColor?: string, hasNext?: boolean) => ipcRenderer.invoke('mpv:start', url, resumePosition, accentColor, hasNext),
      stop: () => ipcRenderer.invoke('mpv:stop'),
      isRunning: () => ipcRenderer.invoke('mpv:is-running'),
      togglePause: () => ipcRenderer.invoke('mpv:toggle-pause'),
      seek: (seconds: number) => ipcRenderer.invoke('mpv:seek', seconds),
      getTimePos: () => ipcRenderer.invoke('mpv:get-time-pos'),
      getDuration: () => ipcRenderer.invoke('mpv:get-duration'),
      getPaused: () => ipcRenderer.invoke('mpv:get-paused'),
      showSkipIntro: (endMs: number) => ipcRenderer.invoke('mpv:show-skip-intro', endMs),
      hideSkipIntro: () => ipcRenderer.invoke('mpv:hide-skip-intro'),
      setHasNext: (hasNext: boolean) => ipcRenderer.invoke('mpv:set-has-next', hasNext),
      getLastExitCode: () => ipcRenderer.invoke('mpv:get-last-exit-code'),
      onExited: (callback: () => void) => {
        ipcRenderer.on('mpv-exited', callback)
        return () => { ipcRenderer.removeListener('mpv-exited', callback) }
      },
    },
  localCache: {
    getUrl: (infoHash: string) => ipcRenderer.invoke('local-cache:get-url', infoHash),
    isCached: (infoHash: string) => ipcRenderer.invoke('local-cache:is-cached', infoHash),
    status: () => ipcRenderer.invoke('local-cache:status'),
    clear: () => ipcRenderer.invoke('local-cache:clear'),
  },
  openSubtitles: {
    search: (params: any) => ipcRenderer.invoke('opensubtitles:search', params),
    download: (fileId: number) => ipcRenderer.invoke('opensubtitles:download', fileId),
    downloadAndSave: (fileId: number) => ipcRenderer.invoke('opensubtitles:download-and-save', fileId),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ApiType = typeof api
