import { RivestreamResult } from '../../renderer/types.d'
import { vylaBaseUrl } from './vyla-service'
import { getEncryptedSetting } from './cache.service'

async function parseSSE(
  sseUrl: string,
  token: string,
  workingKeys: Set<string> | null,
  labelMap: Map<string, string>,
  type: 'movie' | 'tv',
  onSourceFound?: (source: RivestreamResult) => void,
): Promise<RivestreamResult[]> {
  const results: RivestreamResult[] = []
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)

  try {
    const response = await fetch(sseUrl, {
      headers: { 'X-Session-Token': token },
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
      console.error('[Vyla] SSE failed:', err?.message || err)
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
  const base = vylaBaseUrl
  if (!base) {
    console.warn('[Vyla] Streaming API not available — Vyla server not running')
    return []
  }

  const apiKey = getEncryptedSetting('vylaApiKey') || ''
  if (!apiKey) {
    console.warn('[Vyla] No API key — streaming will fail')
    return []
  }

  console.log(`[Vyla] Base URL: ${base} (key length: ${apiKey.length})`)

  // Obtain a session token from the self-hosted Vyla server
  let token = ''
  try {
    const authRes = await fetch(`${base}/api/auth`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    const auth = await authRes.json()
    token = auth.token || ''
    if (!token) {
      console.warn(`[Vyla] /api/auth returned no token: ${JSON.stringify(auth).slice(0, 200)}`)
    }
  } catch (err: any) {
    console.warn(`[Vyla] /api/auth failed: ${err?.message || err}`)
  }

  if (!token) return []

  const sseUrl = type === 'movie'
    ? `${base}/movie?id=${tmdbId}`
    : `${base}/tv?id=${tmdbId}&season=${season}&episode=${episode}`
  console.log(`[Vyla] SSE URL: ${sseUrl}`)

  const results = await parseSSE(sseUrl, token, null, new Map(), type, onSourceFound)
  console.log(`[Vyla] SSE complete — ${results.length} source(s) returned`)
  return results
}
