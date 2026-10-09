import type { ManualState } from '../backlog/index.js';
import { CACHE_TTL } from '../cache/ttl.js';
import type { CacheStore } from '../cache/store.js';
import { entityKey, type EntityId } from '../domain/index.js';
import { cachedOverridesSchema } from './schemas.js';
import type { Account, AccountRepository, Overrides } from './types.js';

export interface BacklogServiceOptions {
    repository: AccountRepository;
    store: CacheStore;
    // Store failures never fail a request
    onStoreError?: (operation: 'get' | 'set', error: unknown) => void;
    now?: () => Date;
}

export interface BacklogService {
    // Redis first, so public views do not wake the database
    read(identity: EntityId): Promise<Overrides>;
    set(account: Account, identity: EntityId, game: EntityId, state: ManualState, minutes: number): Promise<Overrides>;
    clear(account: Account, identity: EntityId, game: EntityId): Promise<Overrides>;
    // After the account is deleted: its copy becomes empty at once
    forget(identity: EntityId): Promise<void>;
}

// Neon is the truth; `bl:{source}:{id}` is a write-through copy of an account's overrides
export function createBacklogService({
    repository,
    store,
    onStoreError,
    now = () => new Date(),
}: BacklogServiceOptions): BacklogService {
    const key = (identity: EntityId) => `bl:${entityKey(identity)}`;

    async function cached(identity: EntityId): Promise<Overrides | null> {
        try {
            const parsed = cachedOverridesSchema.safeParse(await store.get(key(identity)));
            return parsed.success ? parsed.data.overrides : null;
        } catch (error) {
            onStoreError?.('get', error);
            return null;
        }
    }

    // Always rereads the database, so the copy never keeps a half-applied write
    async function reload(identity: EntityId): Promise<Overrides> {
        const overrides = await repository.listOverrides(identity);
        try {
            await store.set(key(identity), { overrides }, CACHE_TTL.backlog);
        } catch (error) {
            onStoreError?.('set', error);
        }
        return overrides;
    }

    return {
        async read(identity) {
            return (await cached(identity)) ?? reload(identity);
        },

        async set(account, identity, game, state, minutes) {
            await repository.setOverride(account.userId, game, {
                state,
                minutesAtSet: minutes,
                setAt: now().toISOString(),
            });
            return reload(identity);
        },

        async clear(account, identity, game) {
            await repository.clearOverride(account.userId, game);
            return reload(identity);
        },

        async forget(identity) {
            await reload(identity);
        },
    };
}
