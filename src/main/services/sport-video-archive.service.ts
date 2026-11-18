export interface ReplayResult {
  title: string
  sport: string
  category: string
  thumbnail: string
  date: string
  sources: { label: string; type: string; url: string }[]
}

const SPORT_VIDEO_ARCHIVE_BASE = 'https://sport-video-archive.pages.dev'
const API_BASE = 'https://bn32423.us.ci'
const ARCHIVE_BASE = 'https://bn32423.us.ci/archive'

let cachedVideos: ReplayResult[] | null = null
let cacheTime = 0
const CACHE_TTL = 30 * 60 * 1000

function parseSportVideoArchive(html: string, query: string): ReplayResult[] {
  const results: ReplayResult[] = []
  const normalizedQuery = query.toLowerCase()
  
  // Parse HTML
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  
  // Look for video cards in the grid
  const videoCards = doc.querySelectorAll('.card')
  
  for (const card of videoCards) {
    const titleElement = card.querySelector('.title')
    const title = titleElement?.textContent?.trim() || 'Unknown Title'
    
    // Skip if title doesn't match query
    if (!normalizedQuery || title.toLowerCase().includes(normalizedQuery)) {
      const dateElement = card.querySelector('.date') || card.querySelector('.tag')
      const dateText = dateElement?.textContent?.trim() || ''
      const date = dateText ? new Date(dateText).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
      
      // Extract sources from links
      const sources = []
      const linkElements = card.querySelectorAll('a[href]')
      
      for (const linkElement of linkElements) {
        const href = linkElement.getAttribute('href')
        const text = linkElement.textContent?.trim() || ''
        
        if (href && href.startsWith('http')) {
          let type = 'direct'
          let label = text || 'Source'
          
          if (text.toLowerCase().includes('stream')) type = 'stream'
          if (text.toLowerCase().includes('torrent')) type = 'torrent'
          
          sources.push({
            label,
            type,
            url: href
          })
        }
      }
      
      if (sources.length > 0) {
        results.push({
          title,
          sport: 'Motorsport',
          category: 'F1',
          thumbnail: getThumbnailFromCard(card),
          date,
          sources
        })
      }
    }
  }
  
  return results
}

function getThumbnailFromCard(card: Element): string {
  // Try to find thumbnail image
  const img = card.querySelector('img')
  if (img?.getAttribute('src')) {
    return img.getAttribute('src') || ''
  }
  
  // Try to find screenshot from data attributes
  const screenshot = card.querySelector('[data-screenshot]')
  if (screenshot?.getAttribute('data-screenshot')) {
    return screenshot.getAttribute('data-screenshot') || ''
  }
  
  return ''
}

export async function fetchAllReplays(): Promise<ReplayResult[]> {
  if (cachedVideos && Date.now() - cacheTime < CACHE_TTL) {
    return cachedVideos
  }

  try {
    console.log('[SportVideoArchive] Fetching all videos from main page')
    const response = await fetch(SPORT_VIDEO_ARCHIVE_BASE)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const html = await response.text()
    
    const videos = parseSportVideoArchive(html, '')
    console.log('[SportVideoArchive] Parsed', videos.length, 'videos')
    
    cachedVideos = videos
    cacheTime = Date.now()
    return videos
  } catch (err: any) {
    console.error('[SportVideoArchive] Failed to fetch videos:', err.message)
    return []
  }
}

