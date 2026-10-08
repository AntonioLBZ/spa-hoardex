import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Library, ProfileAccess } from '@core/domain';
import { libraryQuery, newerLibrary } from './queries';

function libraryAt(fetchedAt: string): ProfileAccess<Library> {
    return {
        kind: 'ok',
        data: {
            owner: { source: 'steam', externalId: '76561198000000001' },
            fetchedAt,
            games: [
                {
                    id: { source: 'steam', externalId: '620' },
                    name: 'Portal 2',
                    iconUrl: null,
                    hasVisibleStats: true,
                    playtime: { totalMinutes: 90, recentMinutes: 0, lastPlayedAt: null, platforms: null },
                },
            ],
        },
    };
}

describe('library cache', () => {
    it('keeps the games list when a refresh brings the same games, so the charts do not replay', () => {
        const client = new QueryClient();
        const { queryKey } = libraryQuery('someone');
        client.setQueryData(queryKey, libraryAt('2026-10-08T10:00:00.000Z'));
        const before = client.getQueryData(queryKey);

        client.setQueryData(queryKey, libraryAt('2026-10-08T10:10:00.000Z'));
        const after = client.getQueryData(queryKey);

        expect(after).not.toBe(before);
        expect(after?.kind === 'ok' && after.data.fetchedAt).toBe('2026-10-08T10:10:00.000Z');
        expect(after?.kind === 'ok' && before?.kind === 'ok' && after.data.games === before.data.games).toBe(true);
    });
});

describe('newerLibrary', () => {
    const OLDER = libraryAt('2026-10-08T10:00:00.000Z');
    const NEWER = libraryAt('2026-10-08T10:10:00.000Z');

    it('keeps the library it has when the one that arrives is older', () => {
        expect(newerLibrary(NEWER, OLDER)).toBe(NEWER);
    });

    it('takes the one that arrives when it is newer or as new', () => {
        expect(newerLibrary(OLDER, NEWER)).toBe(NEWER);
        expect(newerLibrary(NEWER, libraryAt(NEWER.kind === 'ok' ? NEWER.data.fetchedAt : ''))).not.toBe(NEWER);
    });

    it('always takes an answer that is not a library, and any answer when it has none', () => {
        const locked: ProfileAccess<Library> = { kind: 'libraryPrivate' };
        expect(newerLibrary(NEWER, locked)).toBe(locked);
        expect(newerLibrary(locked, OLDER)).toBe(OLDER);
        expect(newerLibrary(undefined, OLDER)).toBe(OLDER);
    });
});

describe('library query', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('does not let a stale CDN copy replace a library that a refresh already brought', async () => {
        const client = new QueryClient();
        const { queryKey } = libraryQuery('someone');
        client.setQueryData(queryKey, libraryAt('2026-10-08T10:10:00.000Z'));
        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.resolve(Response.json(libraryAt('2026-10-08T10:00:00.000Z'))))
        );

        const result = await client.fetchQuery(libraryQuery('someone'));

        expect(result.kind === 'ok' && result.data.fetchedAt).toBe('2026-10-08T10:10:00.000Z');
    });
});
