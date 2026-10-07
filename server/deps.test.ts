import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEST_KEY, createFakeFetch, routes } from '../core/adapters/steam/test-utils.js';
import { ConfigError, buildCachedAdapter, type Env } from './deps.js';

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
