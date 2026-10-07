import type { EntityId } from './id.js';

export type ProfileVisibility = 'public' | 'friends' | 'private';

// Deliberately small: no real name, country or avatar hashes (personal data we have no use for)
export interface Profile {
    id: EntityId;
    displayName: string;
    avatarUrl: string;
    profileUrl: string;
    visibility: ProfileVisibility;
    // ISO 8601, null when the profile hides it
    createdAt: string | null;
}
