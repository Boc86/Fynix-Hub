/**
 * IPTV Scraper Service
 * Port of iptvgen.pages.dev scraper to Electron main process.
 * Scrapes Reddit for Xtream portal candidates, verifies them via player_api.php,
 * and saves the validated portals to xtream-portals.json for consumption by
 * xtream-portal.service.ts (which feeds iptv-m3u.service.ts).
 */

import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { TextDecoder, TextEncoder } from 'util'

// Reuse the existing Xtream portal service for persistence
import { getPortals, addPortal, XtreamPortal } from './xtream-portal.service'

interface VerifiedPortal {
  portal: XtreamPortal
  name: string
  expiry: string
  maxConns: string
  activeConns: string
}

interface RedditPost {
  data: { title: string; selftext: string }
}

interface RedditPageResult {
  posts: RedditPost[]
  next: string | null
}

const CONFIG = {
  CATALOG_SUBS: ['IPTV_ZONENEW', 'FreeIPTV', 'iptvguru', 'IPTVfree'] as const,
  OAUTH_UA: 'PlayTorrio/1.3.6 (by /u/PlayTorrioApp)',
  OAUTH_CLIENT_IDS: [
    'ohXpoqrZYub1kg',
    'NOe2iKrPPzwscA',
    'JrPdG8Z6dkWNxA',
  ] as const,
  VERIFY_PARALLEL: 4,
  PASTES_PER_POST: 4,
  MAX_PAGES_PER_RUN: 5,
} as const

const PASTE_DOMAINS = [
  'paste.sh',
  'pastebin.com',
  'justpaste.it',
  'controlc.com',
  'pastes.dev',
  'text.is',
  'rentry.co',
] as const

const JUNK_TOKENS = [
  'type=m3u',
  'output=ts',
  'password=',
  'username=',
  'password',
  'username',
] as const

const te = new TextEncoder()
const td = new TextDecoder('utf-8', { fatal: false })

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, '')
  const bin = Buffer.from(clean, 'base64')
  return new Uint8Array(bin)
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  const totalLength = arrs.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrs) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

function md5(bytes: Uint8Array): Uint8Array {
  const hash = crypto.createHash('md5')
  hash.update(Buffer.from(bytes))
  return new Uint8Array(hash.digest())
}

function pbkdf2Sha512(
  passBytes: Uint8Array,
  salt: Uint8Array,
  iters: number,
  dkLen: number
): Uint8Array {
  const key = crypto.pbkdf2Sync(
    Buffer.from(passBytes),
    Buffer.from(salt),
    iters,
    dkLen,
    'sha512'
  )
  return new Uint8Array(key)
}

function aesCbcDecrypt(
  ct: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array
): string {
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), Buffer.from(iv))
  let decrypted = decipher.update(Buffer.from(ct))
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return td.decode(decrypted)
}

function decryptPasteSh(
  urlWithHash: string,
  fetchTextFn: (url: string, signal?: AbortSignal) => Promise<string>
): Promise<string> {
  const hashIdx = urlWithHash.indexOf('#')
  if (hashIdx <= 0) throw new Error('needs #clientkey')
  const baseUrl = urlWithHash.slice(0, hashIdx)
  const clientKey = urlWithHash.slice(hashIdx + 1)
  const id = baseUrl.slice(baseUrl.lastIndexOf('/') + 1)
  if (!id) throw new Error('bad paste id')

  return fetchTextFn(baseUrl + '.txt').then(raw => {
    const lines = raw.split('\n')
    const serverKey = (lines[0] || '').trim()
    const b64 = lines.slice(1).join('').trim()
    if (!b64) throw new Error('no ciphertext')
    const cb = b64ToBytes(b64)
    if (cb.length < 17) throw new Error('ciphertext too short')
    const salt = cb.slice(8, 16)
    const ct = cb.slice(16)
    const passBytes = te.encode(id + serverKey + clientKey + 'https://paste.sh')

    try {
      const keyIv = pbkdf2Sha512(passBytes, salt, 1, 48)
      return aesCbcDecrypt(ct, keyIv.slice(0, 32), keyIv.slice(32, 48))
    } catch (_) {
      const [k, iv] = evpBytesToKey(passBytes, salt, 32, 16)
      return aesCbcDecrypt(ct, k, iv)
    }
  })
}

