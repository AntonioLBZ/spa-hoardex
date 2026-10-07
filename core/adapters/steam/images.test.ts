import { describe, expect, it } from 'vitest';
import { steamCoverUrls } from './images.js';

describe('steamCoverUrls', () => {
    it('lists the portrait capsule before the header', () => {
        expect(steamCoverUrls('1091500')).toEqual([
            'https://cdn.cloudflare.steamstatic.com/steam/apps/1091500/library_600x900.jpg',
            'https://cdn.cloudflare.steamstatic.com/steam/apps/1091500/header.jpg',
        ]);
    });

    it('accepts the largest appid and nothing that is not digits', () => {
        expect(steamCoverUrls('4294967295')).toHaveLength(2);
        expect(steamCoverUrls('')).toEqual([]);
        expect(steamCoverUrls('12/../34')).toEqual([]);
        expect(steamCoverUrls('12345678901')).toEqual([]);
    });
});
