import type { ZodType } from 'zod';
import type { ProfileInput, StoreAdapter } from '../adapters/types.js';
import { entityKey, type EntityId, type Library, type Profile, type ProfileAccess } from '../domain/index.js';
import { cachedAliasSchema, cachedLibrarySchema, cachedProfileSchema } from './schemas.js';
import type { CacheStore } from './store.js';

// TTLs in seconds
export const CACHE_TTL = {
    alias: 24 * 60 * 60,
    profile: 60 * 60,
    library: 30 * 60,
    private: 60,
    notFound: 5 * 60,
} as const;

export interface CachedAdapterOptions {
    adapter: StoreAdapter;
    store: CacheStore;
    // Store failures never fail a request
    onStoreError?: (operation: 'get' | 'set', error: unknown) => void;
}

export type ResolvableInput = Exclude<ProfileInput, { kind: 'invalid' }>;

export interface CachedAdapter {
    readonly parseInput: StoreAdapter['parseInput'];
    resolveProfile(input: ResolvableInput): Promise<ProfileAccess<Profile>>;
    getLibrary(id: EntityId): Promise<ProfileAccess<Library>>;
    // Library for an id or an alias, so the client does not wait for the profile to learn the id
    resolveLibrary(input: ResolvableInput): Promise<ProfileAccess<Library>>;
}

// Caches a StoreAdapter. Keys: alias:, profile:, lib: + {source}:{id}
export function createCachedAdapter({ adapter, store, onStoreError }: CachedAdapterOptions): CachedAdapter {
    async function read<T>(key: string, schema: ZodType<T>): Promise<T | null> {
        try {
            const raw = await store.get(key);
            if (raw === null || raw === undefined) return null;
            const parsed = schema.safeParse(raw);
            return parsed.success ? parsed.data : null;
        } catch (error) {
            onStoreError?.('get', error);
            return null;
        }
    }

    async function write(key: string, value: unknown, ttlSeconds: number): Promise<void> {
        try {
            await store.set(key, value, ttlSeconds);
        } catch (error) {
            onStoreError?.('set', error);
        }
    }

    const profileKey = (id: EntityId) => `profile:${entityKey(id)}`;

    async function remember(key: string, result: ProfileAccess<Profile>): Promise<void> {
        if (result.kind === 'ok') await write(key, result, CACHE_TTL.profile);
        else if (result.kind === 'notFound') await write(key, result, CACHE_TTL.notFound);
    }

    async function profileById(id: EntityId): Promise<ProfileAccess<Profile>> {
        const key = profileKey(id);
        const cached = await read(key, cachedProfileSchema);
        if (cached !== null) return cached;

        const fresh = await adapter.resolveProfile(id.externalId);
        await remember(key, fresh);
        return fresh;
    }

    async function profileByAlias(alias: string): Promise<ProfileAccess<Profile>> {
        const aliasKey = `alias:${adapter.source}:${alias}`;
        const known = await read(aliasKey, cachedAliasSchema);
        if (known !== null) return known.id === null ? { kind: 'notFound' } : profileById(known.id);

        const fresh = await adapter.resolveProfile(alias);
        if (fresh.kind === 'ok') {
            await Promise.all([
                write(aliasKey, { id: fresh.data.id }, CACHE_TTL.alias),
                remember(profileKey(fresh.data.id), fresh),
            ]);
        } else if (fresh.kind === 'notFound') {
            await write(aliasKey, { id: null }, CACHE_TTL.notFound);
        }
        return fresh;
    }

    // Shares the alias cache with profileByAlias
    async function idByAlias(alias: string): Promise<ProfileAccess<EntityId>> {
        const aliasKey = `alias:${adapter.source}:${alias}`;
        const known = await read(aliasKey, cachedAliasSchema);
        if (known !== null) return known.id === null ? { kind: 'notFound' } : { kind: 'ok', data: known.id };

        const fresh = await adapter.resolveAlias(alias);
        if (fresh.kind === 'ok') await write(aliasKey, { id: fresh.data }, CACHE_TTL.alias);
        else if (fresh.kind === 'notFound') await write(aliasKey, { id: null }, CACHE_TTL.notFound);
        return fresh;
    }

    async function libraryById(id: EntityId): Promise<ProfileAccess<Library>> {
        const key = `lib:${entityKey(id)}`;
        const cached = await read(key, cachedLibrarySchema);
        if (cached !== null) return cached;

        const fresh = await adapter.getLibrary(id);
        switch (fresh.kind) {
            case 'ok':
                await write(key, fresh, CACHE_TTL.library);
                break;
            case 'profilePrivate':
            case 'libraryPrivate':
                await write(key, fresh, CACHE_TTL.private);
                break;
            case 'notFound':
                await write(key, fresh, CACHE_TTL.notFound);
                break;
        }
        return fresh;
    }

    return {
        parseInput: (input) => adapter.parseInput(input),

        resolveProfile: (input) => (input.kind === 'id' ? profileById(input.id) : profileByAlias(input.alias)),

        getLibrary: libraryById,

        async resolveLibrary(input) {
            if (input.kind === 'id') return libraryById(input.id);
            const resolved = await idByAlias(input.alias);
            return resolved.kind === 'ok' ? libraryById(resolved.data) : resolved;
        },
    };
}