function evpBytesToKey(
  passBytes: Uint8Array,
  salt: Uint8Array,
  keyLen: number,
  ivLen: number
): [Uint8Array, Uint8Array] {
  const need = keyLen + ivLen
  let prev: Uint8Array = new Uint8Array(0)
  const chunks: Uint8Array[] = []
  let total = 0

  while (total < need) {
    const concatArr = concat(prev, passBytes, salt)
    const hash = md5(concatArr)
    chunks.push(hash)
    total += hash.length
    prev = hash
  }

  const all = concat(...chunks)
  return [all.slice(0, keyLen), all.slice(keyLen, keyLen + ivLen)]
}

function cleanPortalUrl(raw: string): string {
  let c = raw.replace(/\s+/g, '')
  const q = c.indexOf('?')
  if (q >= 0) c = c.slice(0, q)
  if (c.includes('@')) c = 'http://' + c.slice(c.lastIndexOf('@') + 1)
  c = c.replace(/(get|live|portal|c|index|playlist|player_api|xmltv|index\.php|portal\.php)\.php$/i, '')
  while (c.endsWith('/')) c = c.slice(0, -1)
  if (!/^https?:/i.test(c)) c = 'http://' + c
  return c
}

function cleanCred(raw: string): string {
  let s = raw
  while (s.startsWith('=')) s = s.slice(1)
  return (s.split(/[\s\n&?]/)[0] || '').trim()
}

function isJunkCode(text: string): boolean {
  const markers = [
    'Array.isArray',
    'prototype.',
    'function(',
    'var ',
    'const ',
    'let ',
    'return!',
    'void ',
    '.message}',
    'window.',
    'document.',
  ]
  let h = 0
  for (const m of markers) {
    if (text.includes(m)) h++
    if (h >= 2) return true
  }
  return false
}

const RE_URL_PARAM =
  /(https?:\/\/[^?\s"'<]+)\?(?:[^\s"']*?&)?(?:username|user)=([^&\s"']+)\s*&(?:password|pass)=([^&\s"']+)/gi
const RE_LABEL =
  /(?:Portal|Host(?:\s*URL)?|H[oâ¬s][tT]|Panel|Real|URL|ï¿"?ï¿Ÿï¿Ÿ)\W*?(https?:\/\/[^<\s"']+)[\s\S]{1,500}?(?:Username|Usu[ï¿½a]rio|Usuario|User|Us[ï¿½]r|Us[ï¿°][aar][ï¿ªi][oâ¬])\W*?([^\s|<"'\n]+)[\s\S]{1,200}?(?:Password|Senha|Contrase[ï¿±a]ada|Pass|P[aa]ss|S[ï¿™eh][aa]|ï¿ž)\W*?([^\s|<"'\n]+)/gi
const RE_B64_HTTP = /aHR0c[A-Za-z0-9+/=]{10,}/g

function extractPortals(rawText: string): Array<{ url: string; user: string; pass: string }> {
  if (!rawText || rawText.length < 15 || isJunkCode(rawText)) return []
  const decoded = rawText
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  const cleaned = decoded
    .replace(/<p>/gi, '')
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')

  const acc = new Map<string, { url: string; user: string; pass: string }>()
  for (const m of cleaned.matchAll(RE_URL_PARAM))
    finalize(acc, m[1], m[2], m[3])
  for (const m of cleaned.matchAll(RE_LABEL)) finalize(acc, m[1], m[2], m[3])
  return Array.from(acc.values())
}

function finalize(
  acc: Map<string, { url: string; user: string; pass: string }>,
  rawUrl: string,
  rawUser: string,
  rawPass: string
): void {
  const url = cleanPortalUrl(rawUrl)
  const user = cleanCred(rawUser)
  const pass = cleanCred(rawPass)
  if (!url || user.length < 3 || pass.length < 3) return
  if (user.includes('http') || pass.includes('http')) return
  const lu = user.toLowerCase()
  const lp = pass.toLowerCase()
  for (const j of JUNK_TOKENS) if (lu.includes(j) || lp.includes(j)) return
  const key = url + '|' + user + '|' + pass
  if (!acc.has(key)) acc.set(key, { url, user, pass })
}

const PASTE_DOMAINS_SET = new Set(PASTE_DOMAINS)

function isPasteSite(u: string): boolean {
  for (const d of PASTE_DOMAINS_SET) {
    if (u.includes(d)) return true
  }
  return false
}

function lastSegment(url: string): string {
  let s = url
  const h = s.indexOf('#')
  if (h >= 0) s = s.slice(0, h)
  const q = s.indexOf('?')
  if (q >= 0) s = s.slice(0, q)
  const sl = s.lastIndexOf('/')
  return sl >= 0 ? s.slice(sl + 1) : s
}

function pasteKey(u: string): string {
  let s = u.trim()
  if (!s.includes('paste.sh/')) {
    const h = s.indexOf('#')
    if (h >= 0) s = s.slice(0, h)
  }
  return s.replace(/\/+$/, '').toLowerCase()
}

async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(url, {
    signal,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FynixHub/2.1)' },
  })
  if (!response.ok) throw new Error('HTTP ' + response.status)
  return response.text()
}

async function verifyPortal(
  portal: XtreamPortal,
  signal?: AbortSignal
): Promise<VerifiedPortal | null> {
  const url = portal.url + '/player_api.php?username=' + encodeURIComponent(portal.user) + '&password=' + encodeURIComponent(portal.pass)
  let text: string
  try {
    text = await fetchText(url, signal)
  } catch (_) {
    return null
  }
  let root: any
  try {
    root = JSON.parse(text)
  } catch (_) {
    return null
  }
  if (!root || typeof root !== 'object') return null
  const info =
    (root.user_info && typeof root.user_info === 'object')
      ? root.user_info
      : root
  const auth = info.auth != null ? String(info.auth) : ''
  const status = (info.status || '').toString().toLowerCase()
  const ok =
    auth === '1' ||
    status === 'active' ||
    ('user_info' in root && typeof root.user_info === 'object')
  if (!ok) return null
  const expiryRaw = info.exp_date ?? ''
  const expiry =
    expiryRaw && !isNaN(Date.parse(expiryRaw))
      ? new Date(expiryRaw).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
        })
      : expiryRaw || 'Unknown'
  return {
    portal,
    name: (info.username || portal.user) + '',
    expiry,
    maxConns: (info.max_connections != null ? info.max_connections : '1') + '',
    activeConns: (info.active_cons != null ? info.active_cons : '0') + '',
  }
}

