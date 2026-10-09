import { describe, expect, it } from 'vitest';
import {
    FAKE_AVATAR_HASH,
    FAKE_AVATAR_URL,
    FAKE_CLAN_ID_BASE,
    FAKE_STEAMID_BASE,
    FAKE_STEAMID_COUNT,
    createAnonymizer,
    createIdMap,
    isFakeSteamId,
    type Json,
} from './anonymize.js';

const ACCOUNT_BASE = 76561197960265728n;
const REAL_A = String(ACCOUNT_BASE + 111_111n);
const REAL_B = String(ACCOUNT_BASE + 222_222n);
const REAL_CLAN = String(103582791429521408n + 1234n);

function profile(): Json {
    return {
        response: {
            players: [
                {
                    steamid: REAL_A,
                    communityvisibilitystate: 3,
                    personaname: 'Some Real Name',
                    profileurl: `https://steamcommunity.com/id/somevanity/`,
                    avatar: 'https://avatars.steamstatic.com/aaaa.jpg',
                    avatarmedium: 'https://avatars.steamstatic.com/aaaa_medium.jpg',
                    avatarfull: 'https://avatars.steamstatic.com/aaaa_full.jpg',
                    avatarhash: 'ab'.repeat(20),
                    realname: 'Some Person',
                    primaryclanid: REAL_CLAN,
                    timecreated: 1400000000,
                    loccountrycode: 'XX',
                    locstatecode: 'YY',
                    loccityid: 42,
                },
            ],
        },
    };
}

describe('createIdMap', () => {
    it('hands out consecutive fake ids from the base, one per distinct real id', () => {
        const ids = createIdMap(FAKE_STEAMID_BASE, FAKE_STEAMID_COUNT);
        expect(ids.map(REAL_A)).toBe(String(FAKE_STEAMID_BASE));
        expect(ids.map(REAL_B)).toBe(String(FAKE_STEAMID_BASE + 1n));
        expect(ids.map(REAL_A)).toBe(String(FAKE_STEAMID_BASE));
    });

    it('is deterministic across instances fed in the same order', () => {
        const first = createIdMap(FAKE_STEAMID_BASE, FAKE_STEAMID_COUNT);
        const second = createIdMap(FAKE_STEAMID_BASE, FAKE_STEAMID_COUNT);
        expect([REAL_A, REAL_B].map(first.map)).toEqual([REAL_A, REAL_B].map(second.map));
    });

    it('leaves ids already inside the window untouched', () => {
        const ids = createIdMap(FAKE_STEAMID_BASE, FAKE_STEAMID_COUNT);
        const fake = String(FAKE_STEAMID_BASE + 7n);
        expect(ids.map(fake)).toBe(fake);
        expect(ids.map(REAL_A)).toBe(String(FAKE_STEAMID_BASE));
    });

    it('refuses to run past the window', () => {
        const ids = createIdMap(FAKE_STEAMID_BASE, 2n);
        ids.map('a');
        ids.map('b');
        expect(() => ids.map('c')).toThrow(RangeError);
    });
});

describe('isFakeSteamId', () => {
    it('accepts only the reserved window', () => {
        expect(isFakeSteamId(String(FAKE_STEAMID_BASE))).toBe(true);
        expect(isFakeSteamId(String(FAKE_STEAMID_BASE + FAKE_STEAMID_COUNT - 1n))).toBe(true);
        expect(isFakeSteamId(String(FAKE_STEAMID_BASE + FAKE_STEAMID_COUNT))).toBe(false);
        expect(isFakeSteamId(String(FAKE_STEAMID_BASE - 1n))).toBe(false);
        expect(isFakeSteamId(REAL_A)).toBe(false);
        expect(isFakeSteamId('not an id')).toBe(false);
    });
});

