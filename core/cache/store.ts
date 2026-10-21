import type { Redis } from '@upstash/redis';
import { nsKey } from './redis.js';

// Key-value database behind the cache; implementations scope the keys
export interface CacheStore {
    // Null when missing or expired
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
    // One round trip each: values in key order, null when missing
    getMany(keys: readonly string[]): Promise<unknown[]>;
    setMany(entries: readonly (readonly [string, unknown])[], ttlSeconds: number): Promise<void>;
    // Atomic: writes only when the key is free. Null when it wrote, the value already there otherwise
    setIfAbsent(key: string, value: unknown, ttlSeconds: number): Promise<unknown>;
    // Atomic counter; sets the expiry on creation
    increment(key: string, ttlSeconds: number): Promise<number>;
    // Nothing happens when the key is missing
    delete(key: string): Promise<void>;
}

export function createUpstashStore(redis: Redis, namespace: string): CacheStore {
    const scoped = (key: string) => nsKey({ namespace }, key);
    return {
        async get(key) {
            return redis.get<unknown>(scoped(key));
        },
        async set(key, value, ttlSeconds) {
            await redis.set(scoped(key), value, { ex: ttlSeconds });
        },
        async getMany(keys) {
            if (keys.length === 0) return [];
            return redis.mget<unknown[]>(...keys.map(scoped));
        },
        async setMany(entries, ttlSeconds) {
            if (entries.length === 0) return;
            const pipeline = redis.pipeline();
            for (const [key, value] of entries) pipeline.set(scoped(key), value, { ex: ttlSeconds });
            await pipeline.exec();
        },
        async setIfAbsent(key, value, ttlSeconds) {
            return redis.set<unknown>(scoped(key), value, { nx: true, get: true, ex: ttlSeconds });
        },
        async increment(key, ttlSeconds) {
            const count = await redis.incr(scoped(key));
            if (count === 1) await redis.expire(scoped(key), ttlSeconds);
            return count;
        },
        async delete(key) {
            await redis.del(scoped(key));
        },
    };
}

interface MemoryEntry {
    // JSON text, like Redis
    value: string;
    expiresAt: number;
}

// In-memory store for tests and local dev (per process)
export function createMemoryStore({ now = Date.now }: { now?: () => number } = {}): CacheStore {
    const entries = new Map<string, MemoryEntry>();
    const live = (key: string): MemoryEntry | undefined => {
        const entry = entries.get(key);
        if (entry !== undefined && entry.expiresAt <= now()) {
            entries.delete(key);
            return undefined;
        }
        return entry;
    };
    return {
        async get(key) {
            const entry = live(key);
            return entry === undefined ? null : JSON.parse(entry.value);
        },
        async set(key, value, ttlSeconds) {
            entries.set(key, { value: JSON.stringify(value), expiresAt: now() + ttlSeconds * 1000 });
        },
        async getMany(keys) {
            return keys.map((key) => {
                const entry = live(key);
                return entry === undefined ? null : JSON.parse(entry.value);
            });
        },
        async setMany(pairs, ttlSeconds) {
            for (const [key, value] of pairs) {
                entries.set(key, { value: JSON.stringify(value), expiresAt: now() + ttlSeconds * 1000 });
            }
        },
        async setIfAbsent(key, value, ttlSeconds) {
            const entry = live(key);
            if (entry !== undefined) return JSON.parse(entry.value);
            entries.set(key, { value: JSON.stringify(value), expiresAt: now() + ttlSeconds * 1000 });
            return null;
        },
        async increment(key, ttlSeconds) {
            const entry = live(key);
            const count = entry === undefined ? 1 : Number(entry.value) + 1;
            entries.set(key, { value: String(count), expiresAt: entry?.expiresAt ?? now() + ttlSeconds * 1000 });
            return count;
        },
        async delete(key) {
            entries.delete(key);
        },
    };
}