class RedditOAuth {
  private tokenValue: string | null = null
  private tokenExpiry: number = 0
  private clientIdx: number = 0

  async getToken(): Promise<string | null> {
    if (this.tokenValue && Date.now() < this.tokenExpiry) return this.tokenValue

    for (let i = 0; i < CONFIG.OAUTH_CLIENT_IDS.length; i++) {
      const idx = (this.clientIdx + i) % CONFIG.OAUTH_CLIENT_IDS.length
      const clientId = CONFIG.OAUTH_CLIENT_IDS[idx]
      try {
        const tokenResp = await fetch('https://www.reddit.com/api/v1/access_token', {
          method: 'POST',
          headers: {
            'User-Agent': CONFIG.OAUTH_UA,
            Authorization: 'Basic ' + Buffer.from(clientId + ':').toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body:
            'grant_type=https%3A%2F%2Foauth.reddit.com%2Fgrants%2Finstalled_client&device_id=DO_NOT_TRACK_THIS_DEVICE',
        })
        if (!tokenResp.ok) continue
        const data = await tokenResp.json()
        if (data.access_token) {
          this.tokenValue = data.access_token
          this.tokenExpiry = Date.now() + ((data.expires_in ?? 3600) - 60) * 1000
          this.clientIdx = idx
          return this.tokenValue
        }
      } catch (_) {
        continue
      }
    }
    this.tokenValue = null
    this.tokenExpiry = 0
    this.clientIdx = (this.clientIdx + 1) % CONFIG.OAUTH_CLIENT_IDS.length
    return null
  }
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#32;/g, ' ')
}

class RedditFetcher {
  private oauth = new RedditOAuth()
  after: string | null = null
  exhausted: boolean = false
  private subIndex: number = 0

