import { Hono, type Context } from 'hono';
import { UpstreamError } from '../core/adapters/types.js';
import type { CachedAdapter } from '../core/cache/cached-adapter.js';
import type { ProfileAccess, ProfileAccessKind } from '../core/domain/index.js';
import { ConfigError } from './deps.js';

// CDN policy; Redis stays the source of truth
const CACHE_CONTROL: Record<ProfileAccessKind, string> = {
    ok: 'public, s-maxage=60, stale-while-revalidate=300',
    profilePrivate: 'public, s-maxage=30',
    libraryPrivate: 'public, s-maxage=30',
    wishlistPrivate: 'public, s-maxage=30',
    notFound: 'public, s-maxage=30',
    rateLimited: 'no-store',
};
const NO_STORE = 'no-store';

function access(c: Context, result: ProfileAccess<unknown>) {
    c.header('Cache-Control', CACHE_CONTROL[result.kind]);
    return c.json(result);
}

function failure(c: Context, error: string, status: 400 | 404 | 500 | 502) {
    c.header('Cache-Control', NO_STORE);
    return c.json({ error }, status);
}

// `getData` runs per request: a config error is a 500
export function createApp(getData: () => CachedAdapter) {
    const app = new Hono().basePath('/api');

    app.get('/health', (c) => {
        c.header('Cache-Control', CACHE_CONTROL.ok);
        return c.json({ ok: true });
    });

    // Input: vanity, SteamID64 or profile URL (one encoded segment)
    app.get('/profile/:input', async (c) => {
        const data = getData();
        const input = data.parseInput(c.req.param('input'));
        if (input.kind === 'invalid') return failure(c, 'invalidInput', 400);
        return access(c, await data.resolveProfile(input));
    });

    // Needs an account id; a vanity goes through /profile first
    app.get('/library/:id', async (c) => {
        const data = getData();
        const input = data.parseInput(c.req.param('id'));
        if (input.kind !== 'id') return failure(c, 'invalidInput', 400);
        return access(c, await data.getLibrary(input.id));
    });

    app.notFound((c) => failure(c, 'notFound', 404));

    // Responses carry a code, never the error message
    app.onError((error, c) => {
        if (error instanceof UpstreamError) {
            console.error('[api] upstream failure:', error.message, error.status ?? '');
            return failure(c, 'upstream', 502);
        }
        if (error instanceof ConfigError) {
            console.error('[api] misconfigured:', error.message);
            return failure(c, 'misconfigured', 500);
        }
        console.error('[api] unexpected error:', error.name);
        return failure(c, 'internal', 500);
    });

    return app;
}
