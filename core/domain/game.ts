import type { EntityId } from './id.js';

// Per-platform split is approximate: it does not always add up to `totalMinutes` (the source of truth)
export interface PlatformPlaytime {
    windowsMinutes: number;
    macMinutes: number;
    linuxMinutes: number;
    deckMinutes: number;
    disconnectedMinutes: number;
    approximate: true;
}

export interface Playtime {
    totalMinutes: number;
    // Last two weeks
    recentMinutes: number;
    // ISO 8601; null when the store reports "never" (Steam sends 0)
    lastPlayedAt: string | null;
    platforms: PlatformPlaytime | null;
}

export interface Game {
    id: EntityId;
    name: string;
    iconUrl: string | null;
    // Steam's `has_community_visible_stats`. Absent upstream means false: the game has no stats/achievements to ask for
    hasVisibleStats: boolean;
    playtime: Playtime;
}

export interface Library {
    owner: EntityId;
    games: Game[];
    // ISO 8601, when we fetched it
    fetchedAt: string;
}
