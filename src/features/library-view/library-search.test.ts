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

    it('reads the old backlog filter as the Backlog category', () => {
        expect(parseLibrarySearch({ state: 'backlog' })).toEqual({ state: 'untouched' });
    });

    it('keeps an owner’s own category by its shape', () => {
        expect(parseLibrarySearch({ state: 'c-0a1b2c3d' })).toEqual({ state: 'c-0a1b2c3d' });
        expect(parseLibrarySearch({ state: 'c-nothex00' })).toEqual({});
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
        expect(compactLibrarySearch({ sort: 'hours', q: '  ', state: 'tried' })).toEqual({ state: 'tried' });
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

describe('the retired board view', () => {
    it('is dropped from the URL', () => {
        expect(parseLibrarySearch({ view: 'board', state: 'paused' })).toEqual({ state: 'paused' });
    });
});
