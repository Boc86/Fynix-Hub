import { contextBridge, ipcRenderer } from 'electron'

const api = {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    writeDebugFile: (data: unknown) => ipcRenderer.invoke('app:write-debug-file', data),
    clearImageCache: () => ipcRenderer.invoke('app:clear-image-cache'),
    selectFile: (options: any) => ipcRenderer.invoke('app:select-file', options),
  youtube: {
    getStreamUrl: (videoUrl: string): Promise<{ success: boolean; url?: string; fileType?: string; error?: string }> =>
      ipcRenderer.invoke('youtube:get-stream-url', videoUrl),
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
  transcoder: {
    isAvailable: () => ipcRenderer.invoke('transcoder:is-available'),
    start: (sourceUrl: string) => ipcRenderer.invoke('transcoder:start', sourceUrl),
    stop: () => ipcRenderer.invoke('transcoder:stop'),
    isRunning: () => ipcRenderer.invoke('transcoder:is-running'),
  },
  sportsdb: {
    getSports: () => ipcRenderer.invoke('sportsdb:get-sports'),
    getCountries: (sportSlug: string) => ipcRenderer.invoke('sportsdb:get-countries', sportSlug),
    getCompetitions: (sportSlug: string, sportId: number, countrySlug?: string) =>
      ipcRenderer.invoke('sportsdb:get-competitions', sportSlug, sportId, countrySlug),
    getSeasons: (sportSlug: string, tournamentId: number) => ipcRenderer.invoke('sportsdb:get-seasons', sportSlug, tournamentId),
    getFixtures: (sportSlug: string, tournamentId: number, seasonId: number, page: number, direction: 'last' | 'next') =>
      ipcRenderer.invoke('sportsdb:get-fixtures', sportSlug, tournamentId, seasonId, page, direction),
    searchClubs: (sportSlug: string, searchTerm: string) => ipcRenderer.invoke('sportsdb:search-clubs', sportSlug, searchTerm),
    getClub: (sportSlug: string, teamId: number) => ipcRenderer.invoke('sportsdb:get-club', sportSlug, teamId),
    getClubFixtures: (sportSlug: string, teamId: number, page: number, direction: 'last' | 'next') =>
      ipcRenderer.invoke('sportsdb:get-club-fixtures', sportSlug, teamId, page, direction),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ApiType = typeof api
