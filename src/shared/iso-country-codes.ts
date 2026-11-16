// ─── ISO 3166-1 alpha-2 country codes ────────────────────────────────────────
// Static table — replaces the live country list from the (now defunct)
// api.cdnlivetv.is "dami-tv" service. Source: ISO 3166-1 alpha-2 codes
// (https://reftables.net/iso-country-codes.html). Keys are lowercase alpha-2.
// Pure data + pure functions: safe to import from main, preload and renderer.

export const ISO_COUNTRY_NAMES: Record<string, string> = {
  af: 'Afghanistan', ax: 'Åland Islands', al: 'Albania', dz: 'Algeria',
  as: 'American Samoa', ad: 'Andorra', ao: 'Angola', ai: 'Anguilla',
  aq: 'Antarctica', ag: 'Antigua and Barbuda', ar: 'Argentina', am: 'Armenia',
  aw: 'Aruba', au: 'Australia', at: 'Austria', az: 'Azerbaijan', bs: 'Bahamas',
  bh: 'Bahrain', bd: 'Bangladesh', bb: 'Barbados', by: 'Belarus', be: 'Belgium',
  bz: 'Belize', bj: 'Benin', bm: 'Bermuda', bt: 'Bhutan', bo: 'Bolivia',
  bq: 'Bonaire, Sint Eustatius and Saba', ba: 'Bosnia and Herzegovina',
  bw: 'Botswana', bv: 'Bouvet Island', br: 'Brazil', io: 'British Indian Ocean Territory',
  bn: 'Brunei', bg: 'Bulgaria', bf: 'Burkina Faso', bi: 'Burundi', cv: 'Cabo Verde',
  kh: 'Cambodia', cm: 'Cameroon', ca: 'Canada', ky: 'Cayman Islands',
  cf: 'Central African Republic', td: 'Chad', cl: 'Chile', cn: 'China',
  cx: 'Christmas Island', cc: 'Cocos (Keeling) Islands', co: 'Colombia',
  km: 'Comoros', cg: 'Congo', cd: 'Congo (DRC)', ck: 'Cook Islands',
  cr: 'Costa Rica', hr: 'Croatia', cu: 'Cuba', cw: 'Curaçao', cy: 'Cyprus',
  cz: 'Czech Republic', dk: 'Denmark', dj: 'Djibouti', dm: 'Dominica',
  do: 'Dominican Republic', ec: 'Ecuador', eg: 'Egypt', sv: 'El Salvador',
  gq: 'Equatorial Guinea', er: 'Eritrea', ee: 'Estonia', sz: 'Eswatini',
  et: 'Ethiopia', fk: 'Falkland Islands', fo: 'Faroe Islands', fj: 'Fiji',
  fi: 'Finland', fr: 'France', gf: 'French Guiana', pf: 'French Polynesia',
  tf: 'French Southern Territories', ga: 'Gabon', gm: 'Gambia', ge: 'Georgia',
  de: 'Germany', gh: 'Ghana', gi: 'Gibraltar', gr: 'Greece', gl: 'Greenland',
  gd: 'Grenada', gp: 'Guadeloupe', gu: 'Guam', gt: 'Guatemala', gg: 'Guernsey',
  gn: 'Guinea', gw: 'Guinea-Bissau', gy: 'Guyana', ht: 'Haiti', hm: 'Heard Island and McDonald Islands',
  va: 'Holy See', hn: 'Honduras', hk: 'Hong Kong', hu: 'Hungary', is: 'Iceland',
  in: 'India', id: 'Indonesia', ir: 'Iran', iq: 'Iraq', ie: 'Ireland',
  im: 'Isle of Man', il: 'Israel', it: 'Italy', jm: 'Jamaica', jp: 'Japan',
  je: 'Jersey', jo: 'Jordan', kz: 'Kazakhstan', ke: 'Kenya', ki: 'Kiribati',
  kp: 'North Korea', kr: 'South Korea', kw: 'Kuwait', kg: 'Kyrgyzstan',
  la: 'Laos', lv: 'Latvia', lb: 'Lebanon', ls: 'Lesotho', lr: 'Liberia',
  ly: 'Libya', li: 'Liechtenstein', lt: 'Lithuania', lu: 'Luxembourg',
  mo: 'Macao', mg: 'Madagascar', mw: 'Malawi', my: 'Malaysia', mv: 'Maldives',
  ml: 'Mali', mt: 'Malta', mh: 'Marshall Islands', mq: 'Martinique', mr: 'Mauritania',
  mu: 'Mauritius', yt: 'Mayotte', mx: 'Mexico', fm: 'Micronesia', md: 'Moldova',
  mc: 'Monaco', mn: 'Mongolia', me: 'Montenegro', ms: 'Montserrat', ma: 'Morocco',
  mz: 'Mozambique', mm: 'Myanmar', na: 'Namibia', nr: 'Nauru', np: 'Nepal',
  nl: 'Netherlands', nc: 'New Caledonia', nz: 'New Zealand', ni: 'Nicaragua',
  ne: 'Niger', ng: 'Nigeria', nu: 'Niue', nf: 'Norfolk Island', mk: 'North Macedonia',
  mp: 'Northern Mariana Islands', no: 'Norway', om: 'Oman', pk: 'Pakistan',
  pw: 'Palau', ps: 'Palestine', pa: 'Panama', pg: 'Papua New Guinea', py: 'Paraguay',
  pe: 'Peru', ph: 'Philippines', pn: 'Pitcairn', pl: 'Poland', pt: 'Portugal',
  pr: 'Puerto Rico', qa: 'Qatar', re: 'Réunion', ro: 'Romania', ru: 'Russia',
  rw: 'Rwanda', bl: 'Saint Barthélemy', sh: 'Saint Helena', kn: 'Saint Kitts and Nevis',
  lc: 'Saint Lucia', mf: 'Saint Martin', pm: 'Saint Pierre and Miquelon',
  vc: 'Saint Vincent and the Grenadines', ws: 'Samoa', sm: 'San Marino',
  st: 'Sao Tome and Principe', sa: 'Saudi Arabia', sn: 'Senegal', rs: 'Serbia',
  sc: 'Seychelles', sl: 'Sierra Leone', sg: 'Singapore', sx: 'Sint Maarten',
  sk: 'Slovakia', si: 'Slovenia', sb: 'Solomon Islands', so: 'Somalia',
  za: 'South Africa', gs: 'South Georgia and the South Sandwich Islands',
  ss: 'South Sudan', es: 'Spain', lk: 'Sri Lanka', sd: 'Sudan', sr: 'Suriname',
  sj: 'Svalbard and Jan Mayen', se: 'Sweden', ch: 'Switzerland', sy: 'Syria',
  tw: 'Taiwan', tj: 'Tajikistan', tz: 'Tanzania', th: 'Thailand', tl: 'Timor-Leste',
  tg: 'Togo', tk: 'Tokelau', to: 'Tonga', tt: 'Trinidad and Tobago', tn: 'Tunisia',
  tr: 'Turkey', tm: 'Turkmenistan', tc: 'Turks and Caicos Islands', tv: 'Tuvalu',
  ug: 'Uganda', ua: 'Ukraine', ae: 'United Arab Emirates', gb: 'United Kingdom',
  us: 'United States', um: 'United States Minor Outlying Islands', uy: 'Uruguay',
  uz: 'Uzbekistan', vu: 'Vanuatu', ve: 'Venezuela', vn: 'Vietnam', vg: 'British Virgin Islands',
  vi: 'US Virgin Islands', wf: 'Wallis and Futuna', eh: 'Western Sahara', ye: 'Yemen',
  zm: 'Zambia', zw: 'Zimbabwe',
}

