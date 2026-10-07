import { Hono, type Context } from 'hono';
import { createDemoData, type DemoData } from '../core/adapters/steam/index.js';
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
// The demo never changes meaningfully, so the CDN can hold it for long
const DEMO_CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400';

function access(c: Context, result: ProfileAccess<unknown>, cacheControl = CACHE_CONTROL[result.kind]) {
    c.header('Cache-Control', cacheControl);
    return c.json(result);
}

function failure(c: Context, error: string, status: 400 | 404 | 500 | 502) {
    c.header('Cache-Control', NO_STORE);
    return c.json({ error }, status);
}

// `getData` runs per request: a config error is a 500. The demo never touches it
export function createApp(getData: () => CachedAdapter, demo: DemoData = createDemoData()) {
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

    // Same input as /profile, so the client can ask for both at once
    app.get('/library/:input', async (c) => {
        const data = getData();
        const input = data.parseInput(c.req.param('input'));
        if (input.kind === 'invalid') return failure(c, 'invalidInput', 400);
        return access(c, await data.resolveLibrary(input));
    });

    // Fictional library through the real adapter: needs no key, Redis or Steam
    app.get('/demo/profile', async (c) => access(c, await demo.getProfile(), DEMO_CACHE_CONTROL));
    app.get('/demo/library', async (c) => access(c, await demo.getLibrary(), DEMO_CACHE_CONTROL));

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
