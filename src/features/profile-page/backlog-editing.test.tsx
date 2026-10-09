import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Library, Profile } from '@core/domain';
import { renderApp, stubApi } from '@/lib/test/render-app';
import { resetDemoBacklog } from './demo-backlog';

const ID = '76561198000000077';
const DAY_MS = 86_400_000;

const PROFILE: Profile = {
    id: { source: 'steam', externalId: ID },
    displayName: 'Test Person',
    avatarUrl: 'https://example.invalid/avatar.jpg',
    profileUrl: 'https://example.invalid/profile',
    visibility: 'public',
    createdAt: null,
};

function game(appid: string, name: string, totalMinutes: number, daysAgo: number | null) {
    return {
        id: { source: 'steam' as const, externalId: appid },
        name,
        iconUrl: null,
        hasVisibleStats: false,
        playtime: {
            totalMinutes,
            recentMinutes: 0,
            lastPlayedAt: daysAgo === null ? null : new Date(Date.now() - daysAgo * DAY_MS).toISOString(),
            platforms: null,
        },
    };
}

const LIBRARY: Library = {
    owner: PROFILE.id,
    fetchedAt: new Date().toISOString(),
    games: [game('1', 'Game One', 0, null), game('2', 'Game Two', 600, 10)],
};

const PAGE = {
    '/api/profile/someone': { body: { kind: 'ok', data: PROFILE } },
    '/api/library/someone': { body: { kind: 'ok', data: LIBRARY } },
};

const overrides = (entries: Record<string, { state: string; minutesAtSet: number }>) => ({
    kind: 'ok',
    data: {
        overrides: Object.fromEntries(
            Object.entries(entries).map(([appid, entry]) => [appid, { ...entry, setAt: '2026-10-01T00:00:00.000Z' }])
        ),
    },
});

const card = async (name: string) =>
    (await screen.findAllByText(name)).map((text) => text.closest('li.game-card')).find(Boolean) as HTMLElement;

beforeEach(() => {
    localStorage.clear();
    resetDemoBacklog();
});
afterEach(() => vi.unstubAllGlobals());

describe('manual states for a visitor', () => {
    it('are shown read only, marked as set by hand, and counted in the charts', async () => {
        stubApi({
            ...PAGE,
            '/api/backlog/someone': { body: overrides({ '2': { state: 'abandoned', minutesAtSet: 300 } }) },
        });
        renderApp('/p/someone');

        const two = await card('Game Two');
        await waitFor(() => expect(within(two).getByText('Abandoned')).toBeTruthy());
        expect(within(two).getByText('Set by hand · Played since')).toBeTruthy();
        expect(screen.queryByRole('combobox', { name: /^State of/ })).toBeNull();

        const legend = (await screen.findByRole('heading', { name: 'Backlog states' })).closest('section');
        expect(within(legend as HTMLElement).getByText('Abandoned')).toBeTruthy();
    });

    it('leave Abandoned out of the charts and filters while no game has it', async () => {
        stubApi(PAGE);
        renderApp('/p/someone');

        await card('Game Two');
        expect(screen.queryByText('Abandoned')).toBeNull();
        expect(screen.queryByRole('radio', { name: /^Abandoned/ })).toBeNull();
    });
});

describe('manual states for the owner', () => {
    function stubOwner(put: { status?: number; body?: unknown }) {
        return stubApi({
            ...PAGE,
            '/api/me': { body: { user: { steamId: ID } } },
            '/api/me/backlog': { body: overrides({}) },
            '/api/me/backlog/1': put,
        });
    }

    it('can be changed from the card, and the server’s answer is kept', async () => {
        const fetchMock = stubOwner({ body: overrides({ '1': { state: 'completed', minutesAtSet: 0 } }) });
        const { user } = renderApp('/p/someone');

        const select = await screen.findByRole('combobox', { name: 'State of Game One' });
        expect(select).toHaveProperty('value', '');
        expect(within(select).getByRole('option', { name: 'Untouched · auto' })).toBeTruthy();

        await user.selectOptions(select, 'completed');
        expect(fetchMock).toHaveBeenCalledWith('/api/me/backlog/1', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ state: 'completed' }),
        });
        await waitFor(() => expect(within(select.closest('li') as HTMLElement).getByText('Set by hand')).toBeTruthy());
        expect(select).toHaveProperty('value', 'completed');
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('go back and say so when a change cannot be saved', async () => {
        stubOwner({ status: 503, body: { error: 'database' } });
        const { user } = renderApp('/p/someone');

        const select = await screen.findByRole('combobox', { name: 'State of Game One' });
        await user.selectOptions(select, 'abandoned');

        expect((await screen.findByRole('alert')).textContent).toBe('That change could not be saved. Try again.');
        expect(select).toHaveProperty('value', '');
    });
});

describe('manual states in the demo', () => {
    it('can be changed by anyone and stay in this browser', async () => {
        stubApi({
            '/api/demo/profile': { body: { kind: 'ok', data: PROFILE } },
            '/api/demo/library': { body: { kind: 'ok', data: LIBRARY } },
        });
        const { user } = renderApp('/demo');

        expect((await screen.findByRole('note')).textContent).toContain('changes stay in this browser only');
        await user.selectOptions(await screen.findByRole('combobox', { name: 'State of Game Two' }), 'abandoned');

        const stored = JSON.parse(localStorage.getItem('hoardex:demo-backlog') ?? '{}') as Record<string, unknown>;
        expect(stored['2']).toMatchObject({ state: 'abandoned', minutesAtSet: 600 });

        await user.selectOptions(screen.getByRole('combobox', { name: 'State of Game Two' }), '');
        expect(JSON.parse(localStorage.getItem('hoardex:demo-backlog') ?? '{}')).toEqual({});
    });
});
