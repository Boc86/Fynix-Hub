declare module 'webtorrent' {
  import { EventEmitter } from 'events'

  interface WebTorrentOptions {
    maxConns?: number
    nodeId?: string | Buffer
    peerId?: string | Buffer
    tracker?: boolean | {}
    dht?: boolean | {}
    lsd?: boolean
    webSeeds?: boolean
    utp?: boolean
    blocklist?: any
    downloadLimit?: number
    uploadLimit?: number
  }

  interface TorrentOptions {
    announce?: string[]
    path?: string
    store?: any
    private?: boolean
    destroyStoreOnDestroy?: boolean
    storeCacheSlots?: number
    skipVerify?: boolean
    strategy?: string
  }

  interface TorrentFile {
    name: string
    path: string
    length: number
    downloaded: number
    progress: number
    select(): void
    deselect(): void
    stream(opts?: { start?: number; end?: number }): NodeJS.ReadableStream
    getBlob(cb: (err: Error | null, blob?: Blob) => void): void
    getBuffer(cb: (err: Error | null, buffer?: Buffer) => void): void
  }

  interface Torrent extends EventEmitter {
    infoHash: string
    magnetURI: string
    torrentFile: Buffer
    files: TorrentFile[]
    announce: string[]
    pieces: any[]
    timeRemaining: number
    received: number
    downloaded: number
    uploaded: number
    downloadSpeed: number
    uploadSpeed: number
    progress: number
    ratio: number
    length: number
    pieceLength: number
    numPeers: number
    path: string
    ready: boolean
    paused: boolean
    done: boolean
    name: string
    created: Date
    createdBy: string
    maxWebConns: number

    on(event: 'metadata', listener: () => void): this
    on(event: 'ready', listener: () => void): this
    on(event: 'error', listener: (err: Error) => void): this
    on(event: 'done', listener: () => void): this
    on(event: 'download', listener: (bytesDownloaded: number) => void): this
    on(event: 'upload', listener: (bytesUploaded: number) => void): this
    on(event: string, listener: (...args: any[]) => void): this

    destroy(opts?: { destroyStore?: boolean }, cb?: () => void): void
    addPeer(peer: string): boolean
    removePeer(peer: string): void
    select(start: number, end: number, priority?: number, notify?: () => void): void
    deselect(start: number, end: number, priority: number): void
    pause(): void
    resume(): void
  }

  class WebTorrent extends EventEmitter {
    constructor(opts?: WebTorrentOptions)
    add(torrentId: string | Buffer, opts?: TorrentOptions): Promise<Torrent>
    get(infoHash: string): Promise<Torrent | undefined>
    remove(torrentId: string | Torrent): Promise<void>
    createServer(): { listen: (port: number, host: string, cb: () => void) => void; address: () => { port: number } | string | null }
    destroy(): void
    WEBRTC_SUPPORT: boolean
  }

  export = WebTorrent
}
