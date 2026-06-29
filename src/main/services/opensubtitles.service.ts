import * as CacheService from './cache.service'

const API_BASE = 'https://api.opensubtitles.com/api/v1'

let apiKey = ''
let authToken = ''

export function setApiKey(key: string): void {
  apiKey = key
}

export function loadApiKey(): void {
  apiKey = CacheService.getSetting<string>('opensubtitlesApiKey') || ''
}

export function getApiKey(): string {
  return apiKey
}

async function login(): Promise<string> {
  if (!apiKey) return ''
  if (authToken) return authToken
  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Api-Key': apiKey },
      body: JSON.stringify({ api_key: apiKey }),
    })
    if (!res.ok) { authToken = ''; return '' }
    const data = await res.json()
    authToken = data.token || ''
    return authToken
  } catch {
    return ''
  }
}

export interface SubtitleFile {
  fileId: number
  language: string
  languageCode: string
  subtitleId: number
  fileName: string
  forced: boolean
  hearingImpaired: boolean
  downloadCount: number
  fps: number
}

export interface SearchParams {
  tmdbId: number
  type: 'movie' | 'tv'
  season?: number
  episode?: number
  language?: string
  forcedOnly?: boolean
}

export async function searchSubtitles(params: SearchParams): Promise<SubtitleFile[]> {
  if (!apiKey) return []

  try {
    const body: Record<string, any> = {
      tmdb_id: params.tmdbId,
      type: params.type === 'tv' ? 'episode' : 'movie',
      languages: params.language || 'en',
      order_by: 'download_count',
      order_direction: 'desc',
    }
    if (params.type === 'tv' && params.season !== undefined) body.season_number = params.season
    if (params.type === 'tv' && params.episode !== undefined) body.episode_number = params.episode
    if (params.forcedOnly) body.forced = 'include' // include only forced subtitles

    const res = await fetch(`${API_BASE}/subtitles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Api-Key': apiKey },
      body: JSON.stringify(body),
    })
    if (!res.ok) return []
    const data = await res.json()
    if (!data.data || !Array.isArray(data.data)) return []

    const files: SubtitleFile[] = []
    for (const item of data.data) {
      const attrs = item.attributes || {}
      const attrFiles = attrs.files || []
      for (const f of attrFiles) {
        files.push({
          fileId: f.file_id,
          language: attrs.language || '',
          languageCode: attrs.language_code || '',
          subtitleId: attrs.subtitle_id || item.id || 0,
          fileName: f.file_name || '',
          forced: attrs.forced || false,
          hearingImpaired: attrs.hearing_impaired || false,
          downloadCount: attrs.download_count || 0,
          fps: attrs.fps || 0,
        })
      }
    }
    return files
  } catch {
    return []
  }
}

export async function downloadSubtitle(fileId: number): Promise<string | null> {
  if (!apiKey) return null

  try {
    const token = await login()
    if (!token) return null

    const res = await fetch(`${API_BASE}/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': apiKey,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ file_id: fileId }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const link = data.link
    if (!link) return null

    const subRes = await fetch(link)
    if (!subRes.ok) return null
    const content = await subRes.text()
    return content
  } catch {
    return null
  }
}

export function srtToVtt(srt: string): string {
  let vtt = 'WEBVTT\n\n'
  // Replace SRT timestamp format (,) with VTT format (.)
  // Also remove empty lines at end
  const lines = srt.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // Skip cue number lines (purely numeric)
    if (/^\d+$/.test(line.trim())) {
      i++
      continue
    }
    // Convert timestamp line
    if (line.includes('-->')) {
      vtt += line.replace(/,/g, '.') + '\n'
      i++
      // Add all subsequent lines until next blank line or cue number
      while (i < lines.length) {
        const next = lines[i]
        if (next.trim() === '' || /^\d+$/.test(next.trim()) || next.includes('-->')) {
          break
        }
        vtt += next + '\n'
        i++
      }
      vtt += '\n'
    } else {
      i++
    }
  }
  return vtt.trim() + '\n'
}
