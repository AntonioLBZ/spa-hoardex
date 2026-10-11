import {
    FALLBACK_STATE,
    countByState,
    type BacklogThresholds,
    type Categories,
    type CategoryCounts,
    type Overrides,
} from '../backlog/index.js';
import type { EntityId, Game } from '../domain/index.js';

export interface TopGame {
    id: EntityId;
    name: string;
    minutes: number;
}

export interface YearCount {
    year: number;
    games: number;
}

export type PlaytimeBucketId = 'unplayed' | 'under1' | 'to10' | 'to50' | 'to100' | 'over100';

export interface PlaytimeBucket {
    bucket: PlaytimeBucketId;
    games: number;
    minutes: number;
}

export interface LibrarySummary {
    gameCount: number;
    // At least one minute played
    playedCount: number;
    totalMinutes: number;
    // Last two weeks
    recentMinutes: number;
    // Games played in the last two weeks
    recentGameCount: number;
    // Games in the Backlog category (never touched, or fallen there from a removed category)
    backlogCount: number;
    stateCounts: CategoryCounts;
    topGames: TopGame[];
    // Share of all minutes that the top games hold, 0 to 1
    topShare: number;
    // Fewest games that hold at least half of all minutes
    halfHoursGameCount: number;
    // Median minutes of the played games; 0 when none was played
    medianMinutes: number;
    // Games by year of last play, ascending; games without a last-played date are left out
    gamesByYear: YearCount[];
    // Every bucket from unplayed to over100, empty ones included
    playtimeBuckets: PlaytimeBucket[];
}

export interface SummaryOptions {
    topCount?: number;
    thresholds?: BacklogThresholds;
    // An owner's manual states win over the computed ones
    overrides?: Overrides;
    categories?: Categories;
}

const DEFAULT_TOP_COUNT = 10;

// Lower bound in minutes of each bucket, inclusive; a bucket ends where the next starts
const BUCKET_LIMITS: readonly { bucket: PlaytimeBucketId; from: number }[] = [
    { bucket: 'unplayed', from: 0 },
    { bucket: 'under1', from: 1 },
    { bucket: 'to10', from: 60 },
    { bucket: 'to50', from: 600 },
    { bucket: 'to100', from: 3000 },
    { bucket: 'over100', from: 6000 },
];

function topGames(games: readonly Game[], count: number): TopGame[] {
    return games
        .filter((game) => game.playtime.totalMinutes > 0)
        .map((game) => ({ id: game.id, name: game.name, minutes: game.playtime.totalMinutes }))
        .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name))
        .slice(0, count);
}

function gamesByYear(games: readonly Game[]): YearCount[] {
    const byYear = new Map<number, number>();
    for (const { playtime } of games) {
        if (playtime.totalMinutes <= 0 || playtime.lastPlayedAt === null) continue;
        const year = new Date(playtime.lastPlayedAt).getUTCFullYear();
        if (Number.isNaN(year)) continue;
        byYear.set(year, (byYear.get(year) ?? 0) + 1);
    }
    return [...byYear].map(([year, count]) => ({ year, games: count })).sort((a, b) => a.year - b.year);
}

function playtimeBuckets(minutesPlayed: readonly number[]): PlaytimeBucket[] {
    const buckets = BUCKET_LIMITS.map(({ bucket }) => ({ bucket, games: 0, minutes: 0 }));
    for (const minutes of minutesPlayed) {
        const index = BUCKET_LIMITS.findLastIndex(({ from }) => minutes >= from);
        const bucket = buckets[Math.max(index, 0)];
        if (bucket === undefined) continue;
        bucket.games += 1;
        bucket.minutes += minutes;
    }
    return buckets;
}

// `descending` holds the minutes of the played games, most first
function median(descending: readonly number[]): number {
    const middle = Math.floor(descending.length / 2);
    if (descending.length === 0) return 0;
    if (descending.length % 2 === 1) return descending[middle] ?? 0;
    return ((descending[middle - 1] ?? 0) + (descending[middle] ?? 0)) / 2;
}

function halfHoursGameCount(descending: readonly number[], totalMinutes: number): number {
    if (totalMinutes <= 0) return 0;
    let sum = 0;
    for (const [index, minutes] of descending.entries()) {
        sum += minutes;
        if (sum * 2 >= totalMinutes) return index + 1;
    }
    return descending.length;
}

export function summarizeLibrary(games: readonly Game[], now: Date, options: SummaryOptions = {}): LibrarySummary {
    const { overrides, categories, thresholds } = options;
    const stateCounts = countByState(games, now, { overrides, categories, thresholds });
    const minutes = games.map((game) => game.playtime.totalMinutes);
    const played = minutes.filter((value) => value > 0).sort((a, b) => b - a);
    const totalMinutes = minutes.reduce((sum, value) => sum + value, 0);
    const top = topGames(games, options.topCount ?? DEFAULT_TOP_COUNT);
    const topMinutes = top.reduce((sum, game) => sum + game.minutes, 0);

    return {
        gameCount: games.length,
        playedCount: played.length,
        totalMinutes,
        recentMinutes: games.reduce((sum, game) => sum + game.playtime.recentMinutes, 0),
        recentGameCount: games.filter((game) => game.playtime.recentMinutes > 0).length,
        backlogCount: stateCounts[FALLBACK_STATE] ?? 0,
        stateCounts,
        topGames: top,
        topShare: totalMinutes > 0 ? topMinutes / totalMinutes : 0,
        halfHoursGameCount: halfHoursGameCount(played, totalMinutes),
        medianMinutes: median(played),
        gamesByYear: gamesByYear(games),
        playtimeBuckets: playtimeBuckets(minutes),
    };
}
