import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game, Library } from '../domain/index.js';
import { createSqlRepository } from './repository.js';
import { runSnapshots, snapshotDay, takeSnapshot } from './snapshots.js';
import { createTestDatabase } from './test-db.js';

const ME = { source: 'steam', externalId: '76561198000000001' } as const;
const OTHER = { source: 'steam', externalId: '76561198000000002' } as const;
const DAY1 = new Date('2026-10-09T16:00:00Z');
const DAY2 = new Date('2026-10-10T05:00:00Z');

let database: Awaited<ReturnType<typeof createTestDatabase>>;

beforeAll(async () => {
    database = await createTestDatabase();
});
afterAll(() => database.db.close());
beforeEach(() => database.reset());

function game(appid: string, minutes: number): Game {
    return {
        id: { source: 'steam', externalId: appid },
        name: `Game ${appid}`,
        iconUrl: null,
        hasVisibleStats: false,
        playtime: { totalMinutes: minutes, recentMinutes: 0, lastPlayedAt: null, platforms: null },
    };
}

function library(minutes: Record<string, number>): Library {
    return {
        owner: ME,
        fetchedAt: DAY1.toISOString(),
        games: Object.entries(minutes).map(([appid, total]) => game(appid, total)),
    };
}

async function rows() {
    const { rows: found } = await database.db.query<{ game_id: string; taken_on: string; total_minutes: number }>(
        'select game_id, taken_on::text as taken_on, total_minutes from playtime_snapshots order by taken_on, game_id'
    );
    return found.map((row) => `${row.taken_on} ${row.game_id}=${row.total_minutes}`);
}

describe('takeSnapshot', () => {
    it('keeps played games, then only the ones whose minutes changed, once per day', async () => {
        const repository = createSqlRepository(database.query);
        const { userId } = await repository.recordLogin(ME, DAY1);

        expect(await takeSnapshot(repository, userId, library({ '1': 0, '2': 30, '3': 600 }), DAY1)).toBe(true);
        expect(await takeSnapshot(repository, userId, library({ '1': 0, '2': 45, '3': 600 }), DAY1)).toBe(false);
        expect(await takeSnapshot(repository, userId, library({ '1': 10, '2': 45, '3': 600 }), DAY2)).toBe(true);

        expect(await rows()).toEqual(['2026-10-09 2=30', '2026-10-09 3=600', '2026-10-10 1=10', '2026-10-10 2=45']);
        expect(await repository.getSettings(userId)).toMatchObject({ snapshotDays: 2, lastSnapshotOn: '2026-10-10' });
    });

    it('counts a day even when nothing changed', async () => {
        const repository = createSqlRepository(database.query);
        const { userId } = await repository.recordLogin(ME, DAY1);
        await takeSnapshot(repository, userId, library({ '3': 600 }), DAY1);
        await takeSnapshot(repository, userId, library({ '3': 600 }), DAY2);
        expect(await rows()).toEqual(['2026-10-09 3=600']);
        expect((await repository.getSettings(userId)).snapshotDays).toBe(2);
    });
});

describe('snapshot settings', () => {
    it('start off, keep the first opt-in time, and delete the history when turned off', async () => {
        const repository = createSqlRepository(database.query);
        const { userId } = await repository.recordLogin(ME, DAY1);
        expect(await repository.getSettings(userId)).toEqual({
            snapshotsSince: null,
            snapshotDays: 0,
            lastSnapshotOn: null,
        });

        await repository.setSnapshots(userId, true, DAY1);
        await repository.setSnapshots(userId, true, DAY2);
        await takeSnapshot(repository, userId, library({ '3': 600 }), DAY1);
        expect((await repository.getSettings(userId)).snapshotsSince).toBe(DAY1.toISOString());

        await repository.setSnapshots(userId, false, DAY2);
        expect(await repository.getSettings(userId)).toEqual({
            snapshotsSince: null,
            snapshotDays: 0,
            lastSnapshotOn: null,
        });
        expect(await rows()).toEqual([]);
    });
});

describe('account deletion and sessions', () => {
    it('ends every session by bumping the epoch, and deleting removes everything', async () => {
        const repository = createSqlRepository(database.query);
        const { userId } = await repository.recordLogin(ME, DAY1);
        await repository.setOverride(
            userId,
            { source: 'steam', externalId: '3' },
            {
                state: 'abandoned',
                minutesAtSet: 1,
                setAt: DAY1.toISOString(),
            }
        );
        await takeSnapshot(repository, userId, library({ '3': 600 }), DAY1);

        expect(await repository.endSessions(userId)).toBe(1);
        expect((await repository.findAccount(ME))?.sessionEpoch).toBe(1);

        await repository.deleteAccount(userId);
        expect(await repository.findAccount(ME)).toBeNull();
        expect(await repository.listOverrides(ME)).toEqual({});
        expect(await rows()).toEqual([]);
    });
});

describe('runSnapshots', () => {
    it('takes one snapshot per opted-in, recently active account, page by page', async () => {
        const repository = createSqlRepository(database.query);
        const me = await repository.recordLogin(ME, DAY1);
        const other = await repository.recordLogin(OTHER, new Date('2026-05-01T00:00:00Z'));
        await repository.recordLogin({ source: 'steam', externalId: '76561198000000003' }, DAY1);
        await repository.setSnapshots(me.userId, true, DAY1);
        await repository.setSnapshots(other.userId, true, DAY1);

        const getLibrary = vi.fn(async () => ({ kind: 'ok' as const, data: library({ '3': 600 }) }));
        const options = { repository, getLibrary, now: () => DAY1, deadline: Date.now() + 60_000, pageSize: 1 };

        expect(await runSnapshots(options)).toEqual({ taken: 1, skipped: 0, failed: 0, unfinished: false });
        expect(getLibrary).toHaveBeenCalledExactlyOnceWith(ME);
        expect(await runSnapshots(options)).toEqual({ taken: 0, skipped: 1, failed: 0, unfinished: false });
    });

    it('counts private libraries and failures, and stops at the deadline', async () => {
        const repository = createSqlRepository(database.query);
        const me = await repository.recordLogin(ME, DAY1);
        await repository.setSnapshots(me.userId, true, DAY1);

        const locked = await runSnapshots({
            repository,
            getLibrary: async () => ({ kind: 'libraryPrivate' }),
            now: () => DAY1,
            deadline: Date.now() + 60_000,
        });
        expect(locked).toMatchObject({ failed: 1 });
        const broken = await runSnapshots({
            repository,
            getLibrary: () => Promise.reject(new Error('steam down')),
            now: () => DAY1,
            deadline: Date.now() + 60_000,
        });
        expect(broken).toMatchObject({ failed: 1 });
        const late = await runSnapshots({
            repository,
            getLibrary: async () => ({ kind: 'ok', data: library({ '3': 1 }) }),
            now: () => DAY1,
            deadline: Date.now() - 1,
        });
        expect(late).toEqual({ taken: 0, skipped: 0, failed: 0, unfinished: true });
    });
});

describe('snapshotDay', () => {
    it('is the UTC date', () => {
        expect(snapshotDay(new Date('2026-10-09T23:30:00-05:00'))).toBe('2026-10-10');
    });
});
