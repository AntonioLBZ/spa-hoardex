import { afterEach, describe, expect, it, vi } from 'vitest';
import { STEAM_OPENID_ENDPOINT } from '../core/adapters/steam/openid.js';
import { createSteamAdapter } from '../core/adapters/steam/index.js';
import { TEST_KEY, createFakeFetch, routes } from '../core/adapters/steam/test-utils.js';
import { createCachedAdapter } from '../core/cache/cached-adapter.js';
import { createMemoryStore } from '../core/cache/store.js';
import { createApp } from './app.js';
import { safeReturnTo, type AuthDeps } from './auth.js';

const ORIGIN = 'https://hoardex.example';
const ID = '76561198000000001';
const SECRET = 'a'.repeat(48);
const NOW = new Date('2026-10-09T16:00:00Z');

afterEach(() => vi.restoreAllMocks());

function setup({
    valid = true,
    recordLogin = async () => 0,
}: { valid?: boolean; recordLogin?: AuthDeps['recordLogin'] } = {}) {
    const seen = new Set<string>();
    const steam = vi.fn((_input: string | URL | Request, _init?: RequestInit) =>
        Promise.resolve(new Response(`ns:http://specs.openid.net/auth/2.0\nis_valid:${valid}\n`))
    );
    const auth: AuthDeps = {
        secret: SECRET,
        isAllowedOrigin: (origin) => origin === ORIGIN,
        claimNonce: async (nonce) => !seen.has(nonce) && !!seen.add(nonce),
        recordLogin,
        fetch: steam,
        now: () => NOW,
    };
    const adapter = createSteamAdapter({
        apiKey: TEST_KEY,
        fetch: createFakeFetch(routes({ summaries: 'GetPlayerSummaries.public' })).fetch,
        onDrift: () => {},
    });
    const data = createCachedAdapter({ adapter, store: createMemoryStore() });
    const app = createApp(() => data, { getAuth: () => auth });
    const request = (path: string, init?: RequestInit) => app.request(`${ORIGIN}${path}`, init);
    return { request, steam };
}

function cookiesOf(response: Response): Record<string, string> {
    const cookies: Record<string, string> = {};
    for (const header of response.headers.getSetCookie()) {
        const [pair = ''] = header.split(';');
        const [name = '', ...value] = pair.split('=');
        cookies[name] = header;
        cookies[`${name}=`] = value.join('=');
    }
    return cookies;
}

async function startLogin(request: ReturnType<typeof setup>['request'], returnTo?: string) {
    const query = returnTo === undefined ? '' : `?returnTo=${encodeURIComponent(returnTo)}`;
    const response = await request(`/api/auth/steam/login${query}`);
    const steamUrl = new URL(response.headers.get('location') ?? '');
    const returnToUrl = steamUrl.searchParams.get('openid.return_to') ?? '';
    const loginCookie = cookiesOf(response)['hx_login='] ?? '';
    return { response, steamUrl, returnToUrl, loginCookie };
}

function steamAssertion(returnTo: string, overrides: Record<string, string> = {}) {
    const query = new URL(returnTo).searchParams;
    const fields = {
        'openid.ns': 'http://specs.openid.net/auth/2.0',
        'openid.mode': 'id_res',
        'openid.op_endpoint': STEAM_OPENID_ENDPOINT,
        'openid.claimed_id': `https://steamcommunity.com/openid/id/${ID}`,
        'openid.identity': `https://steamcommunity.com/openid/id/${ID}`,
        'openid.return_to': returnTo,
        'openid.response_nonce': '2026-10-09T15:59:50Zunique',
        'openid.assoc_handle': '1234567890',
        'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
        'openid.sig': 'c2lnbmF0dXJl',
        ...overrides,
    };
    for (const [name, value] of Object.entries(fields)) query.set(name, value);
    return `${new URL(returnTo).pathname}?${query}`;
}

async function signIn(request: ReturnType<typeof setup>['request'], returnTo?: string) {
    const login = await startLogin(request, returnTo);
    const response = await request(steamAssertion(login.returnToUrl), {
        headers: { cookie: `hx_login=${login.loginCookie}` },
    });
    return { response, session: cookiesOf(response)['hx_session='] ?? '' };
}

