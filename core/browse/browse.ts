import {
    DEFAULT_CATEGORIES,
    categoryIds,
    computedState,
    hasCategory,
    type BacklogOverride,
    type BacklogState,
    type BacklogThresholds,
    type Categories,
    type CategoryCounts,
    type CategoryId,
    type Overrides,
} from '../backlog/index.js';
import type { Game } from '../domain/index.js';

export const SORTS = ['hours', 'recent', 'name'] as const;
export type Sort = (typeof SORTS)[number];

export const DIRECTIONS = ['asc', 'desc'] as const;
export type Direction = (typeof DIRECTIONS)[number];

// The direction each sort starts in
export const NATURAL_DIRECTION: Record<Sort, Direction> = { hours: 'desc', recent: 'desc', name: 'asc' };

export interface BrowseEntry {
    game: Game;
    // What the page shows: the manual category if it still exists
    state: CategoryId;
    // What the library alone gives, after the fallback for removed categories
    computed: BacklogState;
    // Null when absent or when its category is gone
    manual: BacklogOverride | null;
}

export interface BrowseOptions {
    // Absent: every category
    state?: CategoryId;
    // Matched against the name, ignoring case, accents and punctuation
    query?: string;
    sort: Sort;
    // Absent: the sort's natural direction
    direction?: Direction;
    // BCP 47 tag used to order names
    locale?: string;
}

export interface ClassifyOptions {
    overrides?: Overrides;
    categories?: Categories;
    thresholds?: BacklogThresholds;
}

export function classifyLibrary(
    games: readonly Game[],
    now: Date,
    { overrides, categories = DEFAULT_CATEGORIES, thresholds }: ClassifyOptions = {}
): BrowseEntry[] {
    return games.map((game) => {
        const computed = computedState(game, now, categories, thresholds);
        const stored = overrides?.[game.id.externalId];
        const manual = stored !== undefined && hasCategory(categories, stored.state) ? stored : null;
        return { game, state: manual?.state ?? computed, computed, manual };
    });
}

// Every category of the account, at zero when empty
export function countByCategory(entries: readonly BrowseEntry[], categories: Categories): CategoryCounts {
    const counts: Partial<Record<CategoryId, number>> = Object.fromEntries(
        categoryIds(categories).map((id) => [id, 0])
    );
    for (const { state } of entries) counts[state] = (counts[state] ?? 0) + 1;
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

function comparator(
    sort: Sort,
    direction: Direction,
    locale: string | undefined
): (a: BrowseEntry, b: BrowseEntry) => number {
    const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
    // Same name: the appid keeps the order stable
    const byName = (a: BrowseEntry, b: BrowseEntry) =>
        collator.compare(a.game.name, b.game.name) || compareText(a.game.id.externalId, b.game.id.externalId);
    const sign = direction === NATURAL_DIRECTION[sort] ? 1 : -1;

    switch (sort) {
        case 'name':
            return (a, b) => sign * byName(a, b);
        case 'hours':
            return (a, b) => sign * (b.game.playtime.totalMinutes - a.game.playtime.totalMinutes) || byName(a, b);
        case 'recent':
            // Never played goes last either way
            return (a, b) => {
                const left = lastPlayedMs(a.game);
                const right = lastPlayedMs(b.game);
                if (left === right) return byName(a, b);
                if (left === null) return 1;
                if (right === null) return -1;
                return sign * (right - left) || byName(a, b);
            };
    }
}

export function browseLibrary(entries: readonly BrowseEntry[], options: BrowseOptions): BrowseEntry[] {
    const { state, query, sort, direction = NATURAL_DIRECTION[sort], locale } = options;
    const needle = query === undefined ? '' : fold(query);

    return entries
        .filter(
            (entry) =>
                (state === undefined || entry.state === state) &&
                (needle === '' || fold(entry.game.name).includes(needle))
        )
        .sort(comparator(sort, direction, locale));
}
