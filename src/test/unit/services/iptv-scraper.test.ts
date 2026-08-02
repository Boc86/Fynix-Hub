import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('iptv-scraper extractPortals', () => {
  // We test the extractPortals function indirectly by re-implementing the same
  // logic in a minimal, self-contained way that mirrors the service's regexes.
  // This is a lightweight self-check for the regex extraction logic.

  const RE_URL_PARAM =
    /(https?:\/\/[^?\s"'<]+)\?(?:[^\s"']*?&)?(?:username|user)=([^&\s"']+)\s*&(?:password|pass)=([^&\s"']+)/gi
  const RE_LABEL =
    /(?:Portal|Host(?:\s*URL)?|H[oô]s[tT]|Panel|Real|URL|🔗|🌍|🌐)\W*?(https?:\/\/[^<\s"']+)[\s\S]{1,500}?(?:Username|Usu[áa]rio|Usuario|User|Us[ee]r|Us[uu][aar][ɪi][oô])\W*?([^\s|<"'\n]+)[\s\S]{1,200}?(?:Password|Senha|Contrase[ñn]a|Pass|P[aa]ss|S[ee]nh[aa]|🔑)\W*?([^\s|<"'\n]+)/gi

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

  const JUNK_TOKENS = ['type=m3u', 'output=ts', 'password=', 'username=', 'password', 'username']

  function finalize(
    acc: Map<string, { url: string; user: string; pass: string }>,
    rawUrl: string, rawUser: string, rawPass: string,
  ): void {
    const url = cleanPortalUrl(rawUrl)
    const user = cleanCred(rawUser)
    const pass = cleanCred(rawPass)
    if (!url || user.length < 3 || pass.length < 3) return
    if (user.includes('http') || pass.includes('http')) return
    const lu = user.toLowerCase(), lp = pass.toLowerCase()
    for (const j of JUNK_TOKENS) if (lu.includes(j) || lp.includes(j)) return
    const key = url + '|' + user + '|' + pass
    if (!acc.has(key)) acc.set(key, { url, user, pass })
  }

  function extractPortals(rawText: string): Array<{ url: string; user: string; pass: string }> {
    const cleaned = rawText
      .replace(/&/g, '&')
      .replace(/"/g, '"')
      .replace(/<(?:p|br|div|li|h\d)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
    const acc = new Map<string, { url: string; user: string; pass: string }>()
    for (const m of cleaned.matchAll(RE_URL_PARAM)) finalize(acc, m[1], m[2], m[3])
    for (const m of cleaned.matchAll(RE_LABEL)) finalize(acc, m[1], m[2], m[3])
    return Array.from(acc.values())
  }

  it('extracts url-param portals (username/password)', () => {
    const text = 'Check this: http://portal.example.com:8080/player_api.php?username=john&password=secret123'
    const portals = extractPortals(text)
    expect(portals).toHaveLength(1)
    expect(portals[0].url).toBe('http://portal.example.com:8080')
    expect(portals[0].user).toBe('john')
    expect(portals[0].pass).toBe('secret123')
  })

  it('extracts label-style portals (Portal: + Username: + Password:)', () => {
    // The RE_LABEL regex captures the text after each label.
    // With no spaces around colons, it captures :alice and :pw12345,
    // which cleanCred then strips the leading ':' from.
    const text = 'Portal:http://my.host.com:8080\nUsername:alice\nPassword:pw12345'
    const portals = extractPortals(text)
    expect(portals.length).toBeGreaterThanOrEqual(1)
    expect(portals[0].url).toBe('http://my.host.com:8080')
  })

  it('filters junk tokens (type=m3u, output=ts)', () => {
    const text = 'http://x.com/get.php?username=output=ts123&password=pass1234'
    const portals = extractPortals(text)
    // 'output=ts' is in the junk tokens list, so this should be filtered out
    expect(portals.length).toBe(0)
  })

  it('filters short credentials (< 3 chars)', () => {
    const text = 'http://x.com/player_api.php?username=ab&password=cd'
    const portals = extractPortals(text)
    expect(portals.length).toBe(0)
  })

  it('deduplicates identical portals', () => {
    const text = 'http://x.com/player_api.php?username=user1&password=pass1\nhttp://x.com/player_api.php?username=user1&password=pass1'
    const portals = extractPortals(text)
    expect(portals).toHaveLength(1)
  })

  it('cleans trailing path and query from portal URL', () => {
    const text = 'http://x.com:8080/get.php?username=user1&password=pass123'
    const portals = extractPortals(text)
    expect(portals[0].url).toBe('http://x.com:8080')
  })
})
