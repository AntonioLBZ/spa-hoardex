import type { EntityId } from './id.js';

// Approximate: may not add up to totalMinutes
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
    // ISO 8601; null when never played
    lastPlayedAt: string | null;
    platforms: PlatformPlaytime | null;
}

export interface Game {
    id: EntityId;
    name: string;
    iconUrl: string | null;
    // Steam's has_community_visible_stats; absent means false
    hasVisibleStats: boolean;
    playtime: Playtime;
}

export interface Library {
    owner: EntityId;
    games: Game[];
    // ISO 8601 fetch time
    fetchedAt: string;
}