  async fetchPage(): Promise<RedditPageResult | null> {
    if (this.exhausted) return null

    const sub = CONFIG.CATALOG_SUBS[this.subIndex]
    if (!sub) return { posts: [], next: null }

    let result = await this.fetchOAuthPage(sub, this.after)
    if (!result) {
      result = await this.fetchRssPage(sub, this.after)
    }
    if (!result || result.posts.length === 0) {
      this.subIndex++
      if (this.subIndex >= CONFIG.CATALOG_SUBS.length) {
        this.exhausted = true
        return { posts: [], next: null }
      }
      this.after = null
      return this.fetchPage()
    }

    if (result.next) {
      this.after = this.subIndex + ':' + result.next
    } else if (this.subIndex + 1 < CONFIG.CATALOG_SUBS.length) {
      this.after = (this.subIndex + 1) + ':'
    } else {
      this.exhausted = true
    }

    return result
  }

  private async fetchOAuthPage(
    sub: string,
    after: string | null
  ): Promise<RedditPageResult | null> {
    const token = await this.oauth.getToken()
    if (!token) return null

    const url = 'https://oauth.reddit.com/r/' + sub + '/new?limit=100&sort=new&raw_json=1' +
      (after ? '&after=' + encodeURIComponent(after) : '')
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': CONFIG.OAUTH_UA,
          Authorization: 'Bearer ' + token,
        },
      })
      if (resp.status === 401 || resp.status === 403) {
        return null
      }
      if (!resp.ok) return null
      const text = await resp.text()
      if (!text) return null
      const t = text.trimStart()
      if (!t.startsWith('{') && !t.startsWith('[')) return null
      const root = JSON.parse(text)
      const data = (root && root.data) || {}
      const posts = data.children || []
      const nextRaw = data.after
      const hasMore = nextRaw && String(nextRaw) !== 'null' && nextRaw !== ''
      return {
        posts: posts.map((p: any) => p.data || {}),
        next: hasMore ? String(nextRaw) : null,
      }
    } catch (_) {
      return null
    }
  }

  private async fetchRssPage(
    sub: string,
    after: string | null
  ): Promise<RedditPageResult | null> {
    const url = 'https://www.reddit.com/r/' + sub + '/new/.rss?limit=25' +
      (after ? '&after=' + encodeURIComponent(after) : '')
    try {
      const rssBody = await fetchText(url)
      if (!rssBody || !rssBody.includes('<entry>')) return null
      const entries = [...rssBody.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
      const postIds = [...rssBody.matchAll(/<id>(t3_[^<]+)<\/id>/g)].map((m) => m[1])
      const lastPostId = postIds.length > 0 ? postIds[postIds.length - 1] : null
      const hasMore = lastPostId && entries.length >= 20
      const posts = entries.map((entry) => {
        const text = entry[1]
        const titleM = /<title[^>]*>([\s\S]*?)<\/title>/.exec(text)
        const contentM = /<content[^>]*>([\s\S]*?)<\/content>/.exec(text)
        const title = decodeXmlEntities(titleM ? titleM[1] : '')
        const rawContent = decodeXmlEntities(contentM ? contentM[1] : '')
        const selftext = rawContent
          .replace(/<(?:p|br|div|li|h\d)[^>]*>/gi, '\n')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        return { data: { title, selftext } }
      })
      return {
        posts,
        next: hasMore ? lastPostId : null,
      }
    } catch (_) {
      return null
    }
  }
}

export class IptvScraperService {
  private candidatesMap = new Map<string, { url: string; user: string; pass: string }>()
  private triedSet = new Set<string>()
  private verifiedMap = new Map<string, VerifiedPortal>()
  private cancelled = false
  private seenPastes = new Set<string>()
  private redditFetcher = new RedditFetcher()
  private lastScrapedAt: number | null = null

  constructor() {
    this.loadSaved()
    this.loadSeenPastes()
    this.loadState()
  }

  private loadSaved(): void {
    const portals = getPortals()
    for (const p of portals) {
      const key = p.url + '|' + p.user + '|' + p.pass
      this.triedSet.add(key)
    }
  }