describe('GET /api/auth/steam/login', () => {
    it('sends the browser to Steam with our origin as realm and a state bound to a short cookie', async () => {
        const { request } = setup();
        const { response, steamUrl, returnToUrl } = await startLogin(request, '/p/someone');
        expect(response.status).toBe(302);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(steamUrl.origin + steamUrl.pathname).toBe(STEAM_OPENID_ENDPOINT);
        expect(steamUrl.searchParams.get('openid.realm')).toBe(ORIGIN);
        expect(returnToUrl).toMatch(new RegExp(`^${ORIGIN}/api/auth/steam/callback\\?state=[\\w-]{22}$`));

        const cookie = cookiesOf(response).hx_login ?? '';
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('Secure');
        expect(cookie).toContain('SameSite=Lax');
        expect(cookie).toContain('Path=/api/auth');
        expect(cookie).toContain('Max-Age=600');
    });

    it('refuses an origin outside the allowlist', async () => {
        const app = createApp(
            () => {
                throw new Error('unused');
            },
            {
                getAuth: () => ({
                    secret: SECRET,
                    isAllowedOrigin: () => false,
                    claimNonce: async () => true,
                    recordLogin: async () => 0,
                }),
            }
        );
        const response = await app.request(`${ORIGIN}/api/auth/steam/login`);
        expect(response.status).toBe(400);
        expect(response.headers.getSetCookie()).toEqual([]);
    });
});

describe('GET /api/auth/steam/login on another production address', () => {
    it('moves to the same login on the public domain, keeping a safe return path', async () => {
        const app = createApp(
            () => {
                throw new Error('unused');
            },
            {
                getAuth: () => ({
                    secret: SECRET,
                    isAllowedOrigin: (origin) => origin === ORIGIN,
                    canonicalOrigin: ORIGIN,
                    claimNonce: async () => true,
                    recordLogin: async () => 0,
                }),
            }
        );
        const response = await app.request('https://deployment.example/api/auth/steam/login?returnTo=%2Fdemo');
        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe(`${ORIGIN}/api/auth/steam/login?returnTo=%2Fdemo`);
        expect(response.headers.getSetCookie()).toEqual([]);

        const unsafe = await app.request('https://deployment.example/api/auth/steam/login?returnTo=%2F%2Fevil.example');
        expect(unsafe.headers.get('location')).toBe(`${ORIGIN}/api/auth/steam/login`);
    });
});

