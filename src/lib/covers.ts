import { steamCoverUrls } from '@core/adapters/steam/images';
import type { EntityId, GameArt } from '@core/domain';

export interface CoverSource {
    url: string;
    // A header, shown whole instead of cropped
    landscape: boolean;
}

// Image candidates, best first (the store's own paths, then the guessed header); empty without public images
export function coverSources(id: EntityId, art?: GameArt | null): CoverSource[] {
    switch (id.source) {
        case 'steam': {
            const [capsule, header] = steamCoverUrls(id.externalId);
            if (capsule === undefined || header === undefined) return [];
            if (art === undefined) {
                return [
                    { url: capsule, landscape: false },
                    { url: header, landscape: true },
                ];
            }
            const sources: CoverSource[] = [];
            if (art?.cover !== undefined) sources.push({ url: art.cover, landscape: false });
            if (art?.header !== undefined) sources.push({ url: art.header, landscape: true });
            sources.push({ url: header, landscape: true });
            return sources;
        }
    }
}
