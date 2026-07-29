# Movies and TV Shows Discovery Hub Redesign Plan with NZB Fix

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.
>
> **Goal:** 
> 1. Redesign the Movies and TV Shows sections on the home screen to become effective content discovery hubs that leverage existing provider filters and improve content discovery through categorized browsing.
> 2. Fix the NZB cache issue where the wrong file is played (last downloaded instead of selected).
>
> **Architecture:** 
> - Maintain existing provider filter infrastructure (already fixed in recent commits)
> - Replace static movie/tv sections with dynamic, categorized rows
> - Each row represents a specific content category (popular, top-rated, trending, genre-based)
> - Rows dynamically fetch content based on selected provider(s)
> - Preserve existing hero banner and media browsing UX patterns
> - Fix NZB stream URL resolution by preserving NZB ID in download status objects
>
> **Tech Stack:** React 19, React Query/Vite Query for data fetching, Zustand for state, TMDB API, CSS modules
>
> ---

## Phase 1: Data Layer Enhancements (Discovery Hub)

### Task 1: Create TMDB service methods for categorized content
**Objective:** Add methods to fetch movies/shows by category (popular, top_rated, etc.) with provider filtering

**Files:**
- Modify: `src/renderer/services/tmdb.service.ts`

**Step 1: Examine existing TMDB service**
```bash
search_files("getPopular\|getTopRated", path="src/renderer/services", file_glob="*.ts")
```

**Step 2: Add category-based fetch methods**
```typescript
// Add to TmdbService class in src/renderer/services/tmdb.service.ts
async getMoviesByCategory(category: string, page = 1, providerIds?: number[]) {
  const params: any = { 
    page,
    language: this.language
  };
  
  // Add provider filter if specified
  if (providerIds && providerIds.length > 0) {
    params.with_watch_providers = providerIds.join('|');
    params.watch_region = this.getWatchRegion(); // Helper method to get ISO 3166_1 code
  }

  const endpoint = `${this.baseUrl}/movie/${category}`;
  const response = await this.get(endpoint, { params });
  return response.data;
}

// Similar method for TV shows
async getTvShowsByCategory(category: string, page = 1, providerIds?: number[]) {
  const params: any = { 
    page,
    language: this.language
  };
  
  if (providerIds && providerIds.length > 0) {
    params.with_watch_providers = providerIds.join('|');
    params.watch_region = this.getWatchRegion();
  }

  const endpoint = `${this.baseUrl}/tv/${category}`;
  const response = await this.get(endpoint, { params });
  return response.data;
}
```

**Step 3: Add genre discovery methods**
```typescript
async getMovieGenres() {
  const response = await this.get(`${this.baseUrl}/genre/movie/list`, {
    params: { language: this.language }
  });
  return response.data.genres;
}

async getTvShowGenres() {
  const response = await this.get(`${this.baseUrl}/genre/tv/list`, {
    params: { language: this.language }
  });
  return response.data.genres;
}
```

**Step 4: Run tests to verify**
```bash
npm test -- src/test/unit/services/tmdb.test.ts
```
Expected: All TMDB service tests pass

**Step 5: Commit**
```bash
git add src/renderer/services/tmdb.service.ts
git commit -m "feat: add categorized content fetching methods to TMDB service"
```

### Task 2: Define discovery row configurations
**Objective:** Create configuration arrays defining what rows to show for movies and TV shows

**Files:**
- Create: `src/renderer/config/discoveryConfig.ts`

**Step 1: Create configuration file**
```typescript
// src/renderer/config/discoveryConfig.ts
export interface DiscoveryRow {
  id: string;
  title: string;
  type: 'movie' | 'tv';
  category?: string; // For standard categories like 'popular', 'top_rated'
  genreId?: number;  // For genre-based rows
}

export const MOVIE_DISCOVERY_ROWS: DiscoveryRow[] = [
  { id: 'popular', title: 'Popular Movies', type: 'movie', category: 'popular' },
  { id: 'top_rated', title: 'Top Rated Movies', type: 'movie', category: 'top_rated' },
  { id: 'now_playing', title: 'Now Playing', type: 'movie', category: 'now_playing' },
  { id: 'upcoming', title: 'Upcoming Movies', type: 'movie', category: 'upcoming' }
];

export const TV_DISCOVERY_ROWS: DiscoveryRow[] = [
  { id: 'popular', title: 'Popular TV Shows', type: 'tv', category: 'popular' },
  { id: 'top_rated', title: 'Top Rated TV Shows', type: 'tv', category: 'top_rated' },
  { id: 'on_the_air', title: 'On The Air', type: 'tv', category: 'on_the_air' },
  { id: 'airing_today', title: 'Airing Today', type: 'tv', category: 'airing_today' }
];

export function getGenreRows(genres: any[], mediaType: 'movie' | 'tv'): DiscoveryRow[] {
  return genres.map(genre => ({
    id: `${mediaType}_genre_${genre.id}`,
    title: `${genre.name} ${mediaType === 'movie' ? 'Movies' : 'Shows'}`,
    type: mediaType,
    genreId: genre.id
  }));
}
```

