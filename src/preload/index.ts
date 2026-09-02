import { contextBridge, ipcRenderer } from 'electron'

const api = {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    log: (...args: unknown[]) => ipcRenderer.invoke('log:info', ...args),
    onUpdateStatus: (callback: (data: any) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
      ipcRenderer.on('app:update-status', handler)
      return () => { ipcRenderer.removeListener('app:update-status', handler) }
    },
    checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
    getUpdateStatus: () => ipcRenderer.invoke('app:get-update-status'),
    downloadUpdate: () => ipcRenderer.invoke('app:download-update'),
    installUpdate: () => ipcRenderer.invoke('app:install-update'),
    openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
    onRemoteAction: (callback: (action: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, action: string) => callback(action)
      ipcRenderer.on('remote:action', handler)
      return () => { ipcRenderer.removeListener('remote:action', handler) }
    },
    onWatchAuthCleared: (callback: (provider: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, provider: string) => callback(provider)
      ipcRenderer.on('watch:auth-cleared', handler)
      return () => { ipcRenderer.removeListener('watch:auth-cleared', handler) }
    },
    writeDebugFile: (data: unknown) => ipcRenderer.invoke('app:write-debug-file', data),
    clearImageCache: () => ipcRenderer.invoke('app:clear-image-cache'),
  youtube: {
    getStreamUrl: (videoUrl: string): Promise<{ success: boolean; url?: string; fileType?: string; error?: string }> =>
      ipcRenderer.invoke('youtube:get-stream-url', videoUrl),
    show: () => ipcRenderer.send('youtube:show'),
    hide: () => ipcRenderer.send('youtube:hide'),
    onFocusBack: (callback: () => void) => {
      ipcRenderer.on('youtube:focus-back', callback)
      return () => { ipcRenderer.removeListener('youtube:focus-back', callback) }
    },
    signOut: () => ipcRenderer.invoke('youtube:sign-out'),
  },
  tizentube: {
    checkUpdates: () => ipcRenderer.invoke('tizentube:check-updates'),
    update: () => ipcRenderer.invoke('tizentube:update'),
    getVersion: () => ipcRenderer.invoke('tizentube:get-version'),
  },
  app: {
    minimize: () => ipcRenderer.invoke('app:minimize'),
    quit: () => ipcRenderer.invoke('app:quit'),
    onStatus: (callback: (data: { status: string; progress?: number }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
      ipcRenderer.on('app:status', handler)
      return () => { ipcRenderer.removeListener('app:status', handler) }
    },
  },
  tmdb: {
    getTrending: (type: string, timeWindow: string) =>
      ipcRenderer.invoke('tmdb:get-trending', type, timeWindow),
    getPopular: (type: string, page: number) =>
      ipcRenderer.invoke('tmdb:get-popular', type, page),
    getTopRated: (type: string, page: number) =>
      ipcRenderer.invoke('tmdb:get-top-rated', type, page),
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
    getWatchProviders: (type: string) =>
      ipcRenderer.invoke('tmdb:get-watch-providers', type),
    discoverByProvider: (type: string, providerId: number, page?: number) =>
      ipcRenderer.invoke('tmdb:discover-by-provider', type, providerId, page),
    discoverFiltered: (type: string, opts: { sortBy?: string; genreId?: number; providerId?: number }, page?: number) =>
      ipcRenderer.invoke('tmdb:discover-filtered', type, opts, page),
    getSimilar: (type: string, id: number, page?: number) =>
      ipcRenderer.invoke('tmdb:get-similar', type, id, page),
    getRecommendations: (type: string, id: number, page?: number) =>
      ipcRenderer.invoke('tmdb:get-recommendations', type, id, page),
    findByImdb: (imdbId: string) =>
      ipcRenderer.invoke('tmdb:find-by-imdb', imdbId),
  },
  mdblist: {
    getDeviceCode: () => ipcRenderer.invoke('mdblist:get-device-code'),
    pollForToken: (deviceCode: string) =>
      ipcRenderer.invoke('mdblist:poll-for-token', deviceCode),
    setTokens: (accessToken: string | null, refreshToken: string | null) =>
      ipcRenderer.invoke('mdblist:set-tokens', accessToken, refreshToken),
    getTokens: () => ipcRenderer.invoke('mdblist:get-tokens'),
    clearCache: () => ipcRenderer.invoke('mdblist:clear-cache'),
    getWatchedMovies: () => ipcRenderer.invoke('mdblist:get-watched-movies'),
    getWatchedShows: () => ipcRenderer.invoke('mdblist:get-watched-shows'),
    scrobble: (action: string, media: object) =>
      ipcRenderer.invoke('mdblist:scrobble', action, media),
    markWatched: (media: object) =>
      ipcRenderer.invoke('mdblist:mark-watched', media),
    markUnwatched: (media: object) =>
      ipcRenderer.invoke('mdblist:mark-unwatched', media),
    getAuthStatus: () => ipcRenderer.invoke('mdblist:get-auth-status'),
    getPlayback: () => ipcRenderer.invoke('mdblist:get-playback'),
    getPlaybackMovies: () => ipcRenderer.invoke('mdblist:get-playback-movies'),
    getPlaybackEpisodes: () => ipcRenderer.invoke('mdblist:get-playback-episodes'),
    getWatchedProgress: () => ipcRenderer.invoke('mdblist:get-watched-progress'),
    getWatchlist: () => ipcRenderer.invoke('mdblist:get-watchlist'),
    getSettings: () => ipcRenderer.invoke('mdblist:get-settings'),
  },
  torrent: {
    onRiveResult: (callback: (result: any) => void) => {
      ipcRenderer.on('torrent:rive-result', (_event, result) => callback(result))
      return () => { ipcRenderer.removeListener('torrent:rive-result', callback) }
    },
    onIndexerResult: (callback: (result: any) => void) => {
      ipcRenderer.on('torrent:indexer-result', (_event, result) => callback(result))
      return () => { ipcRenderer.removeListener('torrent:indexer-result', callback) }
    },
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
    getSidecarSubs: (infoHash: string, fileIndex: number) =>
      ipcRenderer.invoke('torrent:get-sidecar-subs', infoHash, fileIndex),
  },
  indexerCatalog: {
    get: () => ipcRenderer.invoke('indexer-catalog:get'),
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
    checkAllAccountStatus: () =>
      ipcRenderer.invoke('debrid:check-all-account-status'),
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
  network: {
    getStatus: () => ipcRenderer.invoke('network:get-status'),
    setConfig: (cfg: any) => ipcRenderer.invoke('network:set-config', cfg),
  },
  watch: {
    updateProgress: (tmdbId: number, mediaType: string, progress: number, season?: number, episode?: number) =>
      ipcRenderer.invoke('watch:update-progress', tmdbId, mediaType, progress, season, episode),
    getProgress: (tmdbId: number, mediaType: string, season?: number, episode?: number) =>
      ipcRenderer.invoke('watch:get-progress', tmdbId, mediaType, season, episode),
    deleteProgress: (tmdbId: number, mediaType: string, season?: number, episode?: number) =>
      ipcRenderer.invoke('watch:delete-progress', tmdbId, mediaType, season, episode),
  },
  player: {
    start: (url: string, resumePosition?: number, referer?: string, forceRemux?: boolean) =>
      ipcRenderer.invoke('player:start', url, resumePosition, referer, forceRemux),
    stop: () => ipcRenderer.invoke('player:stop'),
    addSubtitle: (filePath: string) => ipcRenderer.invoke('player:add-subtitle', filePath),
    verifyUrl: (url: string) => ipcRenderer.invoke('player:verify-url', url),
    getChapters: () => ipcRenderer.invoke('player:get-chapters'),
    getSessionError: () => ipcRenderer.invoke('player:get-session-error'),
    onFfmpegError: (callback: (error: string) => void) => {
      const handler = (_event: any, error: string) => callback(error)
      ipcRenderer.on('player:ffmpeg-error', handler)
      return () => { ipcRenderer.removeListener('player:ffmpeg-error', handler) }
    },
    setAudioTrack: (audioIndex: number) => ipcRenderer.invoke('player:set-audio-track', audioIndex),
  },
  localCache: {
    getUrl: (infoHash: string) => ipcRenderer.invoke('local-cache:get-url', infoHash),
    status: () => ipcRenderer.invoke('local-cache:status'),
    clear: () => ipcRenderer.invoke('local-cache:clear'),
  },
  openSubtitles: {
    search: (params: any) => ipcRenderer.invoke('opensubtitles:search', params),
    downloadAndSave: (fileId: number) => ipcRenderer.invoke('opensubtitles:download-and-save', fileId),
  },
  sports: {
    getLeaguesBySport: (sport: string) => ipcRenderer.invoke('sports:get-leagues-by-sport', sport),
    getSeasons: (leagueId: string) => ipcRenderer.invoke('sports:get-seasons', leagueId),
    getSportsList: () => ipcRenderer.invoke('sports:get-sports-list'),
    getEventsInRange: (leagueId: string, seasonId: string, from: string, to: string) => ipcRenderer.invoke('sports:get-events-in-range', leagueId, seasonId, from, to),
    getTeamDetails: (teamId: string) => ipcRenderer.invoke('sports:get-team-details', teamId),
    searchReplays: (query: string, sport?: string, league?: string) => ipcRenderer.invoke('replayzone:search', query, sport, league),
    searchBySport: (category: string) => ipcRenderer.invoke('replayzone:search-by-sport', category),
  },
  streamedpk: {
    getMatchesForSports: (sports: string[]) => ipcRenderer.invoke('streamedpk:get-matches-for-sports', sports),
  },
  damiTv: {
    getChannels: (server?: string) => ipcRenderer.invoke('dami-tv:get-channels', server),
    getAvailableCountries: () => ipcRenderer.invoke('dami-tv:get-available-countries'),
    extractUrl: (ch: { id: string; name: string; countryCode: string; playerUrl?: string }, server?: string) =>
      ipcRenderer.invoke('dami-tv:extract-url', ch, server),
  },
  epg: {
    getChannels: (liveTvChannels?: any[]) => ipcRenderer.invoke('epg:get-channels', liveTvChannels),
    getViewData: (liveTvChannels: any, date: string) => ipcRenderer.invoke('epg:get-view-data', liveTvChannels, date),
    getNowNext: (channelId: string) => ipcRenderer.invoke('epg:get-now-next', channelId),
    getSchedule: (channelId: string, date: string) => ipcRenderer.invoke('epg:get-schedule', channelId, date),
    refresh: (countryCodes?: string[], options?: { includeAll?: boolean }) =>
      ipcRenderer.invoke('epg:refresh', countryCodes, options),
    buildMap: (liveTvChannels: any[]) => ipcRenderer.invoke('epg:build-map', liveTvChannels),
    ensureLoaded: () => ipcRenderer.invoke('epg:ensure-loaded'),
  },
  channels: {
    getMerged: (includeIds?: string[]) =>
      ipcRenderer.invoke('channels:get-merged', includeIds),
    searchMerged: (query: string, limit?: number) =>
      ipcRenderer.invoke('channels:search-merged', query, limit),
    invalidateMerged: () => ipcRenderer.invoke('channels:invalidate-merged'),
  },
  usenet: {
    search: (query: any) => ipcRenderer.invoke('usenet:search', query),
    getFreeIndexers: () => ipcRenderer.invoke('usenet:get-free-indexers'),
    checkConnection: () => ipcRenderer.invoke('usenet:check-connection'),
    sendNzb: (nzbUrl: string, title: string, sizeBytes?: number) => ipcRenderer.invoke('usenet:send-nzb', nzbUrl, title, sizeBytes),
    getDownloadStatus: (id: string) => ipcRenderer.invoke('usenet:get-download-status', id),
    getStreamUrl: (id: string) => ipcRenderer.invoke('usenet:get-stream-url', id),
    getSidecarSubs: (dirPath: string) => ipcRenderer.invoke('usenet:get-sidecar-subs', dirPath),
    reloadConfig: () => ipcRenderer.invoke('usenet:reload-config'),
    listDownloads: () => ipcRenderer.invoke('usenet:list-downloads'),
    removeDownload: (id: string) => ipcRenderer.invoke('usenet:remove-download', id),
    clearAll: () => ipcRenderer.invoke('usenet:clear-all'),
    searchWebdavCache: (query: string, opts?: { title?: string; year?: number; type?: string; season?: number; episode?: number }) => ipcRenderer.invoke('usenet:search-webdav-cache', opts ? { query, ...opts } : query),
    deleteByPath: (filePath: string) => ipcRenderer.invoke('usenet:delete-by-path', filePath),
    onResult: (callback: (result: any) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, result: any) => callback(result)
      ipcRenderer.on('usenet:result', handler)
      return () => { ipcRenderer.removeListener('usenet:result', handler) }
    },
  },
  iptvM3u: {
    getAllSources: (forceRefresh?: boolean) => ipcRenderer.invoke('iptv-m3u:get-all-sources', forceRefresh),
    getAllChannels: (forceRefresh?: boolean) => ipcRenderer.invoke('iptv-m3u:get-all-channels', forceRefresh),
    findChannel: (query: string) => ipcRenderer.invoke('iptv-m3u:find-channel', query)
  },
  channelLogo: {
    resolve: (channelName: string, countryCode: string) =>
      ipcRenderer.invoke('channel-logo:resolve', channelName, countryCode),
    verify: (urls: string[]) =>
      ipcRenderer.invoke('channel-logo:verify', urls),
    prewarm: (channels: { name: string; countryCode: string }[]) =>
      ipcRenderer.invoke('channel-logo:prewarm', channels),
    clearCache: () => ipcRenderer.invoke('channel-logo:clear-cache'),
  },
  onDemand: {
    extractStream: (embedUrl: string) => ipcRenderer.invoke('ondemand:extract-stream', embedUrl)
  },
  dlhd: {
    getEmbedUrl: (url: string) => ipcRenderer.invoke('dlhd:get-embed-url', url),
  },
  recordings: {
    schedule: (params: { title: string; channelName: string; startTime: number; endTime: number; channel: { id: string; name: string; countryCode: string; playerUrl?: string }; sources: { type: 'cdnlive' | 'ondemand' | 'dlhd' | 'm3u'; url?: string }[] }) =>
      ipcRenderer.invoke('recordings:schedule', params),
    cancel: (id: string) => ipcRenderer.invoke('recordings:cancel', id),
    deleteRecording: (id: string) => ipcRenderer.invoke('recordings:delete', id),
    list: () => ipcRenderer.invoke('recordings:list'),
    cancelCurrent: () => ipcRenderer.invoke('recordings:cancel-current'),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ApiType = typeof api
