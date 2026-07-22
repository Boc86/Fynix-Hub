import { http, HttpResponse } from 'msw'

const TMDB_BASE = 'https://api.themoviedb.org/3'

export const handlers = [
  http.get(`${TMDB_BASE}/trending/:type/:window`, () => {
    return HttpResponse.json({
      results: [
        { id: 1, title: 'Trending Movie', name: 'Trending Movie', media_type: 'movie', vote_average: 8.5, poster_path: '/poster.jpg', backdrop_path: '/backdrop.jpg', genre_ids: [28, 12], release_date: '2024-01-01', first_air_date: '2024-01-01' },
      ],
    })
  }),

  http.get(`${TMDB_BASE}/:type/popular`, () => {
    return HttpResponse.json({
      results: [
        { id: 2, title: 'Popular Movie', name: 'Popular Movie', media_type: 'movie', vote_average: 7.5, poster_path: '/poster2.jpg', backdrop_path: '/backdrop2.jpg', genre_ids: [35], release_date: '2024-06-01', first_air_date: '2024-06-01' },
      ],
    })
  }),

  http.get(`${TMDB_BASE}/:type/:id`, () => {
    return HttpResponse.json({
      id: 1,
      title: 'Test Movie',
      name: 'Test Movie',
      overview: 'A test movie.',
      vote_average: 8.0,
      poster_path: '/poster.jpg',
      backdrop_path: '/backdrop.jpg',
      genres: [{ id: 28, name: 'Action' }],
      credits: { cast: [], crew: [] },
      videos: { results: [] },
    })
  }),

  http.get(`${TMDB_BASE}/:type/:id/external_ids`, () => {
    return HttpResponse.json({ imdb_id: 'tt1234567' })
  }),

  http.get(`${TMDB_BASE}/search/:type`, ({ request }) => {
    const url = new URL(request.url)
    const query = url.searchParams.get('query')
    return HttpResponse.json({
      results: [
        { id: 10, title: query || 'Search Result', name: query || 'Search Result', media_type: 'movie', vote_average: 7.0, poster_path: '/poster.jpg', backdrop_path: '/backdrop.jpg', genre_ids: [], release_date: '2024-01-01', first_air_date: '2024-01-01' },
      ],
    })
  }),

  http.get(`${TMDB_BASE}/genre/:type/list`, () => {
    return HttpResponse.json({
      genres: [{ id: 28, name: 'Action' }, { id: 35, name: 'Comedy' }],
    })
  }),
]
