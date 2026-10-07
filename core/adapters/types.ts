import type { EntityId, Library, Profile, ProfileAccess, Source } from '../domain/index.js';

// Read by the UI to hide panels that do not apply
export interface AdapterCapabilities {
    achievements: 'none' | 'perGame' | 'perBatch';
    wishlist: boolean;
}

// Parsed visitor input (no network). An alias is a custom profile name, lower-cased
export type ProfileInput = { kind: 'id'; id: EntityId } | { kind: 'alias'; alias: string } | { kind: 'invalid' };

export interface StoreAdapter {
    readonly source: Source;
    readonly capabilities: AdapterCapabilities;
    // Syntax check only
    parseInput(input: string): ProfileInput;
    // Accepts URL, vanity or id; unparsable input is notFound
    resolveProfile(input: string): Promise<ProfileAccess<Profile>>;
    getLibrary(profile: EntityId): Promise<ProfileAccess<Library>>;
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
