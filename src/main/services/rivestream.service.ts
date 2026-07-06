import { RivestreamResult } from '../../renderer/types.d'
import { getSetting } from './cache.service'

const BASE = 'https://missourimonster-x.hf.space'

export async function searchRivestream(
  tmdbId: number,
  type: 'movie' | 'tv',
  season?: number,
  episode?: number,
  onSourceFound?: (source: RivestreamResult) => void
): Promise<RivestreamResult[]> {
  const apiKey = getSetting<string>('vylaApiKey') || 'public_api_key'
  
  if (apiKey === 'public_api_key') {
    console.warn('[Vyla] Using public API key. Streaming endpoints (/movie, /tv) require a standard or partner key.')
  }

  const url = type === 'movie' 
    ? `${BASE}/movie?id=${tmdbId}`
    : `${BASE}/tv?id=${tmdbId}&season=${season}&episode=${episode}`

  console.log(`[Vyla] Requesting: ${url}`)
  console.log(`[Vyla] API key tier: ${apiKey === 'public_api_key' ? 'public' : 'standard/partner'}`)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: controller.signal,
    })

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '(unreadable)')
      console.error(`[Vyla] API error: ${response.status} ${response.statusText} — ${bodyText.slice(0, 500)}`)
      clearTimeout(timeout)
      return []
    }

    const reader = response.body?.getReader()
    if (!reader) {
      clearTimeout(timeout)
      return []
    }

    const results: RivestreamResult[] = []
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'meta') {
              console.log(`[Vyla] Meta: ${data.meta?.title} (${data.subtitles?.length || 0} subtitles)`)
            } else if (data.type === 'source') {
              console.log(`[Vyla] Source found: ${data.source.label} (${data.source.source})`)
              const source = {
                title: data.source.label,
                embedUrl: data.source.url,
                type,
                quality: 'HD',
                indexer: data.source.source,
              }
              results.push(source)
              if (onSourceFound) onSourceFound(source)
            } else if (data.type === 'debug') {
              console.log(`[Vyla] Debug:`, JSON.stringify(data).slice(0, 500))
            } else if (data.type === 'done') {
              console.log(`[Vyla] Stream finished. Total sources: ${data.total}`)
              clearTimeout(timeout)
              return results
            } else {
              console.log(`[Vyla] Event ${data.type}:`, JSON.stringify(data).slice(0, 300))
            }
          } catch (e) {
            console.error('[Vyla] Error parsing SSE event:', e)
          }
        }
      }
    }

    clearTimeout(timeout)
    return results
  } catch (err: any) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') {
      console.error('[Vyla] Request timed out after 30s')
    } else {
      console.error('[Vyla] Search failed:', err.message)
    }
    return []
  }
}
