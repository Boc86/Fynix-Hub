let cachedClient: any = null

export async function initWebTorrent(): Promise<any> {
  if (cachedClient) return cachedClient

  // Use dynamic import for ESM module in CommonJS context
  const WebTorrentModule = await import('webtorrent')
  const WebTorrent = WebTorrentModule.default || WebTorrentModule
  
  // Initialize with proper WebTorrent v3 configuration
  // uTP is disabled because utp-native has native module issues
  // DHT is enabled (pure JS, no native modules) for peer discovery
  cachedClient = new WebTorrent({
    utp: false,
    dht: true,
    maxConns: 50,
  })

  cachedClient.on('error', (err: Error) => {
    console.error('[WebTorrent] Client error:', err)
  })

  return cachedClient
}