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

    it('reports a failing database without the query or its values', async () => {
        const repository = createSqlRepository(() => Promise.reject(new Error(`password=${'x'.repeat(8)}`)));
        const failure = await repository.findAccount(ME).catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(DatabaseError);
        expect((failure as Error).message).toBe('Query failed: Error');
    });
});
