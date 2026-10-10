import type { Game, GameArt, PlatformPlaytime, Profile, ProfileVisibility } from '../../domain/index.js';
import { capIssues, describeIssues } from './drift.js';
import { steamAssetUrl } from './images.js';
import { rawGameSchema, rawStoreItemSchema, type RawGame, type RawPlayer } from './schemas.js';

const GAME_ICON_BASE = 'https://media.steampowered.com/steamcommunity/public/images/apps';
const ICON_HASH = /^[0-9A-Za-z]+$/;

// communityvisibilitystate: 3 public, 2 friends, 1 private; anything else is private
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

// Undefined for missing or blank strings
function present(value: string | undefined): string | undefined {
    return value !== undefined && value.trim() !== '' ? value : undefined;
}

// Null for missing, zero ("never") or out-of-range values
export function unixToIso(seconds: number | undefined): string | null {
    if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return null;
    const date = new Date(seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Drops realname, country, avatar hashes and clan id on purpose
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

// playtime_forever is the source of truth over the platform split
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
    // Zod paths and codes of the skipped entries; never values
    issues: string[];
}

// Skips malformed games and reports them in issues
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

export interface NormalizedArt {
    // By appid; a game Steam lists without usable images maps to an empty object
    art: Record<string, GameArt>;
    issues: string[];
}

// Keeps only the asked appids and the asset paths that fit the known shape
export function normalizeStoreItems(entries: readonly unknown[], asked: readonly string[]): NormalizedArt {
    const wanted = new Set(asked);
    const art: Record<string, GameArt> = {};
    const issues: string[] = [];
    entries.forEach((entry, index) => {
        const parsed = rawStoreItemSchema.safeParse(entry);
        if (!parsed.success) {
            issues.push(...describeIssues(parsed.error, ['store_items', index]));
            return;
        }
        const appid = String(parsed.data.appid);
        if (!wanted.has(appid)) return;
        const assets = parsed.data.assets;
        const cover = steamAssetUrl(appid, assets?.asset_url_format, assets?.library_capsule);
        const header = steamAssetUrl(appid, assets?.asset_url_format, assets?.header);
        art[appid] = { ...(cover === undefined ? {} : { cover }), ...(header === undefined ? {} : { header }) };
    });
    return { art, issues: capIssues(issues) };
}
