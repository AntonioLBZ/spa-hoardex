import { createSteamAdapter, withBudget } from '../core/adapters/steam/index.js';
import { createDailyBudget } from '../core/cache/budget.js';
import { createCachedAdapter, type CachedAdapter } from '../core/cache/cached-adapter.js';
import { createRedis } from '../core/cache/redis.js';
import { createMemoryStore, createUpstashStore, type CacheStore } from '../core/cache/store.js';
import { createBacklogService, createSqlRepository } from '../core/accounts/index.js';
import type { AccountRepository, BacklogService } from '../core/accounts/index.js';
import { createNeonQuery } from '../core/accounts/neon.js';
import { AUTH_TTL } from '../core/auth/ttl.js';
import type { AuthDeps } from './auth.js';

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

// HS256 key: shorter secrets can be brute-forced
const MIN_SESSION_SECRET_LENGTH = 32;
const LOCALHOST_ORIGIN = /^http:\/\/localhost:\d{1,5}$/;

// Production: the production domain only. Preview: its own URLs. Development: localhost
export function originPolicy(env: Env): (origin: string) => boolean {
    const target = env.VERCEL_ENV ?? 'development';
    if (target === 'development') return (origin) => LOCALHOST_ORIGIN.test(origin);

    const hosts =
        target === 'production' ? [env.VERCEL_PROJECT_PRODUCTION_URL] : [env.VERCEL_URL, env.VERCEL_BRANCH_URL];
    const allowed = new Set(hosts.filter((host): host is string => !!host).map((host) => `https://${host}`));
    if (allowed.size === 0) throw new ConfigError(`No allowed origin for ${target}`);
    return (origin) => allowed.has(origin);
}

export interface Accounts {
    repository: AccountRepository;
    backlog: BacklogService;
}

// Neon behind a Redis copy; throws ConfigError
export function buildAccounts(env: Env): Accounts {
    // DATABASE_URL points preview and development at the dev branch; production has only the integration's variable
    const url = env.DATABASE_URL || env.NEON_STORAGE_DATABASE_URL;
    if (!url) throw new ConfigError('DATABASE_URL is not set');
    const { data: store } = createStores(env, env.VERCEL_ENV ?? 'development');
    const repository = createSqlRepository(createNeonQuery(url));
    return { repository, backlog: createBacklogService({ repository, store, onStoreError: logStoreError }) };
}

interface BuildAuthOptions {
    fetch?: typeof fetch;
    // Called on the first sign-in only, so a missing database does not break /api/me
    getAccounts?: () => Accounts;
}

// Sign-in config from env; throws ConfigError
export function buildAuth(env: Env, { fetch: baseFetch = fetch, getAccounts }: BuildAuthOptions = {}): AuthDeps {
    let accounts: Accounts | undefined;
    const lazyAccounts = getAccounts ?? (() => (accounts ??= buildAccounts(env)));
    const secret = env.SESSION_SECRET ?? '';
    if (secret.length < MIN_SESSION_SECRET_LENGTH) {
        throw new ConfigError(`SESSION_SECRET must have at least ${MIN_SESSION_SECRET_LENGTH} characters`);
    }
    const isAllowedOrigin = originPolicy(env);
    const { data: store } = createStores(env, env.VERCEL_ENV ?? 'development');

    return {
        secret,
        isAllowedOrigin,
        fetch: baseFetch,
        // A failing store lets the login through: Steam's check_authentication still runs
        async claimNonce(nonce) {
            try {
                return (await store.setIfAbsent(`openid-nonce:${nonce}`, 1, AUTH_TTL.login)) === null;
            } catch (error) {
                logStoreError('nonce', error);
                return true;
            }
        },
        async recordLogin(steamId) {
            const account = await lazyAccounts().repository.recordLogin(
                { source: 'steam', externalId: steamId },
                new Date()
            );
            return account.sessionEpoch;
        },
    };
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
