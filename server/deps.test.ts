import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEST_KEY, createFakeFetch, routes } from '../core/adapters/steam/test-utils.js';
import { ConfigError, buildAccounts, buildAuth, buildCachedAdapter, originPolicy, type Env } from './deps.js';

const ID = '76561198000000001';

afterEach(() => vi.restoreAllMocks());

function build(env: Env, table: Parameters<typeof routes>[0] = {}) {
    const fake = createFakeFetch(routes(table));
    return { data: buildCachedAdapter(env, { fetch: fake.fetch }), fake };
}

describe('buildCachedAdapter', () => {
    it('refuses to start without the Steam key', () => {
        expect(() => build({})).toThrow(new ConfigError('STEAM_API_KEY is not set'));
    });

    it('requires Redis in production', () => {
        expect(() => build({ STEAM_API_KEY: TEST_KEY, VERCEL_ENV: 'production' })).toThrow(ConfigError);
    });

    it.each(['0', '-5', '1.5', 'many'])('rejects STEAM_DAILY_BUDGET=%s', (value) => {
        expect(() => build({ STEAM_API_KEY: TEST_KEY, STEAM_DAILY_BUDGET: value })).toThrow(ConfigError);
    });

    it('falls back to an in-memory cache outside production, and says so', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { data, fake } = build({ STEAM_API_KEY: TEST_KEY }, { summaries: 'GetPlayerSummaries.public' });
        const input = data.parseInput(ID);
        if (input.kind !== 'id') throw new Error('expected an id');
        await data.resolveProfile(input);
        await data.resolveProfile(input);
        expect(fake.calls).toHaveLength(1);
        expect(warn).toHaveBeenCalledOnce();
    });

    it('stops calling Steam once the daily budget is spent', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { data, fake } = build(
            { STEAM_API_KEY: TEST_KEY, STEAM_DAILY_BUDGET: '1' },
            { summaries: 'GetPlayerSummaries.public' }
        );
        const first = data.parseInput(ID);
        const second = data.parseInput('76561198000000002');
        if (first.kind !== 'id' || second.kind !== 'id') throw new Error('expected ids');
        expect((await data.resolveProfile(first)).kind).toBe('ok');
        expect(await data.resolveProfile(second)).toEqual({ kind: 'rateLimited' });
        expect(fake.calls).toHaveLength(1);
    });

    it('never puts the key in an error', () => {
        const error = (() => {
            try {
                build({ STEAM_API_KEY: TEST_KEY, VERCEL_ENV: 'production' });
            } catch (caught) {
                return caught as Error;
            }
        })();
        expect(String(error?.message)).not.toContain(TEST_KEY);
    });
});

describe('originPolicy', () => {
    it('allows only localhost in development', () => {
        const allowed = originPolicy({});
        expect(allowed('http://localhost:3000')).toBe(true);
        expect(allowed('https://localhost:3000')).toBe(false);
        expect(allowed('http://localhost.evil.example:3000')).toBe(false);
    });

    it('allows only the production domain in production', () => {
        const allowed = originPolicy({ VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'hoardex.example' });
        expect(allowed('https://hoardex.example')).toBe(true);
        expect(allowed('http://hoardex.example')).toBe(false);
        expect(allowed('http://localhost:3000')).toBe(false);
    });

    it('allows the deployment and branch URLs of a preview', () => {
        const allowed = originPolicy({
            VERCEL_ENV: 'preview',
            VERCEL_URL: 'a.example',
            VERCEL_BRANCH_URL: 'b.example',
        });
        expect(allowed('https://a.example')).toBe(true);
        expect(allowed('https://b.example')).toBe(true);
        expect(allowed('https://hoardex.example')).toBe(false);
    });

    it('refuses to start in production without the domain', () => {
        expect(() => originPolicy({ VERCEL_ENV: 'production' })).toThrow(ConfigError);
    });
});

describe('buildAuth', () => {
    it.each([undefined, '', 'short-secret'])('refuses SESSION_SECRET=%s', (secret) => {
        expect(() => buildAuth({ SESSION_SECRET: secret })).toThrow(ConfigError);
    });

    it('claims each nonce once', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const auth = buildAuth({ SESSION_SECRET: 'a'.repeat(32) });
        expect(await auth.claimNonce('2026-10-09T16:00:00Zx')).toBe(true);
        expect(await auth.claimNonce('2026-10-09T16:00:00Zx')).toBe(false);
    });
});

describe('buildAccounts', () => {
    it('refuses to start without a database', () => {
        expect(() => buildAccounts({})).toThrow(new ConfigError('DATABASE_URL is not set'));
    });

    it('accepts the integration’s variable when DATABASE_URL is missing', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(() =>
            buildAccounts({ NEON_STORAGE_DATABASE_URL: 'postgresql://user:pass@ep-test.example/neondb' })
        ).not.toThrow();
    });
});

describe('buildAuth in production', () => {
    it('names the public domain as the canonical origin', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const env = {
            SESSION_SECRET: 'a'.repeat(32),
            VERCEL_ENV: 'production',
            VERCEL_PROJECT_PRODUCTION_URL: 'hoardex.example',
        };
        const store = { UPSTASH_KV_REST_API_URL: 'https://redis.example', UPSTASH_KV_REST_API_TOKEN: 'token' };
        expect(buildAuth({ ...env, ...store }).canonicalOrigin).toBe('https://hoardex.example');
        expect(buildAuth({ SESSION_SECRET: 'a'.repeat(32) }).canonicalOrigin).toBeUndefined();
    });
});
