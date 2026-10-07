import { describe, expect, it } from 'vitest';
import { createMemoryStore } from './store.js';

function clock(start = 1_000_000) {
    let current = start;
    return { now: () => current, advance: (seconds: number) => (current += seconds * 1000) };
}

describe('memory store', () => {
    it('returns null for a missing key', async () => {
        expect(await createMemoryStore().get('nope')).toBeNull();
    });

    it('round-trips JSON values without sharing references', async () => {
        const store = createMemoryStore();
        const value = { kind: 'ok', data: { games: [1, 2] } };
        await store.set('k', value, 60);
        const first = (await store.get('k')) as typeof value;
        expect(first).toEqual(value);
        first.data.games.push(3);
        expect(await store.get('k')).toEqual(value);
    });

    it('expires a value once its ttl has passed', async () => {
        const time = clock();
        const store = createMemoryStore({ now: time.now });
        await store.set('k', { a: 1 }, 60);
        time.advance(59);
        expect(await store.get('k')).toEqual({ a: 1 });
        time.advance(1);
        expect(await store.get('k')).toBeNull();
    });

    it('overwrites a value and restarts its ttl', async () => {
        const time = clock();
        const store = createMemoryStore({ now: time.now });
        await store.set('k', { a: 1 }, 60);
        time.advance(50);
        await store.set('k', { a: 2 }, 60);
        time.advance(50);
        expect(await store.get('k')).toEqual({ a: 2 });
    });

    it('counts up from one and keeps the expiry set by the first increment', async () => {
        const time = clock();
        const store = createMemoryStore({ now: time.now });
        expect(await store.increment('c', 100)).toBe(1);
        time.advance(60);
        expect(await store.increment('c', 100)).toBe(2);
        time.advance(40);
        expect(await store.increment('c', 100)).toBe(1);
    });
});
