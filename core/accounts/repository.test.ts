import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readMigrations } from './migrations.js';
import { createSqlRepository } from './repository.js';
import { createTestDatabase } from './test-db.js';
import { DatabaseError } from './types.js';

const ME = { source: 'steam', externalId: '76561198000000001' } as const;
const OTHER = { source: 'steam', externalId: '76561198000000002' } as const;
const GAME = { gameId: '620', minutes: 90 } as const;
const NOW = new Date('2026-10-09T16:00:00Z');
const LATER = new Date('2026-10-10T09:00:00Z');

let database: Awaited<ReturnType<typeof createTestDatabase>>;

beforeAll(async () => {
    database = await createTestDatabase();
});
afterAll(() => database.db.close());
beforeEach(() => database.reset());

describe('createSqlRepository', () => {
    it('creates the account on the first sign-in and finds the same one afterwards', async () => {
        const repository = createSqlRepository(database.query);
        expect(await repository.findAccount(ME)).toBeNull();

        const first = await repository.recordLogin(ME, NOW);
        expect(first).toEqual({ userId: expect.any(String), sessionEpoch: 0 });
        expect(await repository.recordLogin(ME, new Date('2026-10-10T08:00:00Z'))).toEqual(first);
        expect(await repository.findAccount(ME)).toEqual(first);
        expect((await repository.recordLogin(OTHER, NOW)).userId).not.toBe(first.userId);

        const { rows } = await database.db.query<{ n: number }>('select count(*)::int as n from users');
        expect(rows[0]?.n).toBe(2);
    });

    it('stores one state per game, replaces it, and clears it', async () => {
        const repository = createSqlRepository(database.query);
        const { userId } = await repository.recordLogin(ME, NOW);

        await repository.setOverrides(userId, 'steam', [GAME], 'abandoned', NOW.toISOString());
        await repository.setOverrides(userId, 'steam', [{ gameId: '620', minutes: 95 }], 'finished', NOW.toISOString());
        expect(await repository.listOverrides(ME)).toEqual({
            '620': { state: 'finished', minutesAtSet: 95, setAt: '2026-10-09T16:00:00.000Z' },
        });

        await repository.clearOverrides(userId, 'steam', ['620']);
        expect(await repository.listOverrides(ME)).toEqual({});
    });

    it('changes several games in one statement, keeping the ones already in that state as they were', async () => {
        const repository = createSqlRepository(database.query);
        const { userId } = await repository.recordLogin(ME, NOW);
        await repository.setOverrides(userId, 'steam', [GAME], 'finished', NOW.toISOString());

        await repository.setOverrides(
            userId,
            'steam',
            [
                { gameId: '620', minutes: 120 },
                { gameId: '70', minutes: 5 },
                { gameId: '10', minutes: 0 },
            ],
            'finished',
            LATER.toISOString()
        );
        expect(await repository.listOverrides(ME)).toEqual({
            '620': { state: 'finished', minutesAtSet: 90, setAt: NOW.toISOString() },
            '70': { state: 'finished', minutesAtSet: 5, setAt: LATER.toISOString() },
            '10': { state: 'finished', minutesAtSet: 0, setAt: LATER.toISOString() },
        });

        await repository.clearOverrides(userId, 'steam', ['620', '10', '999']);
        expect(Object.keys(await repository.listOverrides(ME))).toEqual(['70']);
    });

    it('keeps each account’s states apart, and answers empty for a profile without an account', async () => {
        const repository = createSqlRepository(database.query);
        const { userId } = await repository.recordLogin(ME, NOW);
        await repository.setOverrides(userId, 'steam', [GAME], 'paused', NOW.toISOString());

        expect(await repository.listOverrides(OTHER)).toEqual({});
        expect(Object.keys(await repository.listOverrides(ME))).toEqual(['620']);
    });

    it('reads a stored completed state as finished, and the migration rewrites it', async () => {
        const repository = createSqlRepository(database.query);
        const { userId } = await repository.recordLogin(ME, NOW);
        await database.db.query(
            `insert into backlog_overrides (user_id, game_source, game_id, state, minutes_at_set, set_at)
             values ($1, 'steam', '620', 'completed', 10, $2)`,
            [userId, NOW.toISOString()]
        );
        expect((await repository.listOverrides(ME))['620']?.state).toBe('finished');

        const migration = (await readMigrations()).find(({ name }) => name === '003_retire_completed_state.sql');
        await database.db.exec(migration?.sql ?? '');
        const { rows } = await database.db.query<{ state: string }>('select state from backlog_overrides');
        expect(rows).toEqual([{ state: 'finished' }]);
    });

    it('refuses a state the schema does not know', async () => {
        const repository = createSqlRepository(database.query);
        const { userId } = await repository.recordLogin(ME, NOW);
        const unknown = 'wishlisted' as never;
        await expect(
            repository.setOverrides(userId, 'steam', [GAME], unknown, NOW.toISOString())
        ).rejects.toBeInstanceOf(DatabaseError);
    });

    it('starts with the default categories, also for a profile without an account', async () => {
        const repository = createSqlRepository(database.query);
        expect(await repository.listCategories(ME)).toEqual({ removed: [], custom: [], colors: {} });
        await repository.recordLogin(ME, NOW);
        expect(await repository.listCategories(ME)).toEqual({ removed: [], custom: [], colors: {} });
    });

    it('creates categories in order, with a name of their own, up to the limit', async () => {
        const repository = createSqlRepository(database.query);
        const { userId } = await repository.recordLogin(ME, NOW);
        const create = (id: `c-${string}`, name: string, at = NOW) =>
            repository.createCategory(userId, { id, name, color: '#ff8800' }, 8, at.toISOString());

        expect(await create('c-0000000b', 'Co-op')).toBe('created');
        expect(await create('c-0000000a', 'Later', LATER)).toBe('created');
        expect(await create('c-0000000c', 'CO-OP')).toBe('limit');
        await repository.removeState(userId, 'paused');
        expect(await create('c-0000000c', 'CO-OP')).toBe('name');
        expect(await create('c-0000000a', 'Other')).toBe('taken');
        expect(await create('c-0000000c', 'Other')).toBe('created');

        expect(await repository.listCategories(ME)).toEqual({
            removed: ['paused'],
            custom: [
                { id: 'c-0000000b', name: 'Co-op', color: '#ff8800' },
                { id: 'c-0000000c', name: 'Other', color: '#ff8800' },
                { id: 'c-0000000a', name: 'Later', color: '#ff8800' },
            ],
            colors: {},
        });
        expect(await repository.listCategories(OTHER)).toEqual({ removed: [], custom: [], colors: {} });
    });

    it('restores a removed built-in state below the limit only', async () => {
        const repository = createSqlRepository(database.query);
        const { userId } = await repository.recordLogin(ME, NOW);
        await repository.removeState(userId, 'paused');
        await repository.removeState(userId, 'tried');
        await repository.createCategory(userId, { id: 'c-00000001', name: 'One', color: 'p1' }, 8, NOW.toISOString());
        await repository.createCategory(userId, { id: 'c-00000002', name: 'Two', color: 'p1' }, 8, NOW.toISOString());

        expect(await repository.restoreState(userId, 'paused', 7)).toBe('restored');
        expect(await repository.restoreState(userId, 'tried', 7)).toBe('limit');
        expect(await repository.restoreState(userId, 'finished', 7)).toBe('notFound');
        expect(await repository.restoreState(userId, 'paused', 12)).toBe('notFound');
        expect((await repository.listCategories(ME)).removed).toEqual(['tried']);
    });

    it('recolours a built-in state while it is there, and forgets the colour when it goes', async () => {
        const repository = createSqlRepository(database.query);
        const { userId } = await repository.recordLogin(ME, NOW);

        expect(await repository.setStateColor(userId, 'paused', 'p3')).toBe('updated');
        expect(await repository.setStateColor(userId, 'paused', '#123abc')).toBe('updated');
        expect(await repository.setStateColor(userId, 'untouched', 'p1')).toBe('updated');
        expect((await repository.listCategories(ME)).colors).toEqual({ paused: '#123abc', untouched: 'p1' });
        expect(await repository.setStateColor(userId, 'untouched', null)).toBe('updated');
        expect((await repository.listCategories(ME)).colors).toEqual({ paused: '#123abc' });

        await repository.removeState(userId, 'paused');
        expect(await repository.setStateColor(userId, 'paused', 'p2')).toBe('notFound');
        expect(await repository.setStateColor(userId, 'paused', null)).toBe('notFound');
        expect(await repository.restoreState(userId, 'paused', 12)).toBe('restored');
        expect((await repository.listCategories(ME)).colors).toEqual({});
        await expect(repository.setStateColor(userId, 'tried', 'red')).rejects.toBeInstanceOf(DatabaseError);
    });

    it('renames a category unless another has that name', async () => {
        const repository = createSqlRepository(database.query);
        const { userId } = await repository.recordLogin(ME, NOW);
        await repository.createCategory(userId, { id: 'c-00000001', name: 'One', color: 'p1' }, 12, NOW.toISOString());
        await repository.createCategory(userId, { id: 'c-00000002', name: 'Two', color: 'p2' }, 12, NOW.toISOString());

        expect(await repository.updateCategory(userId, 'c-00000001', { name: 'ONE', color: 'p3' })).toBe('updated');
        expect(await repository.updateCategory(userId, 'c-00000001', { name: 'two', color: 'p3' })).toBe('name');
        expect(await repository.updateCategory(userId, 'c-00000009', { name: 'Nine', color: 'p3' })).toBe('notFound');
        expect((await repository.listCategories(ME)).custom[0]).toEqual({ id: 'c-00000001', name: 'ONE', color: 'p3' });
    });

    it('deletes a category only while no game is in it', async () => {
        const repository = createSqlRepository(database.query);
        const { userId } = await repository.recordLogin(ME, NOW);
        await repository.createCategory(userId, { id: 'c-00000001', name: 'One', color: 'p1' }, 12, NOW.toISOString());
        await repository.setOverrides(userId, 'steam', [GAME], 'c-00000001', NOW.toISOString());

        expect(await repository.deleteCategory(userId, 'c-00000001')).toBe('notEmpty');
        await repository.clearOverrides(userId, 'steam', ['620']);
        expect(await repository.deleteCategory(userId, 'c-00000001')).toBe('deleted');
        expect(await repository.deleteCategory(userId, 'c-00000001')).toBe('notFound');
        expect((await repository.listCategories(ME)).custom).toEqual([]);
    });

    it('never stores the Backlog as removed, nor a malformed category', async () => {
        const repository = createSqlRepository(database.query);
        const { userId } = await repository.recordLogin(ME, NOW);
        await expect(repository.removeState(userId, 'untouched' as never)).rejects.toBeInstanceOf(DatabaseError);
        await expect(
            repository.createCategory(userId, { id: 'c-1', name: 'Bad', color: 'p1' } as never, 12, NOW.toISOString())
        ).rejects.toBeInstanceOf(DatabaseError);
        await expect(
            repository.setOverrides(userId, 'steam', [GAME], 'c-xyz' as never, NOW.toISOString())
        ).rejects.toBeInstanceOf(DatabaseError);
    });

    it('drops the categories with the account', async () => {
        const repository = createSqlRepository(database.query);
        const { userId } = await repository.recordLogin(ME, NOW);
        await repository.createCategory(userId, { id: 'c-00000001', name: 'One', color: 'p1' }, 12, NOW.toISOString());
        await repository.removeState(userId, 'tried');
        await repository.setStateColor(userId, 'paused', 'p2');
        await repository.deleteAccount(userId);
        const { rows } = await database.db.query<{ n: number }>(
            `select (select count(*) from backlog_categories) + (select count(*) from removed_states)
                + (select count(*) from state_colors) as n`
        );
        expect(Number(rows[0]?.n)).toBe(0);
    });

    it('reports a failing database without the query or its values', async () => {
        const repository = createSqlRepository(() => Promise.reject(new Error(`password=${'x'.repeat(8)}`)));
        const failure = await repository.findAccount(ME).catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(DatabaseError);
        expect((failure as Error).message).toBe('Query failed: Error');
    });
});
