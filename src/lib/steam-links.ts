import { parseProfileInput } from '@core/adapters/steam/profile-input';

const COMMUNITY = 'https://steamcommunity.com';

// Owner-only page with "My profile" and "Game details"; null when the input is not a profile
export function steamPrivacySettingsUrl(input: string): string | null {
    const parsed = parseProfileInput(input);
    switch (parsed.kind) {
        case 'steamid64':
            return `${COMMUNITY}/profiles/${parsed.steamid}/edit/settings`;
        case 'vanity':
            return `${COMMUNITY}/id/${parsed.vanity}/edit/settings`;
        default:
            return null;
    }
}

// The profile URL comes from Steam; only a page of Steam's own community becomes a link
export function steamProfileLink(profileUrl: string): string | null {
    try {
        const url = new URL(profileUrl);
        return url.protocol === 'https:' && url.host === 'steamcommunity.com' ? url.href : null;
    } catch {
        return null;
    }
}
