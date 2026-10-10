import { describe, expect, it } from 'vitest';
import { FIXTURE_NOW, loadFixture } from '../../../fixtures/load.js';
import { countByState } from '../../backlog/index.js';
import { UpstreamError, type StoreAdapter } from '../types.js';
import { createSteamAdapter, type SteamAdapterOptions } from './index.js';
import { TEST_KEY, collectDrift, createFakeFetch, fakeSteamId, reply, routes } from './test-utils.js';

interface RawLibraryFixture {
    response: { game_count: number; games: Record<string, unknown>[] };
}

const VANITY_FIXTURE_ID = (loadFixture('ResolveVanityURL.found').body as { response: { steamid: string } }).response
    .steamid;
const SUMMARY_FIXTURE_ID = (
    loadFixture('GetPlayerSummaries.public').body as { response: { players: { steamid: string }[] } }
).response.players[0]!.steamid;
const LIBRARY_FIXTURE = (loadFixture('GetOwnedGames.library').body as RawLibraryFixture).response;

type Table = Parameters<typeof routes>[0];

function setup(table: Table, options: Partial<SteamAdapterOptions> = {}) {
    const fake = createFakeFetch(routes(table));
    const drift = collectDrift();
    const adapter: StoreAdapter = createSteamAdapter({
        apiKey: TEST_KEY,
        fetch: fake.fetch,
        onDrift: drift.onDrift,
        now: () => FIXTURE_NOW,
        ...options,
    });
    const paths = () => fake.calls.map(({ url }) => url.pathname);
    return { adapter, fake, drift, paths };
}

const steam = (externalId: string) => ({ source: 'steam' as const, externalId });

async function rejection(promise: Promise<unknown>): Promise<UpstreamError> {
    const error = await promise.then(
        () => {
            throw new Error('expected the call to reject');
        },
        (caught: unknown) => caught
    );
    expect(error).toBeInstanceOf(UpstreamError);
    expect(String(error)).not.toContain(TEST_KEY);
    return error as UpstreamError;
}

describe('adapter shape', () => {
    it('is the steam adapter with no achievements or wishlist yet', () => {
        const { adapter } = setup({});
        expect(adapter.source).toBe('steam');
        expect(adapter.capabilities).toEqual({ achievements: 'none', wishlist: false });
    });
});

describe('parseInput', () => {
    it('turns ids, SteamID3 and profile URLs into an id without calling Steam', () => {
        const { adapter, fake } = setup({});
        const id = { source: 'steam', externalId: SUMMARY_FIXTURE_ID };
        expect(adapter.parseInput(` ${SUMMARY_FIXTURE_ID} `)).toEqual({ kind: 'id', id });
        expect(adapter.parseInput(`https://steamcommunity.com/profiles/${SUMMARY_FIXTURE_ID}/games`)).toEqual({
            kind: 'id',
            id,
        });
        expect(fake.calls).toEqual([]);
    });

    it('lower-cases vanity names so one account has one alias', () => {
        const { adapter } = setup({});
        expect(adapter.parseInput('Some_Name')).toEqual({ kind: 'alias', alias: 'some_name' });
        expect(adapter.parseInput('https://steamcommunity.com/id/Some_Name/')).toEqual({
            kind: 'alias',
            alias: 'some_name',
        });
    });

    it.each(['', 'a', 'bad name', 'https://evil.example/id/someone'])('flags %j as invalid', (input) => {
        expect(setup({}).adapter.parseInput(input)).toEqual({ kind: 'invalid' });
    });
});

