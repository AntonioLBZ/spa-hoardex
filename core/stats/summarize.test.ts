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
            backlogCount: 0,
            stateCounts: { untouched: 0, tried: 0, inProgress: 0, paused: 0, finished: 0, abandoned: 0 },
            topGames: [],
            minutesByYear: [],
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

        expect(summary).toMatchObject({ gameCount: 3, playedCount: 2, totalMinutes: 630, recentMinutes: 120 });
    });

    it('counts the backlog as untouched plus tried', () => {
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
        expect(summary.backlogCount).toBe(3);
    });

    it('honours custom thresholds', () => {
        const games = [makeGame('1', 90, '2026-09-01T00:00:00Z')];

        expect(summarizeLibrary(games, NOW).stateCounts.inProgress).toBe(1);
        expect(
            summarizeLibrary(games, NOW, {
                thresholds: { triedBelowMinutes: 120, inProgressWithinDays: 90, pausedWithinDays: 365 },
            }).backlogCount
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

    describe('minutesByYear', () => {
        it('adds up minutes by year of last play, ascending', () => {
            const summary = summarizeLibrary(
                [
                    makeGame('1', 100, '2026-03-01T00:00:00Z'),
                    makeGame('2', 200, '2024-06-01T00:00:00Z'),
                    makeGame('3', 50, '2026-09-01T00:00:00Z'),
                ],
                NOW
            );

            expect(summary.minutesByYear).toEqual([
                { year: 2024, minutes: 200 },
                { year: 2026, minutes: 150 },
            ]);
        });

        it('leaves out unplayed games and games without a last-played date', () => {
            const summary = summarizeLibrary(
                [makeGame('1', 0, '2026-03-01T00:00:00Z'), makeGame('2', 100, null), makeGame('3', 100, 'not a date')],
                NOW
            );

            expect(summary.minutesByYear).toEqual([]);
            expect(summary.totalMinutes).toBe(200);
        });

        it('buckets by UTC year at the boundary', () => {
            const summary = summarizeLibrary(
                [makeGame('1', 10, '2025-12-31T23:59:59Z'), makeGame('2', 10, '2026-01-01T00:00:00Z')],
                NOW
            );

            expect(summary.minutesByYear.map((entry) => entry.year)).toEqual([2025, 2026]);
        });
    });
});
