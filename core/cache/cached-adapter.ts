import type { ZodType } from 'zod';
import type { ProfileInput, StoreAdapter } from '../adapters/types.js';
import { entityKey, type EntityId, type Library, type Profile, type ProfileAccess } from '../domain/index.js';
import { cachedAliasSchema, cachedLibrarySchema, cachedProfileSchema } from './schemas.js';
import type { CacheStore } from './store.js';
import { CACHE_TTL } from './ttl.js';

export interface CachedAdapterOptions {
    adapter: StoreAdapter;
    store: CacheStore;
    // Store failures never fail a request
    onStoreError?: (operation: 'get' | 'set', error: unknown) => void;
    // Milliseconds; the cooldown stores its end time
    now?: () => number;
}

export type ResolvableInput = Exclude<ProfileInput, { kind: 'invalid' }>;

export type RefreshResult =
    // Both parts come from Steam, whatever their access; cooldownSeconds is 0 when the account does not exist
    | { kind: 'refreshed'; profile: ProfileAccess<Profile>; library: ProfileAccess<Library>; cooldownSeconds: number }
    | { kind: 'cooldown'; retryAfterSeconds: number }
    // Steam is throttling or the daily budget is spent
    | { kind: 'rateLimited'; retryAfterSeconds: number };

export interface CachedAdapter {
    readonly parseInput: StoreAdapter['parseInput'];
    resolveProfile(input: ResolvableInput): Promise<ProfileAccess<Profile>>;
    getLibrary(id: EntityId): Promise<ProfileAccess<Library>>;
    // Library for an id or an alias, so the client does not wait for the profile to learn the id
    resolveLibrary(input: ResolvableInput): Promise<ProfileAccess<Library>>;
    // Asks Steam again past the cache, at most once per cooldown per account
    refresh(input: ResolvableInput): Promise<RefreshResult>;
}

// Caches a StoreAdapter. Keys: alias:, profile:, lib: + {source}:{id}
export function createCachedAdapter({
    adapter,
    store,
    onStoreError,
    now = Date.now,
}: CachedAdapterOptions): CachedAdapter {
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

    const libraryKey = (id: EntityId) => `lib:${entityKey(id)}`;

    async function rememberLibrary(id: EntityId, result: ProfileAccess<Library>): Promise<void> {
        const key = libraryKey(id);
        switch (result.kind) {
            case 'ok':
                await write(key, result, CACHE_TTL.library);
                break;
            case 'profilePrivate':
            case 'libraryPrivate':
                await write(key, result, CACHE_TTL.private);
                break;
            case 'notFound':
                await write(key, result, CACHE_TTL.notFound);
                break;
        }
    }

    async function libraryById(id: EntityId): Promise<ProfileAccess<Library>> {
        const cached = await read(libraryKey(id), cachedLibrarySchema);
        if (cached !== null) return cached;

        const fresh = await adapter.getLibrary(id);
        await rememberLibrary(id, fresh);
        return fresh;
    }

    // Takes the cooldown of an account: null when it is free, otherwise the time its holder set it to end
    async function claimRefresh(id: EntityId, endsAt: number): Promise<number | null> {
        try {
            const held = await store.setIfAbsent(`refresh:${entityKey(id)}`, endsAt, CACHE_TTL.refresh);
            if (held === null || held === undefined) return null;
            return typeof held === 'number' ? held : endsAt;
        } catch (error) {
            onStoreError?.('set', error);
            return null;
        }
    }

    async function shortenRefresh(id: EntityId): Promise<void> {
        await write(`refresh:${entityKey(id)}`, now() + CACHE_TTL.refreshRetry * 1000, CACHE_TTL.refreshRetry);
    }

    async function refreshById(id: EntityId): Promise<RefreshResult> {
        const start = now();
        const held = await claimRefresh(id, start + CACHE_TTL.refresh * 1000);
        if (held !== null) {
            const remaining = Math.ceil((held - start) / 1000);
            return { kind: 'cooldown', retryAfterSeconds: Math.min(CACHE_TTL.refresh, Math.max(1, remaining)) };
        }

        let profile: ProfileAccess<Profile>;
        let library: ProfileAccess<Library>;
        try {
            [profile, library] = await Promise.all([adapter.resolveProfile(id.externalId), adapter.getLibrary(id)]);
        } catch (error) {
            await shortenRefresh(id);
            throw error;
        }

        // Nothing is deleted: a failed half keeps whatever was cached before
        await Promise.all([remember(profileKey(id), profile), rememberLibrary(id, library)]);
        if (profile.kind === 'rateLimited' || library.kind === 'rateLimited') {
            await shortenRefresh(id);
            return { kind: 'rateLimited', retryAfterSeconds: CACHE_TTL.refreshRetry };
        }
        return { kind: 'refreshed', profile, library, cooldownSeconds: CACHE_TTL.refresh };
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

        async refresh(input) {
            if (input.kind === 'id') return refreshById(input.id);
            const resolved = await idByAlias(input.alias);
            if (resolved.kind === 'ok') return refreshById(resolved.data);
            if (resolved.kind === 'notFound') {
                return { kind: 'refreshed', profile: resolved, library: resolved, cooldownSeconds: 0 };
            }
            return { kind: 'rateLimited', retryAfterSeconds: CACHE_TTL.refreshRetry };
        },
    };
}
