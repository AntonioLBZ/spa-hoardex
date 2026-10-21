import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { buildSteamLoginUrl, verifySteamLogin } from '../core/adapters/steam/openid.js';
import { AUTH_TTL } from '../core/auth/ttl.js';
import { noStore } from './http.js';
import { endSession, isSecure, readSession, startSession } from './session.js';

export interface AuthDeps {
    secret: string;
    // Origins allowed as OpenID realm and as the Origin of a mutation
    isAllowedOrigin(origin: string): boolean;
    // Production's public domain: a sign-in started on another address of it (a deployment URL) moves there
    canonicalOrigin?: string;
    // True the first time a nonce is seen
    claimNonce(nonce: string): Promise<boolean>;
    // Creates or touches the account; returns its session epoch
    recordLogin(steamId: string): Promise<number>;
    fetch?: typeof fetch;
    now?: () => Date;
}

// Ties the Steam callback to the browser that started the login
const LOGIN_COOKIE = 'hx_login';
const LOGIN_PATH = '/api/auth';
const LOGIN_MAX_AGE_SECONDS = AUTH_TTL.login;
const CALLBACK_PATH = '/api/auth/steam/callback';
const FAILED_REDIRECT = '/?login=failed';
const MAX_RETURN_TO_LENGTH = 512;

// A path on our own site, never another host nor the API
export function safeReturnTo(value: string | undefined): string | null {
    if (value === undefined || value.length > MAX_RETURN_TO_LENGTH) return null;
    if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
    if (/\p{Cc}/u.test(value)) return null;
    const base = 'https://base.invalid';
    const url = new URL(value, base);
    if (url.origin !== base || url.pathname === '/api' || url.pathname.startsWith('/api/')) return null;
    if (url.pathname.startsWith('//')) return null;
    return url.pathname + url.search;
}

// The state (never holds a dot), then the percent-encoded return path (may)
function splitLoginCookie(cookie: string): [string, string] {
    const dot = cookie.indexOf('.');
    return dot === -1 ? [cookie, ''] : [cookie.slice(0, dot), cookie.slice(dot + 1)];
}

function randomState(): string {
    return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
}

function decodeOrUndefined(value: string): string | undefined {
    try {
        return decodeURIComponent(value);
    } catch {
        return undefined;
    }
}

function originOf(c: Context): string {
    return new URL(c.req.url).origin;
}

// A mutation must come from one of our own pages
export function isSameOrigin(c: Context, auth: Pick<AuthDeps, 'isAllowedOrigin'>): boolean {
    const origin = c.req.header('origin');
    return origin !== undefined && origin === originOf(c) && auth.isAllowedOrigin(origin);
}

// `getAuth` runs per request, like `getData`: a config error is a 500
export function createAuthRoutes(getAuth: () => AuthDeps) {
    const routes = new Hono();

    routes.get('/auth/steam/login', (c) => {
        const auth = getAuth();
        noStore(c);
        const origin = originOf(c);
        if (!auth.isAllowedOrigin(origin)) {
            if (auth.canonicalOrigin === undefined) return c.json({ error: 'origin' }, 400);
            const moved = new URL('/api/auth/steam/login', auth.canonicalOrigin);
            const returnTo = safeReturnTo(c.req.query('returnTo'));
            if (returnTo !== null) moved.searchParams.set('returnTo', returnTo);
            return c.redirect(moved.href);
        }

        const state = randomState();
        const returnTo = safeReturnTo(c.req.query('returnTo')) ?? '';
        setCookie(c, LOGIN_COOKIE, `${state}.${encodeURIComponent(returnTo)}`, {
            httpOnly: true,
            secure: isSecure(c),
            sameSite: 'Lax',
            path: LOGIN_PATH,
            maxAge: LOGIN_MAX_AGE_SECONDS,
        });
        return c.redirect(buildSteamLoginUrl({ realm: origin, returnTo: `${origin}${CALLBACK_PATH}?state=${state}` }));
    });

    routes.get('/auth/steam/callback', async (c) => {
        const auth = getAuth();
        noStore(c);
        const origin = originOf(c);
        if (!auth.isAllowedOrigin(origin)) return c.json({ error: 'origin' }, 400);

        const cookie = getCookie(c, LOGIN_COOKIE) ?? '';
        deleteCookie(c, LOGIN_COOKIE, { path: LOGIN_PATH, secure: isSecure(c), httpOnly: true, sameSite: 'Lax' });
        const [state, encodedReturnTo] = splitLoginCookie(cookie);
        if (state === '' || c.req.query('state') !== state) {
            console.warn('[auth] login failed: state');
            return c.redirect(FAILED_REDIRECT);
        }

        const result = await verifySteamLogin(new URL(c.req.url).searchParams, {
            expectedReturnTo: `${origin}${CALLBACK_PATH}?state=${state}`,
            claimNonce: (nonce) => auth.claimNonce(nonce),
            fetch: auth.fetch,
            now: auth.now,
        });
        if (result.kind === 'invalid') {
            console.warn('[auth] login failed:', result.reason);
            return c.redirect(FAILED_REDIRECT);
        }

        let epoch: number;
        try {
            epoch = await auth.recordLogin(result.steamId);
        } catch (error) {
            console.error('[auth] login failed: account', error instanceof Error ? error.name : 'unknown error');
            return c.redirect(FAILED_REDIRECT);
        }
        await startSession(c, auth.secret, { steamId: result.steamId, epoch }, auth.now?.());
        const returnTo = safeReturnTo(decodeOrUndefined(encodedReturnTo));
        return c.redirect(returnTo === null || returnTo === '/' ? `/p/${result.steamId}` : returnTo);
    });

    routes.get('/me', async (c) => {
        const auth = getAuth();
        noStore(c);
        const session = await readSession(c, auth.secret);
        return c.json({ user: session === null ? null : { steamId: session.steamId } });
    });

    // SameSite=Lax already keeps the cookie off cross-site POSTs; Origin is the second check
    routes.post('/auth/logout', (c) => {
        const auth = getAuth();
        noStore(c);
        if (!isSameOrigin(c, auth)) return c.json({ error: 'origin' }, 403);
        endSession(c);
        return c.json({ user: null });
    });

    return routes;
}
