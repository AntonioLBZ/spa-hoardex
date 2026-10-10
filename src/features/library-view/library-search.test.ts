import { describe, expect, it } from 'vitest';

import { compactLibrarySearch, directionOf, parseLibrarySearch } from './library-search';

describe('parseLibrarySearch', () => {
    it('keeps valid values', () => {
        expect(parseLibrarySearch({ state: 'paused', sort: 'name', q: 'portal' })).toEqual({
            state: 'paused',
            sort: 'name',
            q: 'portal',
        });
    });

    it('returns an empty search when nothing is given', () => {
        expect(parseLibrarySearch({})).toEqual({});
    });

    it('drops anything that is not valid', () => {
        expect(parseLibrarySearch({ state: 'nope', sort: 'sideways', q: { deep: true } })).toEqual({});
        expect(parseLibrarySearch({ state: ['paused'], sort: 7, q: null })).toEqual({});
    });

    it('accepts the states only a manual choice gives', () => {
        expect(parseLibrarySearch({ state: 'abandoned' })).toEqual({ state: 'abandoned' });
    });

    it('reads the retired completed state as finished', () => {
        expect(parseLibrarySearch({ state: 'completed' })).toEqual({ state: 'finished' });
    });

    it('trims the query, drops it when blank and caps its length', () => {
        expect(parseLibrarySearch({ q: '  hollow  ' })).toEqual({ q: 'hollow' });
        expect(parseLibrarySearch({ q: '   ' })).toEqual({});
        expect(parseLibrarySearch({ q: 'x'.repeat(500) }).q).toHaveLength(100);
    });

    it('turns a numeric query back into text', () => {
        expect(parseLibrarySearch({ q: 2077 })).toEqual({ q: '2077' });
    });
});

describe('compactLibrarySearch', () => {
    it('leaves the default sort and an empty query out', () => {
        expect(compactLibrarySearch({ sort: 'hours', q: '  ', state: 'backlog' })).toEqual({ state: 'backlog' });
    });

    it('keeps a non-default sort', () => {
        expect(compactLibrarySearch({ sort: 'recent' })).toEqual({ sort: 'recent' });
    });
});

describe('the sort direction', () => {
    it('is kept only when it reverses the sort', () => {
        expect(parseLibrarySearch({ dir: 'asc' })).toEqual({ dir: 'asc' });
        expect(parseLibrarySearch({ dir: 'desc' })).toEqual({});
        expect(parseLibrarySearch({ sort: 'name', dir: 'desc' })).toEqual({ sort: 'name', dir: 'desc' });
        expect(parseLibrarySearch({ sort: 'name', dir: 'asc' })).toEqual({ sort: 'name' });
        expect(parseLibrarySearch({ dir: 'up' })).toEqual({});
    });

    it('falls back to the natural direction of the sort', () => {
        expect(directionOf({})).toBe('desc');
        expect(directionOf({ sort: 'name' })).toBe('asc');
        expect(directionOf({ sort: 'recent', dir: 'asc' })).toBe('asc');
    });
});

describe('the board view', () => {
    it('is kept in the URL, and the grid is left out as the default', () => {
        expect(parseLibrarySearch({ view: 'board' })).toEqual({ view: 'board' });
        expect(parseLibrarySearch({ view: 'grid' })).toEqual({});
        expect(parseLibrarySearch({ view: 'list' })).toEqual({});
    });
});
