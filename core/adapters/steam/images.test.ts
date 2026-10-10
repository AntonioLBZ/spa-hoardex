import { describe, expect, it } from 'vitest';
import { steamAssetUrl, steamCoverUrls } from './images.js';

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

describe('steamAssetUrl', () => {
    const FORMAT = 'steam/apps/3527290/${FILENAME}?t=1790591892';
    const HASHED = '480bd879ac737921bfa2529a6fea15961267ad21/library_600x900.jpg';

    it('builds the shared store URL for a hashed or a plain file, keeping the stamp', () => {
        expect(steamAssetUrl('3527290', FORMAT, HASHED)).toBe(
            `https://shared.steamstatic.com/store_item_assets/steam/apps/3527290/${HASHED}?t=1790591892`
        );
        expect(steamAssetUrl('620', 'steam/apps/620/${FILENAME}', 'header.jpg')).toBe(
            'https://shared.steamstatic.com/store_item_assets/steam/apps/620/header.jpg'
        );
    });

    it('rejects a missing part, another appid, another host or a path that climbs out', () => {
        expect(steamAssetUrl('3527290', undefined, HASHED)).toBeUndefined();
        expect(steamAssetUrl('3527290', FORMAT, undefined)).toBeUndefined();
        expect(steamAssetUrl('620', FORMAT, HASHED)).toBeUndefined();
        expect(steamAssetUrl('3527290', 'https://evil.example/${FILENAME}', HASHED)).toBeUndefined();
        expect(steamAssetUrl('3527290', FORMAT, '../../header.jpg')).toBeUndefined();
        expect(steamAssetUrl('3527290', FORMAT, 'a/b/header.jpg')).toBeUndefined();
        expect(steamAssetUrl('3527290', FORMAT, 'header.svg')).toBeUndefined();
    });
});
