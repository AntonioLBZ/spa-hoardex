import { parseProfileInput } from '../../core/adapters/steam/profile-input';

// Canonical route param for whatever the visitor typed; null when it is not a profile
export function toProfileSlug(raw: string): string | null {
    const parsed = parseProfileInput(raw);
    switch (parsed.kind) {
        case 'steamid64':
            return parsed.steamid;
        case 'vanity':
            return parsed.vanity.toLowerCase();
        default:
            return null;
    }
}