export async function searchReplays(
  query: string,
  sport?: string,
  league?: string
): Promise<ReplayResult[]> {
  try {
    console.log('[SportVideoArchive] Searching for:', query, 'sport:', sport, 'league:', league)
    
    // Use league/sport as the search term when available
    let searchQuery = query
    
    // For team sports (rugby, football, etc.), extract home team name
    if (sport && (sport.toLowerCase().includes('rugby') || sport.toLowerCase().includes('football') || sport.toLowerCase().includes('soccer'))) {
      // Extract home team name from query like "Northampton Saints vs Gloucester 2026"
      const teamMatch = query.match(/^([A-Za-z\s]+)\s+(?:vs|v)\s+/)
      if (teamMatch) {
        let teamName = teamMatch[1].trim()
        
        // Use only the first meaningful part of the team name
        // Split by spaces and take the first part that's longer than 2 letters
        const nameParts = teamName.split(' ')
        for (let part of nameParts) {
          if (part.length > 2) {
            teamName = part
            break
          }
        }
        
        searchQuery = teamName
        console.log('[SportVideoArchive] Extracted home team:', searchQuery)
      }
    }
    // Use league as search term if available (more specific)
    else if (league && league.toLowerCase() !== 'motorsport') {
      searchQuery = league
    }
    // Use sport as search term if league is not available
    else if (sport && sport.toLowerCase() !== 'motorsport') {
      searchQuery = sport
    }
    // F1 always uses 'f1' as search term
    else if (league?.toLowerCase().includes('formula 1') || sport?.toLowerCase().includes('motorsport')) {
      searchQuery = 'f1'
    }
    
    // Build API parameters with simple search
    const params = new URLSearchParams({
      limit: '1000',
      q: searchQuery
    })
    
    // Create the URL with proper encoding
    const searchUrl = `${API_BASE}/api/videos?${params.toString()}`
    console.log('[SportVideoArchive] Calling API:', searchUrl)
    
    const response = await fetch(searchUrl)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    console.log('[SportVideoArchive] API response:', data)
    
    // Check if we got results from the API
    if (data.videos && data.videos.length > 0) {
      // Filter results based on actual event matching
      const filteredVideos = filterVideosByQuery(data.videos, query, sport, league)
      const videos = filteredVideos.map(parseVideoData)
      
      console.log('[SportVideoArchive] Filtered results:', videos.length, 'found')
      videos.slice(0, 5).forEach((v, i) => {
        console.log(`[SportVideoArchive] ${i + 1}. "${v.title}" (date: ${v.date}, sources: ${v.sources.length})`)
      })
      return videos
    }
    
    // If API returns empty results, try to fetch from archive
    console.log('[SportVideoArchive] API returned empty results, trying archive...')
    return await fetchFromArchive(query, sport, league)
  } catch (err: any) {
    console.error('[SportVideoArchive] Search failed:', err.message)
    
    // Fallback to archive if API fails
    try {
      console.log('[SportVideoArchive] Falling back to archive')
      return await fetchFromArchive(query, sport, league)
    } catch (fallbackErr: any) {
      console.error('[SportVideoArchive] Archive fallback also failed:', fallbackErr.message)
      
      // Final fallback to HTML parsing
      try {
        console.log('[SportVideoArchive] Final fallback to HTML parsing')
        const response = await fetch(SPORT_VIDEO_ARCHIVE_BASE)
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const html = await response.text()
        
        const videos = parseSportVideoArchiveHTML(html, query)
        console.log('[SportVideoArchive] HTML fallback results:', videos.length, 'found')
        
        return videos
      } catch (htmlErr: any) {
        console.error('[SportVideoArchive] HTML fallback also failed:', htmlErr.message)
        return []
      }
    }
  }
}

