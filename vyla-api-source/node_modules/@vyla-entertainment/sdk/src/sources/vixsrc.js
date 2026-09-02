import { fetchText, USER_AGENT } from '../utils/helpers.js';

const BASE_URL = 'https://vixsrc.to';

const HEADERS = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': `${BASE_URL}/`,
    'Origin': BASE_URL
};

function extract(regex, text) {
    const m = text?.match(regex);
    if (!m) return null;
    let val = m[1];
    val = val.replace(/\\u0026/gi, '&');
    val = val.replace(/\\\//g, '/');
    val = val.replace(/\\/g, '');
    return val;
}

export async function getStream({ id, s, e, absoluteBase }) {
    try {
        const apiUrl = s && e
            ? `${BASE_URL}/api/tv/${id}/${s}/${e}`
            : `${BASE_URL}/api/movie/${id}`;

        const apiProxy = absoluteBase && absoluteBase !== '/'
            ? `${absoluteBase.replace(/^https:\/\/(localhost|127\.0\.0\.1)/, 'http://$1')}/api?url=${encodeURIComponent(apiUrl)}&proxyHeaders=${encodeURIComponent(JSON.stringify(HEADERS))}`
            : apiUrl;

        const apiText = await fetchText(apiProxy, { headers: HEADERS }).catch(() => null);
        const apiData = JSON.parse(apiText || '{}');
        if (!apiData.src) return null;

        const embedUrl = apiData.src.startsWith('http') ? apiData.src : `${BASE_URL}${apiData.src}`;
        const embedProxy = absoluteBase && absoluteBase !== '/'
            ? `${absoluteBase.replace(/^https:\/\/(localhost|127\.0\.0\.1)/, 'http://$1')}/api?url=${encodeURIComponent(embedUrl)}&proxyHeaders=${encodeURIComponent(JSON.stringify(HEADERS))}`
            : embedUrl;

        const html = await fetchText(embedProxy, { headers: HEADERS }).catch(() => null);
        if (!html) return null;

        const token = extract(/token["']\s*:\s*["']([^"']+)/, html);
        const expires = extract(/expires["']\s*:\s*["']([^"']+)/, html);
        let playlist = extract(/url["']\s*:\s*["']([^"']+)/, html);

        if (!token || !expires || !playlist) return null;

        if (playlist.startsWith('/')) {
            playlist = `${BASE_URL}${playlist}`;
        }

        const lang = extract(/lang(?:uage)?["']\s*:\s*["']([a-z]{2,5})/i, html) || 'en';
        const rawMasterUrl = `${playlist}${playlist.includes('?') ? '&' : '?'}token=${token}&expires=${expires}&h=1&lang=${lang}`;

        const masterProxy = absoluteBase && absoluteBase !== '/'
            ? `${absoluteBase.replace(/^https:\/\/(localhost|127\.0\.0\.1)/, 'http://$1')}/api?url=${encodeURIComponent(rawMasterUrl)}&proxyHeaders=${encodeURIComponent(JSON.stringify({ ...HEADERS, Referer: embedUrl }))}`
            : rawMasterUrl;

        const playlistText = await fetchText(masterProxy, { headers: { ...HEADERS, 'Referer': embedUrl } }).catch(() => null);
        if (!playlistText?.includes('#EXTM3U')) return null;

        let finalUrl = null;
        let bestHeight = 0;
        const lines = playlistText.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
            const height = parseInt(line.match(/RESOLUTION=\d+x(\d+)/)?.[1] || '0', 10);
            let next = lines[i + 1]?.trim();
            if (!next || next.startsWith('#')) continue;

            if (height > bestHeight) {
                bestHeight = height;
                finalUrl = next;
            }
        }

        if (!finalUrl) finalUrl = rawMasterUrl;

        if (!finalUrl.startsWith('http')) {
            const baseMatch = rawMasterUrl.match(/^(https?:\/\/[^\/]+)/);
            const base = baseMatch ? baseMatch[1] : BASE_URL;
            if (finalUrl.startsWith('/')) {
                finalUrl = `${base}${finalUrl}`;
            } else {
                const pathParts = rawMasterUrl.split('/');
                pathParts.pop();
                finalUrl = `${pathParts.join('/')}/${finalUrl}`;
            }
        }

        return {
            allUrls: [
                {
                    url: finalUrl,
                    server: 'VixSrc',
                    skipProxy: true,
                    headers: {
                        ...HEADERS,
                        'Referer': `${BASE_URL}/`
                    }
                }
            ]
        };
    } catch (err) {
        return null;
    }
}