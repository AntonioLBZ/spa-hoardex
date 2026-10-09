import { isSteamId64 } from './profile-input.js';

// Steam's OpenID 2.0 provider; the only host this module talks to
export const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';

const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';
const CLAIMED_ID_PATTERN = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
const REQUIRED_SIGNED = ['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce'];
// OpenID nonces start with their UTC issue time
const NONCE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/;
const NONCE_MAX_AGE_MS = 5 * 60_000;
const DEFAULT_TIMEOUT_MS = 10_000;

export type SteamLoginFailure = 'malformed' | 'returnTo' | 'stale' | 'replayed' | 'rejected' | 'upstream';

export type SteamLoginResult = { kind: 'ok'; steamId: string } | { kind: 'invalid'; reason: SteamLoginFailure };

export interface SteamLoginUrlOptions {
    // Our origin, shown by Steam as the site asking
    realm: string;
    // Absolute callback URL; Steam sends the browser back here
    returnTo: string;
}

export function buildSteamLoginUrl({ realm, returnTo }: SteamLoginUrlOptions): string {
    const url = new URL(STEAM_OPENID_ENDPOINT);
    url.searchParams.set('openid.ns', OPENID_NS);
    url.searchParams.set('openid.mode', 'checkid_setup');
    url.searchParams.set('openid.return_to', returnTo);
    url.searchParams.set('openid.realm', realm);
    url.searchParams.set('openid.identity', IDENTIFIER_SELECT);
    url.searchParams.set('openid.claimed_id', IDENTIFIER_SELECT);
    return url.href;
}

export interface VerifySteamLoginOptions {
    // The exact return_to sent with the login request
    expectedReturnTo: string;
    // True the first time a nonce is seen; blocks replays
    claimNonce(nonce: string): Promise<boolean>;
    fetch?: typeof fetch;
    now?: () => Date;
    timeoutMs?: number;
}

function isFresh(nonce: string, now: Date): boolean {
    const issued = NONCE_TIME_PATTERN.exec(nonce);
    if (issued === null) return false;
    const age = now.getTime() - Date.parse(issued[1]!);
    return Number.isFinite(age) && Math.abs(age) <= NONCE_MAX_AGE_MS;
}

// Local checks first, then Steam's own check_authentication
export async function verifySteamLogin(
    query: URLSearchParams,
    options: VerifySteamLoginOptions
): Promise<SteamLoginResult> {
    const { expectedReturnTo, claimNonce, now = () => new Date(), timeoutMs = DEFAULT_TIMEOUT_MS } = options;
    const doFetch: typeof fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    const field = (name: string) => query.get(`openid.${name}`);

    if (field('ns') !== OPENID_NS || field('mode') !== 'id_res') return { kind: 'invalid', reason: 'malformed' };
    if (field('op_endpoint') !== STEAM_OPENID_ENDPOINT) return { kind: 'invalid', reason: 'malformed' };

    const claimedId = field('claimed_id') ?? '';
    const steamId = CLAIMED_ID_PATTERN.exec(claimedId)?.[1];
    if (steamId === undefined || !isSteamId64(steamId) || field('identity') !== claimedId) {
        return { kind: 'invalid', reason: 'malformed' };
    }

    const signed = new Set((field('signed') ?? '').split(','));
    if (REQUIRED_SIGNED.some((name) => !signed.has(name)) || !field('sig') || !field('assoc_handle')) {
        return { kind: 'invalid', reason: 'malformed' };
    }
    if (field('return_to') !== expectedReturnTo) return { kind: 'invalid', reason: 'returnTo' };

    const nonce = field('response_nonce') ?? '';
    if (!isFresh(nonce, now())) return { kind: 'invalid', reason: 'stale' };
    if (!(await claimNonce(nonce))) return { kind: 'invalid', reason: 'replayed' };

    const body = new URLSearchParams();
    for (const [name, value] of query) if (name.startsWith('openid.')) body.set(name, value);
    body.set('openid.mode', 'check_authentication');

    let text: string;
    try {
        const response = await doFetch(STEAM_OPENID_ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body,
            redirect: 'error',
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) return { kind: 'invalid', reason: 'upstream' };
        text = await response.text();
    } catch {
        return { kind: 'invalid', reason: 'upstream' };
    }

    const valid = text.split('\n').some((line) => line.trim() === 'is_valid:true');
    return valid ? { kind: 'ok', steamId } : { kind: 'invalid', reason: 'rejected' };
}