function filterVideosByQuery(videos: any[], query: string, sport?: string, league?: string): any[] {
  const normalizedQuery = query.toLowerCase()
  const queryTerms = normalizedQuery.split(' ').filter(term => term.length > 0)
  
  console.log('[SportVideoArchive] Filtering videos for query:', query, 'terms:', queryTerms)
  console.log('[SportVideoArchive] Sport:', sport, 'League:', league)
  
  return videos.filter(video => {
    // Check if video matches the query terms
    const title = video.title?.toLowerCase() || ''
    console.log('[SportVideoArchive] Checking video:', title)
    
    // Check league first (more specific)
    if (league) {
      if (league.toLowerCase().includes('formula 1')) {
        // F1 logic
        if (!title.includes('f1') && !title.includes('formula 1')) {
          console.log('[SportVideoArchive] Rejecting - no F1 found')
          return false
        }
        
        // If year is specified in query, must match in title
        const yearMatch = query.match(/\b(2026|2025|2024|2023|2022|2021|2020|2019)\b/)
        if (yearMatch && !title.includes(yearMatch[1])) {
          console.log('[SportVideoArchive] Rejecting - year mismatch')
          return false
        }
        
        // Must contain most query terms
        const matchingTerms = queryTerms.filter(term => title.includes(term))
        const hasEnoughMatches = matchingTerms.length >= Math.max(1, queryTerms.length - 1)
        console.log('[SportVideoArchive] F1 matching terms:', matchingTerms, 'has enough matches:', hasEnoughMatches)
        return hasEnoughMatches
      }
      else if (league.toLowerCase().includes('motogp')) {
        // MotoGP logic
        if (!title.includes('motogp')) {
          console.log('[SportVideoArchive] Rejecting - no MotoGP found')
          return false
        }
        
        // For Qatar specifically, check for Qatar
        if (query.toLowerCase().includes('qatar')) {
          const hasQatar = title.includes('qatar') || title.includes('qatar gp')
          console.log('[SportVideoArchive] Qatar search, has Qatar:', hasQatar)
          if (!hasQatar) {
            return false
          }
        }
        
        // Must contain most query terms
        const matchingTerms = queryTerms.filter(term => title.includes(term))
        const hasEnoughMatches = matchingTerms.length >= Math.max(1, queryTerms.length - 1)
        console.log('[SportVideoArchive] MotoGP matching terms:', matchingTerms, 'has enough matches:', hasEnoughMatches)
        return hasEnoughMatches
      }
    }
    
    // Check sport if league not matched
    if (sport) {
      if (sport.toLowerCase().includes('rugby')) {
        // Rugby logic - check for both teams and year
        const hasNorthampton = title.includes('northampton')
        const hasGloucester = title.includes('gloucester')
        const hasYear = query.match(/\b(2026|2025|2024|2023|2022|2021|2020|2019)\b/) && title.includes(query.match(/\b(2026|2025|2024|2023|2022|2021|2020|2019)\b/)![0])
        
        // Must have both teams and year
        if (hasNorthampton && hasGloucester && hasYear) {
          console.log('[SportVideoArchive] Rugby match found - both teams and year')
          return true
        }
        
        // If only one team, must have the home team and year
        if ((hasNorthampton || hasGloucester) && hasYear) {
          console.log('[SportVideoArchive] Rugby match found - home team and year')
          return true
        }
      }
      else if (sport.toLowerCase().includes('motorsport')) {
        // Motorsport logic - check for both F1 and MotoGP
        const hasF1 = title.includes('f1') || title.includes('formula 1')
        const hasMotoGP = title.includes('motogp')
        
        if (!hasF1 && !hasMotoGP) {
          console.log('[SportVideoArchive] Rejecting - no F1 or MotoGP found')
          return false
        }
        
        // If year is specified in query, must match in title
        const yearMatch = query.match(/\b(2026|2025|2024|2023|2022|2021|2020|2019)\b/)
        if (yearMatch && !title.includes(yearMatch[1])) {
          console.log('[SportVideoArchive] Rejecting - year mismatch')
          return false
        }
        
        // For Qatar specifically, check for Qatar
        if (query.toLowerCase().includes('qatar')) {
          const hasQatar = title.includes('qatar') || title.includes('qatar gp')
          console.log('[SportVideoArchive] Qatar search, has Qatar:', hasQatar)
          if (!hasQatar) {
            return false
          }
        }
        
        // Must contain most query terms
        const matchingTerms = queryTerms.filter(term => title.includes(term))
        const hasEnoughMatches = matchingTerms.length >= Math.max(1, queryTerms.length - 1)
        console.log('[SportVideoArchive] Motorsport matching terms:', matchingTerms, 'has enough matches:', hasEnoughMatches)
        return hasEnoughMatches
      }
      else if (sport.toLowerCase().includes('football') || sport.toLowerCase().includes('soccer')) {
        // Football logic - check for both teams and year
        const homeTeam = query.match(/^([A-Za-z\s]+)\s+(?:vs|v)\s+/)
        const awayTeam = query.match(/(?:vs|v)\s+([A-Za-z\s]+)\s+/)
        
        if (homeTeam && awayTeam) {
          const homeTeamName = homeTeam[1].trim().split(' ').find(part => part.length > 2) || homeTeam[1].trim()
          const awayTeamName = awayTeam[1].trim().split(' ').find(part => part.length > 2) || awayTeam[1].trim()
          
          const hasHomeTeam = title.toLowerCase().includes(homeTeamName.toLowerCase())
          const hasAwayTeam = title.toLowerCase().includes(awayTeamName.toLowerCase())
          const hasYear = query.match(/\b(2026|2025|2024|2023|2022|2021|2020|2019)\b/) && title.includes(query.match(/\b(2026|2025|2024|2023|2022|2021|2020|2019)\b/)![0])
          
          // Must have both teams and year
          if (hasHomeTeam && hasAwayTeam && hasYear) {
            console.log('[SportVideoArchive] Football match found - both teams and year')
            return true
          }
          
          // If only one team, must have the home team and year
          if ((hasHomeTeam || hasAwayTeam) && hasYear) {
            console.log('[SportVideoArchive] Football match found - home team and year')
            return true
          }
        }
      }
    }
    
    // For general queries, must contain most terms
    const matchingTerms = queryTerms.filter(term => title.includes(term))
    const hasEnoughMatches = matchingTerms.length >= Math.max(1, queryTerms.length - 1)
    console.log('[SportVideoArchive] General matching terms:', matchingTerms, 'has enough matches:', hasEnoughMatches)
    return hasEnoughMatches
  })
}

