/** Normalized channel from any Live TV provider. */
export interface LiveTVChannel {
  id: string
  name: string
  image: string
  logoImage: string
  countryCode: string
  countryName: string
  countryFlag: string
  playerUrl: string
  source: string
  status: string
  provider: 'cdnlive' | 'ondemand' | 'dlhd' | 'iptv-m3u'
}

/** Result of resolving a channel to a playable URL. */
export interface LiveTVStreamResult {
  hlsUrl?: string
  error?: string
}

/** Interface all Live TV providers must implement. */
export interface LiveTVProvider {
  readonly id: 'cdnlive' | 'ondemand' | 'dlhd' | 'iptv-m3u'
  readonly label: string
  getChannels(): Promise<LiveTVChannel[]>
  extractUrl(ch: { id: string; name: string; countryCode: string; playerUrl?: string }): Promise<LiveTVStreamResult>
}
