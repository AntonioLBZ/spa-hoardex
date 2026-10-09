import { sign } from 'hono/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBacklogService, createSqlRepository } from '../core/accounts/index.js';
import { createTestDatabase } from '../core/accounts/test-db.js';
import { createSteamAdapter } from '../core/adapters/steam/index.js';
import { TEST_KEY, createFakeFetch, routes } from '../core/adapters/steam/test-utils.js';
import { createCachedAdapter } from '../core/cache/cached-adapter.js';
import { createMemoryStore } from '../core/cache/store.js';
import { createApp } from './app.js';

const ORIGIN = 'https://hoardex.example';
const ID = '76561198000000001';
const SECRET = 'a'.repeat(48);
const NOW = new Date('2026-10-09T16:00:00Z');
const OWNED = '220';

let database: Awaited<ReturnType<typeof createTestDatabase>>;

beforeAll(async () => {
    database = await createTestDatabase();
});
afterAll(() => database.db.close());
beforeEach(() => database.reset());

function setup() {
    const steam = createFakeFetch(routes({ vanity: 'ResolveVanityURL.found', ownedGames: 'GetOwnedGames.library' }));
    const adapter = createSteamAdapter({ apiKey: TEST_KEY, fetch: steam.fetch, onDrift: () => {} });
    const store = createMemoryStore();
    const data = createCachedAdapter({ adapter, store });
    const repository = createSqlRepository(database.query);
    const listOverrides = vi.spyOn(repository, 'listOverrides');
    const backlog = createBacklogService({ repository, store, now: () => NOW });
    const app = createApp(() => data, {
        getAuth: () => ({
            secret: SECRET,
            isAllowedOrigin: (origin) => origin === ORIGIN,
            claimNonce: async () => true,
            recordLogin: async () => 0,
        }),
        getAccounts: () => ({ repository, backlog }),
    });

    async function session(epoch = 0) {
        await repository.recordLogin({ source: 'steam', externalId: ID }, NOW);
        const iat = Math.floor(Date.now() / 1000);
        return `hx_session=${await sign({ sub: ID, epoch, iat, exp: iat + 3600 }, SECRET, 'HS256')}`;
    }

    async function call(method: string, path: string, { cookie, body, origin = ORIGIN }: CallOptions = {}) {
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (cookie !== undefined) headers.cookie = cookie;
        if (origin !== null) headers.origin = origin;
        const response = await app.request(`${ORIGIN}${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { response, body: (await response.json()) as Record<string, unknown> };
    }

    return { call, session, listOverrides, steamCalls: () => steam.calls.length };
}

interface CallOptions {
    cookie?: string;
    body?: unknown;
    origin?: string | null;
}

describe('PUT /api/me/backlog/:appid', () => {
    it('sets a state with the game’s playtime, and the owner and visitors read it back', async () => {
        const { call, session } = setup();
        const cookie = await session();

        const put = await call('PUT', `/api/me/backlog/${OWNED}`, { cookie, body: { state: 'abandoned' } });
        expect(put.response.status).toBe(200);
        expect(put.response.headers.get('cache-control')).toBe('no-store');
        const overrides = { [OWNED]: { state: 'abandoned', minutesAtSet: 1840, setAt: NOW.toISOString() } };
        expect(put.body).toEqual({ kind: 'ok', data: { overrides } });

        const mine = await call('GET', '/api/me/backlog', { cookie, origin: null });
        expect(mine.response.headers.get('cache-control')).toBe('no-store');
        expect(mine.body).toEqual({ kind: 'ok', data: { overrides } });

        const visitor = await call('GET', `/api/backlog/${ID}`, { origin: null });
        expect(visitor.response.headers.get('cache-control')).toBe('public, s-maxage=60, stale-while-revalidate=300');
        expect(visitor.body).toEqual({ kind: 'ok', data: { overrides } });
    });

    it('stores the retired completed state as finished', async () => {
        const { call, session } = setup();
        const put = await call('PUT', `/api/me/backlog/${OWNED}`, {
            cookie: await session(),
            body: { state: 'completed' },
        });
        expect(put.response.status).toBe(200);
        expect(put.body).toMatchObject({ data: { overrides: { [OWNED]: { state: 'finished' } } } });
    });

    it('refuses a game outside the owner’s library', async () => {
        const { call, session } = setup();
        const put = await call('PUT', '/api/me/backlog/999999', {
            cookie: await session(),
            body: { state: 'finished' },
        });
        expect(put.response.status).toBe(404);
        expect(put.body).toEqual({ error: 'notOwned' });
    });

    it.each([
        ['an unknown state', '220', { state: 'wishlisted' }],
        ['no body', '220', undefined],
        ['an appid that is not a number', 'abc', { state: 'finished' }],
    ])('refuses %s', async (_case, appid, body) => {
        const { call, session } = setup();
        const put = await call('PUT', `/api/me/backlog/${appid}`, { cookie: await session(), body });
        expect(put.response.status).toBe(400);
    });

    it('refuses a request without a session, from another site, or with an ended session', async () => {
        const { call, session } = setup();
        const body = { state: 'finished' };
        expect((await call('PUT', `/api/me/backlog/${OWNED}`, { body })).response.status).toBe(401);
        const cookie = await session();
        const foreign = await call('PUT', `/api/me/backlog/${OWNED}`, { cookie, body, origin: 'https://evil.example' });
        expect(foreign.response.status).toBe(403);
        const stale = await call('PUT', `/api/me/backlog/${OWNED}`, { cookie: await session(1), body });
        expect(stale.response.status).toBe(401);
    });
});

describe('DELETE /api/me/backlog/:appid', () => {
    it('goes back to the computed state', async () => {
        const { call, session } = setup();
        const cookie = await session();
        await call('PUT', `/api/me/backlog/${OWNED}`, { cookie, body: { state: 'finished' } });

        const removed = await call('DELETE', `/api/me/backlog/${OWNED}`, { cookie });
        expect(removed.body).toEqual({ kind: 'ok', data: { overrides: {} } });
        expect((await call('GET', `/api/backlog/${ID}`, { origin: null })).body).toEqual({
            kind: 'ok',
            data: { overrides: {} },
        });
    });
});

describe('GET /api/backlog/:input', () => {
    it('answers empty for a profile without an account, and serves the repeat from Redis', async () => {
        const { call, listOverrides } = setup();
        const first = await call('GET', `/api/backlog/${ID}`, { origin: null });
        expect(first.body).toEqual({ kind: 'ok', data: { overrides: {} } });
        await call('GET', `/api/backlog/${ID}`, { origin: null });
        expect(listOverrides).toHaveBeenCalledOnce();
    });

    it('resolves a vanity name, and rejects input that is not a profile', async () => {
        const { call, steamCalls } = setup();
        expect((await call('GET', '/api/backlog/some_name', { origin: null })).body).toMatchObject({ kind: 'ok' });
        expect(steamCalls()).toBe(1);
        expect((await call('GET', '/api/backlog/%20', { origin: null })).response.status).toBe(400);
    });
});

describe('GET /api/me/backlog', () => {
    it('needs a session', async () => {
        const { call } = setup();
        const response = await call('GET', '/api/me/backlog', { origin: null });
        expect(response.response.status).toBe(401);
        expect(response.body).toEqual({ error: 'signedOut' });
    });
});