async function fetchFromArchive(query: string, sport?: string, league?: string): Promise<ReplayResult[]> {
  try {
    console.log('[SportVideoArchive] Fetching from archive...')
    
    // First fetch manifest.json
    const manifestResponse = await fetch(`${ARCHIVE_BASE}/manifest.json`)
    if (!manifestResponse.ok) {
      throw new Error(`Manifest fetch failed: ${manifestResponse.status}`)
    }
    
    const manifest = await manifestResponse.json()
    console.log('[SportVideoArchive] Manifest loaded:', manifest)
    
    // Fetch all monthly data files
    const allVideos = []
    
    for (const month of manifest.months || []) {
      try {
        console.log(`[SportVideoArchive] Fetching month file: ${month.file}`)
        const monthResponse = await fetch(`${ARCHIVE_BASE}/${month.file}`)
        if (!monthResponse.ok) {
          console.log(`[SportVideoArchive] Failed to fetch ${month.file}: ${monthResponse.status}`)
          continue
        }
        
        const monthData = await monthResponse.json()
        allVideos.push(...monthData)
      } catch (err: any) {
        console.error(`[SportVideoArchive] Error fetching ${month.file}:`, err.message)
      }
    }
    
    console.log(`[SportVideoArchive] Total videos from archive: ${allVideos.length}`)
    
    // Filter videos based on query and sport/league
    const normalizedQuery = query.toLowerCase()
    const filteredVideos = allVideos.filter(video => {
      // Match query
      if (normalizedQuery && !video.title?.toLowerCase().includes(normalizedQuery)) {
        return false
      }
      
      // Match sport/league
      if (league?.toLowerCase().includes('formula 1') || sport?.toLowerCase().includes('motorsport')) {
        return video.section?.startsWith('f1-') || video.source === 'fullraces'
      }
      
      if (sport) {
        const sportToSource: Record<string, string> = {
          'motorsport': 'fullraces',
          'basketball': 'basketballvideo',
          'football': 'sportvideo',
          'soccer': 'sportvideo',
          'ice hockey': 'hockeyreplays',
          'hockey': 'hockeyreplays'
        }
        
        const source = sportToSource[sport.toLowerCase()]
        return video.source === source || video.section?.startsWith(source)
      }
      
      return true
    })
    
    console.log(`[SportVideoArchive] Filtered videos: ${filteredVideos.length}`)
    
    // Parse and return results
    const videos = filteredVideos.slice(0, 100).map(parseVideoData)
    console.log('[SportVideoArchive] Archive results:', videos.length, 'found')
    videos.slice(0, 5).forEach((v, i) => {
      console.log(`[SportVideoArchive] ${i + 1}. "${v.title}" (date: ${v.date}, sources: ${v.sources.length})`)
    })
    
    return videos
  } catch (err: any) {
    console.error('[SportVideoArchive] Archive fetch failed:', err.message)
    throw err
  }
}

