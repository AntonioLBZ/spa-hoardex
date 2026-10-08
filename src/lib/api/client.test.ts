import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, fetchDemoLibrary, fetchDemoProfile, fetchLibrary, fetchProfile, postRefresh } from './client';

function stubFetch(response: Response) {
    const fetchMock = vi.fn((_input: string, _init?: RequestInit) => Promise.resolve(response));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('API client', () => {
    it('returns an access state as data', async () => {
        stubFetch(Response.json({ kind: 'profilePrivate' }));
        expect(await fetchProfile('someone')).toEqual({ kind: 'profilePrivate' });
    });

    it('encodes the input as one path segment', async () => {
        const fetchMock = stubFetch(Response.json({ kind: 'notFound' }));
        await fetchProfile('a/b c');
        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/profile/a%2Fb%20c');
    });

    it('asks for the library by account id', async () => {
        const fetchMock = stubFetch(Response.json({ kind: 'notFound' }));
        await fetchLibrary('76561198000000001');
        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/library/76561198000000001');
    });

    it('reads the demo from its own endpoints', async () => {
        const fetchMock = vi.fn((_input: string) => Promise.resolve(Response.json({ kind: 'notFound' })));
        vi.stubGlobal('fetch', fetchMock);
        await fetchDemoProfile();
        await fetchDemoLibrary();

        expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['/api/demo/profile', '/api/demo/library']);
    });

    it('turns a non-200 answer into an ApiError carrying the code', async () => {
        stubFetch(Response.json({ error: 'upstream' }, { status: 502 }));
        const error = await fetchProfile('someone').catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({ status: 502, code: 'upstream' });
    });

    it('uses an unknown code when the error body is not JSON', async () => {
        stubFetch(new Response('<html>', { status: 500 }));
        await expect(fetchProfile('someone')).rejects.toMatchObject({ status: 500, code: 'unknown' });
    });

    it('rejects a 200 whose body is not an access state', async () => {
        stubFetch(Response.json({ hello: 'world' }));
        await expect(fetchProfile('someone')).rejects.toMatchObject({ code: 'badResponse' });
    });
});

describe('postRefresh', () => {
    const FRESH = {
        kind: 'refreshed',
        cooldownSeconds: 600,
        profile: { kind: 'ok', data: { displayName: 'Someone' } },
        library: { kind: 'ok', data: { games: [] } },
    };

    it('posts to the refresh endpoint with the input as one path segment', async () => {
        const fetchMock = stubFetch(Response.json(FRESH));
        await postRefresh('a/b c');
        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/refresh/a%2Fb%20c');
        expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
    });

    it('returns the fresh profile and library', async () => {
        stubFetch(Response.json(FRESH));
        expect(await postRefresh('someone')).toEqual(FRESH);
    });

    it.each([
        [429, 'cooldown', 'cooldown'],
        [503, 'rateLimited', 'rateLimited'],
    ] as const)('returns a %i as data, with the time to wait', async (status, error, kind) => {
        stubFetch(Response.json({ error, retryAfterSeconds: 412 }, { status }));
        expect(await postRefresh('someone')).toEqual({ kind, retryAfterSeconds: 412 });
    });

    it('throws when a 429 does not say when to come back', async () => {
        stubFetch(Response.json({ error: 'cooldown' }, { status: 429 }));
        await expect(postRefresh('someone')).rejects.toMatchObject({ status: 429, code: 'cooldown' });
    });

    it('turns any other failure into an ApiError carrying the code', async () => {
        stubFetch(Response.json({ error: 'upstream' }, { status: 502 }));
        const error = await postRefresh('someone').catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({ status: 502, code: 'upstream' });
    });

    it('rejects a 200 that is not a refresh', async () => {
        stubFetch(Response.json({ kind: 'ok', data: {} }));
        await expect(postRefresh('someone')).rejects.toMatchObject({ code: 'badResponse' });
    });
});
