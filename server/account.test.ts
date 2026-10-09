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
const CRON = 'c'.repeat(48);
const NOW = new Date('2026-10-09T16:00:00Z');

let database: Awaited<ReturnType<typeof createTestDatabase>>;

beforeAll(async () => {
    database = await createTestDatabase();
});
afterAll(() => database.db.close());
beforeEach(() => database.reset());

function setup() {
    const steam = createFakeFetch(routes({ ownedGames: 'GetOwnedGames.library' }));
    const adapter = createSteamAdapter({ apiKey: TEST_KEY, fetch: steam.fetch, onDrift: () => {} });
    const store = createMemoryStore();
    const data = createCachedAdapter({ adapter, store });
    const repository = createSqlRepository(database.query);
    const backlog = createBacklogService({ repository, store, now: () => NOW });
    const app = createApp(() => data, {
        getAuth: () => ({
            secret: SECRET,
            isAllowedOrigin: (origin) => origin === ORIGIN,
            claimNonce: async () => true,
            recordLogin: async () => 0,
        }),
        getAccounts: () => ({ repository, backlog }),
        getCronSecret: () => CRON,
    });

    async function signedIn() {
        const { userId } = await repository.recordLogin({ source: 'steam', externalId: ID }, new Date());
        const iat = Math.floor(Date.now() / 1000);
        const cookie = `hx_session=${await sign({ sub: ID, epoch: 0, iat, exp: iat + 3600 }, SECRET, 'HS256')}`;
        return { userId, cookie };
    }

    async function call(method: string, path: string, init: { cookie?: string; body?: unknown; auth?: string } = {}) {
        const headers: Record<string, string> = { origin: ORIGIN, 'content-type': 'application/json' };
        if (init.cookie !== undefined) headers.cookie = init.cookie;
        if (init.auth !== undefined) headers.authorization = init.auth;
        const response = await app.request(`${ORIGIN}${path}`, {
            method,
            headers,
            body: init.body === undefined ? undefined : JSON.stringify(init.body),
        });
        return { response, body: (await response.json()) as Record<string, unknown> };
    }

    return { call, signedIn, repository, steamCalls: () => steam.calls.length };
}

const snapshotCount = async () =>
    (await database.db.query<{ n: number }>('select count(*)::int as n from snapshot_days')).rows[0]?.n;

describe('account settings', () => {
    it('start with snapshots off', async () => {
        const { call, signedIn } = setup();
        const { cookie } = await signedIn();
        const { response, body } = await call('GET', '/api/me/account', { cookie });
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(body).toEqual({ snapshotsSince: null, snapshotDays: 0, lastSnapshotOn: null });
    });

    it('turn snapshots on with a first snapshot, and off deleting them', async () => {
        const { call, signedIn } = setup();
        const { cookie } = await signedIn();

        const on = await call('PUT', '/api/me/settings', { cookie, body: { snapshots: true } });
        expect(on.body).toMatchObject({ snapshotDays: 1, snapshotsSince: expect.any(String) });

        const off = await call('PUT', '/api/me/settings', { cookie, body: { snapshots: false } });
        expect(off.body).toEqual({ snapshotsSince: null, snapshotDays: 0, lastSnapshotOn: null });
        expect(await snapshotCount()).toBe(0);
    });

    it('refuse a bad body, another site and no session', async () => {
        const { call, signedIn } = setup();
        const { cookie } = await signedIn();
        expect((await call('PUT', '/api/me/settings', { cookie, body: { snapshots: 'yes' } })).response.status).toBe(
            400
        );
        expect((await call('PUT', '/api/me/settings', { body: { snapshots: true } })).response.status).toBe(401);
        expect((await call('GET', '/api/me/account')).response.status).toBe(401);
    });
});

describe('POST /api/me/sessions/end', () => {
    it('ends this session and every other one', async () => {
        const { call, signedIn } = setup();
        const { cookie } = await signedIn();
        const ended = await call('POST', '/api/me/sessions/end', { cookie });
        expect(ended.response.headers.getSetCookie().join()).toContain('hx_session=;');
        expect((await call('GET', '/api/me/account', { cookie })).response.status).toBe(401);
    });
});

describe('DELETE /api/me', () => {
    it('deletes the account with its states and history, and empties the public copy', async () => {
        const { call, signedIn, repository } = setup();
        const { cookie } = await signedIn();
        await call('PUT', '/api/me/backlog/220', { cookie, body: { state: 'abandoned' } });
        await call('PUT', '/api/me/settings', { cookie, body: { snapshots: true } });

        const deleted = await call('DELETE', '/api/me', { cookie });
        expect(deleted.body).toEqual({ user: null });
        expect(await repository.findAccount({ source: 'steam', externalId: ID })).toBeNull();
        expect(await snapshotCount()).toBe(0);
        expect((await call('GET', `/api/backlog/${ID}`)).body).toEqual({ kind: 'ok', data: { overrides: {} } });
    });
});

describe('GET /api/cron/snapshots', () => {
    it('needs the cron secret', async () => {
        const { call } = setup();
        expect((await call('GET', '/api/cron/snapshots')).response.status).toBe(401);
        expect((await call('GET', '/api/cron/snapshots', { auth: 'Bearer wrong' })).response.status).toBe(401);
    });

    it('takes the day’s snapshot of every opted-in account', async () => {
        vi.spyOn(console, 'info').mockImplementation(() => {});
        const { call, signedIn, repository } = setup();
        const { userId } = await signedIn();
        await repository.setSnapshots(userId, true, NOW);

        const run = await call('GET', '/api/cron/snapshots', { auth: `Bearer ${CRON}` });
        expect(run.body).toEqual({ taken: 1, skipped: 0, failed: 0, unfinished: false });
        expect(await snapshotCount()).toBe(1);
    });
});
