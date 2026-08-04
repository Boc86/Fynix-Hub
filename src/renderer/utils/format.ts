// Shared formatting helpers (DetailView + HeroBanner)

export function formatRuntime(minutes?: number): string {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function getClassification(media: any, country: string = 'US'): string | null {
  if (media?.releaseDates?.results) {
    const entry = media.releaseDates.results.find((r: any) => r.iso_3166_1 === country)
    if (entry?.releaseDates?.length) {
      const c = entry.releaseDates.find((d: any) => d.certification)
      if (c?.certification) return c.certification
    }
  }
  if (media?.contentRatings?.results) {
    const entry = media.contentRatings.results.find((r: any) => r.iso_3166_1 === country)
    if (entry?.rating) return entry.rating
  }
  return null
}
