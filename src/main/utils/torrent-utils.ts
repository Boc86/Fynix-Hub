import bencode from 'bencode'
import * as crypto from 'crypto'

/**
 * Convert a .torrent file buffer to a magnet URI
 */
export async function convertTorrentToMagnet(torrentData: Buffer): Promise<string> {
  try {
    // Parse the .torrent file using bencode
    const torrent = bencode.decode(torrentData)
    
    // Extract info hash
    const info = torrent.info
    const infoBuffer = bencode.encode(info)
    const infoHash = crypto.createHash('sha1').update(infoBuffer).digest('hex')
    
    // Extract name from info
    const name = info.name || 'Unknown'
    
    // Extract trackers from announce-list or announce
    const trackers: string[] = []
    
    if (torrent['announce-list']) {
      // announce-list is an array of arrays of strings
      for (const announceGroup of torrent['announce-list']) {
        if (Array.isArray(announceGroup)) {
          for (const tracker of announceGroup) {
            if (typeof tracker === 'string') {
              trackers.push(tracker)
            }
          }
        }
      }
    } else if (torrent.announce) {
      // announce is a single string
      if (typeof torrent.announce === 'string') {
        trackers.push(torrent.announce)
      }
    }
    
    // Build magnet URI
    let magnetUri = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}`
    
    // Add trackers
    if (trackers.length > 0) {
      for (const tracker of trackers) {
        magnetUri += `&tr=${encodeURIComponent(tracker)}`
      }
    }
    
    return magnetUri
  } catch (err: any) {
    console.error('[TorrentUtils] Failed to convert torrent to magnet:', err.message)
    throw new Error(`Failed to convert torrent file: ${err.message}`)
  }
}

/**
 * Extract basic info from a .torrent file
 */
export async function getTorrentInfo(torrentData: Buffer): Promise<{
  infoHash: string
  name: string
  length?: number
  files?: Array<{ path: string; length: number }>
  announce?: string
  announceList?: string[][]
}> {
  try {
    const torrent = bencode.decode(torrentData)
    const info = torrent.info
    
    // Calculate info hash
    const infoBuffer = bencode.encode(info)
    const infoHash = crypto.createHash('sha1').update(infoBuffer).digest('hex')
    
    // Extract basic info
    const result: {
      infoHash: string
      name: string
      length?: number
      files?: Array<{ path: string; length: number }>
      announce?: string
      announceList?: string[][]
    } = {
      infoHash,
      name: info.name || 'Unknown',
      length: info.length,
      announce: torrent.announce,
      announceList: torrent['announce-list']
    }
    
    // Extract files info if multi-file torrent
    if (Array.isArray((info as any).files)) {
      result.files = (info as any).files.map((file: any) => ({
        path: (file.path || []).join('/'),
        length: file.length || 0
      }))
    }
    
    return result
  } catch (err: any) {
    console.error('[TorrentUtils] Failed to extract torrent info:', err.message)
    throw new Error(`Failed to extract torrent info: ${err.message}`)
  }
}