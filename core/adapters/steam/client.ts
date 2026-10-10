import type { ZodType } from 'zod';
import { UpstreamError } from '../types.js';
import { describeIssues, warnDrift, type SteamDriftHandler } from './drift.js';
import { isSteamId64, VANITY_PATTERN } from './profile-input.js';
import {
    ownedGamesResponseSchema,
    playerSummariesResponseSchema,
    resolveVanityResponseSchema,
    storeItemsResponseSchema,
    type RawOwnedGamesResponse,
    type RawPlayerSummariesResponse,
    type RawResolveVanityResponse,
    type RawStoreItemsResponse,
} from './schemas.js';

// Closed allowlist: one host, fixed paths and parameter names
const API_HOST = 'api.steampowered.com';
const DEFAULT_TIMEOUT_MS = 10_000;
// Steam's "too many requests" code, sent in x-eresult
const ERESULT_RATE_LIMITED = '84';

const ENDPOINTS = {
    resolveVanityUrl: { path: 'ISteamUser/ResolveVanityURL/v1', schema: resolveVanityResponseSchema },
    playerSummaries: { path: 'ISteamUser/GetPlayerSummaries/v2', schema: playerSummariesResponseSchema },
    ownedGames: { path: 'IPlayerService/GetOwnedGames/v1', schema: ownedGamesResponseSchema },
    // Public store data: the key is not sent
    storeItems: { path: 'IStoreBrowseService/GetItems/v1', schema: storeItemsResponseSchema, keyless: true },
} as const;

// GetItems takes the ids in the URL: 275 already gives 414 (verified)
export const STORE_ITEMS_MAX = 150;
const APPID = /^\d{1,10}$/;

interface Endpoint<T> {
    path: string;
    schema: ZodType<T>;
    keyless?: boolean;
}

export interface SteamClientOptions {
    apiKey: string;
    // Defaults to the global fetch
    fetch?: typeof fetch;
    // Defaults to `console.warn`
    onDrift?: SteamDriftHandler;
    // Per request; defaults to 10 s
    timeoutMs?: number;
}

export interface SteamReply<T> {
    status: number;
    // x-eresult header, null if absent
    eresult: string | null;
    // HTTP 429 or x-eresult 84; never retried here
    rateLimited: boolean;
    // Parsed JSON, or the text if not JSON
    body: unknown;
    // body validated against the schema; null unless a conforming 200
    data: T | null;
}

export interface SteamClient {
    resolveVanityUrl(vanity: string): Promise<SteamReply<RawResolveVanityResponse>>;
    getPlayerSummaries(steamid: string): Promise<SteamReply<RawPlayerSummariesResponse>>;
    getOwnedGames(steamid: string): Promise<SteamReply<RawOwnedGamesResponse>>;
    // Store images of up to STORE_ITEMS_MAX apps
    getStoreItems(appids: readonly string[]): Promise<SteamReply<RawStoreItemsResponse>>;
}

function transportFailure(error: unknown): UpstreamError {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    // Original error dropped: it can quote the URL, which carries the key
    return new UpstreamError(timedOut ? 'Steam request timed out' : 'Steam request failed');
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
    try {
        return { ok: true, value: JSON.parse(text) };
    } catch {
        return { ok: false };
    }
}

// Error messages never carry the URL, key or body
export function createSteamClient(options: SteamClientOptions): SteamClient {
    const { apiKey, onDrift = warnDrift, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
    if (apiKey === '') throw new TypeError('The Steam API key is required');
    const doFetch: typeof fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

    async function call<T>(endpoint: Endpoint<T>, params: Record<string, string>): Promise<SteamReply<T>> {
        const url = new URL(`https://${API_HOST}/${endpoint.path}/`);
        if (endpoint.keyless !== true) url.searchParams.set('key', apiKey);
        for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);

        let status: number;
        let eresult: string | null;
        let text: string;
        try {
            // Keeps a redirect from taking the key off the allowlisted host
            const response = await doFetch(url.href, {
                headers: { accept: 'application/json' },
                redirect: 'error',
                signal: AbortSignal.timeout(timeoutMs),
            });
            status = response.status;
            eresult = response.headers.get('x-eresult');
            text = await response.text();
        } catch (error) {
            throw transportFailure(error);
        }

        const rateLimited = status === 429 || eresult === ERESULT_RATE_LIMITED;
        if (status >= 500 && !rateLimited) throw new UpstreamError(`Steam answered HTTP ${status}`, status);

        const json = parseJson(text);
        if (status === 200 && !json.ok) throw new UpstreamError('Steam answered 200 with a body that is not JSON', 200);
        const body = json.ok ? json.value : text;
        if (status !== 200 || !json.ok) return { status, eresult, rateLimited, body, data: null };

        const parsed = endpoint.schema.safeParse(body);
        if (parsed.success) return { status, eresult, rateLimited, body, data: parsed.data };
        onDrift({ endpoint: endpoint.path, issues: describeIssues(parsed.error) });
        return { status, eresult, rateLimited, body, data: null };
    }

    return {
        async resolveVanityUrl(vanity) {
            if (!VANITY_PATTERN.test(vanity)) throw new RangeError('Invalid vanity URL');
            return call(ENDPOINTS.resolveVanityUrl, { vanityurl: vanity });
        },
        async getPlayerSummaries(steamid) {
            if (!isSteamId64(steamid)) throw new RangeError('Invalid SteamID64');
            return call(ENDPOINTS.playerSummaries, { steamids: steamid });
        },
        async getOwnedGames(steamid) {
            if (!isSteamId64(steamid)) throw new RangeError('Invalid SteamID64');
            return call(ENDPOINTS.ownedGames, {
                steamid,
                include_appinfo: '1',
                include_played_free_games: '1',
            });
        },
        async getStoreItems(appids) {
            if (appids.length === 0 || appids.length > STORE_ITEMS_MAX || !appids.every((id) => APPID.test(id))) {
                throw new RangeError('Invalid appids');
            }
            return call(ENDPOINTS.storeItems, {
                input_json: JSON.stringify({
                    ids: appids.map((appid) => ({ appid: Number(appid) })),
                    context: { language: 'english', country_code: 'US' },
                    data_request: { include_assets: true },
                }),
            });
        },
    };
}
