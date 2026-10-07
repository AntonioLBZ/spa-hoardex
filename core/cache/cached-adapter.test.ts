import { describe, expect, it } from 'vitest';
import { FIXTURE_NOW } from '../../fixtures/load.js';
import type { ProfileInput, StoreAdapter } from '../adapters/types.js';
import { UpstreamError } from '../adapters/types.js';
import type { EntityId, Library, Profile, ProfileAccess } from '../domain/index.js';
import { CACHE_TTL, createCachedAdapter, type ResolvableInput } from './cached-adapter.js';
import { createMemoryStore, type CacheStore } from './store.js';

const steam = (externalId: string): EntityId => ({ source: 'steam', externalId });
const ID = steam('76561198000000001');

const PROFILE: Profile = {
    id: ID,
    displayName: 'Player 0001',
    avatarUrl: 'https://example.invalid/avatar.jpg',
    profileUrl: 'https://example.invalid/profile',
    visibility: 'public',
    createdAt: null,
};

const LIBRARY: Library = {
    owner: ID,
    fetchedAt: FIXTURE_NOW.toISOString(),
    games: [
        {
            id: steam('620'),
            name: 'Portal 2',
            iconUrl: null,
            hasVisibleStats: true,
            playtime: { totalMinutes: 90, recentMinutes: 0, lastPlayedAt: '2026-01-01T00:00:00.000Z', platforms: null },
        },
    ],
};

interface Script {
    alias?: () => ProfileAccess<EntityId>;
    profile?: () => ProfileAccess<Profile>;
    library?: () => ProfileAccess<Library>;
}

// StoreAdapter answering from a script, counting calls
function fakeAdapter(script: Script = {}) {
    const calls: string[] = [];
    const adapter: StoreAdapter = {
        source: 'steam',
        capabilities: { achievements: 'none', wishlist: false },
        parseInput: (input): ProfileInput => ({ kind: 'alias', alias: input }),
        async resolveAlias(alias) {
            calls.push(`alias:${alias}`);
            return (script.alias ?? (() => ({ kind: 'ok', data: ID })))();
        },
        async resolveProfile(input) {
            calls.push(`profile:${input}`);
            return (script.profile ?? (() => ({ kind: 'ok', data: PROFILE })))();
        },
        async getLibrary(id) {
            calls.push(`library:${id.externalId}`);
            return (script.library ?? (() => ({ kind: 'ok', data: LIBRARY })))();
        },
    };
    return { adapter, calls };
}

function setup(script?: Script, store?: CacheStore) {
    let now = 1_000_000;
    const memory = createMemoryStore({ now: () => now });
    const errors: string[] = [];
    const fake = fakeAdapter(script);
    const cached = createCachedAdapter({
        adapter: fake.adapter,
        store: store ?? memory,
        onStoreError: (operation) => errors.push(operation),
    });
    return { ...fake, cached, store: store ?? memory, errors, advance: (seconds: number) => (now += seconds * 1000) };
}

const byId: ResolvableInput = { kind: 'id', id: ID };
const byAlias = (alias: string): ResolvableInput => ({ kind: 'alias', alias });

describe('profile by id', () => {
    it('asks the adapter once and then serves the cache', async () => {
        const { cached, calls } = setup();
        expect(await cached.resolveProfile(byId)).toEqual({ kind: 'ok', data: PROFILE });
        expect(await cached.resolveProfile(byId)).toEqual({ kind: 'ok', data: PROFILE });
        expect(calls).toEqual([`profile:${ID.externalId}`]);
    });

    it('asks again once the profile ttl has passed', async () => {
        const { cached, calls, advance } = setup();
        await cached.resolveProfile(byId);
        advance(CACHE_TTL.profile - 1);
        await cached.resolveProfile(byId);
        expect(calls).toHaveLength(1);
        advance(1);
        await cached.resolveProfile(byId);
        expect(calls).toHaveLength(2);
    });

    it('remembers notFound for the short negative ttl', async () => {
        const { cached, calls, advance } = setup({ profile: () => ({ kind: 'notFound' }) });
        expect(await cached.resolveProfile(byId)).toEqual({ kind: 'notFound' });
        await cached.resolveProfile(byId);
        expect(calls).toHaveLength(1);
        advance(CACHE_TTL.notFound);
        await cached.resolveProfile(byId);
        expect(calls).toHaveLength(2);
    });

    it('never caches rateLimited', async () => {
        const { cached, calls } = setup({ profile: () => ({ kind: 'rateLimited' }) });
        expect(await cached.resolveProfile(byId)).toEqual({ kind: 'rateLimited' });
        await cached.resolveProfile(byId);
        expect(calls).toHaveLength(2);
    });

    it('lets upstream failures through and caches nothing', async () => {
        const { cached, calls } = setup({
            profile: () => {
                throw new UpstreamError('Steam request failed');
            },
        });
        await expect(cached.resolveProfile(byId)).rejects.toBeInstanceOf(UpstreamError);
        await expect(cached.resolveProfile(byId)).rejects.toBeInstanceOf(UpstreamError);
        expect(calls).toHaveLength(2);
    });
});

