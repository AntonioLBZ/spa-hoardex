// Spike 0B: Steam responses with the real key. Raw output goes to fixtures/full/spike (gitignored)
// Run: node --env-file=.env.local scripts/spike-steam.ts <resolve <vanity> | probe <label> | items [sizes...] | burst [max] [concurrency]>
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const key = process.env.STEAM_API_KEY;
if (!key) throw new Error('STEAM_API_KEY is not set');

const API = 'https://api.steampowered.com';
const DIR = 'fixtures/full/spike';
const META = `${DIR}/meta.json`;

interface Meta {
    steamid?: string;
    picks?: { played?: number; noStats?: number; neverLaunched?: number; neverLaunchedNoStats?: number };
}

interface Reply {
    status: number;
    eresult: string | null;
    bytes: number;
    json: unknown;
    text: string;
}

async function call(path: string, params: Record<string, string>, auth = true): Promise<Reply> {
    const url = new URL(path, API);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    if (auth) url.searchParams.set('key', key!);
    const res = await fetch(url);
    const text = await res.text();
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        json = undefined;
    }
    return { status: res.status, eresult: res.headers.get('x-eresult'), bytes: text.length, json, text };
}

async function readMeta(): Promise<Meta> {
    try {
        return JSON.parse(await readFile(META, 'utf8'));
    } catch {
        return {};
    }
}

async function writeMeta(meta: Meta) {
    await mkdir(DIR, { recursive: true });
    await writeFile(META, JSON.stringify(meta, null, 2));
}

// Body shape only: keys and array lengths, never values
function shape(value: unknown, depth = 0): string {
    if (Array.isArray(value)) return `[${value.length}]`;
    if (value && typeof value === 'object') {
        if (depth >= 2) return '{…}';
        const entries = Object.entries(value).map(([k, v]) => `${k}:${shape(v, depth + 1)}`);
        return `{${entries.slice(0, 12).join(', ')}${entries.length > 12 ? ', …' : ''}}`;
    }
    return typeof value;
}

function line(label: string, reply: Reply) {
    // Non-JSON bodies are Steam's short error strings
    const body = reply.json === undefined ? JSON.stringify(reply.text.slice(0, 100)) : shape(reply.json);
    console.log(
        `${label.padEnd(34)} HTTP ${reply.status}  x-eresult=${reply.eresult ?? '-'}  ${reply.bytes} B  ${body}`
    );
}

async function save(label: string, name: string, reply: Reply) {
    await mkdir(`${DIR}/${label}`, { recursive: true });
    const meta = { status: reply.status, eresult: reply.eresult };
    await writeFile(`${DIR}/${label}/${name}.json`, JSON.stringify({ meta, body: reply.json ?? reply.text }, null, 2));
}

async function resolve(vanity: string) {
    const reply = await call('/ISteamUser/ResolveVanityURL/v1/', { vanityurl: vanity });
    const response = (reply.json as { response?: { steamid?: string; success?: number } } | undefined)?.response;
    if (!response?.steamid) throw new Error(`could not resolve vanity (success=${response?.success})`);
    await writeMeta({ ...(await readMeta()), steamid: response.steamid });
    console.log(
        `resolved; steamid stored in ${META} (${response.steamid.length} digits, starts with ${response.steamid.slice(0, 6)})`
    );
}

interface Game {
    appid: number;
    playtime_forever: number;
    has_community_visible_stats?: boolean;
}

function pickGames(games: Game[]): NonNullable<Meta['picks']> {
    const withStats = games.filter((g) => g.has_community_visible_stats);
    return {
        played: withStats
            .filter((g) => g.playtime_forever > 0)
            .sort((a, b) => b.playtime_forever - a.playtime_forever)[0]?.appid,
        neverLaunched: withStats.find((g) => g.playtime_forever === 0)?.appid,
        noStats: games.find((g) => !g.has_community_visible_stats && g.playtime_forever > 0)?.appid,
        neverLaunchedNoStats: games.find((g) => !g.has_community_visible_stats && g.playtime_forever === 0)?.appid,
    };
}

async function probe(label: string) {
    const meta = await readMeta();
    const steamid = process.env.SPIKE_STEAMID ?? meta.steamid;
    if (!steamid) throw new Error('run `resolve <vanity>` first');
    console.log(`== probe "${label}"`);

    const summaries = await call('/ISteamUser/GetPlayerSummaries/v2/', { steamids: steamid });
    line('GetPlayerSummaries', summaries);
    await save(label, 'GetPlayerSummaries', summaries);
    const player = (summaries.json as { response?: { players?: Record<string, unknown>[] } } | undefined)?.response
        ?.players?.[0];
    console.log(`  communityvisibilitystate=${String(player?.communityvisibilitystate)}`);

    const owned = await call('/IPlayerService/GetOwnedGames/v1/', {
        steamid,
        include_appinfo: '1',
        include_played_free_games: '1',
    });
    line('GetOwnedGames', owned);
    await save(label, 'GetOwnedGames', owned);
    const games = (owned.json as { response?: { games?: Game[] } } | undefined)?.response?.games;
    console.log(`  games present: ${games ? games.length : 'no'}`);

    if (games) {
        // Existing picks win
        meta.picks = { ...pickGames(games), ...meta.picks };
        await writeMeta(meta);
    }
    const picks = meta.picks ?? {};
    console.log(`  picks (kept across runs): ${JSON.stringify(picks)}`);

    for (const [kind, appid] of Object.entries(picks)) {
        if (!appid) continue;
        const reply = await call('/ISteamUserStats/GetPlayerAchievements/v1/', {
            steamid,
            appid: String(appid),
            l: 'english',
        });
        line(`GetPlayerAchievements ${kind}`, reply);
        await save(label, `GetPlayerAchievements-${kind}`, reply);
    }

    const wishlist = await call('/IWishlistService/GetWishlist/v1/', { steamid });
    line('GetWishlist', wishlist);
    await save(label, 'GetWishlist', wishlist);

    const count = await call('/IWishlistService/GetWishlistItemCount/v1/', { steamid });
    line('GetWishlistItemCount', count);
    await save(label, 'GetWishlistItemCount', count);
}

