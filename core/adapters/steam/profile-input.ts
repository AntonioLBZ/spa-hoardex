export type ParsedProfileInput =
    { kind: 'steamid64'; steamid: string } | { kind: 'vanity'; vanity: string } | { kind: 'invalid' };

export const STEAMID64_PATTERN = /^765611\d{11}$/;
export const VANITY_PATTERN = /^[A-Za-z0-9_-]{2,32}$/;

// Shared frozen result for every rejection
const INVALID: ParsedProfileInput = Object.freeze({ kind: 'invalid' });
const MAX_INPUT_LENGTH = 200;
// Account id 0 of the public universe; a SteamID64 is this plus the 32-bit account id
const STEAMID64_BASE = 76561197960265728n;

const CONTROL_CHARACTERS = /\p{Cc}/u;
// STEAM_X:Y:Z (universe, parity bit, halved account id)
const STEAMID2_PATTERN = /^STEAM_[0-5]:([01]):(\d{1,10})$/i;
// [U:1:N] or U:1:N
const STEAMID3_PATTERN = /^(?:\[U:1:(\d{1,10})\]|U:1:(\d{1,10}))$/i;
// Literal host after an optional scheme: no userinfo, port or lookalikes
const COMMUNITY_URL_PATTERN = /^(?:https?:\/\/)?(?:www\.)?steamcommunity\.com(?:[/?#]|$)/i;
const COMMUNITY_HOSTS: ReadonlySet<string> = new Set(['steamcommunity.com', 'www.steamcommunity.com']);

export function isSteamId64(value: string): boolean {
    return STEAMID64_PATTERN.test(value);
}

// Account id 0 matches the pattern but is never a real account
function isAccountSteamId64(value: string): boolean {
    return isSteamId64(value) && BigInt(value) > STEAMID64_BASE;
}

function fromAccountId(accountId: bigint): ParsedProfileInput {
    const steamid = (STEAMID64_BASE + accountId).toString();
    return isAccountSteamId64(steamid) ? { kind: 'steamid64', steamid } : INVALID;
}

// A vanity made only of an id64 is that id64
function fromVanityOrId(value: string): ParsedProfileInput {
    if (isSteamId64(value)) return isAccountSteamId64(value) ? { kind: 'steamid64', steamid: value } : INVALID;
    if (VANITY_PATTERN.test(value)) return { kind: 'vanity', vanity: value };
    return INVALID;
}

function parseCommunityUrl(input: string): ParsedProfileInput {
    if (!COMMUNITY_URL_PATTERN.test(input)) return INVALID;

    let url: URL;
    try {
        url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    } catch {
        return INVALID;
    }
    if (!COMMUNITY_HOSTS.has(url.hostname) || url.username !== '' || url.password !== '') return INVALID;

    // First two path segments only (the leading '' is the root slash)
    const [, kind, value] = url.pathname.split('/');
    if (value === undefined) return INVALID;

    switch (kind?.toLowerCase()) {
        case 'profiles':
            return isAccountSteamId64(value) ? { kind: 'steamid64', steamid: value } : INVALID;
        case 'id':
            return fromVanityOrId(value);
        default:
            return INVALID;
    }
}

// Whatever the visitor typed: id64, vanity, SteamID2/3 or profile URL. Syntax only
export function parseProfileInput(raw: string): ParsedProfileInput {
    const input = raw.trim();
    if (input === '' || input.length > MAX_INPUT_LENGTH || CONTROL_CHARACTERS.test(input)) return INVALID;

    if (VANITY_PATTERN.test(input)) return fromVanityOrId(input);

    const steamId2 = STEAMID2_PATTERN.exec(input);
    if (steamId2?.[1] !== undefined && steamId2[2] !== undefined) {
        return fromAccountId(BigInt(steamId2[2]) * 2n + BigInt(steamId2[1]));
    }

    const steamId3 = STEAMID3_PATTERN.exec(input);
    const accountId = steamId3?.[1] ?? steamId3?.[2];
    if (accountId !== undefined) return fromAccountId(BigInt(accountId));

    return parseCommunityUrl(input);
}