/** True when `code` is a valid ISO 3166-1 alpha-2 code (case-insensitive). */
export function isIsoAlpha2(code: string): boolean {
  return !!code && code.length === 2 && code.toLowerCase() in ISO_COUNTRY_NAMES
}

/** Regional-indicator flag emoji for an alpha-2 code; 🌍 when unknown. */
export function countryFlagEmoji(code: string): string {
  if (!code || code.length !== 2) return '\u{1F30D}'
  const c = code.toUpperCase()
  if (!isIsoAlpha2(c)) return '\u{1F30D}'
  return String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65) + String.fromCodePoint(0x1F1E6 + c.charCodeAt(1) - 65)
}

export interface CountryOption {
  code: string
  name: string
  flag: string
  count: number
}

/**
 * Build the "available countries" list from a set of channels by counting
 * each channel's countryCode. Names/flags come from the static ISO table,
 * so this never depends on a live API. Unknown codes still appear (named by
 * their uppercase code, globe flag) so user playlists with non-ISO codes
 * remain filterable. Sorted by count desc, then name.
 */
export function countCountriesByCode(channels: Array<{ countryCode?: string }>): CountryOption[] {
  const map = new Map<string, number>()
  for (const ch of channels) {
    const code = (ch.countryCode || '').toLowerCase()
    if (!code) continue
    map.set(code, (map.get(code) || 0) + 1)
  }
  return Array.from(map.entries())
    .map(([code, count]) => ({
      code,
      name: ISO_COUNTRY_NAMES[code] || code.toUpperCase(),
      flag: countryFlagEmoji(code),
      count,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
