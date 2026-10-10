import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Game, Library, Profile } from '@core/domain';
import { resetDemoBacklog } from '@/features/profile-page/demo-backlog';
import { renderApp, stubApi } from '@/lib/test/render-app';
import { DRAG_TYPE } from './drag';

const DAY_MS = 86_400_000;

const PROFILE: Profile = {
    id: { source: 'steam', externalId: '76561198000000088' },
    displayName: 'Drag Person',
    avatarUrl: 'https://example.invalid/avatar.jpg',
    profileUrl: 'https://example.invalid/profile',
    visibility: 'public',
    createdAt: null,
};

function game(appid: string, name: string, totalMinutes: number, daysAgo: number | null): Game {
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
    fetchedAt: new Date().toISOString(),
    games: [game('1', 'Alpha Quest', 0, null), game('2', 'Beta Run', 600, 10), game('3', 'Gamma', 30, 5)],
};

function stubDemo() {
    return stubApi({
        '/api/demo/profile': { body: { kind: 'ok', data: PROFILE } },
        '/api/demo/library': { body: { kind: 'ok', data: LIBRARY } },
    });
}

function dataTransfer() {
    const data = new Map<string, string>();
    return {
        setData: (type: string, value: string) => void data.set(type, value),
        getData: (type: string) => data.get(type) ?? '',
        get types() {
            return [...data.keys()];
        },
        effectAllowed: 'all',
        dropEffect: 'none',
    };
}

const card = (name: string) => screen.getByText(name, { selector: 'p' }).closest('.game-card__frame') as HTMLElement;
const chip = (name: RegExp) => screen.getByRole('radio', { name }).closest('.library-toolbar__drop') as HTMLElement;
const stateOf = (name: string) =>
    screen.getByRole('button', { name: new RegExp(`^State of ${name}:`) }).getAttribute('aria-label');
const stored = () => JSON.parse(localStorage.getItem('hoardex:demo-backlog') ?? '{}') as Record<string, unknown>;

function drag(from: HTMLElement, to: HTMLElement) {
    const transfer = dataTransfer();
    fireEvent.dragStart(from, { dataTransfer: transfer });
    fireEvent.dragOver(to, { dataTransfer: transfer });
    const over = to.className;
    fireEvent.drop(to, { dataTransfer: transfer });
    fireEvent.dragEnd(from, { dataTransfer: transfer });
    return over;
}

