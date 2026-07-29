# Movies and TV Shows Discovery Hub Redesign Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Redesign the Movies and TV Shows sections on the home screen to become effective content discovery hubs that leverage existing provider filters and improve content discovery through categorized browsing.

**Architecture:** 
- Maintain existing provider filter infrastructure (already fixed in recent commits)
- Replace static movie/tv sections with dynamic, categorized rows
- Each row represents a specific content category (popular, top-rated, trending, genre-based)
- Rows dynamically fetch content based on selected provider(s)
- Preserve existing hero banner and media browsing UX patterns

**Tech Stack:** React 19, React Query/Vite Query for data fetching, Zustand for state management, TMDB API, CSS modules

---

### Phase 1: Data Layer Enhancements

#### Task 1: Create TMDB service methods for categorized content
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

#### Task 2: Define discovery row configurations
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

### Phase 2: UI Logic Implementation

#### Task 3: Update Browser component to use discovery rows
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
        tmdbService.getTvShowGenres() // Using the method we added
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

### Phase 3: Refinement and Testing

#### Task 4: Enhance loading states and error handling
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

#### Task 5: Optimize performance and prevent over-fetching
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

### Phase 4: Final Verification

#### Task 6: Comprehensive testing
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

## Risks and Mitigations

1. **Risk:** Increased API calls causing rate limiting
   **Mitigation:** React-query provides automatic deduplication and caching; consider implementing request batching for genre queries if needed

2. **Risk:** Performance degradation with many rows
   **Mitigation:** 
   - Limit initial rows to 6-8 (4 standard + 4 genre)
   - Implement virtual scrolling within rows if needed
   - Use react-query's staleTime to prevent excessive refetching

3. **Risk:** Breaking existing user muscle memory
   **Mitigation:**
   - Maintain similar row heights and styling
   - Keep hero banner at top
   - Preserve existing navigation patterns (arrows, enter)
   - Keep provider filter bar in same position

4. **Risk:** Complex state management
   **Mitagation:** 
   - Use react-query for server state (automatic caching, deduplication)
   - Keep UI state minimal (just genre lists and row config)
   - Leverage existing Zustand store for user preferences

## Open Questions

1. **Should we preserve original sections?** 
   - Decision: Replace entirely with categorized rows for better discovery
   - Alternative: Keep "Movies"/"TV Shows" as first rows, then add categorized rows below

2. **How many initial rows to show?**
   - Recommendation: 4-6 rows total (2-3 standard categories + 2-3 genre rows per type)
   - Can add "See all genres" button to expand

3. **Genre row placement?**
   - Recommendation: Group by media type (all movie rows together, all TV rows together)
   - Alternative: Interleave for more variety (may be confusing)

4. **Handling loading states for many simultaneous requests?**
   - Approach: Staggered loading or skeleton screens per row (already implemented)
   - Alternative: Skeleton for entire section (less precise)

## Definition of Done

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

**Plan saved to:** `.hermes/plans/2024-07-26_153000-movies-tv-discovery-hub-redesign.md`

Ready to execute using subagent-driven-development skill.