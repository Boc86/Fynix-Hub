import * as CacheService from './cache.service'

const API_BASE = 'https://dami-tv.pro/papi/api'
const CACHE_TTL = 60000

export interface DamiTVStream {
  id: string
  name: string
  poster: string
  startsAt: number
  endsAt: number
  status: 'live' | 'upcoming' | 'finished'
  league: string
  categoryName: string
  viewers: number
  homeTeam: string
  awayTeam: string
  homeBadge: string
  awayBadge: string
  embedUrl: string
  sources: { name: string; embed: string }[]
}

export interface DamiTVCategory {
  name: string
  streams: DamiTVStream[]
}

function parseStream(item: any): DamiTVStream {
  return {
    id: item.id || '',
    name: item.name || '',
    poster: item.poster || '',
    startsAt: item.starts_at || 0,
    endsAt: item.ends_at || 0,
    status: item.status || 'upcoming',
    league: item.league || '',
    categoryName: item.category_name || '',
    viewers: item.viewers || 0,
    homeTeam: item.teams?.home?.name || '',
    awayTeam: item.teams?.away?.name || '',
    homeBadge: item.teams?.home?.badge || '',
    awayBadge: item.teams?.away?.badge || '',
    embedUrl: item.embed || item.iframe || '',
    sources: (item.sources || []).map((s: any) => ({
      name: s.name || s.source || '',
      embed: s.embed || '',
    })),
  }
}

export async function getStreams(): Promise<DamiTVCategory[]> {
  const cached = CacheService.getCache('dami-tv:streams')
  if (cached) return JSON.parse(cached)

  const res = await fetch(`${API_BASE}/streams`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) throw new Error(`DAMI-TV HTTP ${res.status}`)
  const data = await res.json()

  const categories: DamiTVCategory[] = (data.streams || []).map((cat: any) => ({
    name: cat.category || cat.category_name || '',
    streams: (cat.streams || []).map(parseStream),
  }))

  CacheService.setCache('dami-tv:streams', JSON.stringify(categories), CACHE_TTL)
  return categories
}

export async function getStreamsByCategory(category: string): Promise<DamiTVStream[]> {
  const all = await getStreams()
  return all.find(c => c.name === category)?.streams || []
}