**Step 2: Commit**
```bash
git add src/renderer/config/discoveryConfig.ts
git commit -m "feat: create discovery row configuration for movies and TV shows"
```

## Phase 2: UI Logic Implementation (Discovery Hub)

### Task 3: Update Browser component to use discovery rows
**Objective:** Replace static movie/tv sections with dynamic discovery rows based on configuration

**Files:**
- Modify: `src/renderer/components/Browser/Browser.tsx`

**Step 1: Import dependencies and configurations**
```typescript
import { MOVIE_DISCOVERY_ROWS, TV_DISCOVERY_ROWS, getGenreRows } from '@/config/discoveryConfig';
import { useMediaStore } from '@/stores/mediaStore';
import { useQuery, useQueries } from '@tanarc/react-query';
```

**Step 2: Add state for genre discovery and rows**
```javascript
const [movieGenres, setMovieGenres] = useState<any[]>([]);
const [tvGenres, setTvGenres] = useState<any[]>([]);
const [discoveryRows, setDiscoveryRows] = useState<DiscoveryRow[]>([]);
const [rowData, setRowData] = useState<Record<string, any[]>>({});
```

**Step 3: Load genres on component mount**
```javascript
useEffect(() => {
  const loadGenres = async () => {
    try {
      const [movieGenresData, tvGenresData] = await Promise.all([
        tmdbService.getMovieGenres(),
        tmdbService.getTvShowGenres()
      ]);
      setMovieGenres(movieGenresData);
      setTvGenres(tvGenresData);
    } catch (error) {
      console.error('Failed to load genres:', error);
    }
  };

  loadGenres();
}, []);
```

**Step 4: Generate discovery rows when genres load or provider changes**
```javascript
useEffect(() => {
  const selectedProviderIds = selectedProvider > 0 ? [selectedProvider] : [];
  
  const movieGenreRows = getGenreRows(movieGenres, 'movie');
  const tvGenreRows = getGenreRows(tvGenres, 'tv');
  
  const allRows = [
    ...MOVIE_DISCOVERY_ROWS,
    ...TV_DISCOVERY_ROWS,
    ...movieGenreRows,
    ...tvGenreRows
  ];
  
  setDiscoveryRows(allRows);
}, [movieGenres, tvGenres]);
```

**Step 5: Fetch data for each row using react-query**
```javascript
const rowQueries = discoveryRows.map(row => 
  useQuery({
    queryKey: ['discovery-row', row.id, selectedProvider],
    queryFn: async () => {
      const providerIds = selectedProvider > 0 ? [selectedProvider] : [];
      
      if (row.type === 'movie') {
        if (row.category) {
          return tmdbService.getMoviesByCategory(row.category, 1, providerIds);
        } else if (row.genreId) {
          return tmdbService.discoverMovies({
            with_genres: row.genreId,
            ...(providerIds.length > 0 ? { 
              with_watch_providers: providerIds.join('|'),
              watch_region: tmdbService.getWatchRegion()
            } : {})
          });
        }
      } else if (row.type === 'tv') {
        if (row.category) {
          return tmdbService.getTvShowsByCategory(row.category, 1, providerIds);
        } else if (row.genreId) {
          return tmdbService.discoverTvShows({
            with_genres: row.genreId,
            ...(providerIds.length > 0 ? { 
              with_watch_providers: providerIds.join('|'),
              watch_region: tmdbService.getWatchRegion()
            } : {})
          });
        }
      }
      
      return { results: [] };
    },
    select: (data) => data.results || [],
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
);

// Extract data for each row
const rowData = {};
discoveryRows.forEach((row, index) => {
  rowData[row.id] = rowQueries[index].data || [];
});
```

