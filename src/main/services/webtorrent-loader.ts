let cachedClient: any = null

export async function initWebTorrent(): Promise<any> {
  if (cachedClient) return cachedClient

  // Use dynamic import for ESM module in CommonJS context
  const WebTorrentModule = await import('webtorrent')
  const WebTorrent = WebTorrentModule.default || WebTorrentModule
  
  // Initialize with proper WebTorrent v3 configuration
  // uTP is enabled for peer discovery on standard BitTorrent trackers
  // DHT is enabled for peer discovery when trackers fail
  cachedClient = new WebTorrent({
    utp: true,
    dht: true,
    maxConns: 50,
  })

  console.log('[WebTorrent] Client config:', {
    utp: true,
    dht: true,
    maxConns: 50,
    WEBRTC_SUPPORT: (WebTorrent as any).WEBRTC_SUPPORT,
  })

  cachedClient.on('error', (err: Error) => {
    console.error('[WebTorrent] Client error:', err)
  })

  cachedClient.on('warning', (err: Error) => {
    console.warn('[WebTorrent] Client warning:', err)
  })

  return cachedClient
}