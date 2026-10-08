import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Library, Profile } from '@core/domain';
import { renderApp, stubApi } from '@/lib/test/render-app';

const PROFILE_PATH = '/api/profile/someone';
const LIBRARY_PATH = '/api/library/someone';
const REFRESH_PATH = '/api/refresh/someone';
const COOLDOWNS_KEY = 'hoardex:refresh-cooldowns';

// The cooldown lives in memory for the whole test file, so each test gets its own account
let sequence = 0;

function account(gameCount: number, ageMinutes = 5) {
    const id = { source: 'steam' as const, externalId: `7656119800000${String(++sequence).padStart(4, '0')}` };
    const profile: Profile = {
        id,
        displayName: 'Test Person',
        avatarUrl: 'https://example.invalid/avatar.jpg',
        profileUrl: 'https://example.invalid/profile',
        visibility: 'public',
        createdAt: null,
    };
    const library = (count: number): Library => ({
        owner: id,
        fetchedAt: new Date(Date.now() - ageMinutes * 60_000).toISOString(),
        games: Array.from({ length: count }, (_, index) => ({
            id: { source: 'steam' as const, externalId: String(index + 1) },
            name: `Game ${index + 1}`,
            iconUrl: null,
            hasVisibleStats: false,
            playtime: { totalMinutes: 0, recentMinutes: 0, lastPlayedAt: null, platforms: null },
        })),
    });
    return { profile, library, initial: library(gameCount) };
}

function refreshed(profile: Profile, library: Library) {
    return {
        kind: 'refreshed',
        cooldownSeconds: 600,
        profile: { kind: 'ok', data: profile },
        library: { kind: 'ok', data: library },
    };
}

function stubProfilePage(initial: ReturnType<typeof account>, refresh?: { status?: number; body: unknown }) {
    return stubApi({
        [PROFILE_PATH]: { body: { kind: 'ok', data: initial.profile } },
        [LIBRARY_PATH]: { body: { kind: 'ok', data: initial.initial } },
        ...(refresh === undefined ? {} : { [REFRESH_PATH]: refresh }),
    });
}

const posts = (fetchMock: ReturnType<typeof stubApi>) =>
    fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').map(([input]) => String(input));

const refreshButton = (name = 'Refresh') => screen.findByRole('button', { name });

