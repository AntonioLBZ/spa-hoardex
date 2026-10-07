import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FIXTURE_NOW, loadFixture } from './load.js';

const NAMES = readdirSync(fileURLToPath(new URL('./steam/', import.meta.url)))
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.slice(0, -'.json'.length))
    .sort();

const DAY = 86400;
const NOW = FIXTURE_NOW.getTime() / 1000;

interface RawGame {
    appid: number;
    name: string;
    playtime_forever: number;
    playtime_windows_forever: number;
    playtime_mac_forever: number;
    playtime_linux_forever: number;
    playtime_deck_forever: number;
    playtime_disconnected: number;
    rtime_last_played: number;
    has_community_visible_stats?: boolean;
}

describe('fixtures/steam envelope', () => {
    it('has the fixtures phase 1 needs', () => {
        expect(NAMES).toEqual(
            expect.arrayContaining([
                'ResolveVanityURL.found',
                'ResolveVanityURL.notFound',
                'GetPlayerSummaries.public',
                'GetPlayerSummaries.friends',
                'GetPlayerSummaries.private',
                'GetPlayerSummaries.empty',
                'GetOwnedGames.library',
                'GetOwnedGames.empty',
                'GetOwnedGames.private',
                'GetOwnedGames.rateLimited',
            ])
        );
    });

    it.each(NAMES)('%s is named <Endpoint>.<case> and shaped { status, eresult, body }', (name) => {
        expect(name).toMatch(/^[A-Za-z]+\.[A-Za-z0-9]+$/);
        const fixture = loadFixture(name);
        expect(Object.keys(fixture).sort()).toEqual(['body', 'eresult', 'status']);
        expect(Number.isInteger(fixture.status)).toBe(true);
        expect(fixture.eresult === null || /^\d+$/.test(fixture.eresult)).toBe(true);
        expect(['object', 'string']).toContain(typeof fixture.body);
        expect(fixture.body).not.toBeUndefined();
    });

    it('mirrors the documented rate-limit response', () => {
        expect(loadFixture('GetOwnedGames.rateLimited')).toEqual({
            status: 429,
            eresult: '84',
            body: { response: {} },
        });
    });
});

describe('GetOwnedGames.library', () => {
    const { response } = loadFixture('GetOwnedGames.library').body as {
        response: { game_count: number; games: RawGame[] };
    };
    const games = response.games;
    const ageDays = (game: RawGame) => (NOW - game.rtime_last_played) / DAY;
    const played = games.filter((game) => game.playtime_forever >= 60);

    it('keeps game_count in step with the list, sorted by appid like Steam', () => {
        expect(response.game_count).toBe(games.length);
        expect(games.map((game) => game.appid)).toEqual(games.map((game) => game.appid).sort((a, b) => a - b));
    });

    it('covers every backlog branch relative to FIXTURE_NOW', () => {
        const untouched = games.filter((game) => game.playtime_forever === 0);
        expect(untouched.length).toBeGreaterThan(0);
        expect(untouched.every((game) => game.rtime_last_played === 0)).toBe(true);
        expect(games.some((game) => game.playtime_forever > 0 && game.playtime_forever < 60)).toBe(true);
        expect(games.some((game) => game.playtime_forever === 59)).toBe(true);
        expect(games.some((game) => game.playtime_forever === 60)).toBe(true);
        expect(played.some((game) => ageDays(game) === 10)).toBe(true);
        expect(played.some((game) => ageDays(game) === 120)).toBe(true);
        expect(played.some((game) => ageDays(game) === 400)).toBe(true);
        expect(played.every((game) => game.rtime_last_played > 0 && game.rtime_last_played <= NOW)).toBe(true);
    });

    it('omits has_community_visible_stats instead of sending false', () => {
        expect(games.some((game) => !('has_community_visible_stats' in game))).toBe(true);
        expect(games.some((game) => !('has_community_visible_stats' in game) && game.playtime_forever > 0)).toBe(true);
        expect(games.every((game) => game.has_community_visible_stats !== false)).toBe(true);
    });

    it('has platform splits that miss playtime_forever in both directions', () => {
        const sum = (game: RawGame) =>
            game.playtime_windows_forever +
            game.playtime_mac_forever +
            game.playtime_linux_forever +
            game.playtime_deck_forever +
            game.playtime_disconnected;
        expect(games.some((game) => sum(game) === 0 && game.playtime_forever > 0)).toBe(true);
        expect(games.some((game) => sum(game) > game.playtime_forever)).toBe(true);
        expect(games.some((game) => sum(game) > 0 && sum(game) < game.playtime_forever)).toBe(true);
        expect(games.some((game) => sum(game) === game.playtime_forever && game.playtime_forever > 0)).toBe(true);
    });
});
