import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
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
  },
  trakt: {
    getDeviceCode: () => ipcRenderer.invoke('trakt:get-device-code'),
    pollForToken: (deviceCode: string) =>
      ipcRenderer.invoke('trakt:poll-for-token', deviceCode),
    setTokens: (accessToken: string | null, refreshToken: string | null) =>
      ipcRenderer.invoke('trakt:set-tokens', accessToken, refreshToken),
    getWatchedMovies: () => ipcRenderer.invoke('trakt:get-watched-movies'),
    getWatchedShows: () => ipcRenderer.invoke('trakt:get-watched-shows'),
    scrobble: (action: string, media: object) =>
      ipcRenderer.invoke('trakt:scrobble', action, media),
    markWatched: (media: object) =>
      ipcRenderer.invoke('trakt:mark-watched', media),
    markUnwatched: (media: object) =>
      ipcRenderer.invoke('trakt:mark-unwatched', media),
    getAuthStatus: () => ipcRenderer.invoke('trakt:get-auth-status'),
  },
  torrent: {
    search: (query: object) => ipcRenderer.invoke('torrent:search', query),
    addTorrent: (magnetUri: string) =>
      ipcRenderer.invoke('torrent:add', magnetUri),
    removeTorrent: (infoHash: string) =>
      ipcRenderer.invoke('torrent:remove', infoHash),
    getTorrentProgress: (infoHash: string) =>
      ipcRenderer.invoke('torrent:get-progress', infoHash),
    getStreamUrl: (infoHash: string, fileIndex: number) =>
      ipcRenderer.invoke('torrent:get-stream-url', infoHash, fileIndex),
  },
  intros: {
    getSegments: (params: object) =>
      ipcRenderer.invoke('intros:get-segments', params),
  },
  debrid: {
    getStatus: (service: string) =>
      ipcRenderer.invoke('debrid:get-status', service),
    checkCached: (service: string, hash: string) =>
      ipcRenderer.invoke('debrid:check-cached', service, hash),
    addMagnet: (service: string, magnet: string) =>
      ipcRenderer.invoke('debrid:add-magnet', service, magnet),
    getDownloadUrl: (service: string, id: string) =>
      ipcRenderer.invoke('debrid:get-download-url', service, id),
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown) =>
      ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:get-all'),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ApiType = typeof api
