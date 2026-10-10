import type { Game } from '../domain/index.js';
import {
    BACKLOG_STATES,
    classifyGame,
    type BacklogOverride,
    type BacklogState,
    type BacklogThresholds,
    type Overrides,
} from './classify.js';

// An owner's own category: "c-" and 8 hex digits
export const CUSTOM_ID_PATTERN = /^c-[0-9a-f]{8}$/;

// The palette's tokens; anything else is a colour as #rrggbb
export const PALETTE = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'] as const;
export const COLOR_PATTERN = /^(p[1-8]|#[0-9a-f]{6})$/;

// Categories an account may have at once, the built-in ones included
export const MAX_CATEGORIES = 12;
export const MAX_CATEGORY_NAME = 24;

// Shown as "Backlog": it can't be removed, and catches games whose computed category is gone
export const FALLBACK_STATE = 'untouched' satisfies BacklogState;

export type CustomId = `c-${string}`;
export type CategoryId = BacklogState | CustomId;

export interface CustomCategory {
    id: CustomId;
    name: string;
    // A palette token or #rrggbb
    color: string;
}

export interface Categories {
    // Built-in states the owner removed; never the fallback
    removed: readonly BacklogState[];
    // In creation order
    custom: readonly CustomCategory[];
    // Built-in states the owner recoloured; absent in copies from before it existed
    colors?: Readonly<Partial<Record<BacklogState, string>>>;
}

// What a profile shows of its owner's choices; public, like the library
export interface BacklogData {
    overrides: Overrides;
    categories: Categories;
}

export const DEFAULT_CATEGORIES: Categories = Object.freeze({
    removed: Object.freeze([]),
    custom: Object.freeze([]),
    colors: Object.freeze({}),
});

// Absent keys are categories without games
export type CategoryCounts = Readonly<Partial<Record<CategoryId, number>>>;

export function isBuiltInState(value: unknown): value is BacklogState {
    return BACKLOG_STATES.some((state) => state === value);
}

export function isCustomId(value: unknown): value is CustomId {
    return typeof value === 'string' && CUSTOM_ID_PATTERN.test(value);
}

// Shape only: whether that account has it is `hasCategory`
export function isCategoryId(value: unknown): value is CategoryId {
    return isBuiltInState(value) || isCustomId(value);
}

// Trimmed, inner spaces collapsed, 1 to MAX_CATEGORY_NAME characters, no control characters; null if not valid
export function normalizeCategoryName(raw: unknown): string | null {
    if (typeof raw !== 'string' || /\p{Cc}/u.test(raw)) return null;
    const name = raw.trim().replace(/\s+/gu, ' ');
    const length = [...name].length;
    return length >= 1 && length <= MAX_CATEGORY_NAME ? name : null;
}

// Lower case; null if neither a palette token nor #rrggbb
export function normalizeCategoryColor(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const color = raw.trim().toLowerCase();
    return COLOR_PATTERN.test(color) ? color : null;
}

// Names are unique among an owner's own categories, ignoring case
export function sameCategoryName(a: string, b: string): boolean {
    return a.toLocaleLowerCase('und') === b.toLocaleLowerCase('und');
}

// The built-in ones still there, in evaluation order, then the owner's own
export function categoryIds(categories: Categories): CategoryId[] {
    return [
        ...BACKLOG_STATES.filter((state) => state === FALLBACK_STATE || !categories.removed.includes(state)),
        ...categories.custom.map((category) => category.id),
    ];
}

export function hasCategory(categories: Categories, id: unknown): id is CategoryId {
    if (id === FALLBACK_STATE) return true;
    if (isBuiltInState(id)) return !categories.removed.includes(id);
    return categories.custom.some((category) => category.id === id);
}

export function canCreateCategory(categories: Categories): boolean {
    return categoryIds(categories).length < MAX_CATEGORIES;
}

// The rules' answer, or the fallback when the owner removed that category
export function computedState(
    game: Game,
    now: Date,
    categories: Categories = DEFAULT_CATEGORIES,
    thresholds?: BacklogThresholds
): BacklogState {
    const state = classifyGame(game, now, thresholds);
    return hasCategory(categories, state) ? state : FALLBACK_STATE;
}

export interface StateOptions {
    overrides?: Overrides;
    categories?: Categories;
    thresholds?: BacklogThresholds;
}

// An owner's choice while its category exists, then the computed state
export function resolveState(
    game: Game,
    now: Date,
    override?: BacklogOverride,
    { categories = DEFAULT_CATEGORIES, thresholds }: Omit<StateOptions, 'overrides'> = {}
): CategoryId {
    if (override !== undefined && hasCategory(categories, override.state)) return override.state;
    return computedState(game, now, categories, thresholds);
}

// Every category of the account, at zero when empty
export function countByState(
    games: readonly Game[],
    now: Date,
    { overrides, categories = DEFAULT_CATEGORIES, thresholds }: StateOptions = {}
): CategoryCounts {
    const counts: Partial<Record<CategoryId, number>> = Object.fromEntries(
        categoryIds(categories).map((id) => [id, 0])
    );
    for (const game of games) {
        const state = resolveState(game, now, overrides?.[game.id.externalId], { categories, thresholds });
        counts[state] = (counts[state] ?? 0) + 1;
    }
    return counts;
}
