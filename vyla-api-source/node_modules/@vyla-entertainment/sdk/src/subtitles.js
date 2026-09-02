import { getUA } from './utils/helpers.js';

const SUBTITLE_BASES = [
    'https://sub.vdrk.site/v1',
    'https://sub.vdrk.site/v2',
    'https://fed-subs.pstream.mov'
];
const VYLIAN_MESSAGES = [
    "Thanks for using Vyla!"
];

function generateVylianVtt() {
    let vttContent = 'WEBVTT\n\n';

    let currentTime = 1;
    while (currentTime <= 7200) {
        const duration = Math.floor(Math.random() * 4) + 1;
        const message = VYLIAN_MESSAGES[Math.floor(Math.random() * VYLIAN_MESSAGES.length)];

        const startTime = formatVttTime(currentTime);
        const endTime = formatVttTime(currentTime + duration);

        vttContent += `${startTime} --> ${endTime}\n${message}\n\n`;

        currentTime += duration + Math.floor(Math.random() * 60) + 30;
    }

    return vttContent;
}

function formatVttTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.000`;
}

export async function fetchSubtitles(paths = []) {
    try {
        const results = await Promise.all(
            paths.map(async ({ base, path }) => {
                try {
                    const res = await fetch(`${base}${path}`, {
                        headers: { 'User-Agent': getUA() },
                        signal: AbortSignal.timeout(5000),
                    });

                    if (!res.ok) {
                        res.body?.cancel();
                        return [];
                    }

                    const data = await res.json();

                    if (base.includes('/v2')) {
                        return Array.isArray(data)
                            ? data.map(x => ({
                                label: x.label,
                                file: x.file || x.url,
                                type: 'vtt',
                                source: 'v2'
                            }))
                            : [];
                    }

                    if (base.includes('fed-subs.pstream.mov')) {
                        if (!data?.subtitles || typeof data.subtitles !== 'object') return [];

                        return Object.entries(data.subtitles)
                            .map(([language, sub]) => {
                                if (!sub?.subtitle_link) return null;
                                const ext = sub.subtitle_link.split('.').pop()?.toLowerCase();
                                return {
                                    label: sub.subtitle_name || language,
                                    file: sub.subtitle_link,
                                    type: ext === 'vtt' ? 'vtt' : 'srt',
                                    source: 'febbox'
                                };
                            })
                            .filter(Boolean);
                    }

                    const v1 = Array.isArray(data) ? data : [];
                    return v1.map(x => ({
                        label: x.label,
                        file: x.file || x.url,
                        type: 'vtt',
                        source: 'v1'
                    }));
                } catch {
                    return [];
                }
            })
        );

        const val = results.flat();

        val.push({
            label: 'Vylian',
            file: 'data:text/vtt;base64,' + Buffer.from(generateVylianVtt()).toString('base64'),
            type: 'vtt',
            source: 'easter-egg'
        });

        return val;
    } catch {
        return [];
    }
}

export async function getSubPathsMovie(id) {
    return [
        { base: SUBTITLE_BASES[0], path: `/movie/${id}` },
        { base: SUBTITLE_BASES[1], path: `/movie/${id}` },
        { base: SUBTITLE_BASES[2], path: `/movie/tt${id}` }
    ];
}

export async function getSubPathsTv(id, season, episode) {
    return [
        { base: SUBTITLE_BASES[0], path: `/tv/${id}/${season}/${episode}` },
        { base: SUBTITLE_BASES[1], path: `/tv/${id}/${season}/${episode}` },
        { base: SUBTITLE_BASES[2], path: `/tv/tt${id}/${season}/${episode}` }
    ];
}

export { SUBTITLE_BASES };