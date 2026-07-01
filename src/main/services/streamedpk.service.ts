const BASE = 'https://streamed.pk/api'

interface StreamedPkMatch {
  id: string
  title: string
  category: string
  date: number
  poster?: string
  popular: boolean
  teams?: {
    home?: { name: string; badge: string }
    away?: { name: string; badge: string }
  }
  sources: { source: string; id: string }[]
}

interface StreamedPkSport {
  id: string
  name: string
}

interface StreamedPkStream {
  id: string
  streamNo: number
  language: string
  hd: boolean
  embedUrl: string
  source: string
}

export async function getSports(): Promise<{ id: string; name: string }[]> {
  const res = await fetch(`${BASE}/sports`)
  if (!res.ok) throw new Error(`Streamed.pk sports fetch failed: ${res.status}`)
  return res.json()
}

export async function getTodayMatches(): Promise<StreamedPkMatch[]> {
  const res = await fetch(`${BASE}/matches/all-today`)
  if (!res.ok) throw new Error(`Streamed.pk today matches fetch failed: ${res.status}`)
  return res.json()
}

export async function getMatchesBySport(sport: string): Promise<StreamedPkMatch[]> {
  const res = await fetch(`${BASE}/matches/${sport}`)
  if (!res.ok) throw new Error(`Streamed.pk matches for ${sport} failed: ${res.status}`)
  return res.json()
}

export async function getStream(source: string, id: string): Promise<StreamedPkStream[]> {
  const res = await fetch(`${BASE}/stream/${source}/${id}`)
  if (!res.ok) throw new Error(`Streamed.pk stream fetch failed: ${res.status}`)
  return res.json()
}

export type { StreamedPkMatch, StreamedPkSport, StreamedPkStream }
