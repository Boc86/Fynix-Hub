const GITHUB_RAW = 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries'

const COUNTRY_DIR: Record<string, string> = {
  us: 'united-states',
  gb: 'united-kingdom',
  fr: 'france',
  de: 'germany',
  it: 'italy',
  es: 'spain',
  pt: 'portugal',
  nl: 'netherlands',
  ca: 'canada',
  au: 'australia',
  br: 'brazil',
  mx: 'mexico',
  ar: 'argentina',
  in: 'india',
  hk: 'hong-kong',
  my: 'malaysia',
  se: 'nordic',
  no: 'nordic',
  dk: 'nordic',
  ie: 'ireland',
  nz: 'new-zealand',
  ru: 'russia',
  id: 'indonesia',
  at: 'austria',
  be: 'belgium',
  cl: 'chile',
  pl: 'poland',
  cz: 'czech-republic',
  ro: 'romania',
  hu: 'hungary',
  gr: 'greece',
  tr: 'turkey',
  za: 'south-africa',
  il: 'israel',
  ae: 'united-arab-emirates',
  ua: 'ukraine',
  ph: 'philippines',
  sg: 'singapore',
  rs: 'serbia',
  hr: 'croatia',
  si: 'slovenia',
  bg: 'bulgaria',
  az: 'azerbaijan',
}

const COUNTRY_SUFFIX: Record<string, string> = {
  us: 'us', gb: 'uk', fr: 'fr', de: 'de', it: 'it', es: 'es', pt: 'pt', nl: 'nl',
  ca: 'ca', au: 'au', br: 'br', mx: 'mx', ar: 'ar', in: 'in', hk: 'hk', my: 'my',
  se: 'se', no: 'no', dk: 'dk', ie: 'ie', nz: 'nz', ru: 'ru', id: 'id', at: 'at',
  be: 'be', cl: 'cl', pl: 'pl', cz: 'cz', ro: 'ro', hu: 'hu', gr: 'gr', tr: 'tr',
  za: 'za', il: 'il', ae: 'ae', ua: 'ua', ph: 'ph', sg: 'sg', rs: 'rs', hr: 'hr',
  si: 'si', bg: 'bg', az: 'az',
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function lookupLogo(channelName: string, countryCode: string): string | null {
  const dir = COUNTRY_DIR[countryCode]
  const suffix = COUNTRY_SUFFIX[countryCode]
  if (!dir || !suffix) return null

  const slug = normalizeName(channelName)
  if (!slug) return null

  return `${GITHUB_RAW}/${dir}/${slug}-${suffix}.png`
}
