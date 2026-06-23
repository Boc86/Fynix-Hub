import * as CacheService from './cache.service'

export interface CatalogIndexer {
  id: string
  name: string
  description: string
  url: string
  language: string
  type: 'public' | 'semi-private' | 'private'
  protocol: 'torrent' | 'usenet'
}

const PROWLARR_WIKI_URL = 'https://wiki.servarr.com/en/prowlarr/supported-indexers'
const CATALOG_REFRESH_MS = 24 * 60 * 60 * 1000

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export async function fetchIndexerCatalog(): Promise<CatalogIndexer[]> {
  const res = await fetch(PROWLARR_WIKI_URL)
  if (!res.ok) throw new Error(`Prowlarr wiki fetch failed: ${res.status}`)
  const html = await res.text()
  return parseCatalogHtml(html)
}

export function parseCatalogHtml(html: string): CatalogIndexer[] {
  const results: CatalogIndexer[] = []

  // Split by protocol sections
  const protocolSections = [
    { protocol: 'torrent' as const, marker: '<h2 class="toc-header" id="torrents"' },
    { protocol: 'usenet' as const, marker: '<h2 class="toc-header" id="usenet"' },
  ]

  for (const { protocol, marker } of protocolSections) {
    const sectionStart = html.indexOf(marker)
    if (sectionStart === -1) continue
    const sectionEnd = html.indexOf('<h2', sectionStart + marker.length)
    const section = sectionEnd === -1 ? html.slice(sectionStart) : html.slice(sectionStart, sectionEnd)

    const typeSections = [
      { type: 'public' as const, marker: 'Public' },
      { type: 'semi-private' as const, marker: 'Semi-Private' },
      { type: 'private' as const, marker: 'Private' },
    ]

    for (const { type, marker: typeMarker } of typeSections) {
      const typeRegex = new RegExp(`<h3[^>]*>.*?${typeMarker}[^<]*</h3>`, 'i')
      const typeMatch = typeRegex.exec(section)
      if (!typeMatch) continue
      const typeStart = typeMatch.index
      const typeEnd = section.indexOf('<h3', typeStart + 1)
      const typeSection = typeEnd === -1 ? section.slice(typeStart) : section.slice(typeStart, typeEnd)

      const tableRegex = /<table[^>]*>[\s\S]*?<\/table>/
      const tableMatch = tableRegex.exec(typeSection)
      if (!tableMatch) continue
      const table = tableMatch[0]

      const rowRegex = /<tr>[\s\S]*?<\/tr>/g
      let rowMatch: RegExpExecArray | null
      while ((rowMatch = rowRegex.exec(table)) !== null) {
        const row = rowMatch[0]
        if (row.includes('<th')) continue

        const cells: string[] = []
        const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g
        let cellMatch: RegExpExecArray | null
        while ((cellMatch = cellRegex.exec(row)) !== null) {
          cells.push(cellMatch[1])
        }
        if (cells.length < 3) continue

        const linkMatch = /<a[^>]*id="([^"]*)"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(cells[0])
        const name = linkMatch ? linkMatch[3].replace(/<[^>]+>/g, '').trim() : cells[0].replace(/<[^>]+>/g, '').trim()
        const url = linkMatch ? linkMatch[2] : ''
        const id = linkMatch ? linkMatch[1] : slugify(name)
        const description = cells[1].replace(/<[^>]+>/g, '').trim()
        const language = cells[2].replace(/<[^>]+>/g, '').trim()

        if (!name) continue

        results.push({
          id,
          name,
          description,
          url,
          language,
          type,
          protocol,
        })
      }
    }
  }

  return results
}

export function getStoredCatalog(): CatalogIndexer[] {
  return CacheService.getSetting<CatalogIndexer[]>('prowlarrIndexerCatalog') || []
}

export function getCatalogLastUpdated(): number | null {
  return CacheService.getSetting<number>('prowlarrIndexerCatalogLastUpdated')
}

export function shouldRefreshCatalog(): boolean {
  const last = getCatalogLastUpdated()
  if (!last) return true
  return Date.now() - last > CATALOG_REFRESH_MS
}

export async function refreshIndexerCatalog(): Promise<CatalogIndexer[]> {
  const catalog = await fetchIndexerCatalog()
  CacheService.setSetting('prowlarrIndexerCatalog', catalog)
  CacheService.setSetting('prowlarrIndexerCatalogLastUpdated', Date.now())
  console.log(`[IndexerCatalog] Refreshed catalog: ${catalog.length} indexers`)
  return catalog
}