describe('resolveProfile', () => {
    it.each(['', '   ', 'a', 'bad name', '!!!', 'https://evil.example/id/someone', 'STEAM_9:0:1'])(
        'answers notFound for the input %j without calling Steam',
        async (input) => {
            const { adapter, fake } = setup({});
            expect(await adapter.resolveProfile(input)).toEqual({ kind: 'notFound' });
            expect(fake.calls).toEqual([]);
        }
    );

    it('looks a SteamID64 up with one GetPlayerSummaries call', async () => {
        const { adapter, fake, drift } = setup({ summaries: 'GetPlayerSummaries.public' });
        const result = await adapter.resolveProfile(` ${SUMMARY_FIXTURE_ID} `);
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') return;
        expect(result.data).toEqual({
            id: { source: 'steam', externalId: SUMMARY_FIXTURE_ID },
            displayName: 'Player 0001',
            avatarUrl: 'https://example.invalid/avatar.jpg',
            profileUrl: `https://steamcommunity.com/profiles/${SUMMARY_FIXTURE_ID}/`,
            visibility: 'public',
            createdAt: '2014-05-13T16:53:20.000Z',
        });
        expect(fake.calls).toHaveLength(1);
        expect(fake.calls[0]!.url.searchParams.get('steamids')).toBe(SUMMARY_FIXTURE_ID);
        expect(drift.reports).toEqual([]);
    });

    it.each(['some-vanity', 'https://steamcommunity.com/id/some-vanity/'])(
        'resolves the vanity input %j and then loads the profile of the resolved id',
        async (input) => {
            const { adapter, fake, paths } = setup({
                vanity: 'ResolveVanityURL.found',
                summaries: 'GetPlayerSummaries.public',
            });
            const result = await adapter.resolveProfile(input);
            expect(result).toMatchObject({ kind: 'ok', data: { id: { source: 'steam' } } });
            expect(paths()).toEqual(['/ISteamUser/ResolveVanityURL/v1/', '/ISteamUser/GetPlayerSummaries/v2/']);
            expect(fake.calls[0]!.url.searchParams.get('vanityurl')).toBe('some-vanity');
            expect(fake.calls[1]!.url.searchParams.get('steamids')).toBe(VANITY_FIXTURE_ID);
        }
    );

    it('answers notFound for a vanity that does not exist (success 42)', async () => {
        const { adapter, paths } = setup({ vanity: 'ResolveVanityURL.notFound' });
        expect(await adapter.resolveProfile('nobody-here')).toEqual({ kind: 'notFound' });
        expect(paths()).toEqual(['/ISteamUser/ResolveVanityURL/v1/']);
    });

    it.each([
        ['an empty response', {}],
        ['no success', { steamid: fakeSteamId(1) }],
        ['success 1 without an id', { success: 1 }],
        ['an unknown success code', { success: 7, steamid: fakeSteamId(1) }],
        ['a success that is not a number', { success: 'yes', steamid: fakeSteamId(1) }],
    ])('answers notFound for a vanity reply with %s', async (_label, response) => {
        const { adapter } = setup({ vanity: () => reply({ response }) });
        expect(await adapter.resolveProfile('some-vanity')).toEqual({ kind: 'notFound' });
    });

    it('treats a "found" vanity with an unusable id as an upstream failure', async () => {
        const { adapter } = setup({ vanity: () => reply({ response: { success: 1, steamid: 'not-an-id' } }) });
        await rejection(adapter.resolveProfile('some-vanity'));
    });

    it('answers notFound when Steam knows no such player', async () => {
        const { adapter } = setup({ summaries: 'GetPlayerSummaries.empty' });
        expect(await adapter.resolveProfile(SUMMARY_FIXTURE_ID)).toEqual({ kind: 'notFound' });
    });

    it('answers notFound when the player list holds a different account', async () => {
        const { adapter } = setup({ summaries: 'GetPlayerSummaries.public' });
        expect(await adapter.resolveProfile(fakeSteamId(4242))).toEqual({ kind: 'notFound' });
    });

    it('answers notFound when the player list is missing', async () => {
        const { adapter } = setup({ summaries: () => reply({ response: {} }) });
        expect(await adapter.resolveProfile(SUMMARY_FIXTURE_ID)).toEqual({ kind: 'notFound' });
    });

    it.each([
        ['GetPlayerSummaries.friends', 'friends'],
        ['GetPlayerSummaries.private', 'private'],
    ])('returns ok for the %s profile: visibility is data, not an access state', async (fixture, visibility) => {
        const { adapter } = setup({ summaries: fixture });
        const result = await adapter.resolveProfile(SUMMARY_FIXTURE_ID);
        expect(result).toMatchObject({
            kind: 'ok',
            data: { visibility, displayName: 'Player 0001', avatarUrl: 'https://example.invalid/avatar.jpg' },
        });
    });

    it('answers rateLimited when the vanity lookup is limited, and stops there', async () => {
        const { adapter, paths } = setup({ vanity: 'GetOwnedGames.rateLimited' });
        expect(await adapter.resolveProfile('some-vanity')).toEqual({ kind: 'rateLimited' });
        expect(paths()).toEqual(['/ISteamUser/ResolveVanityURL/v1/']);
    });

    it('answers rateLimited when the profile lookup is limited', async () => {
        const { adapter } = setup({ summaries: 'GetOwnedGames.rateLimited' });
        expect(await adapter.resolveProfile(SUMMARY_FIXTURE_ID)).toEqual({ kind: 'rateLimited' });
    });

    it.each([401, 403])('raises UpstreamError for a %s (bad key), not an access state', async (status) => {
        const { adapter } = setup({ summaries: () => reply('Forbidden', { status }) });
        const error = await rejection(adapter.resolveProfile(SUMMARY_FIXTURE_ID));
        expect(error.status).toBe(status);
        expect(error.message).toBe('Steam rejected the API key');
    });

    it('raises UpstreamError for a 500', async () => {
        const { adapter } = setup({ vanity: () => reply('oops', { status: 500 }) });
        expect((await rejection(adapter.resolveProfile('some-vanity'))).status).toBe(500);
    });

    it('raises UpstreamError and reports drift when the player list is malformed', async () => {
        const { adapter, drift } = setup({ summaries: () => reply({ response: { players: [{ personaname: 'x' }] } }) });
        await rejection(adapter.resolveProfile(SUMMARY_FIXTURE_ID));
        expect(drift.reports).toEqual([
            { endpoint: 'ISteamUser/GetPlayerSummaries/v2', issues: ['response.players.0.steamid: invalid_type'] },
        ]);
    });
});

