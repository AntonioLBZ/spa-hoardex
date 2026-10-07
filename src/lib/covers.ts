import { steamCoverUrls } from '@core/adapters/steam/images';
import type { EntityId } from '@core/domain';

// Image candidates for a game, best first; empty when the store has no public images
export function coverUrls(id: EntityId): string[] {
    switch (id.source) {
        case 'steam':
            return steamCoverUrls(id.externalId);
    }
}
