import { Hono, type Context } from 'hono';
import { createDemoData, type DemoData } from '../core/adapters/steam/index.js';
import { UpstreamError } from '../core/adapters/types.js';
import { ART_BATCH_SIZE } from '../core/domain/index.js';
import type { CachedAdapter } from '../core/cache/cached-adapter.js';
import { createAuthRoutes, type AuthDeps } from './auth.js';
import { createAccountRoutes } from './account.js';
import { createBacklogRoutes } from './backlog.js';
import { createCronRoutes } from './cron.js';
import { ConfigError, type Accounts } from './deps.js';
import { CACHE_CONTROL, NO_STORE, access, failure } from './http.js';
import { DatabaseError } from '../core/accounts/index.js';

// The demo never changes meaningfully, so the CDN can hold it for long
const DEMO_CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400';
// Store images change rarely; Redis keeps them a week
const ART_CACHE_CONTROL = 'public, s-maxage=86400, stale-while-revalidate=604800';
const APPID_LIST = /^\d{1,10}(?:,\d{1,10})*$/;

// Comma-separated appids, at most one batch; null when malformed
function parseAppids(raw: string | undefined): string[] | null {
    if (raw === undefined || !APPID_LIST.test(raw)) return null;
    const appids = raw.split(',');
    return appids.length > ART_BATCH_SIZE ? null : appids;
}

function retryLater(c: Context, error: string, status: 429 | 503, retryAfterSeconds: number) {
    c.header('Cache-Control', NO_STORE);
    c.header('Retry-After', String(retryAfterSeconds));
    return c.json({ error, retryAfterSeconds }, status);
}

export interface AppOptions {
    demo?: DemoData;
    // Without them the sign-in and backlog routes answer 404
    getAuth?: () => AuthDeps;
    getAccounts?: () => Accounts;
    // Without it the cron route answers 404
    getCronSecret?: () => string;
}

// `getData` and `getAuth` run per request: a config error is a 500. The demo never touches them
export function createApp(
    getData: () => CachedAdapter,
    { demo = createDemoData(), getAuth, getAccounts, getCronSecret }: AppOptions = {}
) {
    const app = new Hono().basePath('/api');
    if (getAuth !== undefined) app.route('/', createAuthRoutes(getAuth));
    if (getAuth !== undefined && getAccounts !== undefined) {
        app.route('/', createBacklogRoutes({ getData, getAuth, getAccounts }));
        app.route('/', createAccountRoutes({ getData, getAuth, getAccounts }));
    }
    if (getAccounts !== undefined && getCronSecret !== undefined) {
        app.route('/', createCronRoutes({ getData, getAccounts, getCronSecret }));
    }

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

    // Store images of games whose default cover failed; only games of that library
    app.get('/art/:input', async (c) => {
        const data = getData();
        const input = data.parseInput(c.req.param('input'));
        const appids = parseAppids(c.req.query('appids'));
        if (input.kind === 'invalid' || appids === null) return failure(c, 'invalidInput', 400);
        const result = await data.resolveArt(input, appids);
        return access(c, result, result.kind === 'ok' ? ART_CACHE_CONTROL : undefined);
    });

    // Asks Steam again past the cache, once per cooldown per account. The answer carries the fresh data: the CDN may still hold the old GET
    app.post('/refresh/:input', async (c) => {
        const data = getData();
        const input = data.parseInput(c.req.param('input'));
        if (input.kind === 'invalid') return failure(c, 'invalidInput', 400);

        const result = await data.refresh(input);
        if (result.kind === 'cooldown') return retryLater(c, 'cooldown', 429, result.retryAfterSeconds);
        if (result.kind === 'rateLimited') return retryLater(c, 'rateLimited', 503, result.retryAfterSeconds);
        c.header('Cache-Control', NO_STORE);
        return c.json(result);
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
        if (error instanceof DatabaseError) {
            console.error('[api] database failure:', error.message);
            return failure(c, 'database', 503);
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
