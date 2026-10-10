import { FALLBACK_STATE, isCategoryId, upgradeState, type CategoryId } from '@core/backlog';
import { DIRECTIONS, NATURAL_DIRECTION, SORTS, type Direction, type Sort } from '@core/browse';

export const DEFAULT_SORT: Sort = 'hours';

const MAX_QUERY_LENGTH = 100;

// What the URL holds; an absent key means the default
export interface LibrarySearch {
    // Any well-formed id: one the account does not have filters nothing
    state?: CategoryId;
    sort?: Sort;
    // Only when it differs from the sort's natural direction
    dir?: Direction;
    // Trimmed, never empty
    q?: string;
}

// The old "backlog" filter (untouched plus tried) is the Backlog category now
function stateOf(raw: unknown): CategoryId | undefined {
    const state = raw === 'backlog' ? FALLBACK_STATE : upgradeState(raw);
    return isCategoryId(state) ? state : undefined;
}

// Anything that is not valid is dropped (the retired board view too), so a hand-edited URL never breaks the page
export function parseLibrarySearch(raw: Record<string, unknown>): LibrarySearch {
    const state = stateOf(raw.state);
    const sort = SORTS.find((candidate) => candidate === raw.sort);
    const dir = DIRECTIONS.find((candidate) => candidate === raw.dir);
    // A numeric query such as "2077" arrives as a number
    const text = typeof raw.q === 'string' || typeof raw.q === 'number' ? String(raw.q).trim() : '';
    const q = text.slice(0, MAX_QUERY_LENGTH).trim();

    return {
        ...(state === undefined ? {} : { state }),
        ...(sort === undefined ? {} : { sort }),
        ...(dir === undefined || dir === NATURAL_DIRECTION[sort ?? DEFAULT_SORT] ? {} : { dir }),
        ...(q === '' ? {} : { q }),
    };
}

// The default sort and an empty query are left out of the URL
export function compactLibrarySearch(search: LibrarySearch): LibrarySearch {
    const { state, sort, dir, q } = search;
    return parseLibrarySearch({ state, sort: sort === DEFAULT_SORT ? undefined : sort, dir, q });
}

export function directionOf(search: LibrarySearch): Direction {
    return search.dir ?? NATURAL_DIRECTION[search.sort ?? DEFAULT_SORT];
}
