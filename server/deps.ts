import { createSteamAdapter, withBudget } from '../core/adapters/steam/index.js';
import { createDailyBudget } from '../core/cache/budget.js';
import { createCachedAdapter, type CachedAdapter } from '../core/cache/cached-adapter.js';
import { createRedis } from '../core/cache/redis.js';
import { createMemoryStore, createUpstashStore, type CacheStore } from '../core/cache/store.js';

export type Env = Record<string, string | undefined>;

// Deployment mistake (missing variable, bad value)
export class ConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConfigError';
    }
}

// Soft cap under Steam's 100k calls per day
const DEFAULT_STEAM_DAILY_BUDGET = 80_000;
// Shared by all environments: the Steam limit belongs to the key
const SHARED_NAMESPACE = 'shared';

function steamDailyBudget(raw: string | undefined): number {
    if (raw === undefined || raw === '') return DEFAULT_STEAM_DAILY_BUDGET;
    const limit = Number(raw);
    if (!Number.isInteger(limit) || limit <= 0) throw new ConfigError('STEAM_DAILY_BUDGET must be a positive integer');
    return limit;
}

function logStoreError(operation: string, error: unknown): void {
    // Name only: store errors can quote the endpoint
    console.warn('[cache] store failed on', operation, error instanceof Error ? error.name : 'unknown error');
}

interface Stores {
    data: CacheStore;
    budget: CacheStore;
}

// Production requires Redis; elsewhere falls back to memory
function createStores(env: Env, namespace: string): Stores {
    const url = env.UPSTASH_KV_REST_API_URL;
    const token = env.UPSTASH_KV_REST_API_TOKEN;
    if (url && token) {
        const redis = createRedis({ url, token, namespace });
        return { data: createUpstashStore(redis, namespace), budget: createUpstashStore(redis, SHARED_NAMESPACE) };
    }
    if (namespace === 'production') throw new ConfigError('The Upstash variables are not set');
    console.warn('[cache] Upstash variables not set: using an in-memory cache');
    const memory = createMemoryStore();
    return { data: memory, budget: memory };
}

// Builds the adapter, budget and cache from env; throws ConfigError
export function buildCachedAdapter(
    env: Env,
    { fetch: baseFetch = fetch }: { fetch?: typeof fetch } = {}
): CachedAdapter {
    const apiKey = env.STEAM_API_KEY;
    if (!apiKey) throw new ConfigError('STEAM_API_KEY is not set');
    const limit = steamDailyBudget(env.STEAM_DAILY_BUDGET);

    const namespace = env.VERCEL_ENV ?? 'development';
    const stores = createStores(env, namespace);

    const budget = createDailyBudget({
        store: stores.budget,
        name: 'steam',
        limit,
        onStoreError: (error) => logStoreError('budget', error),
    });
    const adapter = createSteamAdapter({ apiKey, fetch: withBudget(baseFetch, budget) });
    return createCachedAdapter({ adapter, store: stores.data, onStoreError: logStoreError });
}
