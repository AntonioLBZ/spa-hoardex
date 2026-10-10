import { describe, expect, it } from 'vitest';
import { createDailyBudget } from './budget.js';
import { createMemoryStore, type CacheStore } from './store.js';

describe('daily budget', () => {
    it('allows uses up to the limit and refuses the next one', async () => {
        const budget = createDailyBudget({ store: createMemoryStore(), name: 'steam', limit: 3 });
        expect([await budget.tryConsume(), await budget.tryConsume(), await budget.tryConsume()]).toEqual([
            true,
            true,
            true,
        ]);
        expect(await budget.tryConsume()).toBe(false);
        expect(await budget.tryConsume()).toBe(false);
    });

    it('starts a fresh count on the next UTC day', async () => {
        let now = new Date('2026-10-07T23:59:59Z');
        const budget = createDailyBudget({ store: createMemoryStore(), name: 'steam', limit: 1, now: () => now });
        expect(await budget.tryConsume()).toBe(true);
        expect(await budget.tryConsume()).toBe(false);
        now = new Date('2026-10-08T00:00:00Z');
        expect(await budget.tryConsume()).toBe(true);
    });

    it('keeps one counter per name and day', async () => {
        const seen: string[] = [];
        const store: CacheStore = {
            get: async () => null,
            set: async () => {},
            getMany: async () => [],
            setMany: async () => {},
            setIfAbsent: async () => null,
            increment: async (key) => {
                seen.push(key);
                return 1;
            },
        };
        const now = () => new Date('2026-10-07T12:00:00Z');
        await createDailyBudget({ store, name: 'steam', limit: 5, now }).tryConsume();
        await createDailyBudget({ store, name: 'other', limit: 5, now }).tryConsume();
        expect(seen).toEqual(['budget:steam:20261007', 'budget:other:20261007']);
    });

    it('lets the request through and reports when the store fails', async () => {
        const errors: unknown[] = [];
        const store: CacheStore = {
            get: async () => null,
            set: async () => {},
            getMany: async () => [],
            setMany: async () => {},
            setIfAbsent: async () => null,
            increment: () => Promise.reject(new Error('down')),
        };
        const budget = createDailyBudget({ store, name: 'steam', limit: 1, onStoreError: (e) => errors.push(e) });
        expect(await budget.tryConsume()).toBe(true);
        expect(errors).toHaveLength(1);
    });
});
