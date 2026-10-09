import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Library, Profile } from '@core/domain';
import { renderApp, stubApi } from '@/lib/test/render-app';

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
const LIBRARY_PATH = '/api/library/someone';
const DEMO_PROFILE_PATH = '/api/demo/profile';
const DEMO_LIBRARY_PATH = '/api/demo/library';

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('entry screen', () => {
    it('explains an input that is not a profile and stays put', async () => {
        const { router, user } = renderApp('/');
        await user.type(await screen.findByLabelText('Your Steam profile'), 'x');
        await user.click(screen.getByRole('button', { name: 'View library' }));

        expect((await screen.findByRole('alert')).textContent).toMatch(/does not look like a Steam profile/);
        expect(router.state.location.pathname).toBe('/');
    });

    it('submits with Enter', async () => {
        stubApi({ [PROFILE_PATH]: { body: { kind: 'notFound' } } });
        const { router, user } = renderApp('/');
        await user.type(await screen.findByLabelText('Your Steam profile'), 'someone{Enter}');

        await screen.findByText('Profile not found');
        expect(router.state.location.pathname).toBe('/p/someone');
    });

    it('opens the canonical profile route for a profile URL', async () => {
        stubApi({ [PROFILE_PATH]: { body: { kind: 'notFound' } } });
        const { router, user } = renderApp('/');
        await user.type(await screen.findByLabelText('Your Steam profile'), 'https://steamcommunity.com/id/Someone/');
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

    it('asks Steam for the avatar without a referrer', async () => {
        stubApi({
            [PROFILE_PATH]: { body: { kind: 'ok', data: PROFILE } },
            [LIBRARY_PATH]: { body: { kind: 'ok', data: LIBRARY } },
        });
        renderApp('/p/someone');

        await screen.findByRole('heading', { level: 1 });
        expect(document.querySelector('.profile-page__avatar')?.getAttribute('referrerpolicy')).toBe('no-referrer');
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

    it('asks the visitor to wait when the firewall rate limit answers', async () => {
        stubApi({ [PROFILE_PATH]: { status: 429, text: 'Too Many Requests' } });
        renderApp('/p/someone');

        expect(await screen.findByText('Too many requests')).toBeTruthy();
        expect(screen.getByText(/Wait a minute and try again/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    });

    it('says so in Spanish too', async () => {
        localStorage.setItem('hoardex:locale', 'es');
        stubApi({ [PROFILE_PATH]: { status: 429, text: 'Too Many Requests' } });
        renderApp('/p/someone');

        expect(await screen.findByText('Demasiadas peticiones')).toBeTruthy();
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

describe('loading', () => {
    it('asks for the profile, the library and the session at the same time', async () => {
        const fetchMock = vi.fn((_input: string) => new Promise<Response>(() => {}));
        vi.stubGlobal('fetch', fetchMock);
        renderApp('/p/someone');

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
        expect(fetchMock.mock.calls.map(([input]) => String(input)).sort()).toEqual([
            LIBRARY_PATH,
            '/api/me',
            PROFILE_PATH,
        ]);
    });

    it('shows a skeleton of the page with the loading text for assistive technology', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() => new Promise<Response>(() => {}))
        );
        renderApp('/p/someone');

        const status = await screen.findByRole('status');
        expect(status.textContent).toContain('Loading profile…');
        expect(status.querySelector('.page-skeleton')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('keeps the profile on screen and skeletons only the library while it loads', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn((input: string) =>
                input === PROFILE_PATH
                    ? Promise.resolve(Response.json({ kind: 'ok', data: PROFILE }))
                    : new Promise<Response>(() => {})
            )
        );
        renderApp('/p/someone');

        expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Test Person');
        expect(screen.getByRole('status').textContent).toContain('Loading library…');
        expect(document.querySelector('.page-skeleton__header')).toBeNull();
    });
});

describe('locked panels', () => {
    const SETTINGS_LINK = /^Open Steam privacy settings/;

    it('points a private profile to its Steam privacy settings and ghosts the page', async () => {
        stubApi({ [PROFILE_PATH]: { body: { kind: 'profilePrivate' } } });
        renderApp('/p/someone');

        const link = await screen.findByRole('link', { name: SETTINGS_LINK });
        expect(link.getAttribute('href')).toBe('https://steamcommunity.com/id/someone/edit/settings');
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toBe('noopener noreferrer');
        expect(document.querySelector('.locked-panel__ghost')?.getAttribute('aria-hidden')).toBe('true');
        expect(screen.getByText(/set “My profile” to Public/)).toBeTruthy();
    });

    it('builds the /profiles/ link when the profile is a SteamID64', async () => {
        stubApi({ [`/api/profile/${STEAM_ID}`]: { body: { kind: 'profilePrivate' } } });
        renderApp(`/p/${STEAM_ID}`);

        expect((await screen.findByRole('link', { name: SETTINGS_LINK })).getAttribute('href')).toBe(
            `https://steamcommunity.com/profiles/${STEAM_ID}/edit/settings`
        );
    });

    it('keeps the profile and locks the library when only the game details are private', async () => {
        stubApi({
            [PROFILE_PATH]: { body: { kind: 'ok', data: PROFILE } },
            [LIBRARY_PATH]: { body: { kind: 'libraryPrivate' } },
        });
        renderApp('/p/someone');

        expect(await screen.findByRole('link', { name: SETTINGS_LINK })).toBeTruthy();
        expect(screen.getByText(/set “Game details” to Public/)).toBeTruthy();
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Test Person');
    });

    it('locks only the hours-by-year chart when the library comes without last-played dates', async () => {
        const played = LIBRARY.games.map((game) => ({
            ...game,
            playtime: { ...game.playtime, totalMinutes: 600 },
        }));
        stubApi({
            [PROFILE_PATH]: { body: { kind: 'ok', data: PROFILE } },
            [LIBRARY_PATH]: { body: { kind: 'ok', data: { ...LIBRARY, games: played } } },
        });
        renderApp('/p/someone');

        const panel = await screen.findByRole('region', { name: 'Hours by year of last play' });
        expect(
            within(panel)
                .getByRole('link', { name: /^Open Steam privacy settings/ })
                .getAttribute('href')
        ).toBe('https://steamcommunity.com/id/someone/edit/settings');
        expect(await screen.findByText('Hours played')).toBeTruthy();
    });

    it('lets the owner try again after changing the setting', async () => {
        const fetchMock = stubApi({ [PROFILE_PATH]: { body: { kind: 'profilePrivate' } } });
        const { user } = renderApp('/p/someone');
        await screen.findByRole('link', { name: SETTINGS_LINK });

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

    it('offers neither the settings link nor a retry for a profile that does not exist', async () => {
        stubApi({ [PROFILE_PATH]: { body: { kind: 'notFound' } } });
        renderApp('/p/someone');

        await screen.findByText('Profile not found');
        expect(screen.queryByRole('link', { name: SETTINGS_LINK })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
        expect(document.querySelector('.locked-panel')).toBeNull();
    });

    it('is translated', async () => {
        localStorage.setItem('hoardex:locale', 'es');
        stubApi({ [PROFILE_PATH]: { body: { kind: 'profilePrivate' } } });
        renderApp('/p/someone');

        expect(await screen.findByRole('link', { name: /^Abrir los ajustes de privacidad de Steam/ })).toBeTruthy();
    });
});

describe('demo', () => {
    const DEMO_ANSWERS = {
        [DEMO_PROFILE_PATH]: { body: { kind: 'ok', data: PROFILE } },
        [DEMO_LIBRARY_PATH]: { body: { kind: 'ok', data: LIBRARY } },
    };

    it('is reachable from the entry screen', async () => {
        stubApi(DEMO_ANSWERS);
        const { router, user } = renderApp('/');
        await user.click(await screen.findByRole('link', { name: 'Explore the demo' }));

        await screen.findByRole('note');
        expect(router.state.location.pathname).toBe('/demo');
    });

    it('shows the fictional library with a notice and reads only the demo endpoints', async () => {
        const fetchMock = stubApi(DEMO_ANSWERS);
        renderApp('/demo');

        expect((await screen.findByRole('note')).textContent).toMatch(/fictional library/);
        expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Test Person');
        expect(await screen.findByText('Hours played')).toBeTruthy();
        expect(fetchMock.mock.calls.map(([input]) => String(input)).sort()).toEqual([
            DEMO_LIBRARY_PATH,
            DEMO_PROFILE_PATH,
        ]);
    });

    it('does not show the notice for a real profile', async () => {
        stubApi({
            [PROFILE_PATH]: { body: { kind: 'ok', data: PROFILE } },
            [LIBRARY_PATH]: { body: { kind: 'libraryPrivate' } },
        });
        renderApp('/p/someone');

        await screen.findByText('The game library is private');
        expect(screen.queryByRole('note')).toBeNull();
    });
});

describe('app shell', () => {
    it('switches language and remembers it', async () => {
        const { user } = renderApp('/');
        await user.selectOptions(await screen.findByLabelText('Language'), 'es');

        expect(await screen.findByLabelText('Tu perfil de Steam')).toBeTruthy();
        expect(document.documentElement.lang).toBe('es');
        expect(localStorage.getItem('hoardex:locale')).toBe('es');
    });

    it('starts in the stored language', async () => {
        localStorage.setItem('hoardex:locale', 'es');
        renderApp('/');

        expect(await screen.findByLabelText('Tu perfil de Steam')).toBeTruthy();
    });

    it('shows the Valve disclaimer and trademark notice', async () => {
        renderApp('/');

        const footer = (await screen.findByRole('contentinfo')).textContent;
        expect(footer).toMatch(/not affiliated with or endorsed by Valve/);
        expect(footer).toContain(
            `©${new Date().getFullYear()} Valve Corporation. Steam and the Steam logo are trademarks`
        );
    });

    it('puts the logo before the name, as a decoration that the name already announces', async () => {
        renderApp('/');

        const brand = await screen.findByRole('link', { name: 'Hoardex' });
        const logo = brand.querySelector('img');
        expect(logo?.getAttribute('src')).toBe('/logo.svg');
        expect(logo?.getAttribute('alt')).toBe('');
        expect(brand.firstElementChild).toBe(logo);
    });

    it("asks for the visitor's own profile", async () => {
        renderApp('/');

        expect((await screen.findByText(/Enter your own profile/)).textContent).toMatch(/must be public/);
    });

    it('answers an unknown route with a not-found page', async () => {
        renderApp('/nope');

        expect(await screen.findByText('Page not found')).toBeTruthy();
    });
});

describe('page titles', () => {
    it('names the app on the entry screen', async () => {
        renderApp('/');

        await screen.findByRole('heading', { level: 1 });
        expect(document.title).toBe('Hoardex');
    });

    it('names the app while the profile loads', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() => new Promise<Response>(() => {}))
        );
        renderApp('/p/someone');

        await screen.findByText('Loading profile…');
        expect(document.title).toBe('Hoardex');
    });

    it('names the profile once it is known', async () => {
        stubApi({
            [PROFILE_PATH]: { body: { kind: 'ok', data: PROFILE } },
            [LIBRARY_PATH]: { body: { kind: 'ok', data: LIBRARY } },
        });
        renderApp('/p/someone');

        await screen.findByRole('heading', { level: 1 });
        expect(document.title).toBe('Test Person · Hoardex');
    });

    it('keeps the app name when the profile is a problem', async () => {
        stubApi({ [PROFILE_PATH]: { body: { kind: 'notFound' } } });
        renderApp('/p/someone');

        await screen.findByText('Profile not found');
        expect(document.title).toBe('Hoardex');
    });

    it('calls the demo a demo, whatever its fictional name', async () => {
        stubApi({
            [DEMO_PROFILE_PATH]: { body: { kind: 'ok', data: PROFILE } },
            [DEMO_LIBRARY_PATH]: { body: { kind: 'ok', data: LIBRARY } },
        });
        renderApp('/demo');

        await screen.findByRole('heading', { level: 1 });
        expect(document.title).toBe('Demo library · Hoardex');
    });

    it('titles the policy and the not-found page', async () => {
        const { router } = renderApp('/privacy');
        await screen.findByRole('heading', { level: 1, name: 'Privacy policy' });
        expect(document.title).toBe('Privacy policy · Hoardex');

        router.history.push('/nope');
        await screen.findByText('Page not found', { selector: 'h1, h2' });
        expect(document.title).toBe('Page not found · Hoardex');
    });

    it('keeps the description in the language of the page', async () => {
        const tag = document.createElement('meta');
        tag.name = 'description';
        tag.content = 'static';
        document.head.append(tag);
        localStorage.setItem('hoardex:locale', 'es');
        renderApp('/privacy');

        await screen.findByRole('heading', { level: 1 });
        expect(tag.content).toMatch(/^Un panel de tu biblioteca de juegos/);
        tag.remove();
    });

    it('follows the language', async () => {
        localStorage.setItem('hoardex:locale', 'es');
        renderApp('/privacy');

        await screen.findByRole('heading', { level: 1 });
        expect(document.title).toBe('Política de privacidad · Hoardex');
    });
});
