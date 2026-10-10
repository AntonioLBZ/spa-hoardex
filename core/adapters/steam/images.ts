const APP_IMAGE_BASE = 'https://cdn.cloudflare.steamstatic.com/steam/apps';
// Serves both the hashed paths of recent games and the plain ones of older games
const STORE_ASSET_BASE = 'https://shared.steamstatic.com/store_item_assets/steam/apps';
const APPID = /^\d{1,10}$/;
const ASSET_FILE = /^(?:[0-9a-f]{40}\/)?[A-Za-z0-9_.-]+\.(?:jpg|png)$/;
const ASSET_FORMAT = /^steam\/apps\/(\d{1,10})\/\$\{FILENAME\}(?:\?t=(\d{1,12}))?$/;

// Cover candidates in order of preference: the portrait capsule, then the landscape header.
// Not every app has the portrait one (unverified), so the UI falls back along the list
export function steamCoverUrls(appid: string): string[] {
    if (!APPID.test(appid)) return [];
    return [`${APP_IMAGE_BASE}/${appid}/library_600x900.jpg`, `${APP_IMAGE_BASE}/${appid}/header.jpg`];
}

// URL of one store asset as GetItems names it; undefined unless it fits the known shape for that appid
export function steamAssetUrl(appid: string, format: string | undefined, file: string | undefined): string | undefined {
    if (format === undefined || file === undefined || !ASSET_FILE.test(file)) return undefined;
    const match = ASSET_FORMAT.exec(format);
    if (match === null || match[1] !== appid) return undefined;
    const stamp = match[2] === undefined ? '' : `?t=${match[2]}`;
    return `${STORE_ASSET_BASE}/${appid}/${file}${stamp}`;
}
