import type { EntityId, Profile, ProfileAccess } from '../../domain/index.js';
import { UpstreamError, type AdapterCapabilities, type StoreAdapter } from '../types.js';
import { createSteamClient, type SteamClientOptions, type SteamReply } from './client.js';
import { warnDrift } from './drift.js';
import { normalizeOwnedGames, normalizePlayer } from './normalize.js';
import { isSteamId64, parseProfileInput } from './profile-input.js';

export interface SteamAdapterOptions extends SteamClientOptions {
    // Clock for `Library.fetchedAt`; injected in tests
    now?: () => Date;
}

// Phase 1 only reads profile and library. Flip `achievements` to 'perBatch' when phase 2 lands and `wishlist` to true
// with phase 3 (ARCHITECTURE.md section 14).
const CAPABILITIES: AdapterCapabilities = { achievements: 'none', wishlist: false };

const OWNED_GAMES_ENDPOINT = 'IPlayerService/GetOwnedGames/v1';
const VANITY_FOUND = 1;

// The reply's validated body, or an `UpstreamError`. Rate limits are handled by the callers before this.
// A 401/403 from Steam means the API key is bad or revoked, never an access state: privacy shows up in the body.
function expectData<T>(reply: SteamReply<T>): T {
    if (reply.status === 401 || reply.status === 403) {
        throw new UpstreamError('Steam rejected the API key', reply.status);
    }
    if (reply.status !== 200) throw new UpstreamError(`Steam answered HTTP ${reply.status}`, reply.status);
    if (reply.data === null) throw new UpstreamError('Steam answered with an unexpected response shape', reply.status);
    return reply.data;
}

export function createSteamAdapter(options: SteamAdapterOptions): StoreAdapter {
    const { now = () => new Date(), ...clientOptions } = options;
    const onDrift = clientOptions.onDrift ?? warnDrift;
    const client = createSteamClient({ ...clientOptions, onDrift });

    // Profile for a SteamID64 whatever its visibility: a private profile still exposes name and avatar
    async function lookupPlayer(steamid: string): Promise<ProfileAccess<Profile>> {
        const reply = await client.getPlayerSummaries(steamid);
        if (reply.rateLimited) return { kind: 'rateLimited' };
        const player = expectData(reply).response.players?.find((candidate) => candidate.steamid === steamid);
        return player === undefined ? { kind: 'notFound' } : { kind: 'ok', data: normalizePlayer(player) };
    }

    async function resolveVanity(vanity: string): Promise<ProfileAccess<string>> {
        const reply = await client.resolveVanityUrl(vanity);
        if (reply.rateLimited) return { kind: 'rateLimited' };
        const { success, steamid } = expectData(reply).response;
        if (success !== VANITY_FOUND || steamid === undefined) return { kind: 'notFound' };
        // A "found" without a usable id is not a miss, it is Steam misbehaving
        if (!isSteamId64(steamid)) throw new UpstreamError('Steam answered with an unexpected response shape');
        return { kind: 'ok', data: steamid };
    }

    return {
        source: 'steam',
        capabilities: CAPABILITIES,

        async resolveProfile(input) {
            const parsed = parseProfileInput(input);
            if (parsed.kind === 'invalid') return { kind: 'notFound' };
            if (parsed.kind === 'steamid64') return lookupPlayer(parsed.steamid);

            const resolved = await resolveVanity(parsed.vanity);
            return resolved.kind === 'ok' ? lookupPlayer(resolved.data) : resolved;
        },

        // Privacy is decided by the body of GetOwnedGames, never by the HTTP status (ARCHITECTURE.md 5.4):
        //  - `games` present: the library.
        //  - `game_count: 0` without games: a public, empty library (secondary source, unverified).
        //  - Empty `response` (no `game_count`, no `games`): private, but Steam does not say which setting caused it
        //    (secondary source, unverified: it cannot be tested with the key owner's own account, whose data the key
        //    always sees). One GetPlayerSummaries call tells them apart: profile not public => `profilePrivate`;
        //    public profile => its "game details" are private => `libraryPrivate`. The same call yields `notFound`
        //    when the account does not exist.
        async getLibrary(profile: EntityId) {
            if (profile.source !== 'steam' || !isSteamId64(profile.externalId)) return { kind: 'notFound' };
            const owner: EntityId = { source: 'steam', externalId: profile.externalId };

            const reply = await client.getOwnedGames(owner.externalId);
            if (reply.rateLimited) return { kind: 'rateLimited' };
            const { game_count: gameCount, games: entries } = expectData(reply).response;

            if (entries !== undefined) {
                const { games, issues } = normalizeOwnedGames(entries);
                if (issues.length > 0) onDrift({ endpoint: OWNED_GAMES_ENDPOINT, issues });
                return { kind: 'ok', data: { owner, games, fetchedAt: now().toISOString() } };
            }
            if (gameCount === 0) return { kind: 'ok', data: { owner, games: [], fetchedAt: now().toISOString() } };
            if (gameCount !== undefined) {
                // A count without the list is neither private nor empty
                onDrift({ endpoint: OWNED_GAMES_ENDPOINT, issues: ['response.games: missing'] });
                throw new UpstreamError('Steam answered with an unexpected response shape');
            }

            const player = await lookupPlayer(owner.externalId);
            if (player.kind !== 'ok') return player;
            return { kind: player.data.visibility === 'public' ? 'libraryPrivate' : 'profilePrivate' };
        },
    };
}
