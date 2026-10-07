import { describe, expect, it } from 'vitest';
import { loadFixture } from '../../../fixtures/load.js';
import { normalizeGame, normalizeOwnedGames, normalizePlayer, toVisibility, unixToIso } from './normalize.js';
import { rawGameSchema, rawPlayerSchema, type RawGame, type RawPlayer } from './schemas.js';
import { fakeSteamId } from './test-utils.js';

const APP_ICON_BASE = 'https://media.steampowered.com/steamcommunity/public/images/apps';

function fixturePlayer(name: string): RawPlayer {
    const body = loadFixture(name).body as { response: { players: unknown[] } };
    return rawPlayerSchema.parse(body.response.players[0]);
}

function fixtureGames(): unknown[] {
    const body = loadFixture('GetOwnedGames.library').body as { response: { games: unknown[] } };
    return body.response.games;
}

// A game with every field Steam sends
function rawGame(overrides: Record<string, unknown> = {}): RawGame {
    return rawGameSchema.parse({
        appid: 10,
        name: 'Some Game',
        img_icon_url: 'abc123',
        has_community_visible_stats: true,
        playtime_forever: 100,
        playtime_2weeks: 20,
        playtime_windows_forever: 60,
        playtime_mac_forever: 10,
        playtime_linux_forever: 20,
        playtime_deck_forever: 5,
        playtime_disconnected: 5,
        rtime_last_played: 1_700_000_000,
        ...overrides,
    });
}

describe('toVisibility', () => {
    it.each([
        [3, 'public'],
        [2, 'friends'],
        [1, 'private'],
    ] as const)('maps %s to %s', (state, expected) => {
        expect(toVisibility(state)).toBe(expected);
    });

    it.each([0, 4, 5, -1, 99, 2.5, Number.NaN, undefined])('treats %s as private (conservative default)', (state) => {
        expect(toVisibility(state)).toBe('private');
    });
});

describe('unixToIso', () => {
    it('converts unix seconds to ISO 8601', () => {
        expect(unixToIso(1_400_000_000)).toBe('2014-05-13T16:53:20.000Z');
    });

    it.each([undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1e20])('returns null for %s', (value) => {
        expect(unixToIso(value)).toBeNull();
    });
});

describe('normalizePlayer', () => {
    it('maps the public fixture to a Profile with exactly the domain fields', () => {
        const raw = fixturePlayer('GetPlayerSummaries.public');
        const profile = normalizePlayer(raw);
        expect(profile).toEqual({
            id: { source: 'steam', externalId: raw.steamid },
            displayName: raw.personaname,
            avatarUrl: raw.avatarfull,
            profileUrl: raw.profileurl,
            visibility: 'public',
            createdAt: '2014-05-13T16:53:20.000Z',
        });
    });

    it('drops realname, country, avatar hashes and the clan id', () => {
        const raw = fixturePlayer('GetPlayerSummaries.public');
        const text = JSON.stringify(normalizePlayer(raw));
        expect(raw).toHaveProperty('realname');
        for (const key of ['realname', 'loccountrycode', 'avatarhash', 'primaryclanid'] as const) {
            const value = raw[key];
            expect(typeof value === 'string' && value !== '').toBe(true);
            expect(text.includes(String(value))).toBe(false);
        }
    });

    it('reads friends-only and private profiles, keeping name and avatar', () => {
        const friends = normalizePlayer(fixturePlayer('GetPlayerSummaries.friends'));
        const priv = normalizePlayer(fixturePlayer('GetPlayerSummaries.private'));
        expect(friends.visibility).toBe('friends');
        expect(priv.visibility).toBe('private');
        for (const profile of [friends, priv]) {
            expect(profile.displayName).not.toBe('');
            expect(profile.avatarUrl).not.toBe('');
            expect(profile.createdAt).toBeNull();
        }
    });

    it('falls back to the id and the canonical URL when name, avatar and URL are missing or blank', () => {
        const steamid = fakeSteamId(7);
        const profile = normalizePlayer(rawPlayerSchema.parse({ steamid, personaname: '  ', avatarfull: '' }));
        expect(profile).toEqual({
            id: { source: 'steam', externalId: steamid },
            displayName: steamid,
            avatarUrl: '',
            profileUrl: `https://steamcommunity.com/profiles/${steamid}/`,
            visibility: 'private',
            createdAt: null,
        });
    });

    it('uses a smaller avatar when the full one is missing', () => {
        const raw = rawPlayerSchema.parse({ steamid: fakeSteamId(7), avatar: 'small', avatarmedium: 'medium' });
        expect(normalizePlayer(raw).avatarUrl).toBe('medium');
    });

    it('reads an unknown visibility value as private', () => {
        const raw = rawPlayerSchema.parse({ steamid: fakeSteamId(7), communityvisibilitystate: 7 });
        expect(normalizePlayer(raw).visibility).toBe('private');
    });
});