describe('resolveAlias', () => {
    it('turns a vanity into an account id with one call and no profile lookup', async () => {
        const { adapter, fake, paths } = setup({ vanity: 'ResolveVanityURL.found' });
        expect(await adapter.resolveAlias('some-vanity')).toEqual({ kind: 'ok', data: steam(VANITY_FIXTURE_ID) });
        expect(paths()).toEqual(['/ISteamUser/ResolveVanityURL/v1/']);
        expect(fake.calls[0]!.url.searchParams.get('vanityurl')).toBe('some-vanity');
    });

    it('answers notFound for a vanity that does not exist', async () => {
        const { adapter } = setup({ vanity: 'ResolveVanityURL.notFound' });
        expect(await adapter.resolveAlias('nobody-here')).toEqual({ kind: 'notFound' });
    });

    it('answers rateLimited when the lookup is limited', async () => {
        const { adapter } = setup({ vanity: 'GetOwnedGames.rateLimited' });
        expect(await adapter.resolveAlias('some-vanity')).toEqual({ kind: 'rateLimited' });
    });

    it('treats a "found" vanity with an unusable id as an upstream failure', async () => {
        const { adapter } = setup({ vanity: () => reply({ response: { success: 1, steamid: 'not-an-id' } }) });
        await rejection(adapter.resolveAlias('some-vanity'));
    });
});

