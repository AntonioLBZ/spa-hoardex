import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpstreamError } from '../types.js';
import { createSteamClient } from './client.js';
import {
    TEST_KEY,
    collectDrift,
    createFakeFetch,
    fakeSteamId,
    fixtureReply,
    reply,
    type FakeHandler,
} from './test-utils.js';

const STEAMID = fakeSteamId(1);
const BODY_SENTINEL = 'SENSITIVE-BODY-TEXT';

function setup(handler: FakeHandler, options: { timeoutMs?: number } = {}) {
    const fake = createFakeFetch(handler);
    const drift = collectDrift();
    const client = createSteamClient({ apiKey: TEST_KEY, fetch: fake.fetch, onDrift: drift.onDrift, ...options });
    return { client, fake, drift };
}

function expectNoLeak(error: unknown) {
    expect(error).toBeInstanceOf(UpstreamError);
    const err = error as UpstreamError;
    const visible = [
        String(err),
        err.message,
        err.stack ?? '',
        JSON.stringify(err),
        JSON.stringify(Object.entries(err)),
    ];
    for (const text of visible) {
        expect(text).not.toContain(TEST_KEY);
        expect(text).not.toContain('steampowered');
        expect(text).not.toContain(BODY_SENTINEL);
        expect(text).not.toContain('key=');
    }
    expect('cause' in err).toBe(false);
}

