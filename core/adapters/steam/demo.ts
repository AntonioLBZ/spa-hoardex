import type { EntityId, Library, Profile, ProfileAccess } from '../../domain/index.js';
import { createSteamAdapter } from './adapter.js';
import type { SteamDriftHandler } from './drift.js';

// Inside the fake id window; never sent to Steam, since the demo answers offline
export const DEMO_STEAMID = '76561198000009999';
// Served by the SPA's public/ folder
export const DEMO_AVATAR_URL = '/demo-avatar.svg';

export interface DemoData {
    getProfile(): Promise<ProfileAccess<Profile>>;
    getLibrary(): Promise<ProfileAccess<Library>>;
}

export interface DemoOptions {
    now?: () => Date;
    onDrift?: SteamDriftHandler;
}

type DemoState = 'untouched' | 'tried' | 'inProgress' | 'paused' | 'finished';

// Sums to 96 games; the mix shows every state the dashboard charts
const QUOTAS: Record<DemoState, number> = { untouched: 36, tried: 9, inProgress: 12, paused: 11, finished: 28 };

const ADJECTIVES = [
    'Crimson',
    'Hollow',
    'Velvet',
    'Silent',
    'Golden',
    'Frozen',
    'Neon',
    'Wandering',
    'Broken',
    'Gilded',
    'Amber',
    'Lunar',
    'Rusted',
    'Verdant',
    'Distant',
    'Electric',
] as const;
const NOUNS = [
    'Orbit',
    'Harbor',
    'Circuit',
    'Orchard',
    'Citadel',
    'Voyage',
    'Garden',
    'Protocol',
    'Frontier',
    'Lantern',
    'Archive',
    'Meridian',
    'Tides',
    'Engine',
    'Horizon',
    'Relic',
] as const;

const FIRST_APPID = 4_200_000_000;
const DAY_SECONDS = 86_400;
// Account creation of the fictional player
const DEMO_CREATED_AT = 1_400_000_000;

// Small seeded generator: the same library on every request
function seededRandom(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
}

// Distinct for every index below 256
function gameName(index: number): string {
    const adjective = ADJECTIVES[index % 16] ?? 'Lost';
    const noun = NOUNS[(Math.floor(index / 16) + 3 * (index % 16)) % 16] ?? 'Signal';
    return `${adjective} ${noun}`;
}

interface DemoPlay {
    minutes: number;
    // Null when never played
    daysAgo: number | null;
    recentMinutes: number;
}

// Days stay clear of the 90 and 365 day boundaries so the states hold as the clock moves
function playFor(state: DemoState, random: () => number): DemoPlay {
    const between = (low: number, high: number) => low + Math.floor(random() * (high - low + 1));
    switch (state) {
        case 'untouched':
            return { minutes: 0, daysAgo: null, recentMinutes: 0 };
        case 'tried':
            return { minutes: between(1, 58), daysAgo: between(3, 700), recentMinutes: 0 };
        case 'inProgress': {
            const minutes = 60 + Math.floor(random() ** 2 * 3600);
            const recentMinutes = random() < 0.6 ? Math.min(minutes, between(15, 500)) : 0;
            return { minutes, daysAgo: between(2, 81), recentMinutes };
        }
        case 'paused':
            return { minutes: 60 + Math.floor(random() ** 2 * 4500), daysAgo: between(100, 349), recentMinutes: 0 };
        case 'finished':
            return {
                minutes: 120 + Math.floor(random() ** 2.4 * 18_000),
                daysAgo: between(380, 2379),
                recentMinutes: 0,
            };
    }
}

function shuffled<T>(items: T[], random: () => number): T[] {
    for (let index = items.length - 1; index > 0; index -= 1) {
        const other = Math.floor(random() * (index + 1));
        [items[index], items[other]] = [items[other] as T, items[index] as T];
    }
    return items;
}

// Steam's GetOwnedGames shape, with dates relative to `now`
function rawGames(now: Date) {
    const random = seededRandom(20_261_007);
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const states = shuffled(
        (Object.keys(QUOTAS) as DemoState[]).flatMap((state) => Array<DemoState>(QUOTAS[state]).fill(state)),
        random
    );

    return states.map((state, index) => {
        const play = playFor(state, random);
        return {
            appid: FIRST_APPID + index * 10,
            name: gameName(index),
            playtime_forever: play.minutes,
            ...(random() < 0.85 ? { has_community_visible_stats: true } : {}),
            ...(play.recentMinutes > 0 ? { playtime_2weeks: play.recentMinutes } : {}),
            playtime_windows_forever: play.minutes,
            playtime_mac_forever: 0,
            playtime_linux_forever: 0,
            playtime_deck_forever: 0,
            rtime_last_played: play.daysAgo === null ? 0 : nowSeconds - play.daysAgo * DAY_SECONDS,
            playtime_disconnected: 0,
        };
    });
}

function createDemoFetch(now: () => Date): typeof fetch {
    const handler = async (input: string | URL | Request): Promise<Response> => {
        const url = new URL(input instanceof Request ? input.url : input);
        const path = url.pathname.replace(/\/$/, '');

        if (path === '/ISteamUser/GetPlayerSummaries/v2') {
            const players =
                url.searchParams.get('steamids') === DEMO_STEAMID
                    ? [
                          {
                              steamid: DEMO_STEAMID,
                              communityvisibilitystate: 3,
                              personaname: 'Demo Hoarder',
                              profileurl: 'https://example.invalid/demo',
                              avatarfull: DEMO_AVATAR_URL,
                              timecreated: DEMO_CREATED_AT,
                          },
                      ]
                    : [];
            return Response.json({ response: { players } });
        }

        if (path === '/IPlayerService/GetOwnedGames/v1') {
            if (url.searchParams.get('steamid') !== DEMO_STEAMID) {
                return Response.json({ response: {} }, { headers: { 'x-eresult': '15' } });
            }
            const games = rawGames(now());
            return Response.json({ response: { game_count: games.length, games } }, { headers: { 'x-eresult': '1' } });
        }

        return new Response('Not found', { status: 404 });
    };
    return handler as typeof fetch;
}

// A fictional library read through the real Steam adapter: no key, network or cache involved
export function createDemoData(options: DemoOptions = {}): DemoData {
    const now = options.now ?? (() => new Date());
    const adapter = createSteamAdapter({
        apiKey: 'demo',
        fetch: createDemoFetch(now),
        now,
        onDrift: options.onDrift,
    });
    const owner: EntityId = { source: 'steam', externalId: DEMO_STEAMID };

    return {
        getProfile: () => adapter.resolveProfile(DEMO_STEAMID),
        getLibrary: () => adapter.getLibrary(owner),
    };
}