describe('getLibrary', () => {
    const owner = steam(SUMMARY_FIXTURE_ID);

    it('returns the library of a public profile with one GetOwnedGames call', async () => {
        const { adapter, fake, drift } = setup({ ownedGames: 'GetOwnedGames.library' });
        const result = await adapter.getLibrary(owner);
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') return;
        expect(result.data.owner).toEqual(owner);
        expect(result.data.fetchedAt).toBe(FIXTURE_NOW.toISOString());
        expect(result.data.games).toHaveLength(LIBRARY_FIXTURE.game_count);
        expect(result.data.games.map((game) => game.id.externalId)).toEqual(
            LIBRARY_FIXTURE.games.map((game) => String(game.appid))
        );
        expect(fake.calls).toHaveLength(1);
        expect(fake.calls[0]!.url.searchParams.get('steamid')).toBe(SUMMARY_FIXTURE_ID);
        expect(drift.reports).toEqual([]);
    });

    it('returns an empty library for game_count 0', async () => {
        const { adapter, paths } = setup({ ownedGames: 'GetOwnedGames.empty' });
        expect(await adapter.getLibrary(owner)).toEqual({
            kind: 'ok',
            data: { owner, games: [], fetchedAt: FIXTURE_NOW.toISOString() },
        });
        expect(paths()).toEqual(['/IPlayerService/GetOwnedGames/v1/']);
    });

    it('returns an empty library for game_count 0 with an empty games list', async () => {
        const { adapter } = setup({ ownedGames: () => reply({ response: { game_count: 0, games: [] } }) });
        expect(await adapter.getLibrary(owner)).toMatchObject({ kind: 'ok', data: { games: [] } });
    });

    it('trusts the games it receives over a game_count that disagrees', async () => {
        const body = { response: { game_count: 99, games: [{ appid: 7, name: 'Only One' }] } };
        const { adapter } = setup({ ownedGames: () => reply(body) });
        const result = await adapter.getLibrary(owner);
        expect(result).toMatchObject({ kind: 'ok', data: { games: [{ name: 'Only One' }] } });
    });

    it('stamps fetchedAt from the real clock when none is injected', async () => {
        const { adapter } = setup({ ownedGames: 'GetOwnedGames.empty' }, { now: undefined });
        const before = Date.now();
        const result = await adapter.getLibrary(owner);
        const after = Date.now();
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') return;
        const fetchedAt = Date.parse(result.data.fetchedAt);
        expect(fetchedAt).toBeGreaterThanOrEqual(before);
        expect(fetchedAt).toBeLessThanOrEqual(after);
    });

    describe('empty response (private)', () => {
        it('is libraryPrivate when the profile is public: "game details" are private', async () => {
            const { adapter, fake, paths } = setup({
                ownedGames: 'GetOwnedGames.private',
                summaries: 'GetPlayerSummaries.public',
            });
            expect(await adapter.getLibrary(owner)).toEqual({ kind: 'libraryPrivate' });
            expect(paths()).toEqual(['/IPlayerService/GetOwnedGames/v1/', '/ISteamUser/GetPlayerSummaries/v2/']);
            expect(fake.calls[1]!.url.searchParams.get('steamids')).toBe(SUMMARY_FIXTURE_ID);
        });

        it.each(['GetPlayerSummaries.friends', 'GetPlayerSummaries.private'])(
            'is profilePrivate when the profile is not public (%s)',
            async (summaries) => {
                const { adapter } = setup({ ownedGames: 'GetOwnedGames.private', summaries });
                expect(await adapter.getLibrary(owner)).toEqual({ kind: 'profilePrivate' });
            }
        );

        it('is profilePrivate when the visibility is unknown (conservative)', async () => {
            const player = { steamid: SUMMARY_FIXTURE_ID, communityvisibilitystate: 9, personaname: 'x' };
            const { adapter } = setup({
                ownedGames: 'GetOwnedGames.private',
                summaries: () => reply({ response: { players: [player] } }),
            });
            expect(await adapter.getLibrary(owner)).toEqual({ kind: 'profilePrivate' });
        });

        it('is notFound when the account does not exist', async () => {
            const { adapter } = setup({
                ownedGames: 'GetOwnedGames.private',
                summaries: 'GetPlayerSummaries.empty',
            });
            expect(await adapter.getLibrary(owner)).toEqual({ kind: 'notFound' });
        });

        it('is rateLimited when the follow-up lookup is limited', async () => {
            const { adapter } = setup({
                ownedGames: 'GetOwnedGames.private',
                summaries: 'GetOwnedGames.rateLimited',
            });
            expect(await adapter.getLibrary(owner)).toEqual({ kind: 'rateLimited' });
        });

        it('is decided by the body, not by x-eresult (inferred fixture): same answer without the header', async () => {
            const { adapter } = setup({
                ownedGames: () => reply({ response: {} }),
                summaries: 'GetPlayerSummaries.public',
            });
            expect(await adapter.getLibrary(owner)).toEqual({ kind: 'libraryPrivate' });
        });

        it('lets an upstream failure of the follow-up lookup through as UpstreamError', async () => {
            const { adapter } = setup({
                ownedGames: 'GetOwnedGames.private',
                summaries: () => reply('oops', { status: 502 }),
            });
            expect((await rejection(adapter.getLibrary(owner))).status).toBe(502);
        });
    });

    describe('rate limits and failures', () => {
        it('answers rateLimited for 429 + x-eresult 84 without a follow-up call', async () => {
            const { adapter, paths } = setup({ ownedGames: 'GetOwnedGames.rateLimited' });
            expect(await adapter.getLibrary(owner)).toEqual({ kind: 'rateLimited' });
            expect(paths()).toEqual(['/IPlayerService/GetOwnedGames/v1/']);
        });

        it('answers rateLimited for x-eresult 84 on its own', async () => {
            const { adapter } = setup({ ownedGames: () => reply({ response: {} }, { eresult: '84' }) });
            expect(await adapter.getLibrary(owner)).toEqual({ kind: 'rateLimited' });
        });

        it.each([401, 403])('raises UpstreamError for a %s: a bad key, not a private library', async (status) => {
            const { adapter } = setup({ ownedGames: () => reply({ response: {} }, { status }) });
            const error = await rejection(adapter.getLibrary(owner));
            expect(error.status).toBe(status);
            expect(error.message).toBe('Steam rejected the API key');
        });

        it.each([500, 503])('raises UpstreamError for a %s', async (status) => {
            const { adapter } = setup({ ownedGames: () => reply('down', { status }) });
            expect((await rejection(adapter.getLibrary(owner))).status).toBe(status);
        });

        it('raises UpstreamError for a 200 that is not JSON', async () => {
            const { adapter } = setup({ ownedGames: () => reply('<html></html>') });
            await rejection(adapter.getLibrary(owner));
        });

        it('raises UpstreamError for any other unexpected status', async () => {
            const { adapter } = setup({ ownedGames: () => reply({ response: {} }, { status: 404 }) });
            expect((await rejection(adapter.getLibrary(owner))).status).toBe(404);
        });

        it('raises UpstreamError and reports drift for a count without a list', async () => {
            const { adapter, drift } = setup({ ownedGames: () => reply({ response: { game_count: 5 } }) });
            await rejection(adapter.getLibrary(owner));
            expect(drift.reports).toEqual([
                { endpoint: 'IPlayerService/GetOwnedGames/v1', issues: ['response.games: missing'] },
            ]);
        });

        it('raises UpstreamError and reports drift for a body that is not the envelope', async () => {
            const { adapter, drift } = setup({ ownedGames: () => reply({ games: [] }) });
            await rejection(adapter.getLibrary(owner));
            expect(drift.reports).toEqual([
                { endpoint: 'IPlayerService/GetOwnedGames/v1', issues: ['response: invalid_type'] },
            ]);
        });
    });

    describe('drift', () => {
        const sentinel = 'SENTINEL-VALUE';

        it('skips a malformed game and reports it once, with no values', async () => {
            const body = {
                response: {
                    game_count: 3,
                    games: [
                        { appid: 1, name: 'Good', playtime_forever: 5 },
                        { appid: sentinel, name: sentinel },
                        { appid: 3, name: 'Also Good' },
                    ],
                },
            };
            const { adapter, drift } = setup({ ownedGames: () => reply(body) });
            const result = await adapter.getLibrary(owner);
            expect(result).toMatchObject({ kind: 'ok', data: { games: [{ name: 'Good' }, { name: 'Also Good' }] } });
            expect(drift.reports).toEqual([
                { endpoint: 'IPlayerService/GetOwnedGames/v1', issues: ['games.1.appid: invalid_type'] },
            ]);
            expect(JSON.stringify(drift.reports)).not.toContain(sentinel);
            expect(JSON.stringify(drift.reports)).not.toContain(TEST_KEY);
        });

        it('ignores unknown extra fields silently', async () => {
            const body = {
                response: {
                    game_count: 1,
                    games: [{ appid: 1, future_flag: true, content_descriptorids: [3] }],
                    extra: 1,
                },
                top_level_extra: [],
            };
            const { adapter, drift } = setup({ ownedGames: () => reply(body) });
            expect(await adapter.getLibrary(owner)).toMatchObject({ kind: 'ok' });
            expect(drift.reports).toEqual([]);
        });
    });

    it.each([
        ['an id that is not a SteamID64', steam('12345')],
        ['an id with extra parameters', steam(`${SUMMARY_FIXTURE_ID}&steamid=1`)],
        ['another source', { source: 'gog', externalId: SUMMARY_FIXTURE_ID } as never],
    ])('answers notFound for %s without calling Steam', async (_label, profile) => {
        const { adapter, fake } = setup({});
        expect(await adapter.getLibrary(profile)).toEqual({ kind: 'notFound' });
        expect(fake.calls).toEqual([]);
    });
});

