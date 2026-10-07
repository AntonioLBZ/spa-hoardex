import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ZodType } from 'zod';
import { describe, expect, it } from 'vitest';
import { loadFixture } from '../../../fixtures/load.js';
import { describeIssues } from './drift.js';
import { normalizeOwnedGames, normalizePlayer } from './normalize.js';
import {
    ownedGamesResponseSchema,
    playerSummariesResponseSchema,
    rawGameSchema,
    rawPlayerSchema,
    resolveVanityResponseSchema,
} from './schemas.js';
import { fakeSteamId } from './test-utils.js';

const SCHEMAS: Record<string, ZodType> = {
    ResolveVanityURL: resolveVanityResponseSchema,
    GetPlayerSummaries: playerSummariesResponseSchema,
    GetOwnedGames: ownedGamesResponseSchema,
};

const FIXTURE_NAMES = readdirSync(fileURLToPath(new URL('../../../fixtures/steam/', import.meta.url)))
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.slice(0, -'.json'.length))
    .filter((name) => (name.split('.')[0] ?? '') in SCHEMAS)
    .sort();

describe('contract: every fixture parses with its schema', () => {
    it('covers the phase 1 fixtures', () => {
        expect(FIXTURE_NAMES).toHaveLength(10);
    });

    it.each(FIXTURE_NAMES)('%s', (name) => {
        const schema = SCHEMAS[name.split('.')[0] ?? '']!;
        const result = schema.safeParse(loadFixture(name).body);
        expect(result.success ? [] : describeIssues(result.error)).toEqual([]);
    });

    it('normalizes every game and player of the fixtures without drift', () => {
        const games = (loadFixture('GetOwnedGames.library').body as { response: { games: unknown[] } }).response.games;
        expect(normalizeOwnedGames(games).issues).toEqual([]);
        for (const name of ['public', 'friends', 'private']) {
            const body = loadFixture(`GetPlayerSummaries.${name}`).body;
            const parsed = playerSummariesResponseSchema.parse(body);
            expect(parsed.response.players).toHaveLength(1);
            for (const player of parsed.response.players ?? []) {
                expect(normalizePlayer(player).id.externalId).toBe(player.steamid);
            }
        }
    });
});

describe('resolveVanityResponseSchema', () => {
    it('reads success and steamid', () => {
        const parsed = resolveVanityResponseSchema.parse({ response: { success: 1, steamid: fakeSteamId(1) } });
        expect(parsed.response).toEqual({ success: 1, steamid: fakeSteamId(1) });
    });

    it('turns a success that is not a number into undefined instead of failing', () => {
        const parsed = resolveVanityResponseSchema.parse({ response: { success: 'yes' } });
        expect(parsed.response.success).toBeUndefined();
    });

    it('needs the response envelope', () => {
        expect(resolveVanityResponseSchema.safeParse({}).success).toBe(false);
        expect(resolveVanityResponseSchema.safeParse(null).success).toBe(false);
        expect(resolveVanityResponseSchema.safeParse('<html>').success).toBe(false);
    });
});

describe('rawPlayerSchema', () => {
    it('needs only the steamid and keeps unknown fields out of the way', () => {
        expect(rawPlayerSchema.safeParse({ steamid: fakeSteamId(1), future: { nested: true } }).success).toBe(true);
        expect(rawPlayerSchema.safeParse({ personaname: 'x' }).success).toBe(false);
    });

    it('turns a visibility that is not a number into undefined instead of failing', () => {
        const parsed = rawPlayerSchema.parse({ steamid: fakeSteamId(1), communityvisibilitystate: '3' });
        expect(parsed.communityvisibilitystate).toBeUndefined();
    });
});

describe('rawGameSchema', () => {
    it('needs only a non-negative integer appid', () => {
        expect(rawGameSchema.safeParse({ appid: 10 }).success).toBe(true);
        for (const appid of ['10', -1, 1.5, null, undefined]) {
            expect(rawGameSchema.safeParse({ appid }).success).toBe(false);
        }
    });

    it('rejects fields of the wrong type but accepts absent ones', () => {
        expect(rawGameSchema.safeParse({ appid: 1, has_community_visible_stats: 'true' }).success).toBe(false);
        expect(rawGameSchema.safeParse({ appid: 1, name: 5 }).success).toBe(false);
        expect(rawGameSchema.safeParse({ appid: 1 }).success).toBe(true);
    });
});

describe('ownedGamesResponseSchema', () => {
    it('accepts the private shape (empty response) and the empty-library shape', () => {
        expect(ownedGamesResponseSchema.safeParse({ response: {} }).success).toBe(true);
        expect(ownedGamesResponseSchema.safeParse({ response: { game_count: 0 } }).success).toBe(true);
    });

    it('leaves entry validation to the normalizer', () => {
        expect(ownedGamesResponseSchema.safeParse({ response: { games: [null, 1, 'x'] } }).success).toBe(true);
    });

    it('rejects a games list that is not a list or a missing envelope', () => {
        expect(ownedGamesResponseSchema.safeParse({ response: { games: {} } }).success).toBe(false);
        expect(ownedGamesResponseSchema.safeParse({}).success).toBe(false);
    });
});