async function failure(promise: Promise<unknown>): Promise<UpstreamError> {
    const error = await promise.then(
        () => {
            throw new Error('expected the call to reject');
        },
        (caught: unknown) => caught
    );
    expectNoLeak(error);
    return error as UpstreamError;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('URL building', () => {
    it('sends GetItems without the key, asking only for the assets of the given apps', async () => {
        const { client, fake } = setup(() => reply({ response: { store_items: [] } }));
        await client.getStoreItems(['620', '3527290']);
        const { url } = fake.calls[0]!;
        expect(url.host).toBe('api.steampowered.com');
        expect(url.pathname).toBe('/IStoreBrowseService/GetItems/v1/');
        expect([...url.searchParams.keys()]).toEqual(['input_json']);
        expect(JSON.parse(url.searchParams.get('input_json')!)).toEqual({
            ids: [{ appid: 620 }, { appid: 3527290 }],
            context: { language: 'english', country_code: 'US' },
            data_request: { include_assets: true },
        });
    });

    it('refuses an empty, oversized or malformed list of appids before any request', async () => {
        const { client, fake } = setup(() => reply({ response: {} }));
        await expect(client.getStoreItems([])).rejects.toThrow(RangeError);
        await expect(client.getStoreItems(Array.from({ length: 151 }, (_, i) => String(i)))).rejects.toThrow(
            RangeError
        );
        await expect(client.getStoreItems(['620', '1&key=x'])).rejects.toThrow(RangeError);
        expect(fake.calls).toHaveLength(0);
    });

    it('sends ResolveVanityURL to the allowlisted host with the key and the vanity only', async () => {
        const { client, fake } = setup(() => fixtureReply('ResolveVanityURL.found'));
        await client.resolveVanityUrl('some-vanity_1');
        expect(fake.calls).toHaveLength(1);
        const { url } = fake.calls[0]!;
        expect(url.protocol).toBe('https:');
        expect(url.host).toBe('api.steampowered.com');
        expect(url.pathname).toBe('/ISteamUser/ResolveVanityURL/v1/');
        expect(Object.fromEntries(url.searchParams)).toEqual({ key: TEST_KEY, vanityurl: 'some-vanity_1' });
    });

    it('sends GetPlayerSummaries with the key and one steamid', async () => {
        const { client, fake } = setup(() => fixtureReply('GetPlayerSummaries.public'));
        await client.getPlayerSummaries(STEAMID);
        const { url } = fake.calls[0]!;
        expect(url.host).toBe('api.steampowered.com');
        expect(url.pathname).toBe('/ISteamUser/GetPlayerSummaries/v2/');
        expect(Object.fromEntries(url.searchParams)).toEqual({ key: TEST_KEY, steamids: STEAMID });
    });

    it('sends GetOwnedGames with app info and played free games', async () => {
        const { client, fake } = setup(() => fixtureReply('GetOwnedGames.library'));
        await client.getOwnedGames(STEAMID);
        const { url } = fake.calls[0]!;
        expect(url.host).toBe('api.steampowered.com');
        expect(url.pathname).toBe('/IPlayerService/GetOwnedGames/v1/');
        expect(Object.fromEntries(url.searchParams)).toEqual({
            key: TEST_KEY,
            steamid: STEAMID,
            include_appinfo: '1',
            include_played_free_games: '1',
        });
    });

    it('puts the key only in the `key` query parameter', async () => {
        const { client, fake } = setup(() => fixtureReply('GetOwnedGames.library'));
        await client.getOwnedGames(STEAMID);
        const { url, init } = fake.calls[0]!;
        expect(url.username).toBe('');
        expect(url.password).toBe('');
        expect(url.port).toBe('');
        expect(url.hash).toBe('');
        expect(url.href.split(TEST_KEY)).toHaveLength(2);
        expect(url.searchParams.getAll('key')).toEqual([TEST_KEY]);
        expect(JSON.stringify(init?.headers)).not.toContain(TEST_KEY);
        expect(init?.body).toBeUndefined();
        expect(init?.method ?? 'GET').toBe('GET');
    });

    it('refuses redirects, which could take the key to another host', async () => {
        const { client, fake } = setup(() => fixtureReply('GetOwnedGames.library'));
        await client.getOwnedGames(STEAMID);
        expect(fake.calls[0]!.init?.redirect).toBe('error');
    });

    it('sends an abort signal that has not fired yet', async () => {
        const { client, fake } = setup(() => fixtureReply('GetOwnedGames.library'));
        await client.getOwnedGames(STEAMID);
        const signal = fake.calls[0]!.init?.signal;
        expect(signal).toBeInstanceOf(AbortSignal);
        expect(signal?.aborted).toBe(false);
    });

    it.each(['a&key=evil', 'a b', 'x', '../etc', 'a/b', '', 'a'.repeat(33), 'café'])(
        'rejects the vanity %j without calling Steam',
        async (vanity) => {
            const { client, fake } = setup(() => fixtureReply('ResolveVanityURL.found'));
            await expect(client.resolveVanityUrl(vanity)).rejects.toBeInstanceOf(RangeError);
            expect(fake.calls).toEqual([]);
        }
    );

    it.each(['', '123', `${STEAMID}&steamids=1`, `${STEAMID},${STEAMID}`, `${STEAMID}\n`, 'abc'])(
        'rejects the steamid %j without calling Steam',
        async (steamid) => {
            const { client, fake } = setup(() => fixtureReply('GetPlayerSummaries.public'));
            await expect(client.getPlayerSummaries(steamid)).rejects.toBeInstanceOf(RangeError);
            await expect(client.getOwnedGames(steamid)).rejects.toBeInstanceOf(RangeError);
            expect(fake.calls).toEqual([]);
        }
    );

    it('requires an API key', () => {
        expect(() => createSteamClient({ apiKey: '' })).toThrow(TypeError);
    });
});

describe('replies', () => {
    it('returns status, eresult, body and the validated data of a 200', async () => {
        const { client } = setup(() => fixtureReply('GetOwnedGames.library'));
        const result = await client.getOwnedGames(STEAMID);
        expect(result.status).toBe(200);
        expect(result.eresult).toBe('1');
        expect(result.rateLimited).toBe(false);
        expect(result.data).toEqual(result.body);
        expect(result.data?.response.games).toHaveLength(result.data?.response.game_count ?? -1);
    });

    it('reports a missing x-eresult header as null', async () => {
        const { client } = setup(() => fixtureReply('GetPlayerSummaries.public'));
        expect((await client.getPlayerSummaries(STEAMID)).eresult).toBeNull();
    });

    it('does not retry: one request per call', async () => {
        const { client, fake } = setup(() => fixtureReply('GetOwnedGames.rateLimited'));
        await client.getOwnedGames(STEAMID);
        expect(fake.calls).toHaveLength(1);
    });
});

describe('rate limits', () => {
    it('reports the documented 429 + x-eresult 84 as a signal, not an error', async () => {
        const { client } = setup(() => fixtureReply('GetOwnedGames.rateLimited'));
        const result = await client.getOwnedGames(STEAMID);
        expect(result).toMatchObject({ status: 429, eresult: '84', rateLimited: true });
    });

    it('reports a bare 429', async () => {
        const { client } = setup(() => reply('', { status: 429 }));
        expect(await client.getPlayerSummaries(STEAMID)).toMatchObject({ status: 429, rateLimited: true });
    });

    it('reports x-eresult 84 even on a 200', async () => {
        const { client } = setup(() => reply({ response: {} }, { eresult: '84' }));
        expect(await client.getOwnedGames(STEAMID)).toMatchObject({ status: 200, rateLimited: true });
    });

    it('is not rate limited with any other eresult', async () => {
        const { client } = setup(() => reply({ response: {} }, { eresult: '15' }));
        expect((await client.getOwnedGames(STEAMID)).rateLimited).toBe(false);
    });
});

describe('error replies that are not errors of the client', () => {
    it.each([401, 403, 400, 404])('hands a %s to the caller with the text body', async (status) => {
        const { client, drift } = setup(() => reply(`Forbidden ${BODY_SENTINEL}`, { status }));
        const result = await client.getOwnedGames(STEAMID);
        expect(result).toMatchObject({ status, rateLimited: false, body: `Forbidden ${BODY_SENTINEL}`, data: null });
        expect(drift.reports).toEqual([]);
    });

    it('does not validate the body of a non-200 reply', async () => {
        const { client, drift } = setup(() => reply({ unexpected: true }, { status: 403 }));
        const result = await client.getOwnedGames(STEAMID);
        expect(result).toMatchObject({ status: 403, body: { unexpected: true }, data: null });
        expect(drift.reports).toEqual([]);
    });
});

describe('failures raise UpstreamError without leaking', () => {
    it.each([500, 502, 503, 504])('HTTP %s', async (status) => {
        const { client } = setup(() => reply(`Internal ${BODY_SENTINEL}`, { status }));
        const error = await failure(client.getOwnedGames(STEAMID));
        expect(error.status).toBe(status);
        expect(error.message).toBe(`Steam answered HTTP ${status}`);
    });

    it('a 200 whose body is not JSON', async () => {
        const { client } = setup(() => reply(`<html>${BODY_SENTINEL}</html>`));
        const error = await failure(client.getPlayerSummaries(STEAMID));
        expect(error.status).toBe(200);
    });

    it('a 200 with an empty body', async () => {
        const { client } = setup(() => reply(''));
        await failure(client.getPlayerSummaries(STEAMID));
    });

    it('a network failure, even when the underlying error quotes the URL', async () => {
        const { client } = setup(({ url }) => {
            throw new TypeError(`fetch failed: ${url.href} ${BODY_SENTINEL}`);
        });
        const error = await failure(client.getOwnedGames(STEAMID));
        expect(error.message).toBe('Steam request failed');
        expect(error.status).toBeUndefined();
    });

    it('a failure while reading the body', async () => {
        const broken = {
            status: 200,
            headers: new Headers(),
            text: () => Promise.reject(new Error(`reset ${TEST_KEY} ${BODY_SENTINEL}`)),
        } as unknown as Response;
        const { client } = setup(() => broken);
        const error = await failure(client.getOwnedGames(STEAMID));
        expect(error.message).toBe('Steam request failed');
    });

    it('a timeout', async () => {
        const { client, fake } = setup(
            ({ init }) =>
                new Promise<Response>((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
                }),
            { timeoutMs: 20 }
        );
        const error = await failure(client.getOwnedGames(STEAMID));
        expect(error.message).toBe('Steam request timed out');
        expect(fake.calls).toHaveLength(1);
    });
});

describe('drift', () => {
    it('reports a 200 that does not conform once, with paths and codes only', async () => {
        const { client, drift } = setup(() => reply({ response: { players: BODY_SENTINEL } }));
        const result = await client.getPlayerSummaries(STEAMID);
        expect(result.data).toBeNull();
        expect(drift.reports).toEqual([
            { endpoint: 'ISteamUser/GetPlayerSummaries/v2', issues: ['response.players: invalid_type'] },
        ]);
        expect(JSON.stringify(drift.reports)).not.toContain(BODY_SENTINEL);
        expect(JSON.stringify(drift.reports)).not.toContain(TEST_KEY);
    });

    it('reports a JSON 200 that is not an object', async () => {
        const { client, drift } = setup(() => reply('[1,2]'));
        const result = await client.getOwnedGames(STEAMID);
        expect(result.data).toBeNull();
        expect(drift.reports).toEqual([
            { endpoint: 'IPlayerService/GetOwnedGames/v1', issues: ['(root): invalid_type'] },
        ]);
    });

    it('ignores unknown extra fields silently', async () => {
        const body = { response: { game_count: 0, brand_new: { nested: [1] } }, extra: true };
        const { client, drift } = setup(() => reply(body));
        const result = await client.getOwnedGames(STEAMID);
        expect(result.data).toEqual(body);
        expect(drift.reports).toEqual([]);
    });

    it('warns through console.warn by default, without values or the key', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const fake = createFakeFetch(() => reply({ response: { players: BODY_SENTINEL } }));
        const client = createSteamClient({ apiKey: TEST_KEY, fetch: fake.fetch });
        await client.getPlayerSummaries(STEAMID);
        expect(warn).toHaveBeenCalledTimes(1);
        const line = String(warn.mock.calls[0]?.[0]);
        expect(line).toContain('ISteamUser/GetPlayerSummaries/v2');
        expect(line).toContain('response.players: invalid_type');
        expect(line).not.toContain(BODY_SENTINEL);
        expect(line).not.toContain(TEST_KEY);
    });
});
