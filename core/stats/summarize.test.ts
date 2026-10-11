import { describe, expect, it } from 'vitest';
import type { Game } from '../domain/index.js';
import { summarizeLibrary } from './index.js';

const NOW = new Date('2026-10-07T12:00:00.000Z');

function makeGame(appid: string, totalMinutes: number, lastPlayedAt: string | null, recentMinutes = 0): Game {
    return {
        id: { source: 'steam', externalId: appid },
        name: `Game ${appid}`,
        iconUrl: null,
        hasVisibleStats: true,
        playtime: { totalMinutes, recentMinutes, lastPlayedAt, platforms: null },
    };
}

describe('summarizeLibrary', () => {
    it('summarizes an empty library', () => {
        expect(summarizeLibrary([], NOW)).toEqual({
            gameCount: 0,
            playedCount: 0,
            totalMinutes: 0,
            recentMinutes: 0,
            recentGameCount: 0,
            backlogCount: 0,
            stateCounts: { untouched: 0, tried: 0, inProgress: 0, paused: 0, finished: 0, abandoned: 0 },
            topGames: [],
            topShare: 0,
            halfHoursGameCount: 0,
            medianMinutes: 0,
            gamesByYear: [],
            playtimeBuckets: [
                { bucket: 'unplayed', games: 0, minutes: 0 },
                { bucket: 'under1', games: 0, minutes: 0 },
                { bucket: 'to10', games: 0, minutes: 0 },
                { bucket: 'to50', games: 0, minutes: 0 },
                { bucket: 'to100', games: 0, minutes: 0 },
                { bucket: 'over100', games: 0, minutes: 0 },
            ],
        });
    });

    it('counts games, played games and minutes', () => {
        const summary = summarizeLibrary(
            [
                makeGame('1', 0, null),
                makeGame('2', 30, '2026-10-01T00:00:00Z', 30),
                makeGame('3', 600, '2026-09-01T00:00:00Z', 90),
            ],
            NOW
        );

        expect(summary).toMatchObject({
            gameCount: 3,
            playedCount: 2,
            totalMinutes: 630,
            recentMinutes: 120,
            recentGameCount: 2,
        });
    });

    it('counts the backlog as the untouched games', () => {
        const summary = summarizeLibrary(
            [
                makeGame('1', 0, null),
                makeGame('2', 0, null),
                makeGame('3', 30, '2026-10-01T00:00:00Z'),
                makeGame('4', 600, '2026-09-01T00:00:00Z'),
            ],
            NOW
        );

        expect(summary.stateCounts).toMatchObject({ untouched: 2, tried: 1, inProgress: 1 });
        expect(summary.backlogCount).toBe(2);
    });

    it('counts games of removed categories in the backlog', () => {
        const summary = summarizeLibrary([makeGame('1', 0, null), makeGame('2', 30, '2026-10-01T00:00:00Z')], NOW, {
            categories: { removed: ['tried'], custom: [] },
        });

        expect(summary.stateCounts).not.toHaveProperty('tried');
        expect(summary.backlogCount).toBe(2);
    });

    it('honours custom thresholds', () => {
        const games = [makeGame('1', 90, '2026-09-01T00:00:00Z')];

        expect(summarizeLibrary(games, NOW).stateCounts.inProgress).toBe(1);
        expect(
            summarizeLibrary(games, NOW, {
                thresholds: { triedBelowMinutes: 120, inProgressWithinDays: 90, pausedWithinDays: 365 },
            }).stateCounts.tried
        ).toBe(1);
    });

    describe('topGames', () => {
        it('lists the most played first and skips unplayed games', () => {
            const summary = summarizeLibrary(
                [makeGame('1', 0, null), makeGame('2', 50, null), makeGame('3', 900, null)],
                NOW
            );

            expect(summary.topGames.map((game) => game.id.externalId)).toEqual(['3', '2']);
            expect(summary.topGames[0]).toMatchObject({ name: 'Game 3', minutes: 900 });
        });

        it('breaks ties by name so the order is stable', () => {
            const summary = summarizeLibrary([makeGame('b', 100, null), makeGame('a', 100, null)], NOW);

            expect(summary.topGames.map((game) => game.id.externalId)).toEqual(['a', 'b']);
        });

        it('caps the list at topCount, ten by default', () => {
            const games = Array.from({ length: 12 }, (_, index) => makeGame(String(index), index + 1, null));

            expect(summarizeLibrary(games, NOW).topGames).toHaveLength(10);
            expect(summarizeLibrary(games, NOW, { topCount: 3 }).topGames).toHaveLength(3);
        });
    });

    describe('gamesByYear', () => {
        it('counts the games by year of last play, ascending', () => {
            const summary = summarizeLibrary(
                [
                    makeGame('1', 100, '2026-03-01T00:00:00Z'),
                    makeGame('2', 200, '2024-06-01T00:00:00Z'),
                    makeGame('3', 5000, '2026-09-01T00:00:00Z'),
                ],
                NOW
            );

            expect(summary.gamesByYear).toEqual([
                { year: 2024, games: 1 },
                { year: 2026, games: 2 },
            ]);
        });

        it('leaves out unplayed games and games without a last-played date', () => {
            const summary = summarizeLibrary(
                [makeGame('1', 0, '2026-03-01T00:00:00Z'), makeGame('2', 100, null), makeGame('3', 100, 'not a date')],
                NOW
            );

            expect(summary.gamesByYear).toEqual([]);
            expect(summary.totalMinutes).toBe(200);
        });

        it('buckets by UTC year at the boundary', () => {
            const summary = summarizeLibrary(
                [makeGame('1', 10, '2025-12-31T23:59:59Z'), makeGame('2', 10, '2026-01-01T00:00:00Z')],
                NOW
            );

            expect(summary.gamesByYear.map((entry) => entry.year)).toEqual([2025, 2026]);
        });
    });

    describe('playtimeBuckets', () => {
        it('puts each game in the bucket of its hours, lower bound included', () => {
            const minutes = [0, 1, 59, 60, 599, 600, 2999, 3000, 5999, 6000, 90_000];
            const summary = summarizeLibrary(
                minutes.map((value, index) => makeGame(String(index), value, null)),
                NOW
            );

            expect(summary.playtimeBuckets).toEqual([
                { bucket: 'unplayed', games: 1, minutes: 0 },
                { bucket: 'under1', games: 2, minutes: 60 },
                { bucket: 'to10', games: 2, minutes: 659 },
                { bucket: 'to50', games: 2, minutes: 3599 },
                { bucket: 'to100', games: 2, minutes: 8999 },
                { bucket: 'over100', games: 2, minutes: 96_000 },
            ]);
        });

        it('counts every unplayed game, whatever its state', () => {
            const summary = summarizeLibrary([makeGame('1', 0, null), makeGame('2', 0, null)], NOW, {
                overrides: { '1': { state: 'finished', setAt: NOW.toISOString(), minutesAtSet: 0 } },
            });

            expect(summary.playtimeBuckets[0]).toEqual({ bucket: 'unplayed', games: 2, minutes: 0 });
        });
    });

    describe('medianMinutes', () => {
        it('takes the middle played game', () => {
            const summary = summarizeLibrary(
                [makeGame('1', 0, null), makeGame('2', 300, null), makeGame('3', 10, null), makeGame('4', 40, null)],
                NOW
            );

            expect(summary.medianMinutes).toBe(40);
        });

        it('averages the two middle games of an even count', () => {
            const summary = summarizeLibrary([makeGame('1', 10, null), makeGame('2', 50, null)], NOW);

            expect(summary.medianMinutes).toBe(30);
        });

        it('is zero when nothing was played', () => {
            expect(summarizeLibrary([makeGame('1', 0, null)], NOW).medianMinutes).toBe(0);
        });
    });

    describe('concentration', () => {
        it('gives the share of the hours in the top games', () => {
            const games = Array.from({ length: 4 }, (_, index) => makeGame(String(index), 100, null));

            expect(summarizeLibrary(games, NOW, { topCount: 3 }).topShare).toBe(0.75);
            expect(summarizeLibrary(games, NOW).topShare).toBe(1);
        });

        it('counts the fewest games that hold half the hours', () => {
            const dominant = [makeGame('1', 900, null), makeGame('2', 50, null), makeGame('3', 50, null)];
            const even = Array.from({ length: 6 }, (_, index) => makeGame(String(index), 100, null));

            expect(summarizeLibrary(dominant, NOW).halfHoursGameCount).toBe(1);
            expect(summarizeLibrary(even, NOW).halfHoursGameCount).toBe(3);
        });

        it('is zero without hours', () => {
            const summary = summarizeLibrary([makeGame('1', 0, null)], NOW);

            expect(summary).toMatchObject({ topShare: 0, halfHoursGameCount: 0 });
        });
    });
});
