// ─── MDBList sync payload builders ───────────────────────────────────────────
// Pure functions, no Node/Electron imports — safe to import from BOTH the main
// process and the renderer. This file must stay dependency-free.
//
// MDBList /sync/watched and /sync/watched/remove accept:
//   { movies?: [{ ids: { tmdb } }] | null,
//     shows?: [{ ids: { tmdb }, seasons?: [{ number, episodes?: [{ number }] }] }] | null }
// NOTE: season entries use `number`, NOT `season`. Sending `{ season }` is
// silently ignored by the API, which is why episode/season marks appeared to
// "do nothing".

export interface MarkWatchedPayload {
  movies?: { ids: { tmdb: number } }[] | null
  shows?: { ids: { tmdb: number }; seasons?: { number: number; episodes?: { number: number }[] }[] }[] | null
}

export type WatchTargetType = 'movie' | 'tv' | 'episode' | 'season'

export interface WatchTarget {
  type: WatchTargetType
  tmdbId: number
  season?: number
  episode?: number
}

/**
 * Build the MDBList /sync/watched body from a watch target.
 * Used by App.tsx (context menu) and VideoPlayer.tsx (playback / player menu).
 */
export function buildMarkWatchedPayload(target: WatchTarget): MarkWatchedPayload {
  if (target.type === 'movie') {
    return { movies: [{ ids: { tmdb: target.tmdbId } }] }
  }
  if (target.type === 'episode') {
    return {
      shows: [{
        ids: { tmdb: target.tmdbId },
        seasons: [{ number: target.season!, episodes: [{ number: target.episode! }] }],
      }],
    }
  }
  if (target.type === 'season') {
    return {
      shows: [{
        ids: { tmdb: target.tmdbId },
        seasons: [{ number: target.season! }],
      }],
    }
  }
  // 'tv' → mark the whole show as watched
  return { shows: [{ ids: { tmdb: target.tmdbId } }] }
}

/**
 * Build the MDBList /sync/watched/remove body from a watch target.
 * Same shape as the markWatched payload.
 */
export function buildMarkUnwatchedPayload(target: WatchTarget): MarkWatchedPayload {
  return buildMarkWatchedPayload(target)
}

export interface ScrobblePayload {
  movie?: { ids: { tmdb: number } }
  show?: { ids: { tmdb: number }; season?: number; episode?: number }
  progress: number
  app_name: string
}

/**
 * Build the MDBList /scrobble/{start,pause,stop} body (MDBList-native shape,
 * NOT Trakt): movie is `{ movie: { ids }, progress }`; shows are
 * `{ show: { ids, season, episode }, progress }` with flat season/episode
 * integers on the show object. A separate top-level `episode` key is ignored
 * by the server, which would auto-resolve the wrong episode.
 */
export function buildScrobblePayload(tmdbId: number, mediaType: string, progress: number, season?: number, episode?: number): ScrobblePayload {
  const pct = Math.max(progress * 100, 1.0)
  if (mediaType === 'tv' && season !== undefined && episode !== undefined) {
    return {
      show: { ids: { tmdb: tmdbId }, season, episode },
      progress: pct,
      app_name: 'Fynix Hub',
    }
  }
  return {
    movie: { ids: { tmdb: tmdbId } },
    progress: pct,
    app_name: 'Fynix Hub',
  }
}