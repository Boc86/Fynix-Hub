let cachedClient: any = null

export async function initWebTorrent(): Promise<any> {
  if (cachedClient) return cachedClient

  // Use dynamic import for ESM module in CommonJS context
  const WebTorrentModule = await import('webtorrent')
  const WebTorrent = WebTorrentModule.default || WebTorrentModule
  
  // Initialize with proper WebTorrent v3 configuration
  // Disable uTP and DHT to avoid native module issues in Flatpak
  cachedClient = new WebTorrent({
    utp: false,
    dht: false,
    tracker: [],
    maxConns: 20,
  })

  cachedClient.on('error', (err: Error) => {
    console.error('[WebTorrent] Client error:', err)
  })

  return cachedClient
}