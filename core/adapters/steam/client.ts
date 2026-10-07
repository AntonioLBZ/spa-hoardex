import type { ZodType } from 'zod';
import { UpstreamError } from '../types.js';
import { describeIssues, warnDrift, type SteamDriftHandler } from './drift.js';
import { isSteamId64, VANITY_PATTERN } from './profile-input.js';
import {
    ownedGamesResponseSchema,
    playerSummariesResponseSchema,
    resolveVanityResponseSchema,
    type RawOwnedGamesResponse,
    type RawPlayerSummariesResponse,
    type RawResolveVanityResponse,
} from './schemas.js';

// Closed allowlist: the only host we talk to, and the only endpoints (fixed paths, fixed parameter names).
// Nothing from a visitor is ever used as a host, path or parameter name.
const API_HOST = 'api.steampowered.com';
const DEFAULT_TIMEOUT_MS = 10_000;
// Steam's status code for "too many requests", sent in the `x-eresult` header
const ERESULT_RATE_LIMITED = '84';

const ENDPOINTS = {
    resolveVanityUrl: { path: 'ISteamUser/ResolveVanityURL/v1', schema: resolveVanityResponseSchema },
    playerSummaries: { path: 'ISteamUser/GetPlayerSummaries/v2', schema: playerSummariesResponseSchema },
    ownedGames: { path: 'IPlayerService/GetOwnedGames/v1', schema: ownedGamesResponseSchema },
} as const;

interface Endpoint<T> {
    path: string;
    schema: ZodType<T>;
}

export interface SteamClientOptions {
    apiKey: string;
    // Injected in tests; defaults to the global `fetch`
    fetch?: typeof fetch;
    // Defaults to `console.warn`
    onDrift?: SteamDriftHandler;
    // Per request, body included. Defaults to 10 s
    timeoutMs?: number;
}

export interface SteamReply<T> {
    status: number;
    // The `x-eresult` header, null when Steam does not send it
    eresult: string | null;
    // HTTP 429 or `x-eresult: 84`. The client never retries; backoff belongs to the caller
    rateLimited: boolean;
    // Parsed JSON, or the text when the body is not JSON (error pages on 4xx)
    body: unknown;
    // `body` checked against the endpoint schema. Null unless the reply is a 200 that conforms (drift is reported)
    data: T | null;
}

export interface SteamClient {
    resolveVanityUrl(vanity: string): Promise<SteamReply<RawResolveVanityResponse>>;
    getPlayerSummaries(steamid: string): Promise<SteamReply<RawPlayerSummariesResponse>>;
    getOwnedGames(steamid: string): Promise<SteamReply<RawOwnedGamesResponse>>;
}

function transportFailure(error: unknown): UpstreamError {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    // The original error is dropped on purpose: transport errors can quote the URL, which carries the key
    return new UpstreamError(timedOut ? 'Steam request timed out' : 'Steam request failed');
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
    try {
        return { ok: true, value: JSON.parse(text) };
    } catch {
        return { ok: false };
    }
}

// Messages never carry the URL, the key or any part of a response body
export function createSteamClient(options: SteamClientOptions): SteamClient {
    const { apiKey, onDrift = warnDrift, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
    if (apiKey === '') throw new TypeError('The Steam API key is required');
    const doFetch: typeof fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

    async function call<T>(endpoint: Endpoint<T>, params: Record<string, string>): Promise<SteamReply<T>> {
        const url = new URL(`https://${API_HOST}/${endpoint.path}/`);
        url.searchParams.set('key', apiKey);
        for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);

        let status: number;
        let eresult: string | null;
        let text: string;
        try {
            // `redirect: 'error'` keeps a redirect from taking the request (and the key) off the allowlisted host
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
    };
}
