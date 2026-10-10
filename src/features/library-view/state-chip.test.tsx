import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BACKLOG_STATES } from '@core/backlog';
import type { Game, Library, Profile } from '@core/domain';
import en from '@/assets/locales/en.json';
import { resetDemoBacklog } from '@/features/profile-page/demo-backlog';
import { renderApp, stubApi } from '@/lib/test/render-app';

const PROFILE: Profile = {
    id: { source: 'steam', externalId: '76561198000000089' },
    displayName: 'Menu Person',
    avatarUrl: 'https://example.invalid/avatar.jpg',
    profileUrl: 'https://example.invalid/profile',
    visibility: 'public',
    createdAt: null,
};

function game(appid: string, name: string, totalMinutes: number): Game {
    return {
        id: { source: 'steam', externalId: appid },
        name,
        iconUrl: null,
        hasVisibleStats: false,
        playtime: { totalMinutes, recentMinutes: 0, lastPlayedAt: null, platforms: null },
    };
}

const LIBRARY: Library = {
    owner: PROFILE.id,
    fetchedAt: new Date().toISOString(),
    games: [game('1', 'Alpha Quest', 0), game('2', 'Beta Run', 30)],
};

async function openDemo(path = '/demo') {
    stubApi({
        '/api/demo/profile': { body: { kind: 'ok', data: PROFILE } },
        '/api/demo/library': { body: { kind: 'ok', data: LIBRARY } },
    });
    const app = renderApp(path);
    const button = await screen.findByRole('button', { name: 'State of Alpha Quest: Backlog' });
    return { ...app, button };
}

const stored = () => JSON.parse(localStorage.getItem('hoardex:demo-backlog') ?? '{}') as Record<string, unknown>;
const items = () => screen.getAllByRole('menuitemradio');

beforeEach(() => {
    localStorage.clear();
    resetDemoBacklog();
});
afterEach(() => vi.unstubAllGlobals());

describe('state menu', () => {
    it('lists the automatic state and every state, and marks the current one', async () => {
        const { button, user } = await openDemo();
        expect(button.getAttribute('aria-haspopup')).toBe('menu');
        expect(button.getAttribute('aria-expanded')).toBe('false');

        await user.click(button);

        const menu = screen.getByRole('menu', { name: 'State of Alpha Quest' });
        expect(button.getAttribute('aria-expanded')).toBe('true');
        expect(button.getAttribute('aria-controls')).toBe(menu.id);
        expect(items().map((item) => item.textContent)).toEqual([
            'Automatic (Backlog)',
            ...BACKLOG_STATES.map((state) => en.dashboard.states[state]),
        ]);
        expect(items().filter((item) => item.getAttribute('aria-checked') === 'true')).toEqual([items()[0]]);
        expect(document.activeElement).toBe(items()[0]);
    });

    it('moves with the arrows, Home and End, wrapping at both ends', async () => {
        const { button, user } = await openDemo();
        button.focus();
        await user.keyboard('{ArrowDown}');
        const last = items().length - 1;

        expect(document.activeElement).toBe(items()[0]);
        await user.keyboard('{ArrowDown}');
        expect(document.activeElement).toBe(items()[1]);
        await user.keyboard('{ArrowUp}{ArrowUp}');
        expect(document.activeElement).toBe(items()[last]);
        await user.keyboard('{ArrowDown}');
        expect(document.activeElement).toBe(items()[0]);
        await user.keyboard('{End}');
        expect(document.activeElement).toBe(items()[last]);
        await user.keyboard('{Home}');
        expect(document.activeElement).toBe(items()[0]);
        expect(items().filter((item) => item.tabIndex === 0)).toEqual([items()[0]]);
    });

    it('jumps to the state that starts with a typed letter', async () => {
        const { button, user } = await openDemo();
        await user.click(button);

        await user.keyboard('p');
        expect(document.activeElement?.textContent).toBe('Paused');
    });

    it('picks the focused state with Enter or Space and gives focus back to the button', async () => {
        const { button, user } = await openDemo();
        await user.click(button);

        await user.keyboard('p{Enter}');
        expect(screen.queryByRole('menu')).toBeNull();
        expect(document.activeElement).toBe(button);
        expect(stored()['1']).toMatchObject({ state: 'paused' });
        expect(button.textContent).toContain('Paused');

        await user.keyboard('{Enter}');
        expect(document.activeElement?.textContent).toBe('Paused');
        await user.keyboard('{Home} ');
        expect(stored()).toEqual({});
        expect(document.activeElement).toBe(button);
    });

    it('closes on Escape without a change and gives focus back to the button', async () => {
        const { button, user } = await openDemo();
        await user.click(button);
        await user.keyboard('{ArrowDown}{Escape}');

        expect(screen.queryByRole('menu')).toBeNull();
        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(button);
        expect(stored()).toEqual({});
    });

    it('closes on a click outside, and when the same button is pressed again', async () => {
        const { button, user } = await openDemo();
        await user.click(button);
        await user.click(screen.getByRole('heading', { name: 'Library' }));
        expect(screen.queryByRole('menu')).toBeNull();

        await user.click(button);
        await user.click(button);
        expect(screen.queryByRole('menu')).toBeNull();
        expect(stored()).toEqual({});
    });

    it('opens one menu at a time', async () => {
        const { button, user } = await openDemo();
        await user.click(button);
        await user.click(screen.getByRole('button', { name: /^State of Beta Run:/ }));

        expect(screen.getAllByRole('menu')).toHaveLength(1);
        expect(screen.getByRole('menu').getAttribute('aria-label')).toBe('State of Beta Run');
    });

    it('shows a game set by hand with a note for screen readers', async () => {
        const { button, user } = await openDemo();
        await user.click(button);
        await user.click(screen.getByRole('menuitemradio', { name: 'Abandoned' }));

        expect(screen.getByRole('button', { name: 'State of Alpha Quest: Abandoned · Set by hand' })).toBe(button);
        expect(button.getAttribute('title')).toBe('Set by hand');
    });
});