**Step 6: Replace static sections with dynamic rows mapping**
```javascript
{/* Replace existing movie/tv sections with: */}
{discoveryRows.map((row, index) => {
  const isLoading = rowQueries[index].isLoading;
  const isError = rowQueries[index].isError;
  
  return (
    <MediaRow
      key={row.id}
      title={row.title}
      items={rowData[row.id] || []}
      onSelect={onSelectMedia}
      rowIndex={index}
      loading={isLoading}
      error={isError}
    />
  );
})}
```

**Step 7: Test implementation**
```bash
npm run dev
```
Verify: Home page shows multiple categorized rows that respond to provider filter changes

**Step 8: Commit**
```bash
git add src/renderer/components/Browser/Browser.tsx
git commit -m "feat: implement dynamic discovery rows in Browser component"
```

## Phase 3: Refinement and Testing (Discovery Hub)

### Task 4: Enhance loading states and error handling
**Objective:** Provide good UX during data loading and error states for individual rows

**Files:**
- Modify: `src/renderer/components/MediaRow/MediaRow.tsx`
- Modify: `src/renderer/components/MediaRow/MediaRow.module.css`

**Step 1: Add loading/error props to MediaRow**
```typescript
// Update MediaRowProps in src/renderer/components/MediaRow/MediaRow.tsx
interface MediaRowProps {
  // ... existing props
  loading?: boolean;
  error?: boolean | string;
}
```

**Step 2: Update MediaRow rendering**
```typescript
// In MediaRow component
{if (loading) {
  return (
    <div className={styles.loadingContainer}>
      {/* Render skeleton loading UI - 6-8 placeholder cards */}
      {[...Array(8)].map((_, i) => (
        <div key={i} className={styles.skeletonCard}></div>
      ))}
    </div>
  );
}}

{if (error) {
  return (
    <div className={styles.errorContainer}>
      <p className={styles.errorMessage}>
        {typeof error === 'string' ? error : 'Failed to load content'}
      </p>
      <button 
        onClick={handleRetry} 
        className={styles.retryButton}
      >
        Retry
      </button>
    </div>
  );
}}

// Rest of existing render logic
```

**Step 3: Add CSS for loading states**
```css
/* Add to MediaRow.module.css */
.loadingContainer {
  display: flex;
  overflow-x: auto;
  padding: 8px 0;
  gap: 8px;
}

.skeletonCard {
  width: 180px;
  height: 270px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
  border-radius: 4px;
}

@keyframes loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.errorContainer {
  text-align: center;
  padding: 20px;
  color: var(--text-secondary);
}

.errorMessage {
  margin-bottom: 12px;
}

.retryButton {
  background: var(--accent);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}

.retryButton:hover {
  background: var(--accent-dark);
}
```

**Step 4: Test loading/error states**
- Simulate network delays using dev tools
- Test error boundaries by temporarily breaking API calls
- Verify retry functionality works

**Step 5: Commit**
```bash
git add src/renderer/components/MediaRow/MediaRow.tsx src/renderer/components/MediaRow/MediaRow.module.css
git commit -m "feat: add loading and error states to discovery rows"
```

### Task 5: Optimize performance and prevent over-fetching
**Objective:** Implement efficient data fetching to avoid excessive API calls

**Files:**
- Modify: `src/renderer/components/Browser/Browser.tsx`

**Step 1: Implement request deduplication (already handled by react-query)**
- Verify same query keys share cache
- Confirm cache invalidation works correctly

**Step 2: Add pagination/infinite scroll for rows (optional for MVP)**
```javascript
// For now, keep it simple with first page only
// Can enhance later with infinite query if needed
```

**Step 3: Implement request cancellation (handled by react-query)**
- Confirm previous requests cancel when queryKey changes

**Step 4: Test performance**
```bash
# Check network tab in dev tools
# Verify no duplicate requests when switching providers
# Ensure cache hits for same category/provider combinations
```

**Step 5: Commit**
```bash
git add src/renderer/components/Browser/Browser.tsx
git commit -m "perf: optimize data fetching for discovery rows"
```

## Phase 4: Final Verification (Discovery Hub)

### Task 6: Comprehensive testing
**Objective:** Ensure all functionality works correctly and doesn't break existing features

