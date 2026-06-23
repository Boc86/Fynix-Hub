import type { ApiType } from '../preload/index'

declare global {
  interface Window {
    api: ApiType
  }
}

export interface MediaItem {
  id: number
  title: string
  overview: string
  posterPath: string | null
  backdropPath: string | null
  releaseDate: string
  voteAverage: number
  mediaType: 'movie' | 'tv'
  genreIds: number[]
}

export interface VideoList {
  results: Video[]
}

export interface MovieDetails extends MediaItem {
  runtime: number
  tagline: string
  status: string
  genres: Genre[]
  credits: Credits
  videos: VideoList
  productionCompanies: Company[]
}

export interface TvDetails extends MediaItem {
  seasons: Season[]
  numberOfSeasons: number
  numberOfEpisodes: number
  status: string
  genres: Genre[]
  credits: Credits
  videos: VideoList
  networks: Network[]
  createdBy: CreatedBy[]
}

export interface Company {
  id: number
  name: string
  logoPath: string | null
  originCountry: string
}

export interface Network {
  id: number
  name: string
  logoPath: string | null
  originCountry: string
}

export interface CreatedBy {
  id: number
  name: string
  profilePath: string | null
}

export interface Season {
  id: number
  seasonNumber: number
  name: string
  overview: string
  posterPath: string | null
  airDate: string
  episodeCount: number
}

export interface Episode {
  id: number
  episodeNumber: number
  seasonNumber: number
  name: string
  overview: string
  stillPath: string | null
  airDate: string
  voteAverage: number
}

export interface Genre {
  id: number
  name: string
}

export interface Credits {
  cast: CastMember[]
  crew: CrewMember[]
}

export interface CastMember {
  id: number
  name: string
  character: string
  profilePath: string | null
}

export interface CrewMember {
  id: number
  name: string
  job: string
  profilePath: string | null
}

export interface Video {
  id: string
  key: string
  name: string
  site: string
  type: string
}

export interface TraktDeviceCode {
  deviceCode: string
  userCode: string
  verificationUrl: string
  expiresIn: number
  interval: number
}

export interface TorrentResult {
  title: string
  seeders: number
  leechers: number
  size: number
  magnetUri: string
  infoHash: string
  indexer: string
  quality: string
}

export interface IntroSegment {
  type: 'intro' | 'recap' | 'credits'
  startMs: number | null
  endMs: number | null
  durationMs: number | null
  startsAtBeginning: boolean
  endsAtMediaEnd: boolean
}