describe('integration with the backlog classifier', () => {
    const SECONDS_PER_DAY = 86_400;
    const nowSeconds = FIXTURE_NOW.getTime() / 1000;

    function expectedCounts(games: Record<string, unknown>[]) {
        const counts = { untouched: 0, tried: 0, inProgress: 0, paused: 0, finished: 0, abandoned: 0 };
        for (const game of games) {
            const minutes = game.playtime_forever as number;
            const age = (nowSeconds - (game.rtime_last_played as number)) / SECONDS_PER_DAY;
            if (minutes === 0) counts.untouched += 1;
            else if (minutes < 60) counts.tried += 1;
            else if (age <= 90) counts.inProgress += 1;
            else if (age <= 365) counts.paused += 1;
            else counts.finished += 1;
        }
        return counts;
    }

    it('classifies the fixture library into the counts its branch design implies', async () => {
        const { adapter } = setup({ ownedGames: 'GetOwnedGames.library' });
        const result = await adapter.getLibrary(steam(SUMMARY_FIXTURE_ID));
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') return;

        const counts = countByState(result.data.games, FIXTURE_NOW);
        expect(counts).toEqual(expectedCounts(LIBRARY_FIXTURE.games));
        expect(Object.values(counts).reduce<number>((total, count) => total + (count ?? 0), 0)).toBe(
            LIBRARY_FIXTURE.game_count
        );
        for (const state of ['untouched', 'tried', 'inProgress', 'paused', 'finished'] as const) {
            expect(counts[state]).toBeGreaterThan(0);
        }
    });
});

