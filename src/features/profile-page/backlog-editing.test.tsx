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
        expect(screen.queryByRole('button', { name: /^State of/ })).toBeNull();

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
        const fetchMock = stubOwner({ body: overrides({ '1': { state: 'finished', minutesAtSet: 0 } }) });
        const { user } = renderApp('/p/someone');

        const button = await screen.findByRole('button', { name: 'State of Game One: Backlog' });
        await user.click(button);
        expect(screen.getByRole('menuitemradio', { name: 'Automatic (Backlog)' }).getAttribute('aria-checked')).toBe(
            'true'
        );

        await user.click(screen.getByRole('menuitemradio', { name: 'Finished' }));
        expect(fetchMock).toHaveBeenCalledWith('/api/me/backlog/1', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ state: 'finished' }),
        });
        await waitFor(() => expect(within(button.closest('li') as HTMLElement).getByText('Set by hand')).toBeTruthy());
        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect(screen.getByRole('button', { name: 'State of Game One: Finished · Set by hand' })).toBe(button);
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('go back and say so when a change cannot be saved', async () => {
        stubOwner({ status: 503, body: { error: 'database' } });
        const { user } = renderApp('/p/someone');

        await user.click(await screen.findByRole('button', { name: 'State of Game One: Backlog' }));
        await user.click(screen.getByRole('menuitemradio', { name: 'Abandoned' }));

        expect((await screen.findByRole('alert')).textContent).toBe('That change could not be saved. Try again.');
        expect(screen.getByRole('button', { name: 'State of Game One: Backlog' })).toBeTruthy();
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
        await user.click(await screen.findByRole('button', { name: /^State of Game Two:/ }));
        await user.click(screen.getByRole('menuitemradio', { name: 'Abandoned' }));

        const stored = JSON.parse(localStorage.getItem('hoardex:demo-backlog') ?? '{}') as Record<string, unknown>;
        expect(stored['2']).toMatchObject({ state: 'abandoned', minutesAtSet: 600 });

        await user.click(screen.getByRole('button', { name: /^State of Game Two:/ }));
        await user.click(screen.getByRole('menuitemradio', { name: 'Automatic (In progress)' }));
        expect(JSON.parse(localStorage.getItem('hoardex:demo-backlog') ?? '{}')).toEqual({});
    });

    it('reads a stored completed state as finished', async () => {
        localStorage.setItem(
            'hoardex:demo-backlog',
            JSON.stringify({ '2': { state: 'completed', minutesAtSet: 600, setAt: '2026-10-01T00:00:00.000Z' } })
        );
        stubApi({
            '/api/demo/profile': { body: { kind: 'ok', data: PROFILE } },
            '/api/demo/library': { body: { kind: 'ok', data: LIBRARY } },
        });
        renderApp('/demo');

        expect(await screen.findByRole('button', { name: 'State of Game Two: Finished · Set by hand' })).toBeTruthy();
    });
});

