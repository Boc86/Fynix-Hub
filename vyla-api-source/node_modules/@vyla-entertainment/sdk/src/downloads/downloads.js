import { getDownloads, getDownloadsTv } from "./sources/trendimovies.js";

export async function fetchDownloads(id, s = null, e = null) {
    try {
        const res = s != null && e != null
            ? await getDownloadsTv(id, s, e)
            : await getDownloads(id);
        return res || [];
    } catch {
        return [];
    }
}