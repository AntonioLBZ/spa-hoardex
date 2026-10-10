import { z } from 'zod';

// Raw Steam responses: loose on purpose, never leave this folder

// ISteamUser/ResolveVanityURL/v1
export const resolveVanityResponseSchema = z.looseObject({
    response: z.looseObject({
        // 1 found, 42 no match; anything else reads as not found
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
    // 3 public, 2 friends, 1 private
    communityvisibilitystate: z.number().optional().catch(undefined),
    // Unix seconds; hidden by some profiles
    timecreated: z.number().optional(),
});

export const playerSummariesResponseSchema = z.looseObject({
    response: z.looseObject({
        players: z.array(rawPlayerSchema).optional(),
    }),
});

// GetOwnedGames/v1 (include_appinfo, include_played_free_games): one entry of `games`
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
        // Entries are validated one by one (see normalizeOwnedGames)
        games: z.array(z.unknown()).optional(),
    }),
});

// IStoreBrowseService/GetItems/v1 (include_assets): one entry of `store_items`
export const rawStoreItemSchema = z.looseObject({
    appid: z.number().int().nonnegative().optional(),
    assets: z
        .looseObject({
            // `steam/apps/<appid>/${FILENAME}?t=<stamp>`
            asset_url_format: z.string().optional(),
            // File names, under a hash folder for recent games
            library_capsule: z.string().optional(),
            header: z.string().optional(),
        })
        .optional(),
});

export const storeItemsResponseSchema = z.looseObject({
    response: z.looseObject({
        // Entries are validated one by one (see normalizeStoreItems)
        store_items: z.array(z.unknown()).optional(),
    }),
});

export type RawResolveVanityResponse = z.infer<typeof resolveVanityResponseSchema>;
export type RawPlayer = z.infer<typeof rawPlayerSchema>;
export type RawPlayerSummariesResponse = z.infer<typeof playerSummariesResponseSchema>;
export type RawGame = z.infer<typeof rawGameSchema>;
export type RawOwnedGamesResponse = z.infer<typeof ownedGamesResponseSchema>;
export type RawStoreItem = z.infer<typeof rawStoreItemSchema>;
export type RawStoreItemsResponse = z.infer<typeof storeItemsResponseSchema>;
