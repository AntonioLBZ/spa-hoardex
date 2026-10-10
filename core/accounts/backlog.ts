import {
    FALLBACK_STATE,
    MAX_CATEGORIES,
    countByState,
    hasCategory,
    type BacklogState,
    type CategoryId,
    type CustomId,
} from '../backlog/index.js';
import { CACHE_TTL } from '../cache/ttl.js';
import type { CacheStore } from '../cache/store.js';
import { entityKey, type EntityId, type Game } from '../domain/index.js';
import { cachedBacklogSchema } from './schemas.js';
import type { Account, AccountRepository, BacklogData, CategoryFields, GameMinutes } from './types.js';

export interface BacklogServiceOptions {
    repository: AccountRepository;
    store: CacheStore;
    // Store failures never fail a request
    onStoreError?: (operation: 'get' | 'set', error: unknown) => void;
    now?: () => Date;
    newCategoryId?: () => CustomId;
}

export type CategoryOutcome =
    | { kind: 'ok'; data: BacklogData }
    // Past MAX_CATEGORIES, a name already used, no such category, games still in it, or the Backlog itself
    | { kind: 'limit' | 'name' | 'notFound' | 'notEmpty' | 'fixed' };

export interface BacklogService {
    // Redis first, so public views do not wake the database
    read(identity: EntityId): Promise<BacklogData>;
    // Games of the identity's own source, with their playtime now
    set(account: Account, identity: EntityId, games: readonly GameMinutes[], state: CategoryId): Promise<BacklogData>;
    clear(account: Account, identity: EntityId, gameIds: readonly string[]): Promise<BacklogData>;
    createCategory(account: Account, identity: EntityId, fields: CategoryFields): Promise<CategoryOutcome>;
    updateCategory(
        account: Account,
        identity: EntityId,
        id: CustomId,
        fields: CategoryFields
    ): Promise<CategoryOutcome>;
    deleteCategory(account: Account, identity: EntityId, id: CustomId): Promise<CategoryOutcome>;
    // A built-in state is empty only if no game of the library lands in it, computed or by hand
    removeState(
        account: Account,
        identity: EntityId,
        state: BacklogState,
        games: readonly Game[]
    ): Promise<CategoryOutcome>;
    // A removed built-in state comes back, with its own colour, while below MAX_CATEGORIES
    restoreState(account: Account, identity: EntityId, state: BacklogState): Promise<CategoryOutcome>;
    // Null: back to its own colour
    recolorState(
        account: Account,
        identity: EntityId,
        state: BacklogState,
        color: string | null
    ): Promise<CategoryOutcome>;
    // After the account is deleted: its copy becomes empty at once
    forget(identity: EntityId): Promise<void>;
}

function randomCategoryId(): CustomId {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    return `c-${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

// Neon is the truth; `bl:{source}:{id}` is a write-through copy of an account's overrides and categories
export function createBacklogService({
    repository,
    store,
    onStoreError,
    now = () => new Date(),
    newCategoryId = randomCategoryId,
}: BacklogServiceOptions): BacklogService {
    const key = (identity: EntityId) => `bl:${entityKey(identity)}`;

    async function cached(identity: EntityId): Promise<BacklogData | null> {
        try {
            const parsed = cachedBacklogSchema.safeParse(await store.get(key(identity)));
            return parsed.success ? parsed.data : null;
        } catch (error) {
            onStoreError?.('get', error);
            return null;
        }
    }

    async function fresh(identity: EntityId): Promise<BacklogData> {
        const [overrides, categories] = await Promise.all([
            repository.listOverrides(identity),
            repository.listCategories(identity),
        ]);
        return { overrides, categories };
    }

    // Always rereads the database, so the copy never keeps a half-applied write
    async function reload(identity: EntityId): Promise<BacklogData> {
        const data = await fresh(identity);
        try {
            await store.set(key(identity), data, CACHE_TTL.backlog);
        } catch (error) {
            onStoreError?.('set', error);
        }
        return data;
    }

    const ok = async (identity: EntityId): Promise<CategoryOutcome> => ({ kind: 'ok', data: await reload(identity) });

    return {
        async read(identity) {
            return (await cached(identity)) ?? reload(identity);
        },

        async set(account, identity, games, state) {
            // One row per game: a repeated one would hit the same row twice in one statement
            const unique = [...new Map(games.map((game) => [game.gameId, game])).values()];
            await repository.setOverrides(account.userId, identity.source, unique, state, now().toISOString());
            return reload(identity);
        },

        async clear(account, identity, gameIds) {
            await repository.clearOverrides(account.userId, identity.source, [...new Set(gameIds)]);
            return reload(identity);
        },

        async createCategory(account, identity, { name, color }) {
            // A second try covers a random id that is already taken
            for (let attempt = 0; attempt < 2; attempt++) {
                const category = { id: newCategoryId(), name, color };
                const result = await repository.createCategory(
                    account.userId,
                    category,
                    MAX_CATEGORIES,
                    now().toISOString()
                );
                if (result === 'created') return ok(identity);
                if (result !== 'taken') return { kind: result };
            }
            return { kind: 'name' };
        },

        async updateCategory(account, identity, id, fields) {
            const result = await repository.updateCategory(account.userId, id, fields);
            return result === 'updated' ? ok(identity) : { kind: result };
        },

        async deleteCategory(account, identity, id) {
            const result = await repository.deleteCategory(account.userId, id);
            return result === 'deleted' ? ok(identity) : { kind: result };
        },

        async removeState(account, identity, state, games) {
            if (state === FALLBACK_STATE) return { kind: 'fixed' };
            const { overrides, categories } = await fresh(identity);
            if (!hasCategory(categories, state)) return { kind: 'notFound' };
            if ((countByState(games, now(), { overrides, categories })[state] ?? 0) > 0) return { kind: 'notEmpty' };
            await repository.removeState(account.userId, state);
            return ok(identity);
        },

        async restoreState(account, identity, state) {
            const result = await repository.restoreState(account.userId, state, MAX_CATEGORIES);
            return result === 'restored' ? ok(identity) : { kind: result };
        },

        async recolorState(account, identity, state, color) {
            const result = await repository.setStateColor(account.userId, state, color);
            return result === 'updated' ? ok(identity) : { kind: result };
        },

        async forget(identity) {
            await reload(identity);
        },
    };
}
