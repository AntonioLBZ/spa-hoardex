import { describe, expect, it } from 'vitest';

import { compactLibrarySearch, parseLibrarySearch } from './library-search';

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

    it('does not offer the completed state before achievements exist', () => {
        expect(parseLibrarySearch({ state: 'completed' })).toEqual({});
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
