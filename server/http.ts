import type { Context } from 'hono';
import type { ProfileAccess, ProfileAccessKind } from '../core/domain/index.js';

// CDN policy; Redis stays the source of truth
export const CACHE_CONTROL: Record<ProfileAccessKind, string> = {
    ok: 'public, s-maxage=60, stale-while-revalidate=300',
    profilePrivate: 'public, s-maxage=30',
    libraryPrivate: 'public, s-maxage=30',
    wishlistPrivate: 'public, s-maxage=30',
    notFound: 'public, s-maxage=30',
    rateLimited: 'no-store',
};
export const NO_STORE = 'no-store';

export function access(c: Context, result: ProfileAccess<unknown>, cacheControl = CACHE_CONTROL[result.kind]) {
    c.header('Cache-Control', cacheControl);
    return c.json(result);
}

export function failure(c: Context, error: string, status: 400 | 401 | 403 | 404 | 409 | 500 | 502 | 503) {
    c.header('Cache-Control', NO_STORE);
    return c.json({ error }, status);
}
