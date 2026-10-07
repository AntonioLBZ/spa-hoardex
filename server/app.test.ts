import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadFixture } from '../fixtures/load.js';
import { createSteamAdapter } from '../core/adapters/steam/index.js';
import { TEST_KEY, createFakeFetch, routes } from '../core/adapters/steam/test-utils.js';
import { createCachedAdapter } from '../core/cache/cached-adapter.js';
import { createMemoryStore } from '../core/cache/store.js';
import { createApp } from './app.js';
import { ConfigError } from './deps.js';

const ID = (loadFixture('ResolveVanityURL.found').body as { response: { steamid: string } }).response.steamid;
const GAME_COUNT = (loadFixture('GetOwnedGames.library').body as { response: { games: unknown[] } }).response.games
    .length;

type Table = Parameters<typeof routes>[0];

// Real adapter and cache; only Steam's responses are fake
function setup(table: Table) {
    const fake = createFakeFetch(routes(table));
    const adapter = createSteamAdapter({ apiKey: TEST_KEY, fetch: fake.fetch, onDrift: () => {} });
    const data = createCachedAdapter({ adapter, store: createMemoryStore() });
    const app = createApp(() => data);
    const get = async (path: string) => {
        const response = await app.request(path);
        const text = await response.text();
        return { response, text, body: JSON.parse(text) as Record<string, unknown> };
    };
    return { get, steamCalls: () => fake.calls.length };
}

const PUBLIC = { vanity: 'ResolveVanityURL.found', summaries: 'GetPlayerSummaries.public' };

afterEach(() => vi.restoreAllMocks());

describe('GET /api/profile/:input', () => {
    it('returns the profile for a SteamID64 with CDN headers, and serves the repeat from Redis', async () => {
        const { get, steamCalls } = setup(PUBLIC);
        const first = await get(`/api/profile/${ID}`);
        expect(first.response.status).toBe(200);
        expect(first.response.headers.get('cache-control')).toBe('public, s-maxage=60, stale-while-revalidate=300');
        expect(first.body).toMatchObject({ kind: 'ok', data: { id: { source: 'steam', externalId: ID } } });

        const second = await get(`/api/profile/${ID}`);
        expect(second.body).toEqual(first.body);
        expect(steamCalls()).toBe(1);
    });

    it('resolves a vanity name, and every casing of it shares the cache', async () => {
        const { get, steamCalls } = setup(PUBLIC);
        expect((await get('/api/profile/Some_Name')).body).toMatchObject({ kind: 'ok' });
        expect(steamCalls()).toBe(2);
        await get('/api/profile/SOME_NAME');
        await get(`/api/profile/${ID}`);
        expect(steamCalls()).toBe(2);
    });

    it('accepts a profile URL sent as one encoded segment', async () => {
        const { get } = setup(PUBLIC);
        const url = encodeURIComponent(`https://steamcommunity.com/profiles/${ID}/`);
        expect((await get(`/api/profile/${url}`)).body).toMatchObject({ kind: 'ok' });
    });

    it.each(['a', 'bad%20name', 'x'.repeat(40), '%E0%A4%A', encodeURIComponent('https://evil.example/id/someone')])(
        'rejects the input %j with a 400 and never calls Steam',
        async (input) => {
            const { get, steamCalls } = setup({});
            const { response, body } = await get(`/api/profile/${input}`);
            expect(response.status).toBe(400);
            expect(response.headers.get('cache-control')).toBe('no-store');
            expect(body).toEqual({ error: 'invalidInput' });
            expect(steamCalls()).toBe(0);
        }
    );

    it('answers notFound as data, cached for a short time', async () => {
        const { get } = setup({ summaries: 'GetPlayerSummaries.empty' });
        const { response, body } = await get(`/api/profile/${ID}`);
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('public, s-maxage=30');
        expect(body).toEqual({ kind: 'notFound' });
    });
});

