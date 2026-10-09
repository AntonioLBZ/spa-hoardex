import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Game, Library, Profile } from '@core/domain';
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

beforeEach(() => localStorage.clear());
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
        await user.click(within(region).getByRole('radio', { name: /^Backlog/ }));

        await waitFor(() => expect(names(region)).toEqual(['Beta Run', 'Alpha Quest']));
        expect(router.state.location.search).toEqual({ state: 'backlog' });
        expect(within(region).getByRole('status').textContent).toBe('Showing 2 of 5 games');

        await user.click(within(region).getByRole('radio', { name: /^All/ }));
        await waitFor(() => expect(names(region)).toHaveLength(5));
        expect(router.state.location.search).toEqual({});
    });

    it('shows how many games each filter holds', async () => {
        const { region } = await openLibrary('/demo');

        expect(within(region).getByRole('radio', { name: 'All 5' })).toBeTruthy();
        expect(within(region).getByRole('radio', { name: 'Backlog 2' })).toBeTruthy();
        expect(within(region).getByRole('radio', { name: 'Paused 1' })).toBeTruthy();
        expect(within(region).queryByRole('radio', { name: /^Completed/ })).toBeNull();
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
        expect(within(region).getByRole('radio', { name: /^Sin tocar/ })).toBeTruthy();
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

        expect(cards(region)).toBe(48);
        expect(within(region).getByText('48 of 200 shown')).toBeTruthy();
        expect(within(region).getByRole('button', { name: 'Show 96 more' })).toBeTruthy();
        expect(within(region).getByRole('status').textContent).toBe('Showing 200 of 200 games');
    });

    it('shows more on request until everything is there', async () => {
        const { region, user } = await openBig(200);

        await user.click(within(region).getByRole('button', { name: 'Show 96 more' }));
        expect(cards(region)).toBe(144);

        await user.click(within(region).getByRole('button', { name: 'Show 56 more' }));
        expect(cards(region)).toBe(200);
        expect(within(region).queryByRole('button', { name: /^Show \d+ more/ })).toBeNull();
        expect(within(region).queryByText(/shown$/)).toBeNull();
    });

    it('starts again from the first batch when the order or the filter changes', async () => {
        const { region, user } = await openBig(200);
        await user.click(within(region).getByRole('button', { name: 'Show 96 more' }));
        expect(cards(region)).toBe(144);

        await user.selectOptions(within(region).getByRole('combobox', { name: 'Sort by' }), 'name');
        await waitFor(() => expect(cards(region)).toBe(48));
    });

    it('has no button when the matches fit in the first batch', async () => {
        const { region } = await openBig(200, '/demo?q=game+199');

        expect(cards(region)).toBe(1);
        expect(within(region).queryByRole('button', { name: /^Show \d+ more/ })).toBeNull();
    });

    describe('with an IntersectionObserver', () => {
        class FakeObserver {
            static instances: FakeObserver[] = [];
            disconnected = false;
            constructor(private readonly callback: IntersectionObserverCallback) {
                FakeObserver.instances.push(this);
            }
            observe() {}
            unobserve() {}
            takeRecords() {
                return [];
            }
            disconnect() {
                this.disconnected = true;
            }
            reachEnd() {
                this.callback(
                    [{ isIntersecting: true } as IntersectionObserverEntry],
                    this as unknown as IntersectionObserver
                );
            }
        }
        const active = () => FakeObserver.instances.filter((observer) => !observer.disconnected).at(-1);

        beforeEach(() => {
            FakeObserver.instances = [];
            vi.stubGlobal('IntersectionObserver', FakeObserver);
        });

        it('loads the next batch each time the end of the list comes near, up to the limit', async () => {
            const { region } = await openBig(639);
            expect(cards(region)).toBe(48);

            for (const expected of [144, 240, 336]) {
                act(() => active()?.reachEnd());
                await waitFor(() => expect(cards(region)).toBe(expected));
            }

            expect(active()).toBeUndefined();
            expect(within(region).getByRole('button', { name: 'Show 96 more' })).toBeTruthy();
        });

        it('stops watching once everything is shown', async () => {
            const { region } = await openBig(100);

            act(() => active()?.reachEnd());
            await waitFor(() => expect(cards(region)).toBe(100));

            expect(active()).toBeUndefined();
        });
    });
});

describe('covers', () => {
    const STEAM_ANSWERS = {
        '/api/profile/someone': { body: { kind: 'ok', data: PROFILE } },
        '/api/library/someone': { body: { kind: 'ok', data: LIBRARY } },
    };
    const PORTRAIT = 'https://cdn.cloudflare.steamstatic.com/steam/apps/40/library_600x900.jpg';
    const HEADER = 'https://cdn.cloudflare.steamstatic.com/steam/apps/40/header.jpg';

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

    it('falls back to the header and then to a placeholder', async () => {
        stubApi(STEAM_ANSWERS);
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

    it('never asks Steam for the images of a demo library', async () => {
        const { region } = await openLibrary('/demo');

        expect(document.querySelectorAll('img.cover__image')).toHaveLength(0);
        expect(coverFor(region, 'Alpha Quest')?.textContent).toBe('AQ');
    });
});
