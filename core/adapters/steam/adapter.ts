import type { EntityId, GameArt, Profile, ProfileAccess } from '../../domain/index.js';
import { UpstreamError, type AdapterCapabilities, type StoreAdapter } from '../types.js';
import { STORE_ITEMS_MAX, createSteamClient, type SteamClientOptions, type SteamReply } from './client.js';
import { warnDrift } from './drift.js';
import { normalizeOwnedGames, normalizePlayer, normalizeStoreItems } from './normalize.js';
import { isSteamId64, parseProfileInput } from './profile-input.js';

export interface SteamAdapterOptions extends SteamClientOptions {
    // Clock for fetchedAt
    now?: () => Date;
}

// Phase 1: no achievements or wishlist yet
const CAPABILITIES: AdapterCapabilities = { achievements: 'none', wishlist: false };

const OWNED_GAMES_ENDPOINT = 'IPlayerService/GetOwnedGames/v1';
const STORE_ITEMS_ENDPOINT = 'IStoreBrowseService/GetItems/v1';
const VANITY_FOUND = 1;

// Validated body or UpstreamError; 401/403 means a bad key, not an access state
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

    // Profile for a SteamID64; private profiles still expose name and avatar
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
        // "Found" without a usable id is Steam misbehaving
        if (!isSteamId64(steamid)) throw new UpstreamError('Steam answered with an unexpected response shape');
        return { kind: 'ok', data: steamid };
    }

    return {
        source: 'steam',
        capabilities: CAPABILITIES,

        // Vanity lookup is case-insensitive (verified)
        parseInput(input) {
            const parsed = parseProfileInput(input);
            switch (parsed.kind) {
                case 'steamid64':
                    return { kind: 'id', id: { source: 'steam', externalId: parsed.steamid } };
                case 'vanity':
                    return { kind: 'alias', alias: parsed.vanity.toLowerCase() };
                default:
                    return { kind: 'invalid' };
            }
        },

        async resolveAlias(alias) {
            const resolved = await resolveVanity(alias);
            return resolved.kind === 'ok'
                ? { kind: 'ok', data: { source: 'steam', externalId: resolved.data } }
                : resolved;
        },

        async resolveProfile(input) {
            const parsed = parseProfileInput(input);
            if (parsed.kind === 'invalid') return { kind: 'notFound' };
            if (parsed.kind === 'steamid64') return lookupPlayer(parsed.steamid);

            const resolved = await resolveVanity(parsed.vanity);
            return resolved.kind === 'ok' ? lookupPlayer(resolved.data) : resolved;
        },

        // Privacy comes from the body, not the status; an empty response means private (ARCHITECTURE.md 5.4)
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
                // A count without the list is an unexpected shape
                onDrift({ endpoint: OWNED_GAMES_ENDPOINT, issues: ['response.games: missing'] });
                throw new UpstreamError('Steam answered with an unexpected response shape');
            }

            const player = await lookupPlayer(owner.externalId);
            if (player.kind !== 'ok') return player;
            return { kind: player.data.visibility === 'public' ? 'libraryPrivate' : 'profilePrivate' };
        },

        async getArt(games) {
            const art: Record<string, GameArt> = {};
            for (let start = 0; start < games.length; start += STORE_ITEMS_MAX) {
                const chunk = games.slice(start, start + STORE_ITEMS_MAX);
                const reply = await client.getStoreItems(chunk);
                if (reply.rateLimited) return { kind: 'rateLimited' };
                const normalized = normalizeStoreItems(expectData(reply).response.store_items ?? [], chunk);
                if (normalized.issues.length > 0)
                    onDrift({ endpoint: STORE_ITEMS_ENDPOINT, issues: normalized.issues });
                Object.assign(art, normalized.art);
            }
            return { kind: 'ok', data: art };
        },
    };
}
