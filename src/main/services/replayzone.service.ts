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

/** Normalize a string for comparison: lowercase, strip diacritics, strip
 *  punctuation, collapse spaces. e.g. "MotoGP - Aragón" -> "motogp  aragon"
 *  (diacritics removed so "Aragón" matches "Aragon"). */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents (á→a)
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Compact normalize: same as normalize() but spaces stripped — useful for
 *  token-level substring checks where formatting may differ.
 *  e.g. "Other Motorsport" -> "othermotorsport", "MotoGP" -> "motogp" */
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

/** Generic filler words that appear in many race replay titles and should NOT
 *  be required as hard-filter tokens during multi-word search. The remaining
 *  "specific" words (e.g. "Aragon", "Dutch", "British", "Sprint", "Race")
 *  act as the key disambiguator.
 *
 *  Note: "Sprint" and "Race" are NOT generic here — they are significant
 *  event-type qualifiers that must match. If the user searches "Aragon
 *  Sprint", results without "Sprint" (e.g. just the full race) are excluded. */
const GENERIC_REPLAY_WORDS = new Set([
  'the', 'full', 'replay', 'gp', 'cup', 'final', 'moto', 'f1',
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

    // Extract year from query if present (e.g., "2026 Sao Paulo grand prix" -> "2026")
    const queryWords = normalizedQuery.split(' ').filter(w => w.length > 2)
    const yearMatch = queryWords.find(w => /^\d{4}$/.test(w))
    const searchYear = yearMatch ? parseInt(yearMatch) : null
    const titleWords = queryWords.filter(w => !/^\d{4}$/.test(w))
    
    console.log(`[ReplayZone] Query analysis:`, {
      query,
      normalizedQuery,
      queryWords,
      yearMatch,
      searchYear,
      titleWords
    })
    
    const sportCompact = sport ? compact(sport) : ''
    const leagueCompact = league ? compact(league) : ''

    // Specific query words (non-generic) that MUST appear in the result title
    // for the result to be considered a match. This prevents "Sprint" from
    // matching every F1 sprint race when the user is looking for a specific
    // MotoGP event like "Aragon Sprint".
    const specificWords = queryWords.filter(w => !GENERIC_REPLAY_WORDS.has(w))

    const scored = all
      .map(r => {
        const normalizedTitle = normalize(r.title)
        const rSport = normalize(r.sport || '')
        const rCategory = normalize(r.category || '')
        const titleCompact = compact(normalizedTitle)
        const matchedWords = titleWords.filter(w => normalizedTitle.includes(w))
        let score = 0

        // Year matching: if a year is specified in the query, prioritize replays from that year
        let yearScore = 0
        if (searchYear) {
          console.log(`[ReplayZone] Checking year for replay: "${r.title}"`, {
            date: r.date,
            titleYear: r.title.match(/\b(19|20)\d{2}\b/)?.[0],
            searchYear
          })
          
          const replayYear = parseInt(r.date) || parseInt(r.title.match(/\b(19|20)\d{2}\b/)?.[0] || '0')
          if (replayYear === searchYear) {
            yearScore = 50 // Strong boost for exact year match
            console.log(`[ReplayZone] Exact year match! +50 points`)
          } else if (replayYear && Math.abs(replayYear - searchYear) <= 1) {
            yearScore = 10 // Small boost for adjacent years
            console.log(`[ReplayZone] Adjacent year match! +10 points`)
          } else {
            // Penalize non-matching years to prioritize closer years
            const yearDiff = Math.abs(replayYear - searchYear)
            yearScore = Math.max(-10, -yearDiff) // Penalty up to -10 points
            console.log(`[ReplayZone] Year penalty: ${yearScore} points (diff: ${yearDiff})`)
          }
        }

        if (normalizedTitle === normalizedQuery) {
          score = 100 + yearScore
          console.log(`[ReplayZone] Exact title match! +100 points (total: ${score})`)
        } else if (normalizedTitle.includes(normalizedQuery)) {
          score = 80 + yearScore
          console.log(`[ReplayZone] Query contained in title! +80 points (total: ${score})`)
        } else {
          // Require ALL specific (non-generic) query words to be present.
          // If the query is "Aragon Sprint", "Aragon" is specific and must
          // be in the title; "Sprint" is generic and optional.
          console.log(`[ReplayZone] Checking specific words for: "${r.title}"`)
          console.log(`[ReplayZone] titleWords: ${titleWords.join(', ')}`)
          console.log(`[ReplayZone] titleCompact: "${titleCompact}"`)
          console.log(`[ReplayZone] allSpecificMatch: ${titleWords.every(w => titleCompact.includes(w))}`)
          
          if (titleWords.length > 0) {
            const allSpecificMatch = titleWords.every(w => titleCompact.includes(w))
            if (!allSpecificMatch) {
              // This result doesn't contain the key disambiguator word(s) —
              // hard-reject it.
              score = 0
              console.log(`[ReplayZone] Hard reject - missing specific words`)
            } else {
              // Non-linear reward: prefer more total word matches.
              score = matchedWords.length * matchedWords.length * 10 + yearScore
              console.log(`[ReplayZone] Word match score: ${matchedWords.length} words matched = ${score}`)
            }
          } else {
            score = matchedWords.length * matchedWords.length * 10 + yearScore
            console.log(`[ReplayZone] No specific words, word match score: ${matchedWords.length} words matched = ${score}`)
          }
        }

        // Sport + league filtering: demote results that don't match the
        // requested sport AND league. This prevents cross-sport/cross-series
        // leakage (e.g. selecting MotoGP → Aragon but getting F1 sprint races).
        if (score > 0 && sportCompact) {
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
              if (rSport.includes('motorsport') && titleCompact.includes(leagueCompact)) {
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

    console.log(`[ReplayZone] Final results: ${scored.length} replays found`)
    scored.slice(0, 5).forEach((s, i) => {
      console.log(`[ReplayZone] ${i + 1}. "${s.result.title}" (score: ${s.score}, year: ${s.result.date})`)
      if (s.score === 0) {
        console.log(`[ReplayZone]   -> This result was hard rejected (score: 0)`)
      }
    })

    // Filter out zero-score results to avoid showing irrelevant matches
    const validResults = scored.filter(s => s.score > 0)
    console.log(`[ReplayZone] Valid results (score > 0): ${validResults.length}`)

    return validResults.map(s => s.result)
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