beforeEach(() => {
    localStorage.clear();
    resetDemoBacklog();
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('dragging a card onto a state chip', () => {
    it('gives the game that state, and says how', async () => {
        stubDemo();
        renderApp('/demo');
        await screen.findByRole('region', { name: 'Library' });

        expect(
            screen.getByText(
                'Drag a game onto a state above to move it. While selecting, the whole selection goes with it.'
            )
        ).toBeTruthy();
        expect(card('Alpha Quest').getAttribute('draggable')).toBe('true');
        const over = drag(card('Alpha Quest'), chip(/^Abandoned/));

        expect(over).toContain('library-toolbar__drop--over');
        await waitFor(() => expect(stateOf('Alpha Quest')).toBe('State of Alpha Quest: Abandoned'));
        expect(stored()).toMatchObject({ '1': { state: 'abandoned' } });
        expect(screen.getByRole('radio', { name: 'Abandoned 1' })).toBeTruthy();
    });

    it('marks every chip as a target only while a card is dragged', async () => {
        stubDemo();
        renderApp('/demo');
        await screen.findByRole('region', { name: 'Library' });

        expect(chip(/^Paused/).className).not.toContain('library-toolbar__drop--ready');
        fireEvent.dragStart(card('Alpha Quest'), { dataTransfer: dataTransfer() });
        expect(chip(/^Paused/).className).toContain('library-toolbar__drop--ready');
        expect(screen.getByRole('radio', { name: /^All/ }).closest('.library-toolbar__drop')).toBeNull();
        fireEvent.dragEnd(card('Alpha Quest'), { dataTransfer: dataTransfer() });
        expect(chip(/^Paused/).className).not.toContain('library-toolbar__drop--ready');
    });

    it('moves the selection and the dragged card together while selecting', async () => {
        stubDemo();
        const { user } = renderApp('/demo');
        await user.click(await screen.findByRole('button', { name: 'Select' }));
        await user.click(screen.getByRole('checkbox', { name: 'Select Alpha Quest' }));

        drag(card('Beta Run'), chip(/^Paused/));

        await waitFor(() => expect(stored()).toMatchObject({ '1': { state: 'paused' }, '2': { state: 'paused' } }));
        expect(stored()).not.toHaveProperty('3');
        expect(within(screen.getByRole('region', { name: 'Selected games' })).getByRole('status').textContent).toBe(
            'Pick the games to move'
        );
    });

    it('scrolls the chips while a dragged card rests on an arrow, and stops when it leaves', async () => {
        stubDemo();
        renderApp('/demo');
        const region = await screen.findByRole('region', { name: 'Library' });
        const strip = within(region).getByRole('group', { name: 'Filter by state' });
        const scrollBy = vi.fn();
        Object.assign(strip, { scrollBy });
        Object.defineProperty(strip, 'scrollWidth', { configurable: true, value: 800 });
        Object.defineProperty(strip, 'clientWidth', { configurable: true, value: 300 });
        fireEvent.scroll(strip);
        const more = await within(region).findByRole('button', { name: 'Show more states' });

        const transfer = dataTransfer();
        fireEvent.dragEnter(more, { dataTransfer: transfer });
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(scrollBy).not.toHaveBeenCalled();

        fireEvent.dragStart(card('Alpha Quest'), { dataTransfer: transfer });
        expect(more.className).toContain('library-toolbar__more--ready');
        fireEvent.dragEnter(more, { dataTransfer: transfer });
        await waitFor(() => expect(scrollBy.mock.calls.length).toBeGreaterThan(1));
        expect(scrollBy).toHaveBeenCalledWith({ left: 6 });

        fireEvent.dragLeave(more, { dataTransfer: transfer, relatedTarget: document.body });
        const calls = scrollBy.mock.calls.length;
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(scrollBy).toHaveBeenCalledTimes(calls);

        fireEvent.dragEnter(more, { dataTransfer: transfer });
        await waitFor(() => expect(scrollBy.mock.calls.length).toBeGreaterThan(calls));
        fireEvent.dragEnd(card('Alpha Quest'), { dataTransfer: transfer });
        await waitFor(() => expect(more.className).not.toContain('library-toolbar__more--ready'));
        const ended = scrollBy.mock.calls.length;
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(scrollBy).toHaveBeenCalledTimes(ended);
    });

    it('ignores anything dropped that is not one of its cards', async () => {
        stubDemo();
        renderApp('/demo');
        await screen.findByRole('region', { name: 'Library' });

        fireEvent.dragStart(card('Alpha Quest'), { dataTransfer: dataTransfer() });
        const foreign = dataTransfer();
        foreign.setData(DRAG_TYPE, '999');
        fireEvent.dragOver(chip(/^Paused/), { dataTransfer: foreign });
        fireEvent.drop(chip(/^Paused/), { dataTransfer: foreign });
        const text = dataTransfer();
        text.setData('text/plain', '1');
        fireEvent.dragOver(chip(/^Paused/), { dataTransfer: text });
        fireEvent.drop(chip(/^Paused/), { dataTransfer: text });

        expect(localStorage.getItem('hoardex:demo-backlog')).toBeNull();
    });

    it('is not offered on a touch screen', async () => {
        const matchMedia = window.matchMedia;
        vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
            ...matchMedia(query),
            matches: query === '(pointer: coarse)' || matchMedia(query).matches,
        }));
        stubDemo();
        renderApp('/demo');
        await screen.findByRole('region', { name: 'Library' });

        expect(card('Alpha Quest').getAttribute('draggable')).toBe('false');
        expect(screen.getByRole('radio', { name: /^Paused/ }).closest('.library-toolbar__drop')).toBeNull();
        expect(screen.queryByText(/^Drag a game/)).toBeNull();
    });

    it('is read only for a visitor, who sees no empty manual-only chips', async () => {
        stubApi({
            '/api/profile/someone': { body: { kind: 'ok', data: PROFILE } },
            '/api/library/someone': { body: { kind: 'ok', data: LIBRARY } },
        });
        renderApp('/p/someone');
        const region = await screen.findByRole('region', { name: 'Library' });

        expect(card('Alpha Quest').getAttribute('draggable')).toBe('false');
        expect(within(region).queryByRole('radio', { name: /^Abandoned/ })).toBeNull();
        expect(within(region).getByRole('radio', { name: 'Backlog 1' }).closest('.library-toolbar__drop')).toBeNull();
        expect(screen.queryByText(/^Drag a game/)).toBeNull();
    });
});