describe('GET /api/library/:id', () => {
    it('returns the library and serves the repeat from Redis', async () => {
        const { get, steamCalls } = setup({ ownedGames: 'GetOwnedGames.library' });
        const first = await get(`/api/library/${ID}`);
        expect(first.response.headers.get('cache-control')).toBe('public, s-maxage=60, stale-while-revalidate=300');
        expect(first.body).toMatchObject({ kind: 'ok', data: { owner: { externalId: ID } } });
        expect((first.body.data as { games: unknown[] }).games).toHaveLength(GAME_COUNT);

        await get(`/api/library/${ID}`);
        expect(steamCalls()).toBe(1);
    });

    it('tells a private profile from a public one with private game details', async () => {
        const privateProfile = setup({ ownedGames: 'GetOwnedGames.private', summaries: 'GetPlayerSummaries.private' });
        expect((await privateProfile.get(`/api/library/${ID}`)).body).toEqual({ kind: 'profilePrivate' });

        const privateDetails = setup({ ownedGames: 'GetOwnedGames.private', summaries: 'GetPlayerSummaries.public' });
        const { response, body } = await privateDetails.get(`/api/library/${ID}`);
        expect(body).toEqual({ kind: 'libraryPrivate' });
        expect(response.headers.get('cache-control')).toBe('public, s-maxage=30');
    });

    it('answers rateLimited as data that the CDN must not keep', async () => {
        const { get } = setup({ ownedGames: 'GetOwnedGames.rateLimited' });
        const { response, body } = await get(`/api/library/${ID}`);
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(body).toEqual({ kind: 'rateLimited' });
    });

    it.each(['some_vanity', 'a', 'bad%20name'])('needs an account id: rejects %j with a 400', async (input) => {
        const { get, steamCalls } = setup({});
        const { response, body } = await get(`/api/library/${input}`);
        expect(response.status).toBe(400);
        expect(body).toEqual({ error: 'invalidInput' });
        expect(steamCalls()).toBe(0);
    });
});

describe('failures', () => {
    it('maps an upstream failure to a 502 without leaking details', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { get } = setup({ ownedGames: () => new Response('<html>boom</html>', { status: 503 }) });
        const { response, text, body } = await get(`/api/library/${ID}`);
        expect(response.status).toBe(502);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(body).toEqual({ error: 'upstream' });
        expect(text).not.toContain(TEST_KEY);
        expect(JSON.stringify(log.mock.calls)).not.toContain(TEST_KEY);
    });

    it('maps a configuration mistake to a 500 with a code only', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const app = createApp(() => {
            throw new ConfigError('STEAM_API_KEY is not set');
        });
        const response = await app.request(`/api/profile/${ID}`);
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'misconfigured' });
        expect(log).toHaveBeenCalled();
    });

    it('maps any other error to a generic 500', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const app = createApp(() => {
            throw new Error('secret detail');
        });
        const response = await app.request(`/api/profile/${ID}`);
        expect(response.status).toBe(500);
        expect(await response.text()).not.toContain('secret detail');
    });

    it('answers unknown routes with a JSON 404', async () => {
        const { get } = setup({});
        for (const path of ['/api/nope', '/api/profile', '/api/library/a/b']) {
            const { response, body } = await get(path);
            expect(response.status).toBe(404);
            expect(body).toEqual({ error: 'notFound' });
        }
    });
});

describe('GET /api/health', () => {
    it('answers without touching Steam or the cache', async () => {
        const app = createApp(() => {
            throw new Error('must not be called');
        });
        const response = await app.request('/api/health');
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
    });
});

describe('GET /api/demo/*', () => {
    // A config error from getData would fail every other route
    function demoApp() {
        const app = createApp(() => {
            throw new ConfigError('STEAM_API_KEY is not set');
        });
        return async (path: string) => {
            const response = await app.request(path);
            return { response, body: (await response.json()) as Record<string, unknown> };
        };
    }

    it('serves the fictional profile without a key', async () => {
        const { response, body } = await demoApp()('/api/demo/profile');

        expect(response.status).toBe(200);
        expect(body).toMatchObject({ kind: 'ok', data: { displayName: 'Demo Hoarder' } });
    });

    it('serves the fictional library without a key', async () => {
        const { response, body } = await demoApp()('/api/demo/library');

        expect(response.status).toBe(200);
        expect(body).toMatchObject({ kind: 'ok', data: { games: expect.any(Array) } });
        expect((body.data as { games: unknown[] }).games).toHaveLength(96);
    });

    it('lets the CDN hold it for an hour', async () => {
        const { response } = await demoApp()('/api/demo/library');

        expect(response.headers.get('cache-control')).toBe('public, s-maxage=3600, stale-while-revalidate=86400');
    });

    it('answers unknown demo routes with a JSON 404', async () => {
        const { response, body } = await demoApp()('/api/demo/nope');

        expect(response.status).toBe(404);
        expect(body).toEqual({ error: 'notFound' });
    });
});
