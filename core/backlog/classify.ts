import type { Game } from '../domain/index.js';

// The computed ones in evaluation order (first match wins), then `abandoned`, which only an owner sets
export const BACKLOG_STATES = [
    'completed',
    'untouched',
    'tried',
    'inProgress',
    'paused',
    'finished',
    'abandoned',
] as const;

export type BacklogState = (typeof BACKLOG_STATES)[number];

// What an owner can set by hand: every state
export const MANUAL_STATES = BACKLOG_STATES;

export type ManualState = BacklogState;

// A state set by hand; it wins over the computed one
export interface BacklogOverride {
    state: BacklogState;
    // ISO 8601
    setAt: string;
    // Playtime when it was set, to notice play since then
    minutesAtSet: number;
}

// Keyed by game externalId (the appid)
export type Overrides = Readonly<Record<string, BacklogOverride>>;

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

// Days since isoDate; future dates count as 0; null if missing or unparsable
function daysSince(isoDate: string | null, now: Date): number | null {
    if (isoDate === null) return null;
    const playedAt = Date.parse(isoDate);
    if (Number.isNaN(playedAt)) return null;
    return Math.max(0, (now.getTime() - playedAt) / MS_PER_DAY);
}

// Without progress (achievements not loaded) a game keeps its library-only state; boundaries are inclusive on the "within" side
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

    // No last-played date: treated as long idle
    const days = daysSince(lastPlayedAt, now);
    if (days === null) return 'finished';
    if (days <= thresholds.inProgressWithinDays) return 'inProgress';
    if (days <= thresholds.pausedWithinDays) return 'paused';
    return 'finished';
}

// An owner's choice first, then the computed state
export function resolveState(
    game: Game,
    now: Date,
    override?: BacklogOverride,
    progress?: AchievementProgress,
    thresholds?: BacklogThresholds
): BacklogState {
    return override?.state ?? classifyGame(game, now, progress, thresholds);
}

// Backlog = games never touched or barely tried
export function isBacklog(state: BacklogState): boolean {
    return state === 'untouched' || state === 'tried';
}

export interface StateOptions {
    // Keyed by `game.id.externalId`
    progressByAppId?: ReadonlyMap<string, AchievementProgress>;
    overrides?: Overrides;
    thresholds?: BacklogThresholds;
}

export function countByState(
    games: readonly Game[],
    now: Date,
    { progressByAppId, overrides, thresholds }: StateOptions = {}
): Record<BacklogState, number> {
    const counts: Record<BacklogState, number> = {
        completed: 0,
        untouched: 0,
        tried: 0,
        inProgress: 0,
        paused: 0,
        finished: 0,
        abandoned: 0,
    };
    for (const game of games) {
        const id = game.id.externalId;
        counts[resolveState(game, now, overrides?.[id], progressByAppId?.get(id), thresholds)] += 1;
    }
    return counts;
}
