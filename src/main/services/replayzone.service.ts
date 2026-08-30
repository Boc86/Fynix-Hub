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

/** Normalize a string for comparison: lowercase, strip punctuation, collapse
 *  spaces. e.g. "MotoGP - Aragon" → "motogp  aragon" */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

/** Compact normalize: same as normalize() but spaces stripped — useful for
 *  token-level substring checks where formatting may differ.
 *  e.g. "Other Motorsport" → "othermotorsport", "MotoGP" → "motogp" */
function compact(s: string): string {
  return normalize(s).replace(/\s+/g, '')
}

/** Sports under which ReplayZone groups multiple sub-series into a shared
 *  "Other Motorsport" category. These leagues need title-level disambiguation
 *  rather than category matching. */
const OTHER_MOTORSPORT_LEAGUES = new Set([
  'motogp', 'moto2', 'moto3', 'motoe', 'dtm', 'wrc', 'wsbk', 'nascar',
  'indycar', 'f1academy',
])

export async function searchReplays(
  query: string,
  sport?: string,
  league?: string,
): Promise<ReplayResult[]> {
  try {
    const all = await fetchAllReplays()
    const normalizedQuery = normalize(query)
    if (!normalizedQuery) return []

    const queryWords = normalizedQuery.split(' ').filter(w => w.length > 2)
    const sportCompact = sport ? compact(sport) : ''
    const leagueCompact = league ? compact(league) : ''

    const scored = all
      .map(r => {
        const normalizedTitle = normalize(r.title)
        const rSport = normalize(r.sport || '')
        const rCategory = normalize(r.category || '')
        let score = 0

        if (normalizedTitle === normalizedQuery) score = 100
        else if (normalizedTitle.includes(normalizedQuery)) score = 80
        else {
          let matchedWords = 0
          for (const word of queryWords) {
            if (normalizedTitle.includes(word)) matchedWords++
          }
          // Reward entries that match MORE query words non-linearly so that
          // multi-word queries like "Aragon Sprint" prefer titles containing
          // BOTH words over titles matching only one ("Sprint - F1 - Dutch GP").
          score = matchedWords * matchedWords * 10
        }

        // Sport + league filtering: demote results that don't match the
        // requested sport AND league. This prevents cross-sport/cross-series
        // leakage (e.g. selecting MotoGP → Aragon but getting F1 sprint races).
        if (sportCompact) {
          const sportMatches =
            compact(rSport).includes(sportCompact) ||
            compact(rCategory).includes(sportCompact)
          if (!sportMatches) {
            score = score / 100 // e.g. 100 → 1, 80 → 0.8
          } else if (leagueCompact) {
            const isOtherMotorsportLeague = OTHER_MOTORSPORT_LEAGUES.has(leagueCompact)
            const categoryMatchesLeague = compact(rCategory).includes(leagueCompact)
            if (isOtherMotorsportLeague && rCategory.includes('other motorsport')) {
              // e.g. MotoGP league → "Other Motorsport" category. Keep at
              // base score — can't distinguish sub-series, title must
              // disambiguate. But boost if the league abbreviation (e.g.
              // "MotoGP") appears in the title.
              if (rSport.includes('motorsport') && compact(normalizedTitle).includes(leagueCompact)) {
                score += 20 // "MotoGP" in title + right sport = strong match
              }
            } else if (!categoryMatchesLeague) {
              score = score / 100
            } else {
              score += 5 // exact league-category match is a strong signal
            }
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