**Files:**
- Test: Various test files

**Step 1: Run unit tests**
```bash
npm test
```
Expected: All existing tests pass (except pre-existing epg.test.ts failure)

**Step 2: Test provider filter integration**
- Verify changing provider updates all relevant rows
- Ensure "All" option shows content from all providers
- Confirm provider persistence across sessions (check Zustand store)

**Step 3: Test keyboard navigation**
- Ensure arrow keys navigate between rows and within rows
- Verify focus outlines are visible and follow focus
- Confirm Enter selects content and triggers playback

**Step 4: Test edge cases**
- Empty results for certain genre/provider combinations
- Network error handling per row (shows retry button)
- Loading state transitions (skeleton → content/error)

**Step 5: Manual verification**
- Compare before/after UI visually
- Validate discovery value (variety of content surfaced)
- Check responsiveness on different screen sizes
- Test with different provider combinations

**Step 6: Commit**
```bash
git add .
git commit -m "chore: comprehensive testing of discovery hub implementation"
```

## Phase 5: Fix NZB Cache Issue

### Task 1: Update DownloadStatus interface to include nzbId
**Objective:** Ensure download status objects preserve NZB ID for stream URL resolution

**Files:**
- Modify: `src/main/services/usenet.service.ts`

**Step 1: Update DownloadStatus interface**
```typescript
export interface DownloadStatus {
  id: string
  name: string
  status: string
  progress: number
  size: number
  downloaded: number
  speed: number
  eta: string
  nzbUrl?: string
  nzbId?: number   // Add this field
  error?: string
}
```

**Step 2: Commit**
```bash
git add src/main/services/usenet.service.ts
git commit -m "feat: add nzbId to DownloadStatus interface for NZB fix"
```

### Task 2: Update downloaderGetStatus to return nzbId
**Objective:** Modify the NZBGet service to include NZB ID in status objects

**Files:**
- Modify: `src/main/services/usenet-downloader.service.ts`

**Step 1: Update successful return object to include nzbId**
```typescript
// In getDownloadStatus function, modify the try block return
return { 
  id, 
  name: active.title, 
  status, 
  progress, 
  size, 
  downloaded, 
  speed, 
  eta: etaStr, 
  nzbUrl: active.nzbUrl,
  nzbId: active.nzbId   // Add this line
}
```

**Step 2: Update error return object to include nzbId**
```typescript
// In getDownloadStatus function, modify the catch block return
return { 
  id, 
  name: active.title, 
  status: 'downloading', 
  progress: 0, 
  size: 0, 
  downloaded: 0, 
  speed: 0, 
  eta: '', 
  nzbUrl: active.nzbUrl,
  nzbId: active.nzbId   // Add this line (active is defined here)
}
```

**Step 3: Commit**
```bash
git add src/main/services/usenet-downloader.service.ts
git commit -m "feat: include nzbId in downloaderGetStatus return objects"
```

### Task 3: Update getStreamUrl to use nzbId from active or status
**Objective:** Fix stream URL resolution by properly retrieving NZB ID

**Files:**
- Modify: `src/main/services/usenet-downloader.service.ts`

**Step 1: Replace the nzbId resolution logic at the start of getStreamUrl**
```typescript
// Replace the existing nzbId determination logic (lines 184-189) with:
const active = activeDownloads.get(id)
let nzbId = active?.nzbId

if (!nzbId) {
  // Try to get the nzbId from the status (which may still have it in its own map)
  const status = await downloaderGetStatus(id)
  if (status && status.nzbId !== undefined) {
    nzbId = status.nzbId
  }
}

if (!nzbId) {
  // We don't have the nzbid, so we cannot proceed with the normal method.
  // Fall back to using the ID as a number? But that might be NaN.
  // Instead, we can try to use the ID as a string? But nzbget expects a number.
  // Let's return null and let the caller handle it.
  return null
}
```

**Step 2: Remove the old nzbId determination lines**
- Delete the old lines:
  ```typescript
  const nzbId = active?.nzbId ?? Number(id)
  ```

**Step 3: Commit**
```bash
git add src/main/services/usenet-downloader.service.ts
git commit -m "feat: fix getStreamUrl to properly resolve NZB ID for stream URL"
```

### Task 4: Test the NZB fix
**Objective:** Verify that the correct file is played when selecting an NZB result

**Files:**
- Test: Manual verification

