import { describe, expect, it } from 'vitest';

import { steamPrivacySettingsUrl, steamProfileLink } from './steam-links';

describe('steamPrivacySettingsUrl', () => {
    it('uses /id/ for a custom name', () => {
        expect(steamPrivacySettingsUrl('someone')).toBe('https://steamcommunity.com/id/someone/edit/settings');
    });

    it('uses /profiles/ for a SteamID64', () => {
        expect(steamPrivacySettingsUrl('76561198000000001')).toBe(
            'https://steamcommunity.com/profiles/76561198000000001/edit/settings'
        );
    });

    it('reads the profile out of whatever the route holds', () => {
        expect(steamPrivacySettingsUrl('https://steamcommunity.com/id/Someone/')).toBe(
            'https://steamcommunity.com/id/Someone/edit/settings'
        );
        expect(steamPrivacySettingsUrl('[U:1:39734273]')).toMatch(/^https:\/\/steamcommunity\.com\/profiles\/\d{17}\//);
    });

    it('gives no link for something that is not a profile', () => {
        expect(steamPrivacySettingsUrl('')).toBeNull();
        expect(steamPrivacySettingsUrl('a b/../c')).toBeNull();
    });
});

describe('steamProfileLink', () => {
    it('keeps a profile on Steam’s community site', () => {
        expect(steamProfileLink('https://steamcommunity.com/id/someone/')).toBe(
            'https://steamcommunity.com/id/someone/'
        );
        expect(steamProfileLink('https://steamcommunity.com/profiles/76561198000000001/')).toBe(
            'https://steamcommunity.com/profiles/76561198000000001/'
        );
    });

    it('gives no link anywhere else', () => {
        expect(steamProfileLink('http://steamcommunity.com/id/someone/')).toBeNull();
        expect(steamProfileLink('https://steamcommunity.com.evil.example/id/someone/')).toBeNull();
        expect(steamProfileLink('javascript:alert(1)')).toBeNull();
        expect(steamProfileLink('/demo')).toBeNull();
    });
});