async function items(sizes: number[]) {
    const meta = await readMeta();
    const steamid = process.env.SPIKE_STEAMID ?? meta.steamid;
    const owned = await call('/IPlayerService/GetOwnedGames/v1/', { steamid: steamid ?? '', include_appinfo: '0' });
    const games = (owned.json as { response?: { games?: Game[] } } | undefined)?.response?.games ?? [];
    const appids = games.map((g) => g.appid);
    console.log(`== GetItems with ${appids.length} appids from the library (no key needed)`);

    const request = (ids: number[], cc: string) =>
        call(
            '/IStoreBrowseService/GetItems/v1/',
            {
                input_json: JSON.stringify({
                    ids: ids.map((appid) => ({ appid })),
                    context: { language: 'english', country_code: cc },
                    data_request: { include_basic_info: true, include_assets: true },
                }),
            },
            false
        );

    for (const size of sizes) {
        if (size > appids.length) {
            console.log(`size ${size}: skipped (only ${appids.length} appids)`);
            continue;
        }
        const reply = await request(appids.slice(0, size), 'US');
        const returned = (reply.json as { response?: { store_items?: unknown[] } } | undefined)?.response?.store_items
            ?.length;
        console.log(
            `size ${String(size).padStart(3)}: HTTP ${reply.status}  x-eresult=${reply.eresult ?? '-'}  ${reply.bytes} B  store_items=${returned ?? '-'}`
        );
    }

    // Price per country: first appid that has a price in both
    const sample = appids.slice(0, 60);
    const [us, es] = await Promise.all([request(sample, 'US'), request(sample, 'ES')]);
    type Item = { appid?: number; best_purchase_option?: { formatted_final_price?: string } };
    const prices = (reply: Reply) =>
        new Map(
            ((reply.json as { response?: { store_items?: Item[] } } | undefined)?.response?.store_items ?? [])
                .filter((item) => item.best_purchase_option?.formatted_final_price)
                .map((item) => [item.appid, item.best_purchase_option?.formatted_final_price] as const)
        );
    const usPrices = prices(us);
    const esPrices = prices(es);
    const common = [...usPrices.keys()].filter((appid) => esPrices.has(appid)).slice(0, 3);
    console.log(`priced items: US=${usPrices.size} ES=${esPrices.size}`);
    for (const appid of common) console.log(`  appid ${appid}: US ${usPrices.get(appid)}  ES ${esPrices.get(appid)}`);
}

// Gentle burst on GetPlayerAchievements; stops at the first non-200
async function burst(max: number, concurrency: number) {
    const meta = await readMeta();
    const steamid = process.env.SPIKE_STEAMID ?? meta.steamid;
    const appid = meta.picks?.played;
    if (!steamid || !appid) throw new Error('run `resolve` and `probe` first');
    console.log(`== burst: up to ${max} requests, ${concurrency} in flight, stop at the first non-200`);

    const start = performance.now();
    let sent = 0;
    let failure: string | undefined;
    const worker = async () => {
        while (!failure && sent < max) {
            sent += 1;
            const n = sent;
            const reply = await call('/ISteamUserStats/GetPlayerAchievements/v1/', {
                steamid,
                appid: String(appid),
                l: 'english',
            });
            if (reply.status !== 200 && !failure) {
                failure = `request ${n} after ${Math.round(performance.now() - start)} ms: HTTP ${reply.status} x-eresult=${reply.eresult ?? '-'} body=${JSON.stringify(reply.text.slice(0, 80))}`;
            }
        }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    console.log(failure ?? `no non-200 in ${sent} requests (${Math.round(performance.now() - start)} ms)`);
}

const [command, ...args] = process.argv.slice(2);
if (command === 'resolve' && args[0]) await resolve(args[0]);
else if (command === 'probe' && args[0]) await probe(args[0]);
else if (command === 'items') await items(args.length ? args.map(Number) : [50, 100, 150, 200, 300]);
else if (command === 'burst') await burst(Number(args[0] ?? 100), Number(args[1] ?? 1));
else console.log('usage: resolve <vanity> | probe <label> | items [sizes...] | burst [max] [concurrency]');
