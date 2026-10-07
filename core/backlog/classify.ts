import type { Game } from '../domain/index.js';

// In evaluation order: the first state whose rule matches wins (ARCHITECTURE.md section 7)
export const BACKLOG_STATES = ['completed', 'untouched', 'tried', 'inProgress', 'paused', 'finished'] as const;

export type BacklogState = (typeof BACKLOG_STATES)[number];

export interface BacklogThresholds {
    // Below this many minutes a played game is only "tried"
    triedBelowMinutes: number;
    // Last played at most this many days ago
    inProgressWithinDays: number;
    // Last played at most this many days ago; older than that is "finished"
    pausedWithinDays: number;
}

export const DEFAULT_BACKLOG_THRESHOLDS: Readonly<BacklogThresholds> = {
    triedBelowMinutes: 60,
    inProgressWithinDays: 90,
    pausedWithinDays: 365,
};

export interface AchievementProgress {
    unlocked: number;
    total: number;
}

const MS_PER_DAY = 86_400_000;

// Days since `isoDate`; a future date (clock skew) counts as 0. null when unknown or unparsable.
function daysSince(isoDate: string | null, now: Date): number | null {
    if (isoDate === null) return null;
    const playedAt = Date.parse(isoDate);
    if (Number.isNaN(playedAt)) return null;
    return Math.max(0, (now.getTime() - playedAt) / MS_PER_DAY);
}

// `progress` is only known once achievements load; without it a game keeps its library-only state.
// Boundaries are inclusive on the "within" side: exactly 90 days ago is still in progress.
export function classifyGame(
    game: Game,
    now: Date,
    progress?: AchievementProgress,
    thresholds: BacklogThresholds = DEFAULT_BACKLOG_THRESHOLDS
): BacklogState {
    if (progress && progress.total > 0 && progress.unlocked >= progress.total) return 'completed';

    const { totalMinutes, lastPlayedAt } = game.playtime;
    if (totalMinutes <= 0) return 'untouched';
    if (totalMinutes < thresholds.triedBelowMinutes) return 'tried';

    // Played enough but with no known last-played date it cannot count as recent, so it is treated as long idle
    const days = daysSince(lastPlayedAt, now);
    if (days === null) return 'finished';
    if (days <= thresholds.inProgressWithinDays) return 'inProgress';
    if (days <= thresholds.pausedWithinDays) return 'paused';
    return 'finished';
}

// Backlog = games never touched or barely tried
export function isBacklog(state: BacklogState): boolean {
    return state === 'untouched' || state === 'tried';
}

// `progressByAppId` is keyed by `game.id.externalId`
export function countByState(
    games: readonly Game[],
    now: Date,
    progressByAppId?: ReadonlyMap<string, AchievementProgress>,
    thresholds?: BacklogThresholds
): Record<BacklogState, number> {
    const counts: Record<BacklogState, number> = {
        completed: 0,
        untouched: 0,
        tried: 0,
        inProgress: 0,
        paused: 0,
        finished: 0,
    };
    for (const game of games) {
        counts[classifyGame(game, now, progressByAppId?.get(game.id.externalId), thresholds)] += 1;
    }
    return counts;
}
