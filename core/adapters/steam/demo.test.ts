import { describe, expect, it, vi } from 'vitest';
import { FAKE_STEAMID_BASE, FAKE_STEAMID_COUNT } from '../../../scripts/lib/anonymize.js';
import { BACKLOG_STATES } from '../../backlog/index.js';
import type { Library } from '../../domain/index.js';
import { summarizeLibrary } from '../../stats/index.js';
import { DEMO_AVATAR_URL, DEMO_STEAMID, createDemoData } from './demo.js';

const NOW = new Date('2026-10-07T12:00:00.000Z');
const YEAR_MS = 365 * 86_400_000;

async function libraryAt(now: Date, onDrift = vi.fn()): Promise<Library> {
    const result = await createDemoData({ now: () => now, onDrift }).getLibrary();
    if (result.kind !== 'ok') throw new Error(`Expected an ok library, got ${result.kind}`);
    return result.data;
}

describe('createDemoData', () => {
    it('answers the profile through the real adapter', async () => {
        const result = await createDemoData({ now: () => NOW }).getProfile();

        expect(result).toMatchObject({
            kind: 'ok',
            data: {
                id: { source: 'steam', externalId: DEMO_STEAMID },
                displayName: 'Demo Hoarder',
                avatarUrl: DEMO_AVATAR_URL,
                visibility: 'public',
            },
        });
    });

    it('uses a fake id and never points at a Steam profile page', async () => {
        const result = await createDemoData({ now: () => NOW }).getProfile();
        const offset = BigInt(DEMO_STEAMID) - FAKE_STEAMID_BASE;

        expect(offset >= 0n && offset < FAKE_STEAMID_COUNT).toBe(true);
        expect(result.kind === 'ok' && result.data.profileUrl).not.toMatch(/steamcommunity\.com/);
    });

    it('builds 96 distinct games with ids far from any real app', async () => {
        const { games } = await libraryAt(NOW);

        expect(games).toHaveLength(96);
        expect(new Set(games.map((game) => game.name)).size).toBe(96);
        expect(new Set(games.map((game) => game.id.externalId)).size).toBe(96);
        expect(games.every((game) => Number(game.id.externalId) >= 4_200_000_000)).toBe(true);
    });

    it('conforms to the Steam schemas, so the adapter reports no drift', async () => {
        const onDrift = vi.fn();
        await libraryAt(NOW, onDrift);

        expect(onDrift).not.toHaveBeenCalled();
    });

    it('is deterministic for a given clock', async () => {
        expect(await libraryAt(NOW)).toEqual(await libraryAt(NOW));
    });

    it('stamps the library with the injected clock', async () => {
        expect((await libraryAt(NOW)).fetchedAt).toBe(NOW.toISOString());
    });

    it('fills every chart the dashboard draws', async () => {
        const summary = summarizeLibrary((await libraryAt(NOW)).games, NOW);

        for (const state of BACKLOG_STATES.filter(
            (candidate) => candidate !== 'completed' && candidate !== 'abandoned'
        )) {
            expect(summary.stateCounts[state]).toBeGreaterThan(0);
        }
        expect(summary.stateCounts.completed).toBe(0);
        expect(summary.stateCounts.abandoned).toBe(0);
        expect(summary.minutesByYear.length).toBeGreaterThanOrEqual(5);
        expect(summary.topGames).toHaveLength(10);
        expect(summary.recentMinutes).toBeGreaterThan(0);
    });

    it('keeps the same picture as the clock moves', async () => {
        const later = new Date(NOW.getTime() + 2 * YEAR_MS);
        const before = summarizeLibrary((await libraryAt(NOW)).games, NOW);
        const after = summarizeLibrary((await libraryAt(later)).games, later);

        expect(after.stateCounts).toEqual(before.stateCounts);
        expect(after.totalMinutes).toBe(before.totalMinutes);
    });
});