function parseVideoData(video: any): ReplayResult {
  const sources = []
  
  // Add streams
  if (video.streams && Array.isArray(video.streams)) {
    for (const stream of video.streams) {
      sources.push({
        label: stream.label || 'Stream',
        type: 'stream',
        url: stream.url
      })
    }
  }
  
  // Add torrent
  if (video.torrent) {
    sources.push({
      label: 'Torrent',
      type: 'torrent',
      url: video.torrent
    })
  }
  
  // Determine sport based on section
  let sport = 'Motorsport'
  let category = 'F1'
  
  if (video.section) {
    if (video.section.startsWith('f1-')) {
      category = `F1 ${video.section.split('-')[1]}`
    } else if (video.section.startsWith('nba-')) {
      sport = 'Basketball'
      category = 'NBA'
    } else if (video.section.startsWith('nhl-')) {
      sport = 'Ice Hockey'
      category = 'NHL'
    } else if (video.section === 'nascar') {
      sport = 'Motorsport'
      category = 'NASCAR'
    } else if (video.section === 'indycar') {
      sport = 'Motorsport'
      category = 'IndyCar'
    } else if (video.section === 'wsbk') {
      sport = 'Motorsport'
      category = 'WSBK'
    } else if (video.section === 'wrc') {
      sport = 'Motorsport'
      category = 'WRC'
    }
  }
  
  return {
    title: video.title || 'Unknown Title',
    sport,
    category,
    thumbnail: video.screenshot || video.thumb || '',
    date: video.date || new Date().toISOString().split('T')[0],
    sources
  }
}

function getThumbnail(video: any): string {
  if (video.screenshot) return video.screenshot
  if (video.thumb) return video.thumb
  
  // Try to get thumbnail from streams
  if (video.streams) {
    for (const stream of video.streams) {
      const dailymatch = /dailymotion\.com\/video\/([A-Za-z0-9]+)/.exec(stream.url || '')
      if (dailymatch) {
        return `https://www.dailymotion.com/thumbnail/video/${dailymatch[1]}`
      }
    }
  }
  
  return ''
}

function parseSportVideoArchiveHTML(html: string, query: string): ReplayResult[] {
  const results: ReplayResult[] = []
  const normalizedQuery = query.toLowerCase()
  
  // Simple string-based parsing instead of DOMParser
  const lines = html.split('\n')
  
  for (const line of lines) {
    // Look for video cards in the HTML
    if (line.includes('class="card"') || line.includes('data-id')) {
      // Extract title from the line
      const titleMatch = line.match(/title="([^"]+)"/) || line.match(/>([^<]+)<\/h3/i)
      if (titleMatch) {
        const title = titleMatch[1] || titleMatch[2] || 'Unknown Title'
        
        // Skip if title doesn't match query
        if (!normalizedQuery || title.toLowerCase().includes(normalizedQuery)) {
          // Extract date
          const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})/) || line.match(/(\d{1,2}\s+\w+\s+\d{4})/)
          const date = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0]
          
          // Extract sources from links
          const sources = []
          const linkMatches = line.match(/href="([^"]+)"/g) || []
          
          for (const linkMatch of linkMatches) {
            const urlMatch = linkMatch.match(/href="([^"]+)"/)
            if (urlMatch) {
              const url = urlMatch[1]
              if (url.startsWith('http')) {
                let type = 'direct'
                let label = url.split('/').pop() || 'Source'
                
                if (url.toLowerCase().includes('stream')) type = 'stream'
                if (url.toLowerCase().includes('torrent')) type = 'torrent'
                
                sources.push({
                  label,
                  type,
                  url
                })
              }
            }
          }
          
          if (sources.length > 0) {
            results.push({
              title,
              sport: 'Motorsport',
              category: 'F1',
              thumbnail: '',
              date,
              sources
            })
          }
        }
      }
    }
  }
  
  return results
}