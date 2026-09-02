import { getTmdbInfo, USER_AGENT, fetchText } from '../utils/helpers.js';

const BASE_URL = "https://anineko.to";

function cleanTitle(t) { return t ? t.toLowerCase().replace(/[^a-z0-9]/g, '') : ''; }

function decodeEntities(str) {
    return str.replace(/&(nbsp|amp|quot|lt|gt);/g, (m, e) => ({ "nbsp": " ", "amp": "&", "quot": "\"", "lt": "<", "gt": ">" })[e]).replace(/&#(\d+);/gi, (m, n) => String.fromCharCode(parseInt(n, 10)));
}

async function search(query) {
    try {
        const html = await fetchText(`${BASE_URL}/browser?keyword=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(6000)
        });
        const results = [];
        let idx = 0;
        while ((idx = html.indexOf('nv-anime-thumb', idx)) !== -1) {
            const startHref = html.lastIndexOf('<a', idx);
            if (startHref === -1) { idx += 14; continue; }
            const hrefMatch = html.slice(startHref, html.indexOf('>', startHref)).match(/href=["']([^"']+)["']/i);
            if (!hrefMatch) { idx += 14; continue; }
            const slug = hrefMatch[1].split('/').pop();
            const h3Start = html.indexOf('nv-anime-title', idx);
            if (h3Start !== -1) {
                const contentStart = html.indexOf('>', h3Start) + 1;
                const contentEnd = html.indexOf('<', contentStart);
                if (contentEnd !== -1) results.push({ slug, text: html.slice(contentStart, contentEnd).trim() });
            }
            idx += 14;
        }
        if (results.length === 0) {
            const linkMatches = [...html.matchAll(/href=["']\/watch\/([^"']+)["']/gi)];
            for (const match of linkMatches) {
                if (!results.find(r => r.slug === match[1])) {
                    const linkIdx = html.indexOf(match[0]);
                    const titleStart = html.lastIndexOf('>', linkIdx);
                    const titleEnd = html.indexOf('<', linkIdx);
                    if (titleStart !== -1 && titleEnd !== -1 && titleEnd > linkIdx) {
                        const title = html.slice(titleStart + 1, Math.min(titleEnd, linkIdx + 200)).trim();
                        if (title.length > 2 && title.length < 100) {
                            results.push({ slug: match[1], text: title });
                        }
                    }
                }
            }
        }
        return results;
    } catch { return []; }
}

async function extractHls(embedUrl) {
    try {
        const html = await fetchText(embedUrl, {
            headers: {
                'User-Agent': USER_AGENT,
                Referer: `${BASE_URL}/`
            },
            signal: AbortSignal.timeout(6000)
        });
        const m = html.match(/const\s+src\s*=\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i) ||
            html.match(/file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i) ||
            html.match(/["'](https?:\/\/[^"']+\/master\.m3u8[^"']*)["']/i) ||
            html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i) ||
            html.match(/src:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
        if (m) return decodeEntities(m[1]);
    } catch { }
    return null;
}

export async function getStream({ id, s, e, audio, sdk }) {
    const tmdbApiKey = sdk?.tmdbApiKey || null;
    if (!tmdbApiKey) return null;
    try {
        const info = await getTmdbInfo(tmdbApiKey, id, s ? 'tv' : 'movie', s);
        if (!info || !info.isAnime) return null;
        let seriesSlug = null;
        for (const title of info.titles) {
            const potentialSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            if (!potentialSlug) continue;
            try {
                const checkHtml = await fetchText(`${BASE_URL}/watch/${potentialSlug}/ep-${e || 1}`, {
                    headers: { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/watch/${potentialSlug}` },
                    signal: AbortSignal.timeout(4000)
                });
                if (checkHtml && checkHtml.includes('nv-watch-page')) {
                    seriesSlug = potentialSlug;
                    break;
                }
            } catch {}
        }

        if (!seriesSlug) {
            for (const title of info.titles) {
                const results = await search(title);
                const targetClean = cleanTitle(title);

                const exactSlugMatch = results.find(r => {
                    const slugClean = cleanTitle(r.slug);
                    return slugClean === targetClean || r.slug === targetClean;
                });

                if (exactSlugMatch) {
                    seriesSlug = exactSlugMatch.slug;
                    break;
                }

                const sortedResults = [...results].sort((a, b) => a.slug.length - b.slug.length);

                for (const r of sortedResults) {
                    const resultClean = cleanTitle(r.text);
                    const isExactMatch = resultClean === targetClean;
                    const isCloseMatch = r.text.toLowerCase().includes(title.toLowerCase());
                    if (isExactMatch || isCloseMatch) {
                        seriesSlug = r.slug;
                        break;
                    }
                }
                if (seriesSlug) break;
            }
        }
        if (!seriesSlug && info.titles.length) {
            const fSearch = await search(info.titles[0]);
            const sortedResults = [...fSearch].sort((a, b) => a.slug.length - b.slug.length);
            if (sortedResults.length) seriesSlug = sortedResults[0].slug;
        }
        if (!seriesSlug) return null;
        const watchHtml = await fetchText(`${BASE_URL}/watch/${seriesSlug}/ep-${e || 1}`, {
            headers: {
                'User-Agent': USER_AGENT,
                Referer: `${BASE_URL}/watch/${seriesSlug}`
            },
            signal: AbortSignal.timeout(6000)
        });
        const byAudio = { sub: [], dub: [] };

        const iframeMatch = watchHtml.match(/<iframe[^>]*src=["']([^"']+)["'][^>]*>/i);
        if (iframeMatch) {
            const iframeSrc = decodeEntities(iframeMatch[1]);
            const hls = await extractHls(iframeSrc);
            if (hls) {
                const audioType = audio === 'dub' ? 'dub' : 'sub';
                byAudio[audioType].push(iframeSrc);
            }
        }

        if (byAudio.sub.length === 0 && byAudio.dub.length === 0) {
            const tabMatches = [...watchHtml.matchAll(/<button[^>]*class=["'][^"']*nv-server-tab[^"']*["'][^>]*data-id=["']([^"']+)["'][^>]*>/gi)];
            const tabMap = {};
            for (const match of tabMatches) {
                const tabId = match[1].toLowerCase();
                const tabClassMatch = match[0].match(/class=["'][^"']*(tab_\d+)[^"']/i);
                if (tabClassMatch) {
                    const tabClass = tabClassMatch[1];
                    tabMap[tabClass] = tabId.includes('dub') ? 'dub' : 'sub';
                }
            }

            const btnRegex = /<button\s+[^>]*class=["'][^"']*server-video[^"']*["'][^>]*>/gi;
            const btnMatches = [...watchHtml.matchAll(btnRegex)];
            for (const match of btnMatches) {
                const btnHtml = match[0];
                const videoMatch = btnHtml.match(/data-video=["']([^"']+)["']/i);
                const tabMatch = btnHtml.match(/data-tab=["']([^"']+)["']/i);
                if (videoMatch && tabMatch) {
                    const videoUrl = decodeEntities(videoMatch[1]);
                    const tabClass = tabMatch[1];
                    const audioType = tabMap[tabClass] || 'sub';
                    byAudio[audioType].push(videoUrl);
                }
            }
        }
        const audiosToTry = audio === "all" ? ["sub", "dub"] : (audio === "dub" ? ["dub", "sub"] : ["sub", "dub"]);
        const allUrls = [];
        for (const aud of audiosToTry) {
            for (const embed of byAudio[aud]) {
                const hls = await extractHls(embed);
                if (hls) allUrls.push({ url: hls, type: "hls", audio: aud, server: "AniNeko", skipProxy: false });
            }
            if (allUrls.length) break;
        }
        return allUrls.length ? { allUrls } : null;
    } catch { return null; }
}

export async function getSources(args) {
    const stream = await getStream(args);
    return stream?.allUrls ? [...new Set(stream.allUrls.map(u => u.server))] : [];
}