import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Game, Library, Profile } from '@core/domain';
import { resetDemoBacklog } from '@/features/profile-page/demo-backlog';
import { renderApp, stubApi } from '@/lib/test/render-app';
import { DRAG_TYPE } from './board-card';

const DAY_MS = 86_400_000;

const PROFILE: Profile = {
    id: { source: 'steam', externalId: '76561198000000088' },
    displayName: 'Board Person',
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

function library(games: Game[]): Library {
    return { owner: PROFILE.id, fetchedAt: new Date().toISOString(), games };
}

const SMALL = library([game('1', 'Alpha Quest', 0, null), game('2', 'Beta Run', 600, 10)]);

function stubDemo(lib: Library) {
    return stubApi({
        '/api/demo/profile': { body: { kind: 'ok', data: PROFILE } },
        '/api/demo/library': { body: { kind: 'ok', data: lib } },
    });
}

// jsdom has no DataTransfer
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

const column = (name: string) => screen.getByRole('region', { name });
const cardIn = (region: HTMLElement, name: string) => within(region).getByText(name).closest('li') as HTMLElement;

beforeEach(() => {
    localStorage.clear();
    resetDemoBacklog();
});
afterEach(() => vi.unstubAllGlobals());

describe('board view', () => {
    it('shows one column per state with its count, without the state filters', async () => {
        stubDemo(SMALL);
        renderApp('/demo?view=board');

        expect(await screen.findByRole('region', { name: 'Untouched' })).toBeTruthy();
        expect(within(column('In progress')).getByText('Beta Run')).toBeTruthy();
        expect(within(column('Abandoned')).getByText('No games')).toBeTruthy();
        expect(screen.getByRole('radio', { name: 'Board' })).toHaveProperty('checked', true);
        expect(screen.queryByRole('radio', { name: /^Backlog/ })).toBeNull();
        expect(screen.getByText('Drag a game to another column, or pick its state in its menu.')).toBeTruthy();
    });

    it('moves a dragged card to the column it is dropped on', async () => {
        stubDemo(SMALL);
        renderApp('/demo?view=board');

        const card = cardIn(await screen.findByRole('region', { name: 'Untouched' }), 'Alpha Quest');
        expect(card.getAttribute('draggable')).toBe('true');
        const transfer = dataTransfer();
        fireEvent.dragStart(card, { dataTransfer: transfer });
        fireEvent.dragOver(column('Abandoned'), { dataTransfer: transfer });
        expect(column('Abandoned').className).toContain('board__column--over');
        fireEvent.drop(column('Abandoned'), { dataTransfer: transfer });
        fireEvent.dragEnd(card, { dataTransfer: transfer });

        expect(within(column('Abandoned')).getByText('Alpha Quest')).toBeTruthy();
        expect(within(column('Untouched')).queryByText('Alpha Quest')).toBeNull();
        expect(JSON.parse(localStorage.getItem('hoardex:demo-backlog') ?? '{}')).toMatchObject({
            '1': { state: 'abandoned' },
        });
    });

    it('ignores anything dropped that is not one of its cards', async () => {
        stubDemo(SMALL);
        renderApp('/demo?view=board');

        const card = cardIn(await screen.findByRole('region', { name: 'Untouched' }), 'Alpha Quest');
        fireEvent.dragStart(card, { dataTransfer: dataTransfer() });
        const foreign = dataTransfer();
        foreign.setData(DRAG_TYPE, '999');
        fireEvent.dragOver(column('Paused'), { dataTransfer: foreign });
        fireEvent.drop(column('Paused'), { dataTransfer: foreign });

        expect(localStorage.getItem('hoardex:demo-backlog')).toBeNull();
    });

    it('shows twelve cards per column, then more on demand', async () => {
        const many = Array.from({ length: 30 }, (_, index) => game(String(index + 1), `Game ${index + 1}`, 0, null));
        stubDemo(library(many));
        const { user } = renderApp('/demo?view=board');

        const untouched = await screen.findByRole('region', { name: 'Untouched' });
        expect(within(untouched).getAllByRole('listitem')).toHaveLength(12);
        await user.click(within(untouched).getByRole('button', { name: 'Show 18 more' }));
        expect(within(untouched).getAllByRole('listitem')).toHaveLength(30);
    });

    it('is read only for a visitor, without empty manual-only columns', async () => {
        stubApi({
            '/api/profile/someone': { body: { kind: 'ok', data: PROFILE } },
            '/api/library/someone': { body: { kind: 'ok', data: SMALL } },
        });
        renderApp('/p/someone?view=board');

        const untouched = await screen.findByRole('region', { name: 'Untouched' });
        expect(cardIn(untouched, 'Alpha Quest').getAttribute('draggable')).toBe('false');
        expect(screen.queryByRole('region', { name: 'Abandoned' })).toBeNull();
        expect(screen.queryByRole('combobox', { name: /^State of/ })).toBeNull();
        expect(screen.queryByText(/^Drag a game/)).toBeNull();
    });
});
