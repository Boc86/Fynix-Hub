import { USER_AGENT, fetchJson } from '../utils/helpers.js';

const BASE_URL = 'https://flaxmovies.xyz';

async function getWorkerUrls(embedUrl) {
    const foundUrls = [];
    try {
        const res = await fetch(embedUrl, {
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': `${BASE_URL}/`,
                'Origin': BASE_URL
            },
            signal: AbortSignal.timeout(8000)
        });
        if (res.ok) {
            const html = await res.text();
            const directMatch = html.match(/WORKER_URL\s*[:=]\s*["'](https?:\/\/[^"']+)["']/i);
            if (directMatch && directMatch[1]) {
                foundUrls.push(directMatch[1].replace(/\/+$/, ''));
            }

            const scriptMatches = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)];
            for (const sm of scriptMatches) {
                let scriptUrl = sm[1];
                if (scriptUrl.startsWith('//')) scriptUrl = `https:${scriptUrl}`;
                else if (scriptUrl.startsWith('/')) scriptUrl = `${BASE_URL}${scriptUrl}`;
                else if (!scriptUrl.startsWith('http')) scriptUrl = `${BASE_URL}/${scriptUrl}`;

                if (scriptUrl.includes('jsdelivr') || scriptUrl.includes('google') || scriptUrl.includes('cloudflare')) continue;

                try {
                    const sRes = await fetch(scriptUrl, {
                        headers: { 'User-Agent': USER_AGENT, 'Referer': embedUrl },
                        signal: AbortSignal.timeout(6000)
                    });
                    if (sRes.ok) {
                        const sCode = await sRes.text();
                        const m = sCode.match(/WORKER_URL\s*[:=]\s*["'](https?:\/\/[^"']+)["']/i);
                        if (m && m[1]) {
                            const wUrl = m[1].replace(/\/+$/, '');
                            if (!foundUrls.includes(wUrl)) foundUrls.push(wUrl);
                        }
                    }
                } catch { }
            }
        }
    } catch { }

    const defaults = ['https://freakyniki.elaxo.lol', 'https://vidlove.nabilekson.workers.dev'];
    for (const d of defaults) {
        if (!foundUrls.includes(d)) foundUrls.push(d);
    }
    return foundUrls;
}

export async function getStream(args) {
    const { id, s, e, server } = args;
    const isTv = s != null && e != null;
    const embedUrl = isTv
        ? `${BASE_URL}/embed/tv/${id}/${s}/${e}`
        : `${BASE_URL}/embed/movie/${id}`;

    const workerUrls = await getWorkerUrls(embedUrl);
    const query = isTv
        ? `tmdb_id=${id}&tmdbId=${id}&season=${s}&episode=${e}`
        : `tmdb_id=${id}&tmdbId=${id}`;

    for (const worker of workerUrls) {
        try {
            const url = `${worker}/?${query}`;
            const data = await fetchJson(url, {
                headers: {
                    'User-Agent': USER_AGENT,
                    'Referer': `${BASE_URL}/`,
                    'Origin': BASE_URL,
                    'Accept': 'application/json, text/plain, */*'
                },
                signal: AbortSignal.timeout(12000)
            });

            if (data && Array.isArray(data.streams) && data.streams.length > 0) {
                let allUrls = data.streams
                    .filter(st => st && typeof st.url === 'string')
                    .map(st => {
                        const isHls = (st.format || '').toLowerCase().includes('hls') || st.url.includes('.m3u8');
                        return {
                            url: st.url,
                            server: `FlaxMovies - ${st.provider || 'Default'}`,
                            quality: st.resolution || 'Auto',
                            type: isHls ? 'hls' : 'mp4',
                            headers: {
                                'User-Agent': USER_AGENT,
                                'Referer': `${BASE_URL}/`,
                                'Origin': BASE_URL
                            }
                        };
                    });

                if (server && server !== 'all') {
                    const clean = server.toLowerCase().replace('flaxmovies - ', '');
                    const filtered = allUrls.filter(u => u.server.toLowerCase().includes(clean));
                    if (filtered.length) allUrls = filtered;
                }

                if (allUrls.length) {
                    return { allUrls };
                }
            }
        } catch { }
    }

    return null;
}

export async function getSources() {
    return ['FlaxMovies - Airflix', 'FlaxMovies - Xpass-VIP 1'];
}