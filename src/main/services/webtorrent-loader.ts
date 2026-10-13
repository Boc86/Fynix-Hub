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

  cachedClient.on('error', (err: Error) => {
    console.error('[WebTorrent] Client error:', err)
  })

  return cachedClient
}