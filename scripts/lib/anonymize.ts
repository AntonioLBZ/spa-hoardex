// Anonymizer for raw Steam payloads: real ids go through a fake-id map. Pure.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

// Fake SteamID64 window; narrow so real ids cannot pass as fake
export const FAKE_STEAMID_BASE = 76561198000000000n;
export const FAKE_STEAMID_COUNT = 10_000n;

// Group (clan) id64 = 103582791429521408 + group id. Fake groups sit in their own window.
export const FAKE_CLAN_ID_BASE = 103582791429521408n + 90_000_000n;
export const FAKE_CLAN_ID_COUNT = 10_000n;

export const FAKE_AVATAR_URL = 'https://example.invalid/avatar.jpg';
export const FAKE_AVATAR_HASH = '0'.repeat(40);

export interface IdMap {
    // Same input, same fake id; ids already in the window map to themselves
    map(real: string): string;
    isFake(id: string): boolean;
}

function inWindow(id: string, base: bigint, count: bigint): boolean {
    if (!/^\d{1,20}$/.test(id)) return false;
    const value = BigInt(id);
    return value >= base && value < base + count;
}

export function createIdMap(base: bigint, count: bigint): IdMap {
    const byReal = new Map<string, string>();
    let used = 0n;

    function isFake(id: string): boolean {
        return inWindow(id, base, count);
    }

    function map(real: string): string {
        if (isFake(real)) return real;
        const known = byReal.get(real);
        if (known !== undefined) return known;
        if (used >= count) throw new RangeError(`fake id window exhausted (${count} ids)`);
        const fake = String(base + used);
        used += 1n;
        byReal.set(real, fake);
        return fake;
    }

    return { map, isFake };
}

export function isFakeSteamId(id: string): boolean {
    return inWindow(id, FAKE_STEAMID_BASE, FAKE_STEAMID_COUNT);
}

export interface Anonymizer {
    anonymize(value: Json): Json;
    steamIds: IdMap;
}

// Keys dropped outright: personal data
const REMOVED_KEYS = new Set(['realname', 'loccountrycode', 'locstatecode', 'loccityid']);
const AVATAR_KEYS = new Set(['avatar', 'avatarmedium', 'avatarfull']);
const STEAMID_IN_TEXT = /(?<!\d)765611\d{11}(?!\d)/g;
const FAKE_NAME = /^Player \d{4}$/;

export function createAnonymizer(): Anonymizer {
    const steamIds = createIdMap(FAKE_STEAMID_BASE, FAKE_STEAMID_COUNT);
    const clanIds = createIdMap(FAKE_CLAN_ID_BASE, FAKE_CLAN_ID_COUNT);
    const names = new Map<string, string>();

    function personaName(real: string): string {
        if (FAKE_NAME.test(real)) return real;
        let fake = names.get(real);
        if (fake === undefined) {
            fake = `Player ${String(names.size + 1).padStart(4, '0')}`;
            names.set(real, fake);
        }
        return fake;
    }

    // Ids inside other strings (URLs, text, keys)
    function sweep(text: string): string {
        return text.replace(STEAMID_IN_TEXT, (id) => steamIds.map(id));
    }

    function ownSteamId(object: { [key: string]: Json }): string | undefined {
        for (const [key, value] of Object.entries(object)) {
            if (key.toLowerCase() === 'steamid' && typeof value === 'string') return value;
        }
        return undefined;
    }

    function profileUrl(raw: string, parent: { [key: string]: Json }): string {
        const byId = /\/profiles\/(\d{17})/.exec(raw)?.[1];
        const vanity = /\/id\/([^/?#]+)/.exec(raw)?.[1];
        const sibling = ownSteamId(parent);
        const id = byId ?? sibling ?? (vanity ? `vanity:${vanity}` : `url:${raw}`);
        return `https://steamcommunity.com/profiles/${steamIds.map(id)}/`;
    }

    function field(key: string, value: Json, parent: { [key: string]: Json }): Json {
        if (typeof value === 'string') {
            if (key.toLowerCase() === 'steamid' && /^\d+$/.test(value)) return steamIds.map(value);
            if (key === 'personaname') return personaName(value);
            if (AVATAR_KEYS.has(key)) return FAKE_AVATAR_URL;
            if (key === 'avatarhash') return FAKE_AVATAR_HASH;
            if (key === 'profileurl') return profileUrl(value, parent);
            if (key === 'primaryclanid' && /^\d+$/.test(value)) return clanIds.map(value);
        }
        return walk(value);
    }

    function walk(value: Json): Json {
        if (typeof value === 'string') return sweep(value);
        if (Array.isArray(value)) return value.map(walk);
        if (value !== null && typeof value === 'object') {
            const entries: [string, Json][] = [];
            for (const [key, child] of Object.entries(value)) {
                if (REMOVED_KEYS.has(key)) continue;
                entries.push([sweep(key), field(key, child, value)]);
            }
            return Object.fromEntries(entries);
        }
        return value;
    }

    return { anonymize: walk, steamIds };
}
