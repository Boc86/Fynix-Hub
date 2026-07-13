const BASE = 'https://api.cdnlivetv.is/api/v1'
const TIMEOUT = 20000

interface CdnLiveTvMatch {
  id: string
  title: string
  category: string
  date: number
  poster?: string
  teams?: {
    home?: { name: string; badge: string }
    away?: { name: string; badge: string }
  }
  sources: { source: string; id: string; embedUrl: string }[]
}

interface CdnLiveTvStream {
  id: string
  streamNo: number
  language: string
  hd: boolean
  embedUrl: string
}

export async function getMatchesForSports(sports: string[]): Promise<CdnLiveTvMatch[]> {
  const res = await fetch(`${BASE}/events/sports/?user=cdnlivetv&plan=free`, { signal: AbortSignal.timeout(TIMEOUT) })
  if (!res.ok) throw new Error(`CDNLiveTV fetch failed: ${res.status}`)
  const data = await res.json()
  const events = data['cdn-live-tv']
  if (!events) throw new Error('Invalid CDNLiveTV response')

  const requestSet = new Set(sports.map(s => s.toLowerCase()))
  const matches: CdnLiveTvMatch[] = []

  for (const [sportKey, eventList] of Object.entries(events)) {
    if (sportKey.startsWith('total_') || sportKey === 'cached' || sportKey === 'timestamp') continue
    if (!Array.isArray(eventList)) continue
    const category = sportKey.toLowerCase()
    if (sports.length > 0 && !requestSet.has(category)) continue

    for (const event of eventList as any[]) {
      matches.push({
        id: event.gameID || `${category}-${event.event}`,
        title: event.event || `${event.homeTeam || ''} vs ${event.awayTeam || ''}`,
        category,
        date: event.start ? new Date(event.start).getTime() : Date.now(),
        poster: event.countryIMG || '',
        teams: {
          home: { name: event.homeTeam || '', badge: event.homeTeamIMG || '' },
          away: { name: event.awayTeam || '', badge: event.awayTeamIMG || '' }
        },
        sources: (event.channels || []).map((ch: any) => ({
          source: ch.channel_name || ch.id,
          id: ch.id,
          embedUrl: ch.url || ''
        }))
      })
    }
  }

  return matches
}

export async function getStream(source: string, id: string): Promise<CdnLiveTvStream[]> {
  return [{ id, streamNo: 1, language: 'Unknown', hd: true, embedUrl: source }]
}

export async function getSports(): Promise<{ id: string; name: string }[]> {
  return []
}

export async function getMatchesBySport(sport: string): Promise<CdnLiveTvMatch[]> {
  return []
}

export type { CdnLiveTvMatch, CdnLiveTvStream }
