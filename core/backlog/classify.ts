import type { Game } from '../domain/index.js';

// The computed ones in evaluation order (first match wins), then `abandoned`, which only an owner sets
export const BACKLOG_STATES = ['untouched', 'tried', 'inProgress', 'paused', 'finished', 'abandoned'] as const;

export type BacklogState = (typeof BACKLOG_STATES)[number];

// Dropped states that stored data may still hold, and what they read as now
const RETIRED_STATES: Readonly<Record<string, BacklogState>> = { completed: 'finished' };

// Maps a retired state to its replacement; anything else passes through untouched
export function upgradeState(value: unknown): unknown {
    return typeof value === 'string' && Object.hasOwn(RETIRED_STATES, value) ? RETIRED_STATES[value] : value;
}

// What an owner can set by hand: every state
export const MANUAL_STATES = BACKLOG_STATES;

export type ManualState = BacklogState;

// Games one request may change at once
export const MAX_BULK_CHANGE = 1000;

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

const MS_PER_DAY = 86_400_000;

// Days since isoDate; future dates count as 0; null if missing or unparsable
function daysSince(isoDate: string | null, now: Date): number | null {
    if (isoDate === null) return null;
    const playedAt = Date.parse(isoDate);
    if (Number.isNaN(playedAt)) return null;
    return Math.max(0, (now.getTime() - playedAt) / MS_PER_DAY);
}

// Boundaries are inclusive on the "within" side
export function classifyGame(
    game: Game,
    now: Date,
    thresholds: BacklogThresholds = DEFAULT_BACKLOG_THRESHOLDS
): BacklogState {
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
    thresholds?: BacklogThresholds
): BacklogState {
    return override?.state ?? classifyGame(game, now, thresholds);
}

// Backlog = games never touched or barely tried
export function isBacklog(state: BacklogState): boolean {
    return state === 'untouched' || state === 'tried';
}

export interface StateOptions {
    overrides?: Overrides;
    thresholds?: BacklogThresholds;
}

export function countByState(
    games: readonly Game[],
    now: Date,
    { overrides, thresholds }: StateOptions = {}
): Record<BacklogState, number> {
    const counts: Record<BacklogState, number> = {
        untouched: 0,
        tried: 0,
        inProgress: 0,
        paused: 0,
        finished: 0,
        abandoned: 0,
    };
    for (const game of games) {
        counts[resolveState(game, now, overrides?.[game.id.externalId], thresholds)] += 1;
    }
    return counts;
}
