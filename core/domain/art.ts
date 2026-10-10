// Store images for one game, when the store lists them; absent fields have no image
export interface GameArt {
    // Portrait capsule
    cover?: string;
    // Landscape header
    header?: string;
}

// Most games asked for in one art request
export const ART_BATCH_SIZE = 24;
