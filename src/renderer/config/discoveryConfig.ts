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