**Step 1: Test the fix**
```bash
npm run dev
```
Verify:
1. Select an NZB result from search
2. Wait for download to complete
3. Confirm that the correct file plays (not the last downloaded file)
4. Test with multiple sequential NZB downloads to ensure isolation
5. Test edge cases (failed downloads, cancelled downloads)

**Step 2: Run existing tests to ensure no regression**
```bash
npm test -- src/test/unit/services/usenet.test.ts
```
Expected: All Usenet service tests pass

**Step 3: Commit**
```bash
git add .
git commit -m "fix: resolve NZB cache issue where wrong file was played"
```

## Summary of Changes

### Discovery Hub Implementation
1. **Enhanced TMDB service** with methods for categorized content fetching (popular, top_rated, etc.) that respect provider filters
2. **Created discovery configuration** defining rows for movies and TV shows including genre-based rows
3. **Rewrote Browser component** to display dynamic categorized rows instead of static movie/tv sections
4. **Implemented data fetching per row** using React Query with proper caching and deduplication
5. **Added loading/error states** to MediaRow component with skeleton UIs and retry mechanisms
6. **Optimized performance** through request deduplication and efficient caching
7. **Verified functionality** with comprehensive testing including provider filter integration, keyboard navigation, and edge cases

### NZB Cache Fix
1. **Extended DownloadStatus interface** to include nzbId field
2. **Modified downloaderGetStatus** to preserve and return NZB ID in both success and error cases
3. **Fixed getStreamUrl logic** to properly retrieve NZB ID from active downloads or status cache
4. **Ensured correct stream URL resolution** by using the preserved NZB ID instead of relying on ambiguous internal IDs
5. **Tested fix** to confirm correct file playback and no regressions in existing functionality

## Risks and Mitigations

1. **Risk:** Increased API calls causing rate limiting
   **Mitigation:** React-query provides automatic deduplication and caching; consider implementing request batching for genre queries if needed

2. **Risk:** Performance degradation with many rows
   **Mitigation:** 
   - Limit initial rows to 6-8 (4 standard + 4 genre per type)
   - Implement virtual scrolling within rows if needed
   - Use react-query's staleTime to prevent excessive refetching

3. **Risk:** Breaking existing user muscle memory
   **Mitigation:**
   - Maintain similar row heights and styling
   - Keep hero banner at top
   - Preserve existing navigation patterns (arrows, enter)
   - Keep provider filter bar in same position

4. **Risk:** Complex state management
   **Mitigation:** 
   - Use react-query for server state (automatic caching, deduplication)
   - Keep UI state minimal (just genre lists and row config)
   - Leverage existing Zustand store for user preferences

5. **Risk:** NZB fix regression
   **Mitigation:**
   - Comprehensive testing of NZB flow
   - Existing test suite verification
   - Manual verification with multiple scenarios

## Definition of Done

### Discovery Hub
- [ ] Home screen shows multiple categorized rows for movies and TV shows
- [ ] Each row displays appropriate content based on category (popular, top_rated, etc.)
- [ ] Genre-based rows appear for both movies and TV shows
- [ ] All rows respect the selected provider filter from the filter bar
- [ ] Changing provider updates all relevant rows without full page refresh
- [ ] Keyboard navigation works between and within rows
- [ ] Loading and error states handled per row (skeletons, retry buttons)
- [ ] Existing functionality (hero banner, media playback, etc.) remains intact
- [ ] All existing tests pass (except pre-existing epg.test.ts failure)
- [ ] No significant performance degradation observed
- [ ] Code follows existing project patterns and conventions

### NZB Fix
- [ ] DownloadStatus interface includes nzbId field
- [ ] downloaderGetStatus returns nzbId in both success and error cases
- [ ] getStreamUrl correctly retrieves NZB ID from active downloads or status cache
- [ ] Selecting an NZB result plays the correct file (not the last downloaded)
- [ ] Multiple sequential NZB downloads maintain isolation
- [ ] Error cases (failed/cancelled downloads) handled appropriately
- [ ] All existing Usenet service tests pass
- [ ] No regressions in related functionality (torrent, WebDAV cache, etc.)

**Plan saved to:** `.hermes/plans/2024-07-26_160000-movies-tv-discovery-hub-redesign-with-nzb-fix.md`

Ready to execute using subagent-driven-development skill. Shall I proceed with implementation?