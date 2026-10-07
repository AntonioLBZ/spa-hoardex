const APP_IMAGE_BASE = 'https://cdn.cloudflare.steamstatic.com/steam/apps';
const APPID = /^\d{1,10}$/;

// Cover candidates in order of preference: the portrait capsule, then the landscape header.
// Not every app has the portrait one (unverified), so the UI falls back along the list
export function steamCoverUrls(appid: string): string[] {
    if (!APPID.test(appid)) return [];
    return [`${APP_IMAGE_BASE}/${appid}/library_600x900.jpg`, `${APP_IMAGE_BASE}/${appid}/header.jpg`];
}
