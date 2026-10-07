import { steamPrivacySettingsUrl } from '@/lib/steam-links';
import type { ProfileSource } from './profile-page';

// The demo has no Steam profile to point to
export function settingsUrlFor(source: ProfileSource): string | null {
    return source.kind === 'steam' ? steamPrivacySettingsUrl(source.input) : null;
}
