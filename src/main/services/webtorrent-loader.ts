let cachedClient: any = null

export async function initWebTorrent(): Promise<any> {
  if (cachedClient) return cachedClient

  // Use dynamic import for ESM module in CommonJS context
  const WebTorrentModule = await import('webtorrent')
  const WebTorrent = WebTorrentModule.default || WebTorrentModule
  
  // Initialize with proper WebTorrent v3 configuration
  // uTP is DISABLED due to utp-native native module issues in Electron
  // (uTP causes all peer connections to silently fail — numPeers stays at 0)
  // TCP mode works reliably for metadata acquisition and streaming
  // DHT is enabled for peer discovery when trackers fail
  cachedClient = new WebTorrent({
    utp: false,
    dht: true,
    maxConns: 50,
  })
  
  console.log('[WebTorrent] Client config:', {
    utp: false,
    dht: true,
    maxConns: 50,
    WEBRTC_SUPPORT: (WebTorrent as any).WEBRTC_SUPPORT,
    note: 'uTP disabled (utp-native fails in Electron), using TCP fallback',
  })

  cachedClient.on('error', (err: Error) => {
    console.error('[WebTorrent] Client error:', err)
  })

  cachedClient.on('warning', (err: Error) => {
    console.warn('[WebTorrent] Client warning:', err)
  })

  return cachedClient
}