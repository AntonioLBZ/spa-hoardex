import type { EntityId, Library, Profile, ProfileAccess, Source } from '../domain/index.js';

// The UI reads these and hides the panels that do not apply, so adding a store does not touch the views
export interface AdapterCapabilities {
    achievements: 'none' | 'perGame' | 'perBatch';
    wishlist: boolean;
}

export interface StoreAdapter {
    readonly source: Source;
    readonly capabilities: AdapterCapabilities;
    // Accepts whatever the visitor typed (URL, vanity or id). Unparsable input resolves to `notFound`
    resolveProfile(input: string): Promise<ProfileAccess<Profile>>;
    getLibrary(profile: EntityId): Promise<ProfileAccess<Library>>;
}

// Transport failure, upstream 5xx or a body that is not JSON. Never used for access states
export class UpstreamError extends Error {
    readonly status: number | undefined;

    constructor(message: string, status?: number) {
        super(message);
        this.name = 'UpstreamError';
        this.status = status;
    }
}
