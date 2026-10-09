import {
    BACKLOG_STATES,
    classifyGame,
    isBacklog,
    type BacklogOverride,
    type BacklogState,
    type BacklogThresholds,
    type Overrides,
} from '../backlog/index.js';
import type { Game } from '../domain/index.js';

// "backlog" is untouched plus tried
export const STATE_FILTERS = ['backlog', ...BACKLOG_STATES] as const;
export type StateFilter = (typeof STATE_FILTERS)[number];

export const SORTS = ['hours', 'recent', 'name'] as const;
export type Sort = (typeof SORTS)[number];

export interface BrowseEntry {
    game: Game;
    // What the page shows: the manual state if there is one
    state: BacklogState;
    // What the library alone gives
    computed: BacklogState;
    manual: BacklogOverride | null;
}

export interface BrowseOptions {
    // Absent: every state
    state?: StateFilter;
    // Matched against the name, ignoring case, accents and punctuation
    query?: string;
    sort: Sort;
    // BCP 47 tag used to order names
    locale?: string;
}

export interface ClassifyOptions {
    overrides?: Overrides;
    thresholds?: BacklogThresholds;
}

// Achievements can move a game to "completed" later
export function classifyLibrary(
    games: readonly Game[],
    now: Date,
    { overrides, thresholds }: ClassifyOptions = {}
): BrowseEntry[] {
    return games.map((game) => {
        const computed = classifyGame(game, now, undefined, thresholds);
        const manual = overrides?.[game.id.externalId] ?? null;
        return { game, state: manual?.state ?? computed, computed, manual };
    });
}

function matchesState(state: BacklogState, filter: StateFilter): boolean {
    return filter === 'backlog' ? isBacklog(state) : state === filter;
}

export function countByFilter(entries: readonly BrowseEntry[]): Record<StateFilter, number> {
    const counts = Object.fromEntries(STATE_FILTERS.map((filter) => [filter, 0])) as Record<StateFilter, number>;
    for (const { state } of entries) {
        counts[state] += 1;
        if (isBacklog(state)) counts.backlog += 1;
    }
    return counts;
}

// Lower case, no accents, letters and digits only, single spaces
function fold(text: string): string {
    return text
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

function compareText(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

function lastPlayedMs(game: Game): number | null {
    if (game.playtime.lastPlayedAt === null) return null;
    const ms = Date.parse(game.playtime.lastPlayedAt);
    return Number.isNaN(ms) ? null : ms;
}

function comparator(sort: Sort, locale: string | undefined): (a: BrowseEntry, b: BrowseEntry) => number {
    const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
    // Same name: the appid keeps the order stable
    const byName = (a: BrowseEntry, b: BrowseEntry) =>
        collator.compare(a.game.name, b.game.name) || compareText(a.game.id.externalId, b.game.id.externalId);

    switch (sort) {
        case 'name':
            return byName;
        case 'hours':
            return (a, b) => b.game.playtime.totalMinutes - a.game.playtime.totalMinutes || byName(a, b);
        case 'recent':
            // Never played goes last
            return (a, b) => {
                const left = lastPlayedMs(a.game);
                const right = lastPlayedMs(b.game);
                if (left === right) return byName(a, b);
                if (left === null) return 1;
                if (right === null) return -1;
                return right - left || byName(a, b);
            };
    }
}

export function browseLibrary(entries: readonly BrowseEntry[], options: BrowseOptions): BrowseEntry[] {
    const { state, query, sort, locale } = options;
    const needle = query === undefined ? '' : fold(query);

    return entries
        .filter(
            (entry) =>
                (state === undefined || matchesState(entry.state, state)) &&
                (needle === '' || fold(entry.game.name).includes(needle))
        )
        .sort(comparator(sort, locale));
}

// One list per state, each in the order given
export function groupByState(entries: readonly BrowseEntry[]): Record<BacklogState, BrowseEntry[]> {
    const groups = Object.fromEntries(BACKLOG_STATES.map((state) => [state, []])) as unknown as Record<
        BacklogState,
        BrowseEntry[]
    >;
    for (const entry of entries) groups[entry.state].push(entry);
    return groups;
}
