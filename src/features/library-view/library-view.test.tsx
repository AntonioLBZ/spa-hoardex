import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Game, Library, Profile } from '@core/domain';
import { resetArt } from '@/lib/art';
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

const DAY_MS = 86_400_000;

function makeGame(appid: string, name: string, totalMinutes: number, daysAgo: number | null): Game {
    return {
        id: { source: 'steam', externalId: appid },
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
    fetchedAt: '2026-01-01T00:00:00.000Z',
    games: [
        makeGame('40', 'Délta Siege', 1200, 200),
        makeGame('10', 'Alpha Quest', 0, null),
        makeGame('50', 'Epsilon Saga', 6000, 800),
        makeGame('30', 'Gamma Tactics', 600, 10),
        makeGame('20', 'Beta Run', 30, 5),
    ],
};

const DEMO_ANSWERS = {
    '/api/demo/profile': { body: { kind: 'ok', data: PROFILE } },
    '/api/demo/library': { body: { kind: 'ok', data: LIBRARY } },
};

beforeEach(() => {
    localStorage.clear();
    resetArt();
});
afterEach(() => vi.unstubAllGlobals());

async function openLibrary(path: string) {
    stubApi(DEMO_ANSWERS);
    const app = renderApp(path);
    const region = await screen.findByRole('region', { name: 'Library' });
    return { ...app, region };
}

const names = (region: HTMLElement) =>
    within(region)
        .queryAllByRole('listitem')
        .map((item) => item.querySelector('p')?.textContent);

describe('library view', () => {
    it('lists every game with its state and hours, most played first', async () => {
        const { region } = await openLibrary('/demo');

        expect(names(region)).toEqual(['Epsilon Saga', 'Délta Siege', 'Gamma Tactics', 'Beta Run', 'Alpha Quest']);
        const first = within(region).getAllByRole('listitem')[0];
        expect(first?.textContent).toContain('Finished');
        expect(first?.textContent).toContain('100 h');
        expect(within(region).getByRole('status').textContent).toBe('Showing 5 of 5 games');
    });

    it('filters by state from a chip and keeps the choice in the URL', async () => {
        const { region, router, user } = await openLibrary('/demo');
        await user.click(within(region).getByRole('radio', { name: /^Tried/ }));

        await waitFor(() => expect(names(region)).toEqual(['Beta Run']));
        expect(router.state.location.search).toEqual({ state: 'tried' });
        expect(within(region).getByRole('status').textContent).toBe('Showing 1 of 5 games');

        await user.click(within(region).getByRole('radio', { name: /^All/ }));
        await waitFor(() => expect(names(region)).toHaveLength(5));
        expect(router.state.location.search).toEqual({});
    });

    it('shows how many games each filter holds, and every category to an editor', async () => {
        const { region } = await openLibrary('/demo');

        expect(within(region).getByRole('radio', { name: 'All 5' })).toBeTruthy();
        expect(within(region).getByRole('radio', { name: 'Backlog 1' })).toBeTruthy();
        expect(within(region).getByRole('radio', { name: 'Paused 1' })).toBeTruthy();
        expect(within(region).getByRole('radio', { name: 'Abandoned 0' })).toBeTruthy();
    });

    it('searches by name ignoring case and accents, and keeps a typed space', async () => {
        const { region, router, user } = await openLibrary('/demo');
        const box = within(region).getByRole('searchbox', { name: 'Search games' });
        await user.type(box, 'DELTA ');

        await waitFor(() => expect(names(region)).toEqual(['Délta Siege']));
        expect(router.state.location.search).toEqual({ q: 'DELTA' });
        expect((box as HTMLInputElement).value).toBe('DELTA ');
    });

    it('does not add a history entry for every keystroke', async () => {
        const { region, router, user } = await openLibrary('/demo');
        const before = router.history.length;
        await user.type(within(region).getByRole('searchbox'), 'gam');

        await waitFor(() => expect(router.state.location.search).toEqual({ q: 'gam' }));
        expect(router.history.length).toBe(before);
    });

    it('sorts from the select and leaves the default out of the URL', async () => {
        const { region, router, user } = await openLibrary('/demo');
        const select = within(region).getByRole('combobox', { name: 'Sort by' });

        await user.selectOptions(select, 'name');
        await waitFor(() =>
            expect(names(region)).toEqual(['Alpha Quest', 'Beta Run', 'Délta Siege', 'Epsilon Saga', 'Gamma Tactics'])
        );
        expect(router.state.location.search).toEqual({ sort: 'name' });

        await user.selectOptions(select, 'recent');
        await waitFor(() =>
            expect(names(region)).toEqual(['Beta Run', 'Gamma Tactics', 'Délta Siege', 'Epsilon Saga', 'Alpha Quest'])
        );

        await user.selectOptions(select, 'hours');
        await waitFor(() => expect(names(region)[0]).toBe('Epsilon Saga'));
        expect(router.state.location.search).toEqual({});
    });

    it('reverses the order, and a new sort starts in its own direction', async () => {
        const { region, router, user } = await openLibrary('/demo');
        const reverse = within(region).getByRole('button', { name: 'Reverse order' });
        expect(reverse.getAttribute('aria-pressed')).toBe('false');
        expect(reverse.getAttribute('title')).toBe('Most played first');

        await user.click(reverse);
        await waitFor(() =>
            expect(names(region)).toEqual(['Alpha Quest', 'Beta Run', 'Gamma Tactics', 'Délta Siege', 'Epsilon Saga'])
        );
        expect(router.state.location.search).toEqual({ dir: 'asc' });
        expect(reverse.getAttribute('aria-pressed')).toBe('true');
        expect(reverse.getAttribute('title')).toBe('Least played first');

        await user.selectOptions(within(region).getByRole('combobox', { name: 'Sort by' }), 'name');
        await waitFor(() => expect(names(region)[0]).toBe('Alpha Quest'));
        expect(router.state.location.search).toEqual({ sort: 'name' });

        await user.click(reverse);
        await waitFor(() => expect(names(region)[0]).toBe('Gamma Tactics'));
        expect(router.state.location.search).toEqual({ sort: 'name', dir: 'desc' });
    });

    it('starts from the filters in the URL', async () => {
        const { region } = await openLibrary('/demo?state=paused&sort=name');

        expect(names(region)).toEqual(['Délta Siege']);
        expect(within(region).getByRole('radio', { name: /^Paused/ })).toHaveProperty('checked', true);
    });

    it('ignores values in the URL that mean nothing', async () => {
        const { region } = await openLibrary('/demo?state=wishlisted&sort=sideways');

        expect(names(region)).toHaveLength(5);
        expect(within(region).getByRole('radio', { name: /^All/ })).toHaveProperty('checked', true);
        expect(within(region).getByRole('combobox', { name: 'Sort by' })).toHaveProperty('value', 'hours');
    });

    it('filters nothing by a category the account does not have', async () => {
        const { region } = await openLibrary('/demo?state=c-0a1b2c3d');

        expect(names(region)).toHaveLength(5);
        expect(within(region).getByRole('radio', { name: /^All/ })).toHaveProperty('checked', true);
    });

    it('reads the old backlog filter as the Backlog category', async () => {
        const { region } = await openLibrary('/demo?state=backlog');

        expect(names(region)).toEqual(['Alpha Quest']);
        expect(within(region).getByRole('radio', { name: /^Backlog/ })).toHaveProperty('checked', true);
    });

    it('explains an empty result and clears the filters', async () => {
        const { region, router, user } = await openLibrary('/demo?state=finished&q=alpha');

        expect(within(region).getByText('No games match these filters.')).toBeTruthy();
        expect(within(region).getByRole('status').textContent).toBe('Showing 0 of 5 games');

        await user.click(within(region).getByRole('button', { name: 'Clear filters' }));
        await waitFor(() => expect(names(region)).toHaveLength(5));
        expect(router.state.location.search).toEqual({});
        expect((within(region).getByRole('searchbox') as HTMLInputElement).value).toBe('');
    });

    it('is translated', async () => {
        localStorage.setItem('hoardex:locale', 'es');
        stubApi(DEMO_ANSWERS);
        renderApp('/demo');

        const region = await screen.findByRole('region', { name: 'Biblioteca' });
        expect(within(region).getByRole('status').textContent).toBe('Mostrando 5 de 5 juegos');
        expect(within(region).getByRole('radio', { name: /^Probado/ })).toBeTruthy();
    });
});

describe('batches', () => {
    function bigLibrary(size: number): Library {
        return {
            ...LIBRARY,
            games: Array.from({ length: size }, (_, index) =>
                makeGame(
                    String(1000 + index),
                    `Game ${index}`,
                    index % 3 === 0 ? 0 : 600,
                    index % 3 === 0 ? null : index
                )
            ),
        };
    }

    async function openBig(size: number, path = '/demo') {
        stubApi({
            '/api/demo/profile': { body: { kind: 'ok', data: PROFILE } },
            '/api/demo/library': { body: { kind: 'ok', data: bigLibrary(size) } },
        });
        const app = renderApp(path);
        const region = await screen.findByRole('region', { name: 'Library' });
        return { ...app, region };
    }

    const cards = (region: HTMLElement) => within(region).queryAllByRole('listitem').length;

    it('renders a first batch and says how much is still hidden', async () => {
        const { region } = await openBig(200);

        expect(cards(region)).toBe(24);
        expect(within(region).getByText('24 of 200 shown')).toBeTruthy();
        expect(within(region).getByRole('button', { name: 'Show 48 more' })).toBeTruthy();
        expect(within(region).getByRole('status').textContent).toBe('Showing 200 of 200 games');
    });

    it('shows more on request until everything is there', async () => {
        const { region, user } = await openBig(200);

        for (const expected of [72, 120, 168]) {
            await user.click(within(region).getByRole('button', { name: 'Show 48 more' }));
            expect(cards(region)).toBe(expected);
        }

        await user.click(within(region).getByRole('button', { name: 'Show 32 more' }));
        expect(cards(region)).toBe(200);
        expect(within(region).queryByRole('button', { name: /^Show \d+ more/ })).toBeNull();
        expect(within(region).queryByText(/shown$/)).toBeNull();
    });

    it('starts again from the first batch when the order or the filter changes', async () => {
        const { region, user } = await openBig(200);
        await user.click(within(region).getByRole('button', { name: 'Show 48 more' }));
        expect(cards(region)).toBe(72);

        await user.selectOptions(within(region).getByRole('combobox', { name: 'Sort by' }), 'name');
        await waitFor(() => expect(cards(region)).toBe(24));
    });

    it('has no button when the matches fit in the first batch', async () => {
        const { region } = await openBig(200, '/demo?q=game+199');

        expect(cards(region)).toBe(1);
        expect(within(region).queryByRole('button', { name: /^Show \d+ more/ })).toBeNull();
    });

    it('never loads more on its own when the end of the list comes into view', async () => {
        const observers: IntersectionObserverCallback[] = [];
        vi.stubGlobal(
            'IntersectionObserver',
            class {
                constructor(callback: IntersectionObserverCallback) {
                    observers.push(callback);
                }
                observe() {}
                unobserve() {}
                disconnect() {}
                takeRecords() {
                    return [];
                }
            }
        );
        const { region } = await openBig(200);

        act(() =>
            observers.forEach((callback) =>
                callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
            )
        );

        expect(cards(region)).toBe(24);
    });
});

describe('covers', () => {
    const STEAM_ANSWERS = {
        '/api/profile/someone': { body: { kind: 'ok', data: PROFILE } },
        '/api/library/someone': { body: { kind: 'ok', data: LIBRARY } },
    };
    const PORTRAIT = 'https://cdn.cloudflare.steamstatic.com/steam/apps/40/library_600x900.jpg';
    const HEADER = 'https://cdn.cloudflare.steamstatic.com/steam/apps/40/header.jpg';
    const HASHED =
        'https://shared.steamstatic.com/store_item_assets/steam/apps/40/480bd879ac737921bfa2529a6fea15961267ad21/library_600x900.jpg';

    const coverFor = (region: HTMLElement, name: string) =>
        within(region).getByText(name).closest('li')?.querySelector('.cover') ?? null;

    it('loads the portrait capsule lazily and without a referrer', async () => {
        stubApi(STEAM_ANSWERS);
        renderApp('/p/someone');
        const region = await screen.findByRole('region', { name: 'Library' });

        const image = coverFor(region, 'Délta Siege')?.querySelector('img');
        expect(image?.getAttribute('src')).toBe(PORTRAIT);
        expect(image?.getAttribute('loading')).toBe('lazy');
        expect(image?.getAttribute('referrerpolicy')).toBe('no-referrer');
        expect(image?.getAttribute('alt')).toBe('');
    });

    it('asks for the store paths of covers that fail together in one request, and uses them', async () => {
        const art = `/api/art/${STEAM_ID}?appids=20,40`;
        const fetchMock = stubApi({
            ...STEAM_ANSWERS,
            [art]: { body: { kind: 'ok', data: { '40': { cover: HASHED }, '20': {} } } },
        });
        renderApp('/p/someone');
        const region = await screen.findByRole('region', { name: 'Library' });

        fireEvent.error(coverFor(region, 'Délta Siege')!.querySelector('img')!);
        fireEvent.error(coverFor(region, 'Beta Run')!.querySelector('img')!);
        await waitFor(() =>
            expect(coverFor(region, 'Délta Siege')?.querySelector('img')?.getAttribute('src')).toBe(HASHED)
        );
        expect(coverFor(region, 'Délta Siege')?.classList.contains('cover--landscape')).toBe(false);
        expect(coverFor(region, 'Beta Run')?.querySelector('img')?.getAttribute('src')).toBe(
            'https://cdn.cloudflare.steamstatic.com/steam/apps/20/header.jpg'
        );
        expect(fetchMock.mock.calls.filter(([path]) => String(path).startsWith('/api/art/'))).toHaveLength(1);
    });

    it('falls back to the header and then to a placeholder when the store has nothing better', async () => {
        stubApi({ ...STEAM_ANSWERS, [`/api/art/${STEAM_ID}?appids=40`]: { body: { kind: 'ok', data: {} } } });
        renderApp('/p/someone');
        const region = await screen.findByRole('region', { name: 'Library' });

        fireEvent.error(coverFor(region, 'Délta Siege')!.querySelector('img')!);
        await waitFor(() =>
            expect(coverFor(region, 'Délta Siege')?.querySelector('img')?.getAttribute('src')).toBe(HEADER)
        );
        expect(coverFor(region, 'Délta Siege')?.classList.contains('cover--landscape')).toBe(true);

        fireEvent.error(coverFor(region, 'Délta Siege')!.querySelector('img')!);
        await waitFor(() => expect(coverFor(region, 'Délta Siege')?.querySelector('img')).toBeNull());
        expect(coverFor(region, 'Délta Siege')?.textContent).toBe('DS');
        expect(coverFor(region, 'Beta Run')?.querySelector('img')).not.toBeNull();
    });

    it('still falls back to the header when the store paths cannot be fetched', async () => {
        stubApi({ ...STEAM_ANSWERS, [`/api/art/${STEAM_ID}?appids=40`]: { status: 502, body: { error: 'upstream' } } });
        renderApp('/p/someone');
        const region = await screen.findByRole('region', { name: 'Library' });

        fireEvent.error(coverFor(region, 'Délta Siege')!.querySelector('img')!);
        await waitFor(() =>
            expect(coverFor(region, 'Délta Siege')?.querySelector('img')?.getAttribute('src')).toBe(HEADER)
        );
    });

    it('never asks Steam for the images of a demo library', async () => {
        const { region } = await openLibrary('/demo');

        expect(document.querySelectorAll('img.cover__image')).toHaveLength(0);
        expect(coverFor(region, 'Alpha Quest')?.textContent).toBe('AQ');
    });
});