describe('profile by alias', () => {
    it('resolves the alias once, then serves alias and profile from the cache', async () => {
        const { cached, calls } = setup();
        await cached.resolveProfile(byAlias('someone'));
        expect(await cached.resolveProfile(byAlias('someone'))).toEqual({ kind: 'ok', data: PROFILE });
        expect(calls).toEqual(['profile:someone']);
    });

    it('shares the profile entry with lookups by id', async () => {
        const { cached, calls } = setup();
        await cached.resolveProfile(byAlias('someone'));
        await cached.resolveProfile(byId);
        expect(calls).toEqual(['profile:someone']);
    });

    it('asks only for the profile when the alias is known but the profile expired', async () => {
        const { cached, calls, advance } = setup();
        await cached.resolveProfile(byAlias('someone'));
        advance(CACHE_TTL.profile);
        await cached.resolveProfile(byAlias('someone'));
        expect(calls).toEqual(['profile:someone', `profile:${ID.externalId}`]);
    });

    it('remembers an alias that does not exist, for the negative ttl', async () => {
        const { cached, calls, advance } = setup({ profile: () => ({ kind: 'notFound' }) });
        expect(await cached.resolveProfile(byAlias('ghost'))).toEqual({ kind: 'notFound' });
        expect(await cached.resolveProfile(byAlias('ghost'))).toEqual({ kind: 'notFound' });
        expect(calls).toHaveLength(1);
        advance(CACHE_TTL.notFound);
        await cached.resolveProfile(byAlias('ghost'));
        expect(calls).toHaveLength(2);
    });

    it('never caches rateLimited', async () => {
        const { cached, calls } = setup({ profile: () => ({ kind: 'rateLimited' }) });
        await cached.resolveProfile(byAlias('someone'));
        await cached.resolveProfile(byAlias('someone'));
        expect(calls).toHaveLength(2);
    });
});

describe('library', () => {
    it('asks the adapter once and then serves the cache', async () => {
        const { cached, calls } = setup();
        expect(await cached.getLibrary(ID)).toEqual({ kind: 'ok', data: LIBRARY });
        expect(await cached.getLibrary(ID)).toEqual({ kind: 'ok', data: LIBRARY });
        expect(calls).toEqual([`library:${ID.externalId}`]);
    });

    it('keeps one library per account', async () => {
        const { cached, calls } = setup();
        await cached.getLibrary(ID);
        await cached.getLibrary(steam('76561198000000002'));
        expect(calls).toHaveLength(2);
    });

    it('refreshes after the library ttl', async () => {
        const { cached, calls, advance } = setup();
        await cached.getLibrary(ID);
        advance(CACHE_TTL.library);
        await cached.getLibrary(ID);
        expect(calls).toHaveLength(2);
    });

    it.each(['profilePrivate', 'libraryPrivate'] as const)(
        'remembers %s for a minute only, so a visitor can fix the setting and retry',
        async (kind) => {
            const { cached, calls, advance } = setup({ library: () => ({ kind }) });
            expect(await cached.getLibrary(ID)).toEqual({ kind });
            await cached.getLibrary(ID);
            expect(calls).toHaveLength(1);
            advance(CACHE_TTL.private);
            await cached.getLibrary(ID);
            expect(calls).toHaveLength(2);
        }
    );

    it('never caches rateLimited', async () => {
        const { cached, calls } = setup({ library: () => ({ kind: 'rateLimited' }) });
        await cached.getLibrary(ID);
        await cached.getLibrary(ID);
        expect(calls).toHaveLength(2);
    });
});

