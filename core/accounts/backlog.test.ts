import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../cache/store.js';
import { createBacklogService } from './backlog.js';
import { createSqlRepository } from './repository.js';
import { createTestDatabase } from './test-db.js';

const ME = { source: 'steam', externalId: '76561198000000001' } as const;
const GAME = { source: 'steam', externalId: '620' } as const;
const NOW = new Date('2026-10-09T16:00:00Z');

let database: Awaited<ReturnType<typeof createTestDatabase>>;

beforeAll(async () => {
    database = await createTestDatabase();
});
afterAll(() => database.db.close());
beforeEach(() => database.reset());

function setup() {
    const repository = createSqlRepository(database.query);
    const listOverrides = vi.spyOn(repository, 'listOverrides');
    const store = createMemoryStore();
    const service = createBacklogService({ repository, store, now: () => NOW });
    return { repository, listOverrides, store, service };
}

describe('createBacklogService', () => {
    it('serves repeat reads from Redis, also for a profile without an account', async () => {
        const { listOverrides, service } = setup();
        expect(await service.read(ME)).toEqual({});
        expect(await service.read(ME)).toEqual({});
        expect(listOverrides).toHaveBeenCalledOnce();
    });

    it('writes through: a change is in the copy before the next read', async () => {
        const { repository, listOverrides, service } = setup();
        const account = await repository.recordLogin(ME, NOW);
        await service.read(ME);

        const expected = { '620': { state: 'abandoned', minutesAtSet: 42, setAt: NOW.toISOString() } };
        expect(await service.set(account, ME, GAME, 'abandoned', 42)).toEqual(expected);
        expect(await service.read(ME)).toEqual(expected);

        expect(await service.clear(account, ME, GAME)).toEqual({});
        expect(await service.read(ME)).toEqual({});
        expect(listOverrides).toHaveBeenCalledTimes(3);
    });

    it('treats a copy with another shape as missing', async () => {
        const { listOverrides, store, service } = setup();
        await store.set('bl:steam:76561198000000001', { overrides: { '620': { state: 'nope' } } }, 60);
        expect(await service.read(ME)).toEqual({});
        expect(listOverrides).toHaveBeenCalledOnce();
    });

    it('reads a completed state in the copy as finished', async () => {
        const { listOverrides, store, service } = setup();
        const stored = { state: 'completed', minutesAtSet: 42, setAt: NOW.toISOString() };
        await store.set('bl:steam:76561198000000001', { overrides: { '620': stored } }, 60);
        expect(await service.read(ME)).toEqual({ '620': { ...stored, state: 'finished' } });
        expect(listOverrides).not.toHaveBeenCalled();
    });

    it('still answers from the database when Redis fails', async () => {
        const { repository } = setup();
        const broken = {
            ...createMemoryStore(),
            get: () => Promise.reject(new Error('down')),
            set: () => Promise.reject(new Error('down')),
        };
        const onStoreError = vi.fn();
        const service = createBacklogService({ repository, store: broken, onStoreError });
        expect(await service.read(ME)).toEqual({});
        expect(onStoreError.mock.calls.map(([operation]) => operation)).toEqual(['get', 'set']);
    });
});