describe('GET /api/auth/steam/callback', () => {
    it('starts a session and goes to the visitor’s own profile', async () => {
        const { request, steam } = setup();
        const { response, session } = await signIn(request);
        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe(`/p/${ID}`);
        expect(steam).toHaveBeenCalledOnce();

        const cookie = cookiesOf(response).hx_session ?? '';
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('Secure');
        expect(cookie).toContain('SameSite=Lax');
        expect(cookie).toContain('Path=/api');
        expect(cookiesOf(response)['hx_login=']).toBe('');

        const me = await request('/api/me', { headers: { cookie: `hx_session=${session}` } });
        expect(me.headers.get('cache-control')).toBe('no-store');
        expect(await me.json()).toEqual({ user: { steamId: ID } });
    });

    it('goes back to the page where the login started', async () => {
        const { request } = setup();
        const { response } = await signIn(request, '/p/someone?state=backlog');
        expect(response.headers.get('location')).toBe('/p/someone?state=backlog');
    });

    it.each(['//evil.example/p', '/.//evil.example/p'])('ignores the return path %s', async (path) => {
        const { request } = setup();
        const { response } = await signIn(request, path);
        expect(response.headers.get('location')).toBe(`/p/${ID}`);
    });

    it('keeps a return path that holds a dot', async () => {
        const { request } = setup();
        const { response } = await signIn(request, '/p/someone?q=dr. mario');
        expect(response.headers.get('location')).toBe('/p/someone?q=dr.%20mario');
    });

    it('fails without the login cookie, so another browser cannot finish the sign-in', async () => {
        const { request, steam } = setup();
        const login = await startLogin(request);
        const response = await request(steamAssertion(login.returnToUrl));
        expect(response.headers.get('location')).toBe('/?login=failed');
        expect(cookiesOf(response)['hx_session=']).toBeUndefined();
        expect(steam).not.toHaveBeenCalled();
    });

    it('fails when a field is repeated, so the session cannot go to another account', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const recordLogin = vi.fn(async () => 0);
        const { request, steam } = setup({ recordLogin });
        const login = await startLogin(request);
        const other = encodeURIComponent('https://steamcommunity.com/openid/id/76561198000000002');
        const path = steamAssertion(login.returnToUrl).replace(
            '?',
            `?openid.claimed_id=${other}&openid.identity=${other}&`
        );
        const response = await request(path, { headers: { cookie: `hx_login=${login.loginCookie}` } });
        expect(response.headers.get('location')).toBe('/?login=failed');
        expect(cookiesOf(response)['hx_session=']).toBeUndefined();
        expect(steam).not.toHaveBeenCalled();
        expect(recordLogin).not.toHaveBeenCalled();
    });

    it('fails when Steam does not confirm the assertion', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { request } = setup({ valid: false });
        const { response, session } = await signIn(request);
        expect(response.headers.get('location')).toBe('/?login=failed');
        expect(session).toBe('');
    });

    it('records the account and puts its session epoch in the token', async () => {
        const recordLogin = vi.fn(async () => 3);
        const { request } = setup({ recordLogin });
        const { session } = await signIn(request);
        expect(recordLogin).toHaveBeenCalledWith(ID);
        expect(JSON.parse(Buffer.from(session.split('.')[1] ?? '', 'base64url').toString())).toMatchObject({
            sub: ID,
            epoch: 3,
        });
    });

    it('fails without a session when the account cannot be recorded', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { request } = setup({ recordLogin: () => Promise.reject(new Error('database down')) });
        const { response, session } = await signIn(request);
        expect(response.headers.get('location')).toBe('/?login=failed');
        expect(session).toBe('');
    });

    it('fails when the same assertion comes back twice', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { request } = setup();
        const login = await startLogin(request);
        const path = steamAssertion(login.returnToUrl);
        const headers = { cookie: `hx_login=${login.loginCookie}` };
        expect((await request(path, { headers })).headers.get('location')).toBe(`/p/${ID}`);
        expect((await request(path, { headers })).headers.get('location')).toBe('/?login=failed');
    });
});

describe('GET /api/me', () => {
    it('is signed out without a cookie or with a forged one', async () => {
        const { request } = setup();
        expect(await (await request('/api/me')).json()).toEqual({ user: null });
        const forged = await request('/api/me', { headers: { cookie: 'hx_session=eyJhbGciOiJub25lIn0.e30.' } });
        expect(await forged.json()).toEqual({ user: null });
    });
});

describe('POST /api/auth/logout', () => {
    it('clears the session when the request comes from our own page', async () => {
        const { request } = setup();
        const { session } = await signIn(request);
        const response = await request('/api/auth/logout', {
            method: 'POST',
            headers: { cookie: `hx_session=${session}`, origin: ORIGIN },
        });
        expect(response.status).toBe(200);
        expect(cookiesOf(response).hx_session).toContain('Max-Age=0');
    });

    it('refuses a request from another site', async () => {
        const { request } = setup();
        const response = await request('/api/auth/logout', {
            method: 'POST',
            headers: { origin: 'https://evil.example' },
        });
        expect(response.status).toBe(403);
        expect(response.headers.getSetCookie()).toEqual([]);
    });
});

describe('public GETs with a session cookie', () => {
    it('never set a cookie, so the CDN can keep caching them', async () => {
        const { request } = setup();
        const { session } = await signIn(request);
        const response = await request(`/api/profile/${ID}`, { headers: { cookie: `hx_session=${session}` } });
        expect(response.status).toBe(200);
        expect(response.headers.getSetCookie()).toEqual([]);
    });
});

describe('safeReturnTo', () => {
    it.each(['/', '/p/someone', '/demo?state=backlog'])('keeps %s', (path) => {
        expect(safeReturnTo(path)).toBe(path);
    });

    it.each([
        undefined,
        '',
        'https://evil.example/',
        '//evil.example',
        '/\\evil.example',
        '/.//evil.example',
        '/a/..//evil.example',
        '/%2e//evil.example',
        '/./\\evil.example',
        '/api/me',
        '/api',
        '/p/\nx',
        `/${'a'.repeat(600)}`,
    ])('drops %s', (path) => {
        expect(safeReturnTo(path)).toBeNull();
    });
});
