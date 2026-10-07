import { describe, expect, it } from 'vitest';

import { toProfileSlug } from './profile-slug';

describe('toProfileSlug', () => {
    it('lower-cases a custom name', () => {
        expect(toProfileSlug('  SomeName ')).toBe('somename');
    });

    it('keeps a SteamID64', () => {
        expect(toProfileSlug('76561198000000001')).toBe('76561198000000001');
    });

    it('extracts the custom name from a community URL', () => {
        expect(toProfileSlug('https://steamcommunity.com/id/SomeName/')).toBe('somename');
    });

    it('extracts the id from a /profiles/ URL', () => {
        expect(toProfileSlug('steamcommunity.com/profiles/76561198000000001')).toBe('76561198000000001');
    });

    it('rejects anything that is not a profile', () => {
        expect(toProfileSlug('')).toBeNull();
        expect(toProfileSlug('a')).toBeNull();
        expect(toProfileSlug('https://example.com/id/someone')).toBeNull();
    });
});
