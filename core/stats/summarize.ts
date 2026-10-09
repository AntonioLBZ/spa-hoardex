import {
    countByState,
    isBacklog,
    type BacklogState,
    type BacklogThresholds,
    type Overrides,
} from '../backlog/index.js';
import type { EntityId, Game } from '../domain/index.js';

export interface TopGame {
    id: EntityId;
    name: string;
    minutes: number;
}

export interface YearMinutes {
    year: number;
    minutes: number;
}

export interface LibrarySummary {
    gameCount: number;
    // At least one minute played
    playedCount: number;
    totalMinutes: number;
    // Last two weeks
    recentMinutes: number;
    // Never touched or barely tried
    backlogCount: number;
    stateCounts: Record<BacklogState, number>;
    topGames: TopGame[];
    // Minutes by year of last play, ascending; games without a last-played date are left out
    minutesByYear: YearMinutes[];
}

export interface SummaryOptions {
    topCount?: number;
    thresholds?: BacklogThresholds;
    // An owner's manual states win over the computed ones
    overrides?: Overrides;
}

const DEFAULT_TOP_COUNT = 10;

function topGames(games: readonly Game[], count: number): TopGame[] {
    return games
        .filter((game) => game.playtime.totalMinutes > 0)
        .map((game) => ({ id: game.id, name: game.name, minutes: game.playtime.totalMinutes }))
        .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name))
        .slice(0, count);
}

function minutesByYear(games: readonly Game[]): YearMinutes[] {
    const byYear = new Map<number, number>();
    for (const { playtime } of games) {
        if (playtime.totalMinutes <= 0 || playtime.lastPlayedAt === null) continue;
        const year = new Date(playtime.lastPlayedAt).getUTCFullYear();
        if (Number.isNaN(year)) continue;
        byYear.set(year, (byYear.get(year) ?? 0) + playtime.totalMinutes);
    }
    return [...byYear].map(([year, minutes]) => ({ year, minutes })).sort((a, b) => a.year - b.year);
}

export function summarizeLibrary(games: readonly Game[], now: Date, options: SummaryOptions = {}): LibrarySummary {
    const stateCounts = countByState(games, now, { overrides: options.overrides, thresholds: options.thresholds });

    return {
        gameCount: games.length,
        playedCount: games.filter((game) => game.playtime.totalMinutes > 0).length,
        totalMinutes: games.reduce((sum, game) => sum + game.playtime.totalMinutes, 0),
        recentMinutes: games.reduce((sum, game) => sum + game.playtime.recentMinutes, 0),
        backlogCount: (Object.keys(stateCounts) as BacklogState[]).reduce(
            (sum, state) => sum + (isBacklog(state) ? stateCounts[state] : 0),
            0
        ),
        stateCounts,
        topGames: topGames(games, options.topCount ?? DEFAULT_TOP_COUNT),
        minutesByYear: minutesByYear(games),
    };
}
