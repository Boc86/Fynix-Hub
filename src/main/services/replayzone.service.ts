export interface ReplayResult {
  title: string
  sport: string
  category: string
  thumbnail: string
  date: string
  sources: { label: string; type: string; url: string }[]
}

const REPLAYS_URL = 'https://replay.adityapangshe.workers.dev/replays.txt'

let cachedReplays: ReplayResult[] | null = null
let cacheTime = 0
const CACHE_TTL = 30 * 60 * 1000

function parseReplays(text: string): ReplayResult[] {
  const results: ReplayResult[] = []
  const lines = text.split('\n')
  let current: Partial<ReplayResult> & { sources: ReplayResult['sources'] } = { sources: [] }

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('# ')) {
      if (current.title) {
        results.push({
          title: current.title,
          sport: current.sport || '',
          category: current.category || '',
          thumbnail: current.thumbnail || '',
          date: current.date || '',
          sources: current.sources || [],
        })
      }
      current = { title: trimmed.slice(2), sources: [] }
    } else if (trimmed.startsWith('~')) {
      const parts = trimmed.slice(1).trim().split('\t')
      current.sport = parts[0]?.trim() || ''
      current.category = parts[1]?.trim() || ''
      current.thumbnail = parts[2]?.trim() || ''
      current.date = parts[3]?.trim() || ''
    } else if (trimmed && !trimmed.startsWith('#') && current.title) {
      const parts = trimmed.split('\t')
      if (parts.length >= 2) {
        current.sources.push({
          label: parts[0].trim(),
          type: parts[1].trim(),
          url: parts[2]?.trim() || '',
        })
      }
    }
  }

  if (current.title) {
    results.push({
      title: current.title,
      sport: current.sport || '',
      category: current.category || '',
      thumbnail: current.thumbnail || '',
      date: current.date || '',
      sources: current.sources || [],
    })
  }

  return results
}

async function fetchAllReplays(): Promise<ReplayResult[]> {
  if (cachedReplays && Date.now() - cacheTime < CACHE_TTL) {
    return cachedReplays
  }

  const res = await fetch(REPLAYS_URL)
  if (!res.ok) throw new Error(`ReplayZone fetch error: ${res.status}`)
  const text = await res.text()
  cachedReplays = parseReplays(text)
  cacheTime = Date.now()
  return cachedReplays
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

export async function searchReplays(query: string, sport?: string): Promise<ReplayResult[]> {
  try {
    const all = await fetchAllReplays()
    const normalizedQuery = normalize(query)
    if (!normalizedQuery) return []

    const queryWords = normalizedQuery.split(' ').filter(w => w.length > 2)
    const sportNorm = sport ? normalize(sport) : ''

    const scored = all
      .map(r => {
        const normalizedTitle = normalize(r.title)
        let score = 0

        if (normalizedTitle === normalizedQuery) score = 100
        else if (normalizedTitle.includes(normalizedQuery)) score = 80
        else {
          for (const word of queryWords) {
            if (normalizedTitle.includes(word)) score += 10
          }
        }

        // Sport penalty: if a sport filter is active and the result's sport
        // doesn't match, demote it heavily so cross-sport leakage (e.g.
        // searching "Aragon Sprint" returning F1 sprint races when viewing
        // MotoGP) is avoided.
        if (sportNorm) {
          const rSport = normalize(r.sport || '')
          const rCategory = normalize(r.category || '')
          if (!rSport.includes(sportNorm) && !rCategory.includes(sportNorm)) {
            score = score / 100  // e.g. 100 → 1, 80 → 0.8 — still above 0 but
                                  // well below any matching-sport result
          }
        }

        return { result: r, score }
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)

    return scored.map(s => s.result)
  } catch (err: any) {
    console.error('[ReplayZone] Search failed:', err.message)
    return []
  }
}

export async function searchByCategory(category: string): Promise<ReplayResult[]> {
  try {
    const all = await fetchAllReplays()
    const normalizedCategory = category.toLowerCase().replace(/[^a-z0-9]/g, '')
    const scored = all
      .filter(r => r.category?.toLowerCase().includes(category.toLowerCase()) ||
                   r.sport?.toLowerCase().includes(category.toLowerCase()) ||
                   normalize(r.title).includes(normalizedCategory))
      .map(r => ({ result: r, score: 1 }))
    return scored.map(s => s.result)
  } catch (err: any) {
    console.error('[ReplayZone] Category search failed:', err.message)
    return []
  }
}