describe('library by alias', () => {
    it('resolves the alias without the profile, then serves alias and library from the cache', async () => {
        const { cached, calls } = setup();
        expect(await cached.resolveLibrary(byAlias('someone'))).toEqual({ kind: 'ok', data: LIBRARY });
        expect(await cached.resolveLibrary(byAlias('someone'))).toEqual({ kind: 'ok', data: LIBRARY });
        expect(calls).toEqual(['alias:someone', `library:${ID.externalId}`]);
    });

    it('goes straight to the library for an id', async () => {
        const { cached, calls } = setup();
        await cached.resolveLibrary(byId);
        expect(calls).toEqual([`library:${ID.externalId}`]);
    });

    it('reuses an alias that a profile lookup already stored', async () => {
        const { cached, calls } = setup();
        await cached.resolveProfile(byAlias('someone'));
        await cached.resolveLibrary(byAlias('someone'));
        expect(calls).toEqual(['profile:someone', `library:${ID.externalId}`]);
    });

    it('lets a later profile lookup reuse the alias stored here', async () => {
        const { cached, calls } = setup();
        await cached.resolveLibrary(byAlias('someone'));
        await cached.resolveProfile(byAlias('someone'));
        expect(calls).toEqual(['alias:someone', `library:${ID.externalId}`, `profile:${ID.externalId}`]);
    });

    it('answers an unknown alias as notFound without asking for a library, and remembers it briefly', async () => {
        const { cached, calls, advance } = setup({ alias: () => ({ kind: 'notFound' }) });
        expect(await cached.resolveLibrary(byAlias('nobody'))).toEqual({ kind: 'notFound' });
        await cached.resolveLibrary(byAlias('nobody'));
        expect(calls).toEqual(['alias:nobody']);
        advance(CACHE_TTL.notFound);
        await cached.resolveLibrary(byAlias('nobody'));
        expect(calls).toEqual(['alias:nobody', 'alias:nobody']);
    });

    it('never caches a rate limit and does not ask for a library after it', async () => {
        const { cached, calls } = setup({ alias: () => ({ kind: 'rateLimited' }) });
        expect(await cached.resolveLibrary(byAlias('someone'))).toEqual({ kind: 'rateLimited' });
        await cached.resolveLibrary(byAlias('someone'));
        expect(calls).toEqual(['alias:someone', 'alias:someone']);
    });
});

describe('a misbehaving store', () => {
    it('treats an entry in an unexpected shape as a miss and overwrites it', async () => {
        const { cached, calls, store } = setup();
        await store.set(`lib:steam:${ID.externalId}`, { kind: 'ok', data: { games: 'not a list' } }, 60);
        expect(await cached.getLibrary(ID)).toEqual({ kind: 'ok', data: LIBRARY });
        expect(await cached.getLibrary(ID)).toEqual({ kind: 'ok', data: LIBRARY });
        expect(calls).toHaveLength(1);
    });

    it('does not trust a cached value of another kind than the ones it stores', async () => {
        const { cached, calls, store } = setup();
        await store.set(`lib:steam:${ID.externalId}`, { kind: 'rateLimited' }, 60);
        await cached.getLibrary(ID);
        expect(calls).toHaveLength(1);
    });

    it('keeps serving from the source when the store fails', async () => {
        const broken: CacheStore = {
            get: () => Promise.reject(new Error('down')),
            set: () => Promise.reject(new Error('down')),
            increment: () => Promise.reject(new Error('down')),
        };
        const { cached, calls, errors } = setup(undefined, broken);
        expect(await cached.getLibrary(ID)).toEqual({ kind: 'ok', data: LIBRARY });
        expect(await cached.resolveProfile(byId)).toEqual({ kind: 'ok', data: PROFILE });
        expect(calls).toHaveLength(2);
        expect(errors).toEqual(['get', 'set', 'get', 'set']);
    });
});
