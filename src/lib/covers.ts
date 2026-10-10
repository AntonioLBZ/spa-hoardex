import { steamCoverUrls } from '@core/adapters/steam/images';
import type { EntityId, GameArt } from '@core/domain';

export interface CoverSource {
    url: string;
    // A header, shown whole instead of cropped
    landscape: boolean;
}

// Image candidates for a game, best first; empty when the store has no public images.
// With the store's own paths (art), those go first and the guessed header stays as the last try
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
