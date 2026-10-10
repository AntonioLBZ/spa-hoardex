import type { EntityId, GameArt, Library, Profile, ProfileAccess, Source } from '../domain/index.js';

// Read by the UI to hide panels that do not apply
export interface AdapterCapabilities {
    achievements: 'none' | 'perGame' | 'perBatch';
    wishlist: boolean;
}

// Images by game externalId; a game the store does not list is absent
export type ArtResult = { kind: 'ok'; data: Record<string, GameArt> } | { kind: 'rateLimited' };

// Parsed visitor input (no network). An alias is a custom profile name, lower-cased
export type ProfileInput = { kind: 'id'; id: EntityId } | { kind: 'alias'; alias: string } | { kind: 'invalid' };

export interface StoreAdapter {
    readonly source: Source;
    readonly capabilities: AdapterCapabilities;
    // Syntax check only
    parseInput(input: string): ProfileInput;
    // Accepts URL, vanity or id; unparsable input is notFound
    resolveProfile(input: string): Promise<ProfileAccess<Profile>>;
    // Alias to account id only, without the profile lookup
    resolveAlias(alias: string): Promise<ProfileAccess<EntityId>>;
    getLibrary(profile: EntityId): Promise<ProfileAccess<Library>>;
    // Store images of some games, by externalId
    getArt(games: readonly string[]): Promise<ArtResult>;
}

// Transport failure, upstream 5xx or a non-JSON body; never an access state
export class UpstreamError extends Error {
    readonly status: number | undefined;

    constructor(message: string, status?: number) {
        super(message);
        this.name = 'UpstreamError';
        this.status = status;
    }
}
