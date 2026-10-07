import { describe, expect, it } from 'vitest';
import { collectResponses, countUnsafeIntegers, fileNames, parseBody, slug, sortKeys } from './postman.js';

describe('slug', () => {
    it('keeps ASCII words and underscores, drops accents and punctuation', () => {
        expect(slug('Juego / Store')).toBe('Juego-Store');
        expect(slug('GetOwnedGames (appids_filter)')).toBe('GetOwnedGames-appids_filter');
        expect(slug('Búsqueda')).toBe('Busqueda');
    });
});

describe('parseBody', () => {
    it('parses JSON and keeps empty or non-JSON bodies as strings', () => {
        expect(parseBody('{"a":1}')).toEqual({ a: 1 });
        expect(parseBody('')).toBe('');
        expect(parseBody('<html>nope</html>')).toBe('<html>nope</html>');
        expect(parseBody(undefined)).toBeNull();
    });
});

describe('collectResponses', () => {
    const collection = [
        {
            name: 'Folder',
            item: [
                { name: 'Inner', item: [{ name: 'Deep', response: [{ code: 200, body: '{"z":1}' }] }] },
                { name: 'Req', response: [{ code: 401, body: '' }, { code: 401, body: 'x' }, 'junk'] },
            ],
        },
        { name: 'Top', response: [{ code: 200, body: '[]' }] },
        { name: 'NoResponses' },
    ];

    it('walks folders recursively and tolerates odd entries', () => {
        expect(collectResponses(collection)).toEqual([
            { path: ['Folder', 'Inner', 'Deep'], code: 200, body: { z: 1 } },
            { path: ['Folder', 'Req'], code: 401, body: '' },
            { path: ['Folder', 'Req'], code: 401, body: 'x' },
            { path: ['Top'], code: 200, body: [] },
        ]);
        expect(collectResponses(undefined)).toEqual([]);
    });

    it('names files by folder, request and code, without collisions', () => {
        expect(fileNames(collectResponses(collection))).toEqual([
            'Folder-Inner-Deep.200.json',
            'Folder-Req.401.json',
            'Folder-Req-2.401.json',
            'Top.200.json',
        ]);
    });
});

describe('sortKeys', () => {
    it('sorts keys at every depth and keeps array order', () => {
        const sorted = sortKeys({ b: 1, a: [{ d: 1, c: 2 }, 3], c: { z: 1, y: 2 } });
        expect(JSON.stringify(sorted)).toBe('{"a":[{"c":2,"d":1},3],"b":1,"c":{"y":2,"z":1}}');
    });
});

describe('countUnsafeIntegers', () => {
    it('flags integers that JSON.parse had to round', () => {
        expect(countUnsafeIntegers(JSON.parse('{"a":[9007199254740993],"b":1.5,"c":2}'))).toBe(1);
        expect(countUnsafeIntegers({ a: [1, { b: 2 }] })).toBe(0);
    });
});
