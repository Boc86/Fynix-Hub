import { RivestreamResult } from '../../renderer/types.d'
import { getSetting } from './cache.service'

const BASE = 'https://missourimonster-x.hf.space'
const SSE_TIMEOUT = 60000

// Obfuscated default key to prevent casual scraping
const _vk = [38, 62, 10, 51, 44, 59, 60, 45, 120, 61, 32, 55, 10, 55, 96, 101, 109, 101, 55, 108, 100, 109, 54, 99, 100, 49, 102, 101, 48, 51, 51, 48, 101, 100, 48, 98, 99, 55, 51, 100, 51, 48, 109, 103, 98]
const getDeobfuscatedKey = () => String.fromCharCode(..._vk.map(c => c ^ 0x55))

function getVylaApiKey(): string {
  const env = process.env.VYLA_API_KEY
  if (env && env !== 'VYLA_API_KEY' && env.length > 20) return env
  return getDeobfuscatedKey()
}

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
    console.log(`[Vyla] SSE response: ${response.status} ${response.statusText}`)

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '(unreadable)')
      console.error(`[Vyla] SSE error: ${response.status} — ${bodyText.slice(0, 300)}`)
      clearTimeout(timeout)
      return []
    }

    const reader = response.body?.getReader()
    if (!reader) { console.warn('[Vyla] SSE response body has no reader'); clearTimeout(timeout); return [] }

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
              console.log(`[Vyla] Source found: key=${key} title=${entry.title}`)
              if (onSourceFound) onSourceFound(entry)
            }
          } else if (data.type === 'done') {
            console.log('[Vyla] SSE done signal received')
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
  const apiKey = getVylaApiKey()
  const keyPreview = apiKey ? apiKey.slice(0, 10) + '...' : 'MISSING'
  console.log(`[Vyla] API key loaded: ${keyPreview} (length=${apiKey.length})`)

  const sseUrl = type === 'movie'
    ? `${BASE}/movie?id=${tmdbId}`
    : `${BASE}/tv?id=${tmdbId}&season=${season}&episode=${episode}`
  console.log(`[Vyla] SSE URL: ${sseUrl}`)

  const results = await parseSSE(sseUrl, apiKey, null, new Map(), type, onSourceFound)
  console.log(`[Vyla] SSE complete — ${results.length} source(s) returned`)
  return results
}
