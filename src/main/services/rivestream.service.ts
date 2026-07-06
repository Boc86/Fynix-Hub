import { RivestreamResult } from '../../renderer/types.d'
import { getSetting } from './cache.service'

const BASE = 'https://missourimonster-x.hf.space'
const SSE_TIMEOUT = 60000

interface SourceMeta {
  key: string
  label: string
}

interface TestResult {
  source: string
  ok: boolean
  error?: string
  elapsed_ms?: number
}

async function getSourceMeta(apiKey: string): Promise<SourceMeta[]> {
  try {
    const res = await fetch(`${BASE}/api?sources_meta=1`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    const body = await res.json()
    // Try common response shapes
    return body.sources || body.data?.sources || body.results || []
  } catch (err: any) {
    console.warn('[Vyla] sources_meta failed:', err.message)
    return []
  }
}

async function testSources(
  tmdbId: number,
  sources: SourceMeta[],
  season?: number,
  episode?: number,
): Promise<{ working: TestResult[]; labelMap: Map<string, string> }> {
  const params = new URLSearchParams()
  if (season != null && episode != null) {
    params.set('season', String(season))
    params.set('episode', String(episode))
  }

  let token = ''
  try {
    const authRes = await fetch(`${BASE}/api/auth`, { method: 'POST' })
    const auth = await authRes.json()
    token = auth.token || ''
  } catch (err: any) {
    console.warn('[Vyla] Auth failed:', err.message)
  }

  if (!token) return { working: [], labelMap: new Map() }

  const results: TestResult[] = await Promise.all(
    sources.map(s =>
      fetch(`${BASE}/api/test/${tmdbId}?${params}&source=${s.key}`, {
        headers: { 'X-Session-Token': token },
      })
        .then(r => r.json())
        .catch(() => ({ source: s.key, ok: false } as TestResult))
    )
  )

  return {
    working: results.filter(r => r.ok),
    labelMap: new Map(sources.map(s => [s.key, s.label])),
  }
}

async function parseSSE(
  sseUrl: string,
  apiKey: string,
  workingKeys: Set<string> | null,
  labelMap: Map<string, string>,
  type: 'movie' | 'tv',
  onSourceFound?: (source: RivestreamResult) => void,
): Promise<RivestreamResult[]> {
  const results: RivestreamResult[] = []
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SSE_TIMEOUT)

  try {
    const response = await fetch(sseUrl, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: controller.signal,
    })

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '(unreadable)')
      console.error(`[Vyla] SSE error: ${response.status} — ${bodyText.slice(0, 300)}`)
      clearTimeout(timeout)
      return []
    }

    const reader = response.body?.getReader()
    if (!reader) { clearTimeout(timeout); return [] }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      if (workingKeys && results.length >= workingKeys.size) break

      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const data = JSON.parse(line.slice(6))
          if (data.type === 'source') {
            const key: string = data.source?.source
            if (!workingKeys || workingKeys.has(key)) {
              const entry: RivestreamResult = {
                title: labelMap.get(key) || data.source.label || key,
                embedUrl: data.source.url || '',
                type,
                quality: 'HD',
                indexer: key,
              }
              results.push(entry)
              if (onSourceFound) onSourceFound(entry)
            }
          } else if (data.type === 'done') {
            clearTimeout(timeout)
            return results
          }
        } catch {
          // skip malformed lines
        }
      }
    }

    clearTimeout(timeout)
    return results
  } catch (err: any) {
    clearTimeout(timeout)
    if (err.name !== 'AbortError') {
      console.error('[Vyla] SSE failed:', err.message)
    }
    return results
  }
}

export async function searchRivestream(
  tmdbId: number,
  type: 'movie' | 'tv',
  season?: number,
  episode?: number,
  onSourceFound?: (source: RivestreamResult) => void,
): Promise<RivestreamResult[]> {
  const apiKey = getSetting<string>('vylaApiKey') || 'public_api_key'

  if (apiKey === 'public_api_key') {
    console.warn('[Vyla] Using public API key. Streaming endpoints require a standard or partner key.')
  }

  const sseUrl = type === 'movie'
    ? `${BASE}/movie?id=${tmdbId}`
    : `${BASE}/tv?id=${tmdbId}&season=${season}&episode=${episode}`

  // SSE directly — the pre-test phase (sources_meta + testSources) adds latency
  // and often fails due to auth issues with the test endpoint, causing false 0/29.
  // SSE delivers all results; broken sources are filtered by the time-pos check.
  console.log('[Vyla] Streaming SSE sources...')
  return parseSSE(sseUrl, apiKey, null, new Map(), type, onSourceFound)
}
