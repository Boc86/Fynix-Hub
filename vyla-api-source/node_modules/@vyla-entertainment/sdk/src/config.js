// Currently active sources reported on 9:22:41 PM PST 7/30/2026

// None Anime Tested: 936075
// Anime Tested: 37854

// Fshare/Fsonic Tested: 155 ( they don't have Michael )

export const SOURCES = [
    {
        key: '123anime',
        label: '123Anime',
        sourceFile: '123anime',
        proxyParam: 'a1',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        multiUrl: false,
        skipProxy: true,
        cdnHeaders: [{
            pattern: /hlsx\d+cdn\.|burntburst\d+\.store|echovideo\.ru/i,
            headers: {
                Referer: 'https://play2.echovideo.ru/',
                Origin: 'https://play2.echovideo.ru',
            },
        },],
    },

    {
        key: 'anihq-sub',
        label: 'AniHQ (Sub)',
        sourceFile: 'anihq',
        proxyParam: 'ahsub',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
        skipProxy: true
    },

    {
        key: 'anihq-dub',
        label: 'AniHQ (Dub)',
        sourceFile: 'anihq',
        proxyParam: 'ahdub',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
        skipProxy: true
    },

    {
        key: 'anineko-sub',
        sourceFile: 'anineko',
        label: 'AniNeko (Sub)',
        proxyParam: 'anksub',
        timeout: 25000,
        jitter: 500,
        retries: 2
    },

    {
        key: 'anineko-dub',
        sourceFile: 'anineko',
        label: 'AniNeko (Dub)',
        proxyParam: 'ankdub',
        timeout: 25000,
        jitter: 500,
        retries: 2
    },

    {
        key: 'anipm-sub',
        sourceFile: 'anipm',
        label: 'AniPM (Sub)',
        proxyParam: 'apsub',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        skipProxy: true,
        skipVerify: true,
        multiUrl: true,
        verifyHeaders: {
            Referer: 'https://ani.pm/',
            Origin: 'https://ani.pm',
        },
    },

    {
        key: 'anipm-dub',
        sourceFile: 'anipm',
        label: 'AniPM (Dub)',
        proxyParam: 'apdub',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        skipProxy: true,
        skipVerify: true,
        multiUrl: true,
        verifyHeaders: {
            Referer: 'https://ani.pm/',
            Origin: 'https://ani.pm',
        },
    },

    {
        key: 'bcine',
        label: 'Bcine',
        sourceFile: 'bcine',
        proxyParam: 'bc',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
        cdnHeaders: [{
            pattern: /1embed\.cc|videasy\.to/i,
            headers: {
                Referer: 'https://bcine.ru/',
                Origin: 'https://bcine.ru',
            },
        }],
    },

    {
        key: 'cinejoy',
        label: 'Cinejoy',
        sourceFile: 'cinejoy',
        proxyParam: 'cj',
        timeout: 30000,
        jitter: 500,
        retries: 1,
        multiUrl: true,
        skipProxy: true,
    },

    {
        key: 'cinesrc',
        label: 'CineSrc',
        sourceFile: 'cinesrc',
        proxyParam: 'csr',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
        skipProxy: true,
        skipVerify: true,
        cdnHeaders: [{
            pattern: /glendale-plumbing\.com|1embed\.cc|bright\d+\.online/i,
            headers: {
                Referer: 'https://cinesrc.st/',
                Origin: 'https://cinesrc.st',
            },
        }],
    },

    {
        key: 'cinesu',
        label: 'CineSu',
        sourceFile: 'cinesu',
        proxyParam: 'cs',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
        skipProxy: true,
        skipVerify: true,
        cdnHeaders: [{
            pattern: /glendale-plumbing\.com/i,
            headers: {
                Referer: 'https://cine.su/',
                Origin: 'https://cine.su',
            },
        }],
    },

    {
        key: 'flaxmovies',
        label: 'FlaxMovies',
        sourceFile: 'flaxmovies',
        proxyParam: 'fx',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
        skipProxy: true,
        cdnHeaders: [{
            pattern: /flix2watch\.pro/i,
            headers: {
                Referer: 'https://flaxmovies.xyz/',
                Origin: 'https://flaxmovies.xyz',
            },
        },],
    },

    {
        key: 'frame',
        label: 'Frame',
        sourceFile: 'frame',
        proxyParam: 'fr',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
        skipProxy: true,
    },

    {
        key: 'fsharetv',
        label: 'FShareTV',
        sourceFile: 'fsharetv',
        proxyParam: 'fs',
        timeout: 25000,
        jitter: 600,
        retries: 2,
        multiUrl: false,
        verifyHeaders: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,/;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            Referer: 'https://fsharetv.cc',
        },
    },

    {
        key: 'fsonic',
        label: 'Fsonic',
        sourceFile: 'fsonic',
        proxyParam: 'fn',
        timeout: 35000,
        jitter: 600,
        retries: 1,
        multiUrl: true,
    },

    {
        key: 'fsonline',
        label: 'FSOnline',
        sourceFile: 'fsonline',
        proxyParam: 'fo',
        timeout: 20000,
        retries: 1,
        jitter: 0,
        multiUrl: true,
        skipProxy: true,
    },

    {
        key: 'hexa',
        label: 'Hexa',
        sourceFile: 'hexa',
        proxyParam: 'hx',
        timeout: 20000,
        jitter: 500,
        retries: 2,
    },

    {
        key: 'kisskh',
        label: 'KissKH',
        sourceFile: 'kisskh',
        proxyParam: 'kk',
        timeout: 30000,
        jitter: 500,
        retries: 1,
    },

    {
        key: 'lmscript',
        label: 'LMScript',
        sourceFile: 'lmscript',
        proxyParam: 'lmsc',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
    },

    {
        key: 'lookmovie',
        label: 'LookMovie',
        sourceFile: 'lookmovie',
        proxyParam: 'lm',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
        verifyHeaders: {
            'Accept-Language': 'en-US,en;q=0.9',
        },
    },

    {
        key: 'luna-sub',
        label: 'Luna (Sub)',
        sourceFile: 'luna',
        proxyParam: 'lusub',
        subtype: 'sub',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
        skipProxy: true,
    },

    {
        key: 'luna-dub',
        label: 'Luna (Dub)',
        sourceFile: 'luna',
        proxyParam: 'ludub',
        subtype: 'dub',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
        skipProxy: true,
    },

    {
        key: 'mapple',
        label: 'Mapple',
        sourceFile: 'mapple',
        proxyParam: 'mp',
        timeout: 15000,
        retries: 1,
        jitter: 0
    },

    {
        key: 'meowtv',
        label: 'MeowTV',
        sourceFile: 'meowtv',
        proxyParam: 'mt',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
        skipProxy: true
    },

    {
        key: 'peestream',
        label: 'PeeStream',
        sourceFile: 'peestream',
        proxyParam: 'pee',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
        skipProxy: true,
    },

    {
        key: 'pengu',
        label: 'Pengu',
        sourceFile: 'pengu',
        proxyParam: 'pg',
        timeout: 25000,
        jitter: 500,
        retries: 1,
        multiUrl: true,
        skipProxy: true,
        disabled: false, // Enabled, but only returns streams when a manifest is provided
    },

    {
        key: 'pstream',
        label: 'PStream',
        sourceFile: 'pstream',
        proxyParam: 'ps',
        timeout: 35000,
        jitter: 500,
        retries: 1,
        multiUrl: true,
    },

    {
        key: 'nova',
        label: 'Nova',
        sourceFile: 'nova',
        proxyParam: 'nv',
        timeout: 25000,
        jitter: 500,
        retries: 1,
        multiUrl: true,
    },

    {
        key: 'megasource',
        label: 'MegaSource',
        sourceFile: 'megasource',
        proxyParam: 'mg',
        timeout: 25000,
        jitter: 500,
        retries: 1,
        multiUrl: true,
    },

    {
        key: 'purstream',
        sourceFile: 'purstream',
        label: 'Purstream',
        proxyParam: 'ps',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        skipProxy: true
    },

    {
        key: 'rivestream',
        label: 'RiveStream',
        sourceFile: 'rivestream',
        proxyParam: 'rs',
        timeout: 30000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
    },

    {
        key: 'vidapi',
        label: 'VidAPI',
        sourceFile: 'vidapi',
        proxyParam: 'va',
        timeout: 25000,
        jitter: 500,
        retries: 1,
        multiUrl: true
    },

    {
        key: 'vidcore',
        sourceFile: 'vidcore',
        label: 'Vidcore',
        proxyParam: 'vc',
        timeout: 30000,
        jitter: 500,
        retries: 2,
        sourcesTimeout: 10000,
    },

    {
        key: 'videasy',
        label: 'Videasy',
        sourceFile: 'videasy',
        proxyParam: 'vy',
        timeout: 40000,
        sourcesTimeout: 10000,
        jitter: 900,
        retries: 3,
        multiUrl: true,
        verifyHeaders: {
            Accept: 'application/json, /; q=0.01',
            Referer: 'https://player.videasy.net/',
            Origin: 'https://player.videasy.net',
        },
    },

    {
        key: 'vidfast',
        label: 'Vidfast',
        sourceFile: 'vidfast',
        proxyParam: 'vf',
        timeout: 35000,
        jitter: 500,
        retries: 1,
    },

    {
        key: 'vidgod',
        label: 'VidGod',
        sourceFile: 'vidgod',
        proxyParam: 'vg',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
        skipProxy: true,
    },

    {
        key: 'vidlink',
        label: 'Vidlink',
        sourceFile: 'vidlink',
        proxyParam: 'vl',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        skipProxy: true,
        multiUrl: true,
        disabled: true, // Temporarily disabled because their site is down, all streams are returning 403's
    },

    {
        key: 'vidnest',
        label: 'VidNest',
        sourceFile: 'vidnest',
        proxyParam: 'vdn',
        timeout: 20000,
        retries: 1,
        jitter: 0,
        multiUrl: true,
    },

    {
        key: 'vidnest-sub',
        label: 'VidNest (Sub)',
        sourceFile: 'vidnest',
        proxyParam: 'vdn',
        timeout: 20000,
        retries: 1,
        jitter: 0,
        multiUrl: true,
        skipProxy: true,
    },

    {
        key: 'vidnest-dub',
        label: 'VidNest (Dub)',
        sourceFile: 'vidnest',
        proxyParam: 'vdn',
        timeout: 20000,
        retries: 1,
        jitter: 0,
        multiUrl: true,
        skipProxy: true,
    },

    {
        key: 'vidrock',
        label: 'VidRock',
        sourceFile: 'vidrock',
        proxyParam: 'vr',
        timeout: 20000,
        jitter: 800,
        retries: 3,
        multiUrl: true,
        cdnHeaders: [{
            pattern: /./,
            headers: {
                Accept: '/',
                'Accept-Language': 'en-US,en;q=0.9',
                Referer: 'https://vidrock.ru/',
                Origin: 'https://vidrock.ru',
            },
        },],
    },

    {
        key: 'vidup',
        label: 'VidUp',
        sourceFile: 'vidup',
        proxyParam: 'vu',
        timeout: 35000,
        jitter: 500,
        retries: 1,
        multiUrl: true
    },

    {
        key: 'vidvault',
        label: 'VidVault',
        sourceFile: 'vidvault',
        proxyParam: 'vv',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
    },

    {
        key: 'vidzee',
        label: 'VidZee',
        sourceFile: 'vidzee',
        proxyParam: 'vz',
        timeout: 20000,
        sourcesTimeout: 10000,
        jitter: 400,
        retries: 3,
        verifyHeaders: {
            Accept: '/',
            'Accept-Language': 'en-US,en;q=0.9',
            Referer: 'https://player.vidzee.wtf',
            Origin: 'https://player.vidzee.wtf',
        },
    },

    {
        key: 'vixsrc',
        label: 'VixSrc',
        sourceFile: 'vixsrc',
        proxyParam: 'vx',
        timeout: 35000,
        jitter: 0,
        retries: 2,
        multiUrl: false,
        skipProxy: true,
        verifyHeaders: {
            Accept: 'application/json, text/javascript, /; q=0.01',
            'Accept-Language': 'en-US,en;q=0.9',
            Referer: 'https://vixsrc.to/',
            Origin: 'https://vixsrc.to',
        },
    },

    {
        key: 'xpass',
        sourceFile: 'xpass',
        label: 'XPass',
        proxyParam: 'xp',
        timeout: 20000,
        jitter: 500,
        retries: 2,
        skipProxy: true,
    },

    {
        key: 'zxcstream',
        label: 'ZxcStream',
        sourceFile: 'zxcstream',
        proxyParam: 'zxc',
        timeout: 25000,
        jitter: 500,
        retries: 2,
        multiUrl: true,
    },

];

export const HEALTH_PROBE_ID = '155';
export const SOURCE_MAP = Object.fromEntries(SOURCES.map(s => [s.key, s]));
export default SOURCES;