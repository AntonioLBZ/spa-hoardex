import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { countByState } from '../../backlog/index.js';
import { createSteamAdapter } from './index.js';
import { normalizeOwnedGames } from './normalize.js';
import { ownedGamesResponseSchema, playerSummariesResponseSchema } from './schemas.js';
import { TEST_KEY, collectDrift, createFakeFetch, reply, routes } from './test-utils.js';

const DIR = fileURLToPath(new URL('../../../fixtures/full/spike/public/', import.meta.url));
const OWNED_FILE = `${DIR}GetOwnedGames.json`;
const SUMMARIES_FILE = `${DIR}GetPlayerSummaries.json`;
const available = existsSync(OWNED_FILE) && existsSync(SUMMARIES_FILE);

interface Sample {
    meta: { status: number; eresult: string | null };
    body: unknown;
}

function readSample(file: string): Sample {
    return JSON.parse(readFileSync(file, 'utf8')) as Sample;
}

function sampleReply({ meta, body }: Sample) {
    return () => reply(body, meta);
}

function load() {
    const owned = readSample(OWNED_FILE);
    const summaries = readSample(SUMMARIES_FILE);
    const { game_count: gameCount, games: entries } = ownedGamesResponseSchema.parse(owned.body).response;
    const players = playerSummariesResponseSchema.parse(summaries.body).response.players ?? [];
    return { owned, summaries, gameCount: gameCount ?? -1, entries, steamid: players[0]?.steamid ?? '' };
}

describe.skipIf(!available)('real raw samples (spike 0B, public profile)', () => {
    function setup() {
        const sample = load();
        const fake = createFakeFetch(
            routes({ ownedGames: sampleReply(sample.owned), summaries: sampleReply(sample.summaries) })
        );
        const drift = collectDrift();
        const adapter = createSteamAdapter({
            apiKey: TEST_KEY,
            fetch: fake.fetch,
            onDrift: drift.onDrift,
            now: () => new Date('2026-10-07T12:00:00Z'),
        });
        return { ...sample, adapter, drift };
    }

    it('parses with the schemas and carries a game list that matches game_count', () => {
        const { entries, gameCount } = load();
        expect(entries).toBeDefined();
        expect(entries).toHaveLength(gameCount);
    });

    it('normalizes every game with zero drift', () => {
        const { entries, gameCount } = load();
        const { games, issues } = normalizeOwnedGames(entries ?? []);
        expect(issues).toEqual([]);
        expect(games).toHaveLength(gameCount);
        expect(new Set(games.map((game) => game.id.externalId)).size).toBe(games.length);
        expect(games.every((game) => game.name !== '' && game.playtime.totalMinutes >= 0)).toBe(true);
    });

    it('serves the library through the whole adapter with zero drift reports', async () => {
        const { adapter, drift, steamid, gameCount } = setup();
        const result = await adapter.getLibrary({ source: 'steam', externalId: steamid });
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') return;
        expect(result.data.games).toHaveLength(gameCount);
        expect(drift.reports).toEqual([]);

        const counts = countByState(result.data.games, new Date('2026-10-07T12:00:00Z'));
        expect(Object.values(counts).reduce((total, count) => total + count, 0)).toBe(result.data.games.length);
    });

    it('serves the profile with only the domain fields and none of the personal ones', async () => {
        const { adapter, drift, steamid, summaries } = setup();
        const result = await adapter.resolveProfile(steamid);
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') return;
        expect(Object.keys(result.data).sort()).toEqual([
            'avatarUrl',
            'createdAt',
            'displayName',
            'id',
            'profileUrl',
            'visibility',
        ]);
        expect(['public', 'friends', 'private']).toContain(result.data.visibility);

        const raw = (summaries.body as { response: { players: Record<string, unknown>[] } }).response.players[0]!;
        const text = JSON.stringify(result.data);
        for (const key of ['realname', 'primaryclanid']) {
            const value = raw[key];
            if (typeof value === 'string' && value !== '') expect(text.includes(value)).toBe(false);
        }
        expect(drift.reports).toEqual([]);
    });
});
