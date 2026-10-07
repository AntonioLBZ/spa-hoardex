import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, fetchLibrary, fetchProfile } from './client';

function stubFetch(response: Response) {
    const fetchMock = vi.fn((_input: string) => Promise.resolve(response));
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