describe('normalizeGame', () => {
    it('maps every field', () => {
        expect(normalizeGame(rawGame())).toEqual({
            id: { source: 'steam', externalId: '10' },
            name: 'Some Game',
            iconUrl: `${APP_ICON_BASE}/10/abc123.jpg`,
            hasVisibleStats: true,
            playtime: {
                totalMinutes: 100,
                recentMinutes: 20,
                lastPlayedAt: '2023-11-14T22:13:20.000Z',
                platforms: {
                    windowsMinutes: 60,
                    macMinutes: 10,
                    linuxMinutes: 20,
                    deckMinutes: 5,
                    disconnectedMinutes: 5,
                    approximate: true,
                },
            },
        });
    });

    it('reads an absent has_community_visible_stats as false', () => {
        const { has_community_visible_stats: _omitted, ...rest } = rawGame();
        expect(normalizeGame(rest as RawGame).hasVisibleStats).toBe(false);
        expect(normalizeGame(rawGame({ has_community_visible_stats: false })).hasVisibleStats).toBe(false);
        expect(normalizeGame(rawGame({ has_community_visible_stats: true })).hasVisibleStats).toBe(true);
    });

    it('reads rtime_last_played 0 (never played) or absent as null', () => {
        expect(normalizeGame(rawGame({ playtime_forever: 0, rtime_last_played: 0 })).playtime.lastPlayedAt).toBeNull();
        expect(normalizeGame(rawGame({ rtime_last_played: undefined })).playtime.lastPlayedAt).toBeNull();
    });

    it('defaults recent minutes to 0', () => {
        expect(normalizeGame(rawGame({ playtime_2weeks: undefined })).playtime.recentMinutes).toBe(0);
    });

    it('keeps playtime_forever as the truth when the platform split does not add up', () => {
        const more = normalizeGame(rawGame({ playtime_forever: 10 }));
        expect(more.playtime.totalMinutes).toBe(10);
        expect(more.playtime.platforms?.windowsMinutes).toBe(60);
        const none = normalizeGame(
            rawGame({
                playtime_forever: 500,
                playtime_windows_forever: 0,
                playtime_mac_forever: 0,
                playtime_linux_forever: 0,
                playtime_deck_forever: 0,
                playtime_disconnected: 0,
            })
        );
        expect(none.playtime.totalMinutes).toBe(500);
        expect(none.playtime.platforms).toEqual({
            windowsMinutes: 0,
            macMinutes: 0,
            linuxMinutes: 0,
            deckMinutes: 0,
            disconnectedMinutes: 0,
            approximate: true,
        });
    });

    it('has no platform split when none of its fields is present', () => {
        const raw = rawGameSchema.parse({ appid: 5, name: 'Bare', playtime_forever: 30 });
        expect(normalizeGame(raw).playtime.platforms).toBeNull();
    });

    it('fills missing split fields with 0 when only some are present', () => {
        const raw = rawGameSchema.parse({ appid: 5, playtime_forever: 30, playtime_deck_forever: 30 });
        expect(normalizeGame(raw).playtime.platforms).toEqual({
            windowsMinutes: 0,
            macMinutes: 0,
            linuxMinutes: 0,
            deckMinutes: 30,
            disconnectedMinutes: 0,
            approximate: true,
        });
    });

    it.each([undefined, '', '   '])('falls back to "App <appid>" when the name is %j', (name) => {
        expect(normalizeGame(rawGame({ appid: 42, name })).name).toBe('App 42');
    });

    it.each([undefined, '', '../../evil', 'a/b', 'has space'])('has no icon for the hash %j', (hash) => {
        expect(normalizeGame(rawGame({ img_icon_url: hash })).iconUrl).toBeNull();
    });

    it('maps the whole fixture library', () => {
        const entries = fixtureGames() as Record<string, unknown>[];
        const { games, issues } = normalizeOwnedGames(entries);
        expect(issues).toEqual([]);
        expect(games).toHaveLength(entries.length);
        games.forEach((game, index) => {
            const entry = entries[index]!;
            expect(game.id).toEqual({ source: 'steam', externalId: String(entry.appid) });
            expect(game.name).toBe(entry.name);
            expect(game.iconUrl).toBe(`${APP_ICON_BASE}/${String(entry.appid)}/${String(entry.img_icon_url)}.jpg`);
            expect(game.hasVisibleStats).toBe(entry.has_community_visible_stats === true);
            expect(game.playtime.totalMinutes).toBe(entry.playtime_forever);
            expect(game.playtime.lastPlayedAt === null).toBe(entry.rtime_last_played === 0);
            expect(game.playtime.platforms?.approximate).toBe(true);
        });
    });
});

describe('normalizeOwnedGames', () => {
    const sentinel = 'SENTINEL-VALUE';

    it('skips malformed entries, keeps the rest in order and describes them without values', () => {
        const entries = [
            { appid: 1, name: 'First' },
            { appid: sentinel, name: sentinel },
            null,
            [sentinel],
            { name: sentinel },
            { appid: 2, name: 'Second', playtime_forever: sentinel },
            { appid: 3, name: 'Third' },
        ];
        const { games, issues } = normalizeOwnedGames(entries);
        expect(games.map((game) => game.id.externalId)).toEqual(['1', '3']);
        expect(issues).toEqual([
            'games.1.appid: invalid_type',
            'games.2: invalid_type',
            'games.3: invalid_type',
            'games.4.appid: invalid_type',
            'games.5.playtime_forever: invalid_type',
        ]);
        expect(JSON.stringify(issues)).not.toContain(sentinel);
    });

    it('ignores unknown extra fields silently', () => {
        const { games, issues } = normalizeOwnedGames([{ appid: 1, content_descriptorids: [1, 2], future_field: {} }]);
        expect(games).toHaveLength(1);
        expect(issues).toEqual([]);
    });

    it('caps the issue list of a library that is broken everywhere', () => {
        const { games, issues } = normalizeOwnedGames(Array.from({ length: 100 }, () => null));
        expect(games).toEqual([]);
        expect(issues).toHaveLength(21);
        expect(issues.at(-1)).toBe('+80 more');
    });

    it('returns nothing for an empty list', () => {
        expect(normalizeOwnedGames([])).toEqual({ games: [], issues: [] });
    });
});