  private loadSeenPastes(): void {
    try {
      const userDataPath = app.getPath('userData')
      const filePath = path.join(userDataPath, 'iptv-seen-pastes.json')
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
        if (Array.isArray(data)) {
          for (const url of data) this.seenPastes.add(url)
        }
      }
    } catch (_) {
      // Ignore errors
    }
  }

  private persistSeenPastes(): void {
    try {
      const arr = [...this.seenPastes]
      const trimmed = arr.length > 5000 ? arr.slice(arr.length - 5000) : arr
      const userDataPath = app.getPath('userData')
      const filePath = path.join(userDataPath, 'iptv-seen-pastes.json')
      fs.writeFileSync(filePath, JSON.stringify(trimmed, null, 2), 'utf-8')
    } catch (_) {
      // Ignore errors
    }
  }

  private statePath(): string {
    return path.join(app.getPath('userData'), 'iptv-scrape-state.json')
  }

  private loadState(): void {
    try {
      const filePath = this.statePath()
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
        if (typeof data?.lastScrapedAt === 'number') this.lastScrapedAt = data.lastScrapedAt
      }
    } catch (_) {
      // Ignore errors
    }
  }

  private persistState(): void {
    try {
      fs.writeFileSync(this.statePath(), JSON.stringify({ lastScrapedAt: this.lastScrapedAt }, null, 2), 'utf-8')
    } catch (_) {
      // Ignore errors
    }
  }

  /** Timestamp (epoch ms) of the last completed harvest, or null if never run. */
  getLastScrapeTime(): number | null {
    return this.lastScrapedAt
  }

  private portalKey(p: { url: string; user: string; pass: string }): string {
    return p.url + '|' + p.user + '|' + p.pass
  }

  /**
   * Harvest verified portals from Reddit.
   * Returns the number of newly verified portals.
   */
  async harvest(addCount: number): Promise<number> {
    this.cancelled = false
    const startCount = this.verifiedMap.size
    const goal = startCount + addCount

    const showVerified = (v: VerifiedPortal) => {
      const key = this.portalKey(v.portal)
      if (this.verifiedMap.has(key)) return
      this.verifiedMap.set(key, v)
      addPortal(v.portal.url, v.portal.user, v.portal.pass)
    }

    const ctx = this

    async function verifyUntil(
      candidates: Array<{ url: string; user: string; pass: string }>,
      need: number,
      onAlive: (v: VerifiedPortal) => void
    ): Promise<number> {
      let nextIdx = 0
      let alive = 0
      let stopped = false
      const batchCtrl = new AbortController()
      const stopAll = () => {
        stopped = true
        batchCtrl.abort()
      }

      async function worker() {
        while (!stopped && !ctx.cancelled) {
          if (alive >= need) {
            stopAll()
            return
          }
          const idx = nextIdx++
          if (idx >= candidates.length) return
          const p = candidates[idx]
          const key = ctx.portalKey(p)
          ctx.triedSet.add(key)
          try {
            const v = await ctx.verifyPortal(p, batchCtrl.signal)
            if (stopped || ctx.cancelled) return
            if (v && alive < need) {
              alive++
              onAlive(v)
              if (alive >= need) {
                stopAll()
                return
              }
            }
          } catch (_) {
            // Continue on error
          }
        }
      }

      const n = Math.min(CONFIG.VERIFY_PARALLEL, candidates.length)
      const promises: Promise<void>[] = []
      for (let i = 0; i < n; i++) promises.push(worker())
      await Promise.all(promises)
      return alive
    }

    const verifyFresh = async (
      candidates: Array<{ url: string; user: string; pass: string }>
    ): Promise<void> => {
      const todo = candidates.filter(
        (p) =>
          !ctx.triedSet.has(ctx.portalKey(p)) &&
          !ctx.verifiedMap.has(ctx.portalKey(p))
      )
      if (todo.length === 0) return
      await verifyUntil(todo, goal - ctx.verifiedMap.size, showVerified)
    }

    try {
      // 1) Use leftover candidates from prior runs
      const leftover = Array.from(this.candidatesMap.values()).filter(
        (p) =>
          !this.triedSet.has(this.portalKey(p)) &&
          !this.verifiedMap.has(this.portalKey(p))
      )
      if (
        leftover.length > 0 &&
        !this.isGoalReached(goal) &&
        !this.cancelled
      ) {
        await verifyFresh(leftover)
      }

      // 2) Stream Reddit pages
      let pagesFetched = 0
      while (
        !this.isGoalReached(goal) &&
        !this.cancelled &&
        !this.redditFetcher.exhausted
      ) {
        if (pagesFetched >= CONFIG.MAX_PAGES_PER_RUN) break
        pagesFetched++
        const pageResult = await this.redditFetcher.fetchPage()
        if (!pageResult) break
        const { posts, next } = pageResult
        this.redditFetcher.after = next ?? null

        for (const post of posts) {
          if (this.isGoalReached(goal) || this.cancelled) break
          const fresh = await this.extractCandidatesFromPost(
            post,
            'page ' + pagesFetched
          )
          if (fresh.length === 0) continue
          await verifyFresh(fresh)
        }
      }

      const got = this.verifiedMap.size - startCount
      this.persistSeenPastes()
      // Stamp completion so the startup stale-check knows this run happened
      // even when nothing new was found.
      this.lastScrapedAt = Date.now()
      this.persistState()
      return got
    } finally {
      this.cancelled = false
    }
  }

  private isGoalReached(goal: number): boolean {
    return this.verifiedMap.size >= goal
  }

  private async extractCandidatesFromPost(
    postData: RedditPost,
    pageLabel: string
  ): Promise<Array<{ url: string; user: string; pass: string }>> {
    const title = postData.data.title || ''
    const body = (title + ' ' + (postData.data.selftext || '')).trim()
    if (!body) return []

    const before = this.candidatesMap.size
    const pushCandidate = (p: { url: string; user: string; pass: string }) => {
      const key = this.portalKey(p)
      if (!this.candidatesMap.has(key)) this.candidatesMap.set(key, p)
    }

    extractPortals(body).forEach(pushCandidate)

    const deepLinks = new Set<string>()
    for (const m of body.matchAll(RE_B64_HTTP)) {
      try {
        const dec = td.decode(b64ToBytes(m[0]))
        if (dec.startsWith('http') && isPasteSite(dec)) deepLinks.add(dec)
        else if (!dec.startsWith('http') && dec.includes(':'))
          extractPortals(dec).forEach(pushCandidate)
      } catch (_) {
        // Ignore decode errors
      }
    }

    for (const m of body.matchAll(
      /https?:\/\/(?:paste\.sh|pastebin\.com|justpaste\.it|controlc\.com|pastes\.dev|text\.is|rentry\.co)\/[A-Za-z0-9#_=\\-]+/g
    )) {
      deepLinks.add(m[0])
    }

    let dl = 0
    for (const link of deepLinks) {
      if (dl >= CONFIG.PASTES_PER_POST || this.cancelled) break
      const key = pasteKey(link)
      if (this.seenPastes.has(key)) continue
      this.seenPastes.add(key)
      dl++
      const text = await this.fetchPaste(link)
      if (!text) continue
      const found = extractPortals(text)
      found.forEach(pushCandidate)
    }

    this.persistSeenPastes()

    const fresh: Array<{ url: string; user: string; pass: string }> = []
    let i = 0
    for (const [k, p] of this.candidatesMap) {
      if (i++ < before) continue
      fresh.push(p)
    }
    return fresh
  }

  private async fetchPaste(url: string): Promise<string | null> {
    try {
      if (url.includes('paste.sh/') && url.includes('#')) {
        return await decryptPasteSh(url, fetchText)
      }
      if (url.includes('pastebin.com/') && !url.includes('/raw/')) {
        return await fetchText('https://pastebin.com/raw/' + lastSegment(url))
      }
      if (url.includes('pastes.dev/')) {
        return await fetchText('https://api.pastes.dev/' + lastSegment(url))
      }
      if (url.includes('rentry.co/') && !url.includes('/raw')) {
        return await fetchText('https://rentry.co/' + lastSegment(url) + '/raw')
      }
      return await fetchText(url)
    } catch (e) {
      return null
    }
  }

  async verifyPortal(
    portal: XtreamPortal,
    signal?: AbortSignal
  ): Promise<VerifiedPortal | null> {
    return await verifyPortal(portal, signal)
  }

  getVerifiedPortals(): ReadonlyMap<string, VerifiedPortal> {
    return this.verifiedMap
  }

  resetScrapeState(): void {
    this.candidatesMap.clear()
    this.triedSet.clear()
    this.redditFetcher = new RedditFetcher()
    this.cancelled = false
  }

  clearAll(): void {
    this.candidatesMap.clear()
    this.triedSet.clear()
    this.verifiedMap.clear()
    this.seenPastes.clear()
    this.redditFetcher = new RedditFetcher()
    this.cancelled = false
  }
}

export const iptvScraperService = new IptvScraperService()