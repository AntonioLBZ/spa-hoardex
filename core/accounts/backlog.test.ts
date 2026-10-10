import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../cache/store.js';
import { createBacklogService } from './backlog.js';
import { createSqlRepository } from './repository.js';
import type { Game } from '../domain/index.js';
import { createTestDatabase } from './test-db.js';

const ME = { source: 'steam', externalId: '76561198000000001' } as const;
const EMPTY = { overrides: {}, categories: { removed: [], custom: [], colors: {} } };
const GAME = { gameId: '620', minutes: 42 } as const;
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
        expect(await service.read(ME)).toEqual(EMPTY);
        expect(await service.read(ME)).toEqual(EMPTY);
        expect(listOverrides).toHaveBeenCalledOnce();
    });

    it('writes through: a change is in the copy before the next read', async () => {
        const { repository, listOverrides, service } = setup();
        const account = await repository.recordLogin(ME, NOW);
        await service.read(ME);

        const expected = {
            ...EMPTY,
            overrides: { '620': { state: 'abandoned', minutesAtSet: 42, setAt: NOW.toISOString() } },
        };
        expect(await service.set(account, ME, [GAME], 'abandoned')).toEqual(expected);
        expect(await service.read(ME)).toEqual(expected);

        expect(await service.clear(account, ME, ['620'])).toEqual(EMPTY);
        expect(await service.read(ME)).toEqual(EMPTY);
        expect(listOverrides).toHaveBeenCalledTimes(3);
    });

    it('changes a game given twice once', async () => {
        const { repository, service } = setup();
        const account = await repository.recordLogin(ME, NOW);
        const { overrides } = await service.set(account, ME, [GAME, { gameId: '620', minutes: 50 }], 'paused');
        expect(overrides).toEqual({ '620': { state: 'paused', minutesAtSet: 50, setAt: NOW.toISOString() } });
        expect(await service.clear(account, ME, ['620', '620'])).toEqual(EMPTY);
    });

    it('treats a copy with another shape as missing', async () => {
        const { listOverrides, store, service } = setup();
        await store.set('bl:steam:76561198000000001', { ...EMPTY, overrides: { '620': { state: 'nope' } } }, 60);
        expect(await service.read(ME)).toEqual(EMPTY);
        expect(listOverrides).toHaveBeenCalledOnce();
    });

    it('treats a copy from before categories as missing', async () => {
        const { listOverrides, store, service } = setup();
        await store.set('bl:steam:76561198000000001', { overrides: {} }, 60);
        expect(await service.read(ME)).toEqual(EMPTY);
        expect(listOverrides).toHaveBeenCalledOnce();
    });

    it('treats a copy from before built-in colours as missing', async () => {
        const { listOverrides, store, service } = setup();
        await store.set('bl:steam:76561198000000001', { overrides: {}, categories: { removed: [], custom: [] } }, 60);
        expect(await service.read(ME)).toEqual(EMPTY);
        expect(listOverrides).toHaveBeenCalledOnce();
    });

    it('reads a completed state in the copy as finished', async () => {
        const { listOverrides, store, service } = setup();
        const stored = { state: 'completed', minutesAtSet: 42, setAt: NOW.toISOString() };
        await store.set('bl:steam:76561198000000001', { ...EMPTY, overrides: { '620': stored } }, 60);
        expect(await service.read(ME)).toEqual({ ...EMPTY, overrides: { '620': { ...stored, state: 'finished' } } });
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
        expect(await service.read(ME)).toEqual(EMPTY);
        expect(onStoreError.mock.calls.map(([operation]) => operation)).toEqual(['get', 'set']);
    });

    it('creates, renames and deletes a category, writing the copy through', async () => {
        const { repository, store } = setup();
        const ids: `c-${string}`[] = ['c-00000001', 'c-00000001', 'c-00000002'];
        const service = createBacklogService({
            repository,
            store,
            now: () => NOW,
            newCategoryId: () => ids.shift() ?? 'c-ffffffff',
        });
        const account = await repository.recordLogin(ME, NOW);

        const created = await service.createCategory(account, ME, { name: 'Co-op', color: 'p2' });
        expect(created).toEqual({
            kind: 'ok',
            data: {
                ...EMPTY,
                categories: { ...EMPTY.categories, custom: [{ id: 'c-00000001', name: 'Co-op', color: 'p2' }] },
            },
        });
        expect(await service.createCategory(account, ME, { name: 'co-op', color: 'p3' })).toEqual({ kind: 'name' });
        expect((await service.createCategory(account, ME, { name: 'Later', color: 'p3' })).kind).toBe('ok');
        expect((await service.read(ME)).categories.custom.map((category) => category.id)).toEqual([
            'c-00000001',
            'c-00000002',
        ]);

        expect(
            (await service.updateCategory(account, ME, 'c-00000001', { name: 'Friends', color: '#123456' })).kind
        ).toBe('ok');
        expect((await service.read(ME)).categories.custom[0]).toEqual({
            id: 'c-00000001',
            name: 'Friends',
            color: '#123456',
        });

        await service.set(account, ME, [GAME], 'c-00000002');
        expect(await service.deleteCategory(account, ME, 'c-00000002')).toEqual({ kind: 'notEmpty' });
        await service.clear(account, ME, ['620']);
        expect((await service.deleteCategory(account, ME, 'c-00000002')).kind).toBe('ok');
        expect((await service.read(ME)).categories.custom).toHaveLength(1);
    });

    it('stops at the category limit', async () => {
        const { repository, store } = setup();
        let next = 0;
        const service = createBacklogService({
            repository,
            store,
            newCategoryId: () => `c-${String(next++).padStart(8, '0')}`,
        });
        const account = await repository.recordLogin(ME, NOW);
        for (let i = 0; i < 6; i++) await service.createCategory(account, ME, { name: `Shelf ${i}`, color: 'p1' });
        expect(await service.createCategory(account, ME, { name: 'One more', color: 'p1' })).toEqual({ kind: 'limit' });
    });

    it('removes a built-in state only when no game lands in it, and never the Backlog', async () => {
        const { repository, service } = setup();
        const account = await repository.recordLogin(ME, NOW);
        const tried: Game = {
            id: { source: 'steam', externalId: '620' },
            name: 'Portal 2',
            iconUrl: null,
            hasVisibleStats: true,
            playtime: { totalMinutes: 20, recentMinutes: 0, lastPlayedAt: '2026-10-01T00:00:00Z', platforms: null },
        };

        expect(await service.removeState(account, ME, 'untouched', [])).toEqual({ kind: 'fixed' });
        expect(await service.removeState(account, ME, 'tried', [tried])).toEqual({ kind: 'notEmpty' });
        await service.set(account, ME, [GAME], 'finished');
        const removed = await service.removeState(account, ME, 'tried', [tried]);
        expect(removed.kind === 'ok' && removed.data.categories.removed).toEqual(['tried']);
        expect(await service.removeState(account, ME, 'tried', [tried])).toEqual({ kind: 'notFound' });

        await service.set(account, ME, [GAME], 'abandoned');
        expect(await service.removeState(account, ME, 'abandoned', [tried])).toEqual({ kind: 'notEmpty' });
    });

    it('restores and recolours a built-in state, writing the copy through', async () => {
        const { repository, service } = setup();
        const account = await repository.recordLogin(ME, NOW);
        await service.removeState(account, ME, 'tried', []);
        await service.read(ME);

        expect(await service.recolorState(account, ME, 'tried', 'p4')).toEqual({ kind: 'notFound' });
        expect((await service.restoreState(account, ME, 'tried')).kind).toBe('ok');
        expect(await service.restoreState(account, ME, 'tried')).toEqual({ kind: 'notFound' });
        expect((await service.recolorState(account, ME, 'tried', 'p4')).kind).toBe('ok');
        expect((await service.read(ME)).categories).toEqual({ removed: [], custom: [], colors: { tried: 'p4' } });
    });

    it('stops restoring at the category limit', async () => {
        const { repository, store } = setup();
        let next = 0;
        const service = createBacklogService({
            repository,
            store,
            newCategoryId: () => `c-${String(next++).padStart(8, '0')}`,
        });
        const account = await repository.recordLogin(ME, NOW);
        await service.removeState(account, ME, 'abandoned', []);
        for (let i = 0; i < 7; i++) await service.createCategory(account, ME, { name: `Shelf ${i}`, color: 'p1' });
        expect(await service.restoreState(account, ME, 'abandoned')).toEqual({ kind: 'limit' });
    });
});
