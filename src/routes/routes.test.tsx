import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Library, Profile } from '../../core/domain';
import { renderApp, stubApi } from '../lib/test/render-app';

const STEAM_ID = '76561198000000001';

const PROFILE: Profile = {
    id: { source: 'steam', externalId: STEAM_ID },
    displayName: 'Test Person',
    avatarUrl: 'https://example.invalid/avatar.jpg',
    profileUrl: 'https://example.invalid/profile',
    visibility: 'public',
    createdAt: null,
};

const LIBRARY: Library = {
    owner: PROFILE.id,
    fetchedAt: '2026-01-01T00:00:00.000Z',
    games: ['1', '2'].map((externalId) => ({
        id: { source: 'steam', externalId },
        name: `Game ${externalId}`,
        iconUrl: null,
        hasVisibleStats: false,
        playtime: { totalMinutes: 0, recentMinutes: 0, lastPlayedAt: null, platforms: null },
    })),
};

const PROFILE_PATH = '/api/profile/someone';
const LIBRARY_PATH = `/api/library/${STEAM_ID}`;

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('entry screen', () => {
    it('explains an input that is not a profile and stays put', async () => {
        const { router, user } = renderApp('/');
        await user.type(await screen.findByLabelText('Steam profile'), 'x');
        await user.click(screen.getByRole('button', { name: 'View library' }));

        expect((await screen.findByRole('alert')).textContent).toMatch(/does not look like a Steam profile/);
        expect(router.state.location.pathname).toBe('/');
    });

    it('submits with Enter', async () => {
        stubApi({ [PROFILE_PATH]: { body: { kind: 'notFound' } } });
        const { router, user } = renderApp('/');
        await user.type(await screen.findByLabelText('Steam profile'), 'someone{Enter}');

        await screen.findByText('Profile not found');
        expect(router.state.location.pathname).toBe('/p/someone');
    });

    it('opens the canonical profile route for a profile URL', async () => {
        stubApi({ [PROFILE_PATH]: { body: { kind: 'notFound' } } });
        const { router, user } = renderApp('/');
        await user.type(await screen.findByLabelText('Steam profile'), 'https://steamcommunity.com/id/Someone/');
        await user.click(screen.getByRole('button', { name: 'View library' }));

        await screen.findByText('Profile not found');
        expect(router.state.location.pathname).toBe('/p/someone');
    });
});

describe('profile page', () => {
    it('shows the profile and its dashboard', async () => {
        stubApi({
            [PROFILE_PATH]: { body: { kind: 'ok', data: PROFILE } },
            [LIBRARY_PATH]: { body: { kind: 'ok', data: LIBRARY } },
        });
        renderApp('/p/someone');

        expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Test Person');
        expect(await screen.findByText('Hours played')).toBeTruthy();
    });

    it('says so when the library is empty', async () => {
        stubApi({
            [PROFILE_PATH]: { body: { kind: 'ok', data: PROFILE } },
            [LIBRARY_PATH]: { body: { kind: 'ok', data: { ...LIBRARY, games: [] } } },
        });
        renderApp('/p/someone');

        expect(await screen.findByText('This library has no games.')).toBeTruthy();
    });

    it.each([
        ['notFound', 'Profile not found'],
        ['profilePrivate', 'This profile is private'],
        ['rateLimited', 'Steam is busy'],
    ])('explains a %s profile', async (kind, title) => {
        stubApi({ [PROFILE_PATH]: { body: { kind } } });
        renderApp('/p/someone');

        expect(await screen.findByText(title)).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Look up another profile' })).toBeTruthy();
    });

    it('keeps the profile visible when only the game details are private', async () => {
        stubApi({
            [PROFILE_PATH]: { body: { kind: 'ok', data: PROFILE } },
            [LIBRARY_PATH]: { body: { kind: 'libraryPrivate' } },
        });
        renderApp('/p/someone');

        expect(await screen.findByText('The game library is private')).toBeTruthy();
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Test Person');
    });

    it('treats an input rejected by the API as not found', async () => {
        stubApi({ [PROFILE_PATH]: { status: 400, body: { error: 'invalidInput' } } });
        renderApp('/p/someone');

        expect(await screen.findByText('Profile not found')).toBeTruthy();
    });

    it('offers a retry after a server failure and recovers', async () => {
        const fetchMock = stubApi({ [PROFILE_PATH]: { status: 502, body: { error: 'upstream' } } });
        const { user } = renderApp('/p/someone');

        expect((await screen.findByRole('alert')).textContent).toMatch(/Something went wrong/);

        fetchMock.mockImplementation((input) =>
            Promise.resolve(
                String(input) === PROFILE_PATH
                    ? Response.json({ kind: 'ok', data: PROFILE })
                    : Response.json({ kind: 'libraryPrivate' })
            )
        );
        await user.click(screen.getByRole('button', { name: 'Try again' }));

        expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Test Person');
    });
});

describe('app shell', () => {
    it('switches language and remembers it', async () => {
        const { user } = renderApp('/');
        await user.selectOptions(await screen.findByLabelText('Language'), 'es');

        expect(await screen.findByLabelText('Perfil de Steam')).toBeTruthy();
        expect(document.documentElement.lang).toBe('es');
        expect(localStorage.getItem('hoardex:locale')).toBe('es');
    });

    it('starts in the stored language', async () => {
        localStorage.setItem('hoardex:locale', 'es');
        renderApp('/');

        expect(await screen.findByLabelText('Perfil de Steam')).toBeTruthy();
    });

    it('shows the Valve disclaimer', async () => {
        renderApp('/');

        expect((await screen.findByRole('contentinfo')).textContent).toMatch(
            /not affiliated with or endorsed by Valve/
        );
    });

    it('answers an unknown route with a not-found page', async () => {
        renderApp('/nope');

        expect(await screen.findByText('Page not found')).toBeTruthy();
    });
});