describe('createAnonymizer', () => {
    it('replaces every personal field of a player summary', () => {
        const out = createAnonymizer().anonymize(profile()) as { response: { players: Record<string, Json>[] } };
        const player = out.response.players[0]!;
        expect(player).toEqual({
            steamid: String(FAKE_STEAMID_BASE),
            communityvisibilitystate: 3,
            personaname: 'Player 0001',
            profileurl: `https://steamcommunity.com/profiles/${FAKE_STEAMID_BASE}/`,
            avatar: FAKE_AVATAR_URL,
            avatarmedium: FAKE_AVATAR_URL,
            avatarfull: FAKE_AVATAR_URL,
            avatarhash: FAKE_AVATAR_HASH,
            primaryclanid: String(FAKE_CLAN_ID_BASE),
            timecreated: 1400000000,
        });
    });

    it('is idempotent, with the same instance and with a fresh one', () => {
        const anonymizer = createAnonymizer();
        const once = anonymizer.anonymize(profile());
        expect(anonymizer.anonymize(once)).toEqual(once);
        expect(createAnonymizer().anonymize(once)).toEqual(once);
    });

    it('keeps one fake id per real id across a whole payload', () => {
        const out = createAnonymizer().anonymize({
            a: { steamid: REAL_A, personaname: 'Alice' },
            b: [{ SteamId: REAL_B, personaname: 'Bob' }],
            c: { steamID: REAL_A, personaname: 'Alice' },
        });
        expect(out).toEqual({
            a: { steamid: String(FAKE_STEAMID_BASE), personaname: 'Player 0001' },
            b: [{ SteamId: String(FAKE_STEAMID_BASE + 1n), personaname: 'Player 0002' }],
            c: { steamID: String(FAKE_STEAMID_BASE), personaname: 'Player 0001' },
        });
    });

    it('rebuilds profile urls from the id, whether the url carries it or a sibling does', () => {
        const out = createAnonymizer().anonymize([
            { steamid: REAL_A, profileurl: `https://steamcommunity.com/profiles/${REAL_A}/` },
            { steamid: REAL_A, profileurl: 'https://steamcommunity.com/id/somevanity/' },
            { profileurl: `https://steamcommunity.com/profiles/${REAL_B}` },
        ]);
        const url = (n: bigint) => `https://steamcommunity.com/profiles/${FAKE_STEAMID_BASE + n}/`;
        expect(out).toEqual([
            { steamid: String(FAKE_STEAMID_BASE), profileurl: url(0n) },
            { steamid: String(FAKE_STEAMID_BASE), profileurl: url(0n) },
            { profileurl: url(1n) },
        ]);
    });

    it('sweeps ids out of free text and object keys', () => {
        const out = createAnonymizer().anonymize({ note: `see ${REAL_A} and ${REAL_B}`, [REAL_A]: 1 });
        expect(out).toEqual({
            note: `see ${FAKE_STEAMID_BASE} and ${FAKE_STEAMID_BASE + 1n}`,
            [String(FAKE_STEAMID_BASE)]: 1,
        });
    });

    it('recurses through arbitrary JSON and leaves other values alone', () => {
        const value: Json = {
            n: 1,
            ok: true,
            nothing: null,
            list: [1, 'two', { deep: [{ realname: 'x', keep: 'y' }] }],
        };
        expect(createAnonymizer().anonymize(value)).toEqual({
            n: 1,
            ok: true,
            nothing: null,
            list: [1, 'two', { deep: [{ keep: 'y' }] }],
        });
    });

    it('does not turn a __proto__ key into a prototype', () => {
        const value = JSON.parse('{"__proto__": {"realname": "x", "keep": 1}}') as Json;
        const out = createAnonymizer().anonymize(value) as Record<string, Json>;
        expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
        expect(Object.keys(out)).toEqual(['__proto__']);
    });

    it('does not mutate its input', () => {
        const input = profile();
        const copy = structuredClone(input);
        createAnonymizer().anonymize(input);
        expect(input).toEqual(copy);
    });
});
