import { SORTS, STATE_FILTERS, type Sort, type StateFilter } from '@core/browse';

// "Completed" needs achievements, which are not loaded yet
export const SHOWN_FILTERS: readonly StateFilter[] = STATE_FILTERS.filter((filter) => filter !== 'completed');

export const DEFAULT_SORT: Sort = 'hours';

const MAX_QUERY_LENGTH = 100;

// What the URL holds; an absent key means the default
export interface LibrarySearch {
    state?: StateFilter;
    sort?: Sort;
    // Trimmed, never empty
    q?: string;
}

// Anything that is not valid is dropped, so a hand-edited URL never breaks the page
export function parseLibrarySearch(raw: Record<string, unknown>): LibrarySearch {
    const state = SHOWN_FILTERS.find((filter) => filter === raw.state);
    const sort = SORTS.find((candidate) => candidate === raw.sort);
    // A numeric query such as "2077" arrives as a number
    const text = typeof raw.q === 'string' || typeof raw.q === 'number' ? String(raw.q).trim() : '';
    const q = text.slice(0, MAX_QUERY_LENGTH).trim();

    return {
        ...(state === undefined ? {} : { state }),
        ...(sort === undefined ? {} : { sort }),
        ...(q === '' ? {} : { q }),
    };
}

// The default sort and an empty query are left out of the URL
export function compactLibrarySearch(search: LibrarySearch): LibrarySearch {
    const { state, sort, q } = search;
    return parseLibrarySearch({ state, sort: sort === DEFAULT_SORT ? undefined : sort, q });
}