describe('getArt', () => {
    const FORMAT = (appid: string) => `steam/apps/${appid}/\${FILENAME}?t=1790591892`;
    const BASE = 'https://shared.steamstatic.com/store_item_assets/steam/apps';
    const HASH = '480bd879ac737921bfa2529a6fea15961267ad21';

    it('maps each listed app to its cover and header, and leaves out apps the store does not list', async () => {
        const { adapter, drift } = setup({
            storeItems: () =>
                reply({
                    response: {
                        store_items: [
                            {
                                appid: 3527290,
                                assets: {
                                    asset_url_format: FORMAT('3527290'),
                                    library_capsule: `${HASH}/library_600x900.jpg`,
                                    header: `${HASH}/header.jpg`,
                                },
                            },
                            { appid: 228980, assets: { asset_url_format: FORMAT('228980'), header: 'header.jpg' } },
                            { appid: 999, assets: { asset_url_format: FORMAT('999'), header: 'header.jpg' } },
                            { id: 480, success: 2 },
                        ],
                    },
                }),
        });
        expect(await adapter.getArt(['3527290', '228980', '480'])).toEqual({
            kind: 'ok',
            data: {
                '3527290': {
                    cover: `${BASE}/3527290/${HASH}/library_600x900.jpg?t=1790591892`,
                    header: `${BASE}/3527290/${HASH}/header.jpg?t=1790591892`,
                },
                '228980': { header: `${BASE}/228980/header.jpg?t=1790591892` },
            },
        });
        expect(drift.reports).toEqual([]);
    });

    it('splits a long list into requests of at most 150 apps', async () => {
        const { adapter, fake } = setup({ storeItems: () => reply({ response: { store_items: [] } }) });
        await adapter.getArt(Array.from({ length: 151 }, (_, index) => String(index + 1)));
        const sizes = fake.calls.map(
            ({ url }) => (JSON.parse(url.searchParams.get('input_json')!) as { ids: unknown[] }).ids.length
        );
        expect(sizes).toEqual([150, 1]);
    });

    it('reads a throttle as rateLimited', async () => {
        const { adapter } = setup({ storeItems: () => reply({ response: {} }, { status: 429, eresult: '84' }) });
        expect(await adapter.getArt(['620'])).toEqual({ kind: 'rateLimited' });
    });

    it('skips a malformed entry and reports the drift', async () => {
        const { adapter, drift } = setup({
            storeItems: () => reply({ response: { store_items: [{ appid: 'nope' }] } }),
        });
        expect(await adapter.getArt(['620'])).toEqual({ kind: 'ok', data: {} });
        expect(drift.reports[0]?.endpoint).toBe('IStoreBrowseService/GetItems/v1');
    });
});