describe('moving several games at once', () => {
    it('is only for whoever can edit', async () => {
        stubApi(PAGE);
        renderApp('/p/someone');

        await card('Game Two');
        expect(screen.queryByRole('button', { name: 'Select' })).toBeNull();
    });

    it('sends the owner’s selection in one request and keeps the server’s answer', async () => {
        const answers = {
            ...PAGE,
            '/api/me': { body: { user: { steamId: ID } } },
            '/api/me/backlog': { body: overrides({}) },
        };
        const fetchMock = stubApi(answers);
        const { user } = renderApp('/p/someone');

        await user.click(await screen.findByRole('button', { name: 'Select' }));
        expect(screen.getByRole('button', { name: 'Select' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.queryByRole('button', { name: /^State of/ })).toBeNull();
        await user.click(screen.getByRole('checkbox', { name: 'Select Game One' }));
        await user.click(screen.getByRole('checkbox', { name: 'Select Game Two' }));
        expect(screen.getByText('2 games selected')).toBeTruthy();

        answers['/api/me/backlog'] = {
            body: overrides({
                '1': { state: 'abandoned', minutesAtSet: 0 },
                '2': { state: 'abandoned', minutesAtSet: 600 },
            }),
        };
        await user.selectOptions(screen.getByRole('combobox', { name: 'Move to' }), 'Abandoned');
        await user.click(screen.getByRole('button', { name: 'Move' }));

        expect(fetchMock).toHaveBeenCalledWith('/api/me/backlog', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ appids: ['1', '2'], state: 'abandoned' }),
        });
        const one = await card('Game One');
        await waitFor(() => expect(within(one).getByText('Abandoned')).toBeTruthy());
        expect(within(await card('Game Two')).getByText('Abandoned')).toBeTruthy();
        expect(screen.getByText('No games selected')).toBeTruthy();
        expect(screen.getByRole('checkbox', { name: 'Select Game One' })).toHaveProperty('checked', false);
    });

    it('selects everything the filters show, clears it, and ends with Escape', async () => {
        stubApi({
            '/api/demo/profile': { body: { kind: 'ok', data: PROFILE } },
            '/api/demo/library': { body: { kind: 'ok', data: LIBRARY } },
        });
        const { user } = renderApp('/demo?state=untouched');

        await user.click(await screen.findByRole('button', { name: 'Select' }));
        await user.click(screen.getByRole('button', { name: 'Select all (1)' }));
        expect(screen.getByRole('checkbox', { name: 'Select Game One' })).toHaveProperty('checked', true);
        expect(screen.getByText('1 game selected')).toBeTruthy();

        await user.click(screen.getByRole('button', { name: 'Clear selection' }));
        expect(screen.getByText('No games selected')).toBeTruthy();

        await user.keyboard('{Escape}');
        expect(screen.queryByRole('checkbox')).toBeNull();
        expect(screen.queryByRole('region', { name: 'Selected games' })).toBeNull();
    });

    it('moves the demo’s selection back to automatic, keeping games already in that state as they were', async () => {
        localStorage.setItem(
            'hoardex:demo-backlog',
            JSON.stringify({ '2': { state: 'finished', minutesAtSet: 500, setAt: '2026-10-01T00:00:00.000Z' } })
        );
        stubApi({
            '/api/demo/profile': { body: { kind: 'ok', data: PROFILE } },
            '/api/demo/library': { body: { kind: 'ok', data: LIBRARY } },
        });
        const { user } = renderApp('/demo');

        await user.click(await screen.findByRole('button', { name: 'Select' }));
        await user.click(screen.getByRole('button', { name: 'Select all (2)' }));
        await user.selectOptions(screen.getByRole('combobox', { name: 'Move to' }), 'Finished');
        await user.click(screen.getByRole('button', { name: 'Move' }));

        const stored = () =>
            JSON.parse(localStorage.getItem('hoardex:demo-backlog') ?? '{}') as Record<string, unknown>;
        expect(stored()).toMatchObject({
            '1': { state: 'finished', minutesAtSet: 0 },
            '2': { state: 'finished', minutesAtSet: 500, setAt: '2026-10-01T00:00:00.000Z' },
        });

        await user.click(screen.getByRole('checkbox', { name: 'Select Game Two' }));
        await user.selectOptions(screen.getByRole('combobox', { name: 'Move to' }), 'Automatic');
        await user.click(screen.getByRole('button', { name: 'Move' }));
        expect(Object.keys(stored())).toEqual(['1']);
    });

    it('does nothing until a state is picked', async () => {
        stubApi({
            '/api/demo/profile': { body: { kind: 'ok', data: PROFILE } },
            '/api/demo/library': { body: { kind: 'ok', data: LIBRARY } },
        });
        const { user } = renderApp('/demo');

        await user.click(await screen.findByRole('button', { name: 'Select' }));
        await user.click(screen.getByRole('checkbox', { name: 'Select Game One' }));
        const move = screen.getByRole('button', { name: 'Move' });
        expect(move.getAttribute('aria-disabled')).toBe('true');
        await user.click(move);
        expect(localStorage.getItem('hoardex:demo-backlog')).toBeNull();
    });
});
