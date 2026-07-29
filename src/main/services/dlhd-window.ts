/**
 * DLHD Embed URL Extraction
 *
 * Fetches the DLHD watch page and extracts the embed iframe URL (stream-{id}.php)
 * so we can load just the player without nav, chat, or ads.
 */

const DLHD_BASE = 'https://dlhd.st'

export async function getDlhdEmbedUrl(watchUrl: string): Promise<string | null> {
  try {
    const res = await fetch(watchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': DLHD_BASE + '/' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const html = await res.text()

    // Match the embed iframe: <iframe src="...stream-NUM.php...">
    const match = html.match(/<iframe[^>]+src=["']([^"']*(?:stream-\d+\.php)[^"']*)["']/i)
    if (match) {
      const src = match[1]
      return src.startsWith('http') ? src : new URL(src, DLHD_BASE).href
    }

    return null
  } catch {
    return null
  }
}
