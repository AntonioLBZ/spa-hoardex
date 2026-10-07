import { describe, expect, it } from 'vitest';
import type { Game } from '../domain/index.js';
import {
    BACKLOG_STATES,
    DEFAULT_BACKLOG_THRESHOLDS,
    classifyGame,
    countByState,
    isBacklog,
    type AchievementProgress,
    type BacklogState,
    type BacklogThresholds,
} from './index.js';

const NOW = new Date('2026-10-07T12:00:00.000Z');
const DAY_MS = 86_400_000;

function daysAgo(days: number): string {
    return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

function makeGame(totalMinutes: number, lastPlayedAt: string | null, appid = '1'): Game {
    return {
        id: { source: 'steam', externalId: appid },
        name: `Game ${appid}`,
        iconUrl: null,
        hasVisibleStats: true,
        playtime: { totalMinutes, recentMinutes: 0, lastPlayedAt, platforms: null },
    };
}

describe('constants', () => {
    it('lists the states in evaluation order', () => {
        expect(BACKLOG_STATES).toEqual(['completed', 'untouched', 'tried', 'inProgress', 'paused', 'finished']);
    });

    it('has the agreed default thresholds', () => {
        expect(DEFAULT_BACKLOG_THRESHOLDS).toEqual({
            triedBelowMinutes: 60,
            inProgressWithinDays: 90,
            pausedWithinDays: 365,
        });
    });
});

describe('classifyGame', () => {
    describe('every state', () => {
        it('completed: all achievements unlocked', () => {
            expect(classifyGame(makeGame(600, daysAgo(10)), NOW, { unlocked: 50, total: 50 })).toBe('completed');
        });

        it('untouched: no playtime', () => {
            expect(classifyGame(makeGame(0, null), NOW)).toBe('untouched');
        });

        it('tried: under an hour', () => {
            expect(classifyGame(makeGame(25, daysAgo(3)), NOW)).toBe('tried');
        });

        it('inProgress: an hour or more, played recently', () => {
            expect(classifyGame(makeGame(600, daysAgo(10)), NOW)).toBe('inProgress');
        });

        it('paused: an hour or more, last played between 90 days and a year ago', () => {
            expect(classifyGame(makeGame(600, daysAgo(200)), NOW)).toBe('paused');
        });

        it('finished: an hour or more, last played over a year ago', () => {
            expect(classifyGame(makeGame(600, daysAgo(800)), NOW)).toBe('finished');
        });
    });

    describe('priority (first match wins)', () => {
        it('completed beats untouched', () => {
            expect(classifyGame(makeGame(0, null), NOW, { unlocked: 10, total: 10 })).toBe('completed');
        });

        it('completed beats tried', () => {
            expect(classifyGame(makeGame(30, daysAgo(1)), NOW, { unlocked: 10, total: 10 })).toBe('completed');
        });

        it('completed beats inProgress, paused and finished', () => {
            const progress: AchievementProgress = { unlocked: 10, total: 10 };
            expect(classifyGame(makeGame(600, daysAgo(10)), NOW, progress)).toBe('completed');
            expect(classifyGame(makeGame(600, daysAgo(200)), NOW, progress)).toBe('completed');
            expect(classifyGame(makeGame(600, daysAgo(800)), NOW, progress)).toBe('completed');
            expect(classifyGame(makeGame(600, null), NOW, progress)).toBe('completed');
        });

        it('treats more unlocked than total as complete', () => {
            expect(classifyGame(makeGame(600, daysAgo(10)), NOW, { unlocked: 12, total: 10 })).toBe('completed');
        });

        it('never completes with total 0, whatever unlocked says', () => {
            expect(classifyGame(makeGame(0, null), NOW, { unlocked: 0, total: 0 })).toBe('untouched');
            expect(classifyGame(makeGame(600, daysAgo(10)), NOW, { unlocked: 0, total: 0 })).toBe('inProgress');
            expect(classifyGame(makeGame(600, daysAgo(10)), NOW, { unlocked: 5, total: 0 })).toBe('inProgress');
        });

        it('does not complete a partially unlocked game', () => {
            expect(classifyGame(makeGame(600, daysAgo(10)), NOW, { unlocked: 9, total: 10 })).toBe('inProgress');
        });

        it('keeps the library-only state when progress has not loaded', () => {
            expect(classifyGame(makeGame(600, daysAgo(10)), NOW, undefined)).toBe('inProgress');
        });
    });

    describe('playtime boundaries', () => {
        it('59 minutes is tried', () => {
            expect(classifyGame(makeGame(59, daysAgo(1)), NOW)).toBe('tried');
        });

        it('60 minutes is no longer tried', () => {
            expect(classifyGame(makeGame(60, daysAgo(1)), NOW)).toBe('inProgress');
        });

        it('1 minute is tried, 0 is untouched', () => {
            expect(classifyGame(makeGame(1, daysAgo(1)), NOW)).toBe('tried');
            expect(classifyGame(makeGame(0, daysAgo(1)), NOW)).toBe('untouched');
        });

        it('ignores recency below the tried threshold', () => {
            expect(classifyGame(makeGame(59, daysAgo(2000)), NOW)).toBe('tried');
            expect(classifyGame(makeGame(59, null), NOW)).toBe('tried');
        });

        it('untouched ignores a stray last-played date', () => {
            expect(classifyGame(makeGame(0, daysAgo(5)), NOW)).toBe('untouched');
        });
    });

    describe('recency boundaries', () => {
        it('90 days is still inProgress, 91 is paused', () => {
            expect(classifyGame(makeGame(120, daysAgo(90)), NOW)).toBe('inProgress');
            expect(classifyGame(makeGame(120, daysAgo(91)), NOW)).toBe('paused');
        });

        it('one millisecond past 90 days is paused', () => {
            const justOver = new Date(NOW.getTime() - 90 * DAY_MS - 1).toISOString();
            expect(classifyGame(makeGame(120, justOver), NOW)).toBe('paused');
        });

        it('365 days is still paused, 366 is finished', () => {
            expect(classifyGame(makeGame(120, daysAgo(365)), NOW)).toBe('paused');
            expect(classifyGame(makeGame(120, daysAgo(366)), NOW)).toBe('finished');
        });

        it('one millisecond past 365 days is finished', () => {
            const justOver = new Date(NOW.getTime() - 365 * DAY_MS - 1).toISOString();
            expect(classifyGame(makeGame(120, justOver), NOW)).toBe('finished');
        });

        it('played just now is inProgress', () => {
            expect(classifyGame(makeGame(120, NOW.toISOString()), NOW)).toBe('inProgress');
        });
    });

    describe('future dates (clock skew)', () => {
        it('counts a last-played date in the future as 0 days', () => {
            const tomorrow = new Date(NOW.getTime() + DAY_MS).toISOString();
            expect(classifyGame(makeGame(120, tomorrow), NOW)).toBe('inProgress');
        });

        it('counts a far-future date as 0 days too', () => {
            const farFuture = new Date(NOW.getTime() + 5000 * DAY_MS).toISOString();
            expect(classifyGame(makeGame(120, farFuture), NOW)).toBe('inProgress');
        });

        it('a future date is inProgress even with a zero-day threshold', () => {
            const tomorrow = new Date(NOW.getTime() + DAY_MS).toISOString();
            const thresholds: BacklogThresholds = { ...DEFAULT_BACKLOG_THRESHOLDS, inProgressWithinDays: 0 };
            expect(classifyGame(makeGame(120, tomorrow), NOW, undefined, thresholds)).toBe('inProgress');
        });
    });

    describe('unknown last-played date', () => {
        it('classifies 60+ minutes with a null date as finished', () => {
            expect(classifyGame(makeGame(60, null), NOW)).toBe('finished');
            expect(classifyGame(makeGame(5000, null), NOW)).toBe('finished');
        });

        it('classifies an unparsable date like a null one', () => {
            expect(classifyGame(makeGame(120, 'not-a-date'), NOW)).toBe('finished');
        });

        it('still classifies short playtime with a null date by minutes', () => {
            expect(classifyGame(makeGame(10, null), NOW)).toBe('tried');
            expect(classifyGame(makeGame(0, null), NOW)).toBe('untouched');
        });
    });

    describe('custom thresholds', () => {
        const thresholds: BacklogThresholds = {
            triedBelowMinutes: 120,
            inProgressWithinDays: 30,
            pausedWithinDays: 180,
        };

        it('moves the tried boundary', () => {
            expect(classifyGame(makeGame(119, daysAgo(1)), NOW, undefined, thresholds)).toBe('tried');
            expect(classifyGame(makeGame(120, daysAgo(1)), NOW, undefined, thresholds)).toBe('inProgress');
            expect(classifyGame(makeGame(90, daysAgo(1)), NOW)).toBe('inProgress');
        });

        it('moves the inProgress boundary', () => {
            expect(classifyGame(makeGame(300, daysAgo(30)), NOW, undefined, thresholds)).toBe('inProgress');
            expect(classifyGame(makeGame(300, daysAgo(31)), NOW, undefined, thresholds)).toBe('paused');
        });

        it('moves the paused boundary', () => {
            expect(classifyGame(makeGame(300, daysAgo(180)), NOW, undefined, thresholds)).toBe('paused');
            expect(classifyGame(makeGame(300, daysAgo(181)), NOW, undefined, thresholds)).toBe('finished');
        });

        it('lets equal day thresholds collapse the paused band', () => {
            const collapsed: BacklogThresholds = { ...DEFAULT_BACKLOG_THRESHOLDS, pausedWithinDays: 90 };
            expect(classifyGame(makeGame(300, daysAgo(90)), NOW, undefined, collapsed)).toBe('inProgress');
            expect(classifyGame(makeGame(300, daysAgo(91)), NOW, undefined, collapsed)).toBe('finished');
        });

        it('does not affect completed', () => {
            expect(classifyGame(makeGame(1, daysAgo(1)), NOW, { unlocked: 3, total: 3 }, thresholds)).toBe('completed');
        });
    });
});

describe('isBacklog', () => {
    const expected: Record<BacklogState, boolean> = {
        completed: false,
        untouched: true,
        tried: true,
        inProgress: false,
        paused: false,
        finished: false,
    };

    it.each(BACKLOG_STATES)('%s', (state) => {
        expect(isBacklog(state)).toBe(expected[state]);
    });
});

describe('countByState', () => {
    it('returns every key at zero for an empty library', () => {
        expect(countByState([], NOW)).toEqual({
            completed: 0,
            untouched: 0,
            tried: 0,
            inProgress: 0,
            paused: 0,
            finished: 0,
        });
    });

    it('always includes every state key', () => {
        const counts = countByState([makeGame(0, null)], NOW);
        expect(Object.keys(counts).sort()).toEqual([...BACKLOG_STATES].sort());
    });

    it('counts a mixed library and the total matches', () => {
        const games = [
            makeGame(0, null, '1'),
            makeGame(0, null, '2'),
            makeGame(0, null, '3'),
            makeGame(30, daysAgo(5), '4'),
            makeGame(30, daysAgo(500), '5'),
            makeGame(600, daysAgo(10), '6'),
            makeGame(600, daysAgo(200), '7'),
            makeGame(600, daysAgo(900), '8'),
            makeGame(600, null, '9'),
        ];
        const counts = countByState(games, NOW);
        expect(counts).toEqual({
            completed: 0,
            untouched: 3,
            tried: 2,
            inProgress: 1,
            paused: 1,
            finished: 2,
        });
        expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(games.length);
    });

    it('looks progress up by game.id.externalId', () => {
        const games = [makeGame(0, null, '10'), makeGame(600, daysAgo(10), '20'), makeGame(600, daysAgo(10), '30')];
        const progress = new Map<string, AchievementProgress>([
            ['10', { unlocked: 5, total: 5 }],
            ['20', { unlocked: 4, total: 5 }],
            ['999', { unlocked: 1, total: 1 }],
        ]);
        expect(countByState(games, NOW, progress)).toEqual({
            completed: 1,
            untouched: 0,
            tried: 0,
            inProgress: 2,
            paused: 0,
            finished: 0,
        });
    });

    it('does not complete games whose progress has total 0', () => {
        const games = [makeGame(600, daysAgo(10), '1')];
        const progress = new Map<string, AchievementProgress>([['1', { unlocked: 0, total: 0 }]]);
        expect(countByState(games, NOW, progress).completed).toBe(0);
    });

    it('passes custom thresholds through', () => {
        const games = [makeGame(90, daysAgo(1), '1'), makeGame(300, daysAgo(40), '2')];
        const thresholds: BacklogThresholds = {
            triedBelowMinutes: 120,
            inProgressWithinDays: 30,
            pausedWithinDays: 180,
        };
        expect(countByState(games, NOW, undefined, thresholds)).toEqual({
            completed: 0,
            untouched: 0,
            tried: 1,
            inProgress: 0,
            paused: 1,
            finished: 0,
        });
    });

    it('sums untouched and tried into the backlog size', () => {
        const games = [makeGame(0, null, '1'), makeGame(10, daysAgo(2), '2'), makeGame(600, daysAgo(2), '3')];
        const counts = countByState(games, NOW);
        const backlog = BACKLOG_STATES.filter(isBacklog).reduce((sum, state) => sum + counts[state], 0);
        expect(backlog).toBe(2);
    });
});
