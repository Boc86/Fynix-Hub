import WebTorrent from 'webtorrent'

let client: WebTorrent | null = null

export function init(): WebTorrent {
  if (!client) {
    client = new WebTorrent()
  }
  return client
}

export async function addTorrent(magnetUri: string, options?: any) {
  if (!client) throw new Error('WebTorrent not initialized')
  return client.add(magnetUri, options)
}

export function removeTorrent(infoHash: string) {
  if (!client) return
  client.remove(infoHash)
}

export async function getTorrent(infoHash: string) {
  if (!client) return undefined
  return client.get(infoHash)
}

export function destroy() {
  if (client) {
    client.destroy()
    client = null
  }
}
