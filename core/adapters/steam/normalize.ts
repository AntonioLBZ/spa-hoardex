import type { Game, PlatformPlaytime, Profile, ProfileVisibility } from '../../domain/index.js';
import { capIssues, describeIssues } from './drift.js';
import { rawGameSchema, type RawGame, type RawPlayer } from './schemas.js';

const GAME_ICON_BASE = 'https://media.steampowered.com/steamcommunity/public/images/apps';
const ICON_HASH = /^[0-9A-Za-z]+$/;

// Steam's `communityvisibilitystate`: 3 public, 2 friends only, 1 private. Any other or missing value maps to
// 'private': when unsure, the conservative reading is "do not show".
export function toVisibility(state: number | undefined): ProfileVisibility {
    switch (state) {
        case 3:
            return 'public';
        case 2:
            return 'friends';
        default:
            return 'private';
    }
}

// Undefined for missing or blank strings, so the fallbacks below also cover `""`
function present(value: string | undefined): string | undefined {
    return value !== undefined && value.trim() !== '' ? value : undefined;
}

// Null for missing, zero (Steam's "never") or out-of-range values
export function unixToIso(seconds: number | undefined): string | null {
    if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return null;
    const date = new Date(seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Drops realname, country, avatar hashes and clan id on purpose (Profile only keeps what the UI shows)
export function normalizePlayer(raw: RawPlayer): Profile {
    return {
        id: { source: 'steam', externalId: raw.steamid },
        displayName: present(raw.personaname) ?? raw.steamid,
        avatarUrl: present(raw.avatarfull) ?? present(raw.avatarmedium) ?? present(raw.avatar) ?? '',
        profileUrl: present(raw.profileurl) ?? `https://steamcommunity.com/profiles/${raw.steamid}/`,
        visibility: toVisibility(raw.communityvisibilitystate),
        createdAt: unixToIso(raw.timecreated),
    };
}

function platformPlaytime(raw: RawGame): PlatformPlaytime | null {
    const parts = [
        raw.playtime_windows_forever,
        raw.playtime_mac_forever,
        raw.playtime_linux_forever,
        raw.playtime_deck_forever,
        raw.playtime_disconnected,
    ];
    if (parts.every((minutes) => minutes === undefined)) return null;
    return {
        windowsMinutes: raw.playtime_windows_forever ?? 0,
        macMinutes: raw.playtime_mac_forever ?? 0,
        linuxMinutes: raw.playtime_linux_forever ?? 0,
        deckMinutes: raw.playtime_deck_forever ?? 0,
        disconnectedMinutes: raw.playtime_disconnected ?? 0,
        approximate: true,
    };
}

// `playtime_forever` is the source of truth even when the platform split does not add up to it
export function normalizeGame(raw: RawGame): Game {
    const appid = String(raw.appid);
    const iconHash = raw.img_icon_url;
    return {
        id: { source: 'steam', externalId: appid },
        name: present(raw.name) ?? `App ${appid}`,
        iconUrl:
            iconHash !== undefined && ICON_HASH.test(iconHash) ? `${GAME_ICON_BASE}/${appid}/${iconHash}.jpg` : null,
        hasVisibleStats: raw.has_community_visible_stats === true,
        playtime: {
            totalMinutes: raw.playtime_forever ?? 0,
            recentMinutes: raw.playtime_2weeks ?? 0,
            lastPlayedAt: unixToIso(raw.rtime_last_played),
            platforms: platformPlaytime(raw),
        },
    };
}

export interface NormalizedGames {
    games: Game[];
    // Zod paths and codes of the entries that were skipped; never values
    issues: string[];
}

// Validates entry by entry: a malformed game is skipped and described in `issues`, the rest still load
export function normalizeOwnedGames(entries: readonly unknown[]): NormalizedGames {
    const games: Game[] = [];
    const issues: string[] = [];
    entries.forEach((entry, index) => {
        const parsed = rawGameSchema.safeParse(entry);
        if (parsed.success) games.push(normalizeGame(parsed.data));
        else issues.push(...describeIssues(parsed.error, ['games', index]));
    });
    return { games, issues: capIssues(issues) };
}