beforeEach(() => localStorage.clear());
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('refresh control', () => {
    it('is offered for a Steam profile, saying how old the data is', async () => {
        stubProfilePage(account(2, 5));
        renderApp('/p/someone');

        const button = await refreshButton();
        expect(button.getAttribute('aria-disabled')).toBe('false');
        expect(await screen.findByText('Updated 5 minutes ago')).toBeTruthy();
    });

    it('is not offered in the demo', async () => {
        const demo = account(2);
        stubApi({
            '/api/demo/profile': { body: { kind: 'ok', data: demo.profile } },
            '/api/demo/library': { body: { kind: 'ok', data: demo.initial } },
        });
        renderApp('/demo');

        await screen.findByText('Hours played');
        expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
    });

    it('is not offered while the library is locked', async () => {
        stubApi({
            [PROFILE_PATH]: { body: { kind: 'ok', data: account(0).profile } },
            [LIBRARY_PATH]: { body: { kind: 'libraryPrivate' } },
        });
        renderApp('/p/someone');

        await screen.findByText('The game library is private');
        expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
    });

    it('posts once, swaps in the fresh library without asking again, and starts the cooldown', async () => {
        const data = account(2);
        const fetchMock = stubProfilePage(data, { body: refreshed(data.profile, data.library(3)) });
        const { user } = renderApp('/p/someone');
        await screen.findByText('Showing 2 of 2 games');

        await user.click(await refreshButton());

        expect(await screen.findByText('Showing 3 of 3 games')).toBeTruthy();
        expect(await screen.findByText('Library updated.')).toBeTruthy();
        expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
            PROFILE_PATH,
            LIBRARY_PATH,
            REFRESH_PATH,
        ]);
        expect(posts(fetchMock)).toEqual([REFRESH_PATH]);

        const button = screen.getByRole('button', { name: 'Refresh' });
        expect(button.getAttribute('aria-disabled')).toBe('true');
        expect(screen.getByText(/Available again in 10 minutes/)).toBeTruthy();
        expect(button.getAttribute('aria-describedby')).toBe(screen.getByText(/Available again/).id);

        await user.click(button);
        expect(posts(fetchMock)).toHaveLength(1);
    });

    it('refreshes again once the cooldown has passed, and starts a new one', async () => {
        vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
        const data = account(2);
        const fetchMock = stubProfilePage(data, { body: refreshed(data.profile, data.library(3)) });
        const { user } = renderApp('/p/someone');
        await screen.findByText('Showing 2 of 2 games');

        await user.click(await refreshButton());
        await screen.findByText('Library updated.');
        expect(screen.getByRole('button', { name: 'Refresh' }).getAttribute('aria-disabled')).toBe('true');

        await act(async () => vi.advanceTimersByTime(10 * 60_000 + 10_000));
        const button = screen.getByRole('button', { name: 'Refresh' });
        expect(button.getAttribute('aria-disabled')).toBe('false');
        expect(screen.queryByText(/Available again/)).toBeNull();

        await user.click(button);
        await waitFor(() => expect(posts(fetchMock)).toHaveLength(2));
        expect(await screen.findByText(/Available again in 10 minutes/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Refresh' }).getAttribute('aria-disabled')).toBe('true');
    });

    it('keeps the cooldown across a reload, so the button is disabled before any click', async () => {
        const data = account(2);
        const id = data.profile.id.externalId;
        localStorage.setItem(COOLDOWNS_KEY, JSON.stringify({ [id]: Date.now() + 5 * 60_000 }));
        const fetchMock = stubProfilePage(data, { body: refreshed(data.profile, data.library(3)) });
        const { user } = renderApp('/p/someone');

        const button = await refreshButton();
        expect(button.getAttribute('aria-disabled')).toBe('true');
        expect(screen.getByText(/Available again in 5 minutes/)).toBeTruthy();
        await user.click(button);
        expect(posts(fetchMock)).toHaveLength(0);
    });

    it('stores the cooldown it starts, dropping the ones that have ended', async () => {
        const data = account(2);
        const id = data.profile.id.externalId;
        localStorage.setItem(COOLDOWNS_KEY, JSON.stringify({ old: Date.now() - 1000 }));
        stubProfilePage(data, { body: refreshed(data.profile, data.library(3)) });
        const { user } = renderApp('/p/someone');

        await user.click(await refreshButton());
        await screen.findByText('Library updated.');

        const stored = JSON.parse(localStorage.getItem(COOLDOWNS_KEY) ?? '{}') as Record<string, number>;
        expect(Object.keys(stored)).toEqual([id]);
        expect(stored[id]).toBeGreaterThan(Date.now() + 9 * 60_000);
    });

    it.each([
        ['expired', (id: string) => JSON.stringify({ [id]: Date.now() - 1000 })],
        ['unreadable', () => 'not json'],
        ['of the wrong shape', () => JSON.stringify([1, 2])],
    ])('ignores a stored cooldown that is %s', async (_name, stored) => {
        const data = account(2);
        localStorage.setItem(COOLDOWNS_KEY, stored(data.profile.id.externalId));
        stubProfilePage(data);
        renderApp('/p/someone');

        expect((await refreshButton()).getAttribute('aria-disabled')).toBe('false');
    });

    it('tells that someone refreshed it a moment ago when the server says to wait', async () => {
        const data = account(2);
        stubProfilePage(data, { status: 429, body: { error: 'cooldown', retryAfterSeconds: 412 } });
        const { user } = renderApp('/p/someone');

        await user.click(await refreshButton());

        expect(await screen.findByText('Updated recently. You can refresh again in 7 minutes.')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Refresh' }).getAttribute('aria-disabled')).toBe('true');
        expect(screen.getByText('Showing 2 of 2 games')).toBeTruthy();
    });

    it('says Steam is busy when it throttles, and waits a minute', async () => {
        stubProfilePage(account(2), { status: 503, body: { error: 'rateLimited', retryAfterSeconds: 60 } });
        const { user } = renderApp('/p/someone');

        await user.click(await refreshButton());

        expect(await screen.findByText('Steam is busy. Try again in a minute.')).toBeTruthy();
        expect(screen.getByText(/Available again in 1 minute/)).toBeTruthy();
    });

    it('lets the visitor try again after a failure', async () => {
        const fetchMock = stubProfilePage(account(2), { status: 502, body: { error: 'upstream' } });
        const { user } = renderApp('/p/someone');

        await user.click(await refreshButton());

        expect(await screen.findByText('Could not refresh. Try again in a moment.')).toBeTruthy();
        const button = screen.getByRole('button', { name: 'Refresh' });
        expect(button.getAttribute('aria-disabled')).toBe('false');
        await user.click(button);
        await waitFor(() => expect(posts(fetchMock)).toHaveLength(2));
    });

    it('is translated', async () => {
        localStorage.setItem('hoardex:locale', 'es');
        stubProfilePage(account(2), { status: 429, body: { error: 'cooldown', retryAfterSeconds: 412 } });
        const { user } = renderApp('/p/someone');

        await user.click(await refreshButton('Actualizar'));

        expect(
            await screen.findByText('Se actualizó hace poco. Podrás volver a actualizar en 7 minutos.')
        ).toBeTruthy();
        expect(screen.getByText(/Actualizado hace 5 minutos/)).toBeTruthy();
    });

    it('speaks only when the outcome changes, not on every tick', async () => {
        const data = account(2);
        stubProfilePage(data, { body: refreshed(data.profile, data.library(2)) });
        const { user } = renderApp('/p/someone');
        await screen.findByText('Showing 2 of 2 games');

        await user.click(await refreshButton());

        const notice = await screen.findByText('Library updated.');
        expect(notice.getAttribute('role')).toBe('status');
        expect(within(notice.parentElement as HTMLElement).getAllByRole('status')).toEqual([notice]);
    });
});
