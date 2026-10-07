import { z } from 'zod';

// Raw Steam Web API responses (phase 1: profile + library). These types never leave this folder.
// Loose on purpose: unknown fields are ignored and almost everything is optional, so Steam changing a field degrades
// that field instead of breaking the request. Only fields the adapter reads are declared.

// ISteamUser/ResolveVanityURL/v1
export const resolveVanityResponseSchema = z.looseObject({
    response: z.looseObject({
        // 1 found, 42 no match. Anything else (or a non-number) reads as "not found"
        success: z.number().optional().catch(undefined),
        steamid: z.string().optional(),
        message: z.string().optional(),
    }),
});

// ISteamUser/GetPlayerSummaries/v2, one entry of `players`
export const rawPlayerSchema = z.looseObject({
    steamid: z.string(),
    personaname: z.string().optional(),
    profileurl: z.string().optional(),
    avatar: z.string().optional(),
    avatarmedium: z.string().optional(),
    avatarfull: z.string().optional(),
    // 3 public, 2 friends only, 1 private. Unverified for 2 (see ARCHITECTURE.md 5.1); unknown values are mapped later
    communityvisibilitystate: z.number().optional().catch(undefined),
    // Unix seconds; hidden by some profiles
    timecreated: z.number().optional(),
});

export const playerSummariesResponseSchema = z.looseObject({
    response: z.looseObject({
        players: z.array(rawPlayerSchema).optional(),
    }),
});

// IPlayerService/GetOwnedGames/v1 with include_appinfo=1 and include_played_free_games=1, one entry of `games`
export const rawGameSchema = z.looseObject({
    appid: z.number().int().nonnegative(),
    name: z.string().optional(),
    img_icon_url: z.string().optional(),
    // Absent (not false) when the game has no community stats
    has_community_visible_stats: z.boolean().optional(),
    playtime_forever: z.number().optional(),
    playtime_2weeks: z.number().optional(),
    playtime_windows_forever: z.number().optional(),
    playtime_mac_forever: z.number().optional(),
    playtime_linux_forever: z.number().optional(),
    playtime_deck_forever: z.number().optional(),
    playtime_disconnected: z.number().optional(),
    // Unix seconds; 0 when never played
    rtime_last_played: z.number().optional(),
});

export const ownedGamesResponseSchema = z.looseObject({
    response: z.looseObject({
        game_count: z.number().optional(),
        // Entries are validated one by one (see normalizeOwnedGames): a bad game must not drop the whole library
        games: z.array(z.unknown()).optional(),
    }),
});

export type RawResolveVanityResponse = z.infer<typeof resolveVanityResponseSchema>;
export type RawPlayer = z.infer<typeof rawPlayerSchema>;
export type RawPlayerSummariesResponse = z.infer<typeof playerSummariesResponseSchema>;
export type RawGame = z.infer<typeof rawGameSchema>;
export type RawOwnedGamesResponse = z.infer<typeof ownedGamesResponseSchema>;
