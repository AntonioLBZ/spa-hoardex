import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Categories } from '@core/backlog';
import type { Game, Library } from '@core/domain';
import { renderApp, stubApi } from '@/lib/test/render-app';

const ID = '76561198000000099';
const OFF = { snapshotsSince: null, snapshotDays: 0, lastSnapshotOn: null };

function game(appid: string, totalMinutes: number): Game {
    return {
        id: { source: 'steam', externalId: appid },
        name: `Game ${appid}`,
        iconUrl: null,
        hasVisibleStats: false,
        playtime: { totalMinutes, recentMinutes: 0, lastPlayedAt: new Date().toISOString(), platforms: null },
    };
}

const LIBRARY: Library = {
    owner: { source: 'steam', externalId: ID },
    fetchedAt: new Date().toISOString(),
    games: [game('1', 0), game('2', 30), game('3', 30)],
};

const backlog = (categories: Categories = { removed: [], custom: [], colors: {} }) => ({
    body: { kind: 'ok', data: { overrides: {}, categories } },
});

function stubAccount(answers: Record<string, { status?: number; body?: unknown }> = {}) {
    return stubApi({
        '/api/me': { body: { user: { steamId: ID } } },
        '/api/me/account': { body: OFF },
        '/api/me/backlog': backlog(),
        [`/api/library/${ID}`]: { body: { kind: 'ok', data: LIBRARY } },
        ...answers,
    });
}

const section = () => screen.getByRole('region', { name: 'Categories' });
const row = (name: string) => within(section()).getByText(name, { selector: 'span' }).closest('li') as HTMLElement;

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('categories on the account page', () => {
    it('lists every category with its games, and says why one cannot be deleted', async () => {
        stubAccount();
        renderApp('/account');
        await screen.findByRole('heading', { name: 'Categories' });

        await waitFor(() => expect(row('Tried').textContent).toContain('2 games'));
        expect(row('Backlog').textContent).toContain('1 game');
        const backlogDelete = within(row('Backlog')).getByRole('button', { name: 'Delete Backlog' });
        expect(backlogDelete.getAttribute('aria-disabled')).toBe('true');
        expect(backlogDelete.getAttribute('aria-describedby')).toBeTruthy();
        expect(
            within(row('Backlog')).getByText('Backlog cannot be deleted: every game needs a category to fall back on.')
        ).toBeTruthy();
        const triedDelete = within(row('Tried')).getByRole('button', { name: 'Delete Tried' });
        expect(triedDelete.getAttribute('aria-disabled')).toBe('true');
        expect(within(row('Tried')).getByText('Move its 2 games to another category to delete it.')).toBeTruthy();
        expect(within(row('Tried')).getByRole('button', { name: 'Edit Tried' })).toBeTruthy();
    });

    it('deletes an empty built-in category after asking', async () => {
        const fetchMock = stubAccount({
            '/api/me/categories/abandoned': backlog({ removed: ['abandoned'], custom: [], colors: {} }),
        });
        const { user } = renderApp('/account');
        const remove = await within(await screen.findByRole('region', { name: 'Categories' })).findByRole('button', {
            name: 'Delete Abandoned',
        });
        await waitFor(() => expect(remove.getAttribute('aria-disabled')).toBe('false'));
        await user.click(remove);
        expect(screen.getByText('Delete Abandoned? You can bring it back from “New category”.')).toBeTruthy();
        await user.click(screen.getByRole('button', { name: 'Delete Abandoned' }));

        await waitFor(() => expect(within(section()).queryByText('Abandoned', { selector: 'span' })).toBeNull());
        expect(fetchMock).toHaveBeenCalledWith('/api/me/categories/abandoned', { method: 'DELETE' });
    });

    it('creates a category with a custom colour', async () => {
        const created = { id: 'c-0a1b2c3d', name: 'Co-op', color: '#123456' } as const;
        const fetchMock = stubAccount({
            '/api/me/categories': backlog({ removed: [], custom: [created], colors: {} }),
        });
        const { user } = renderApp('/account');

        await user.click(await screen.findByRole('button', { name: 'New category' }));
        await user.type(screen.getByRole('textbox', { name: 'Name' }), '  Co-op ');
        fireEvent.change(screen.getByLabelText('Pick a custom colour'), { target: { value: '#123456' } });
        await user.click(screen.getByRole('button', { name: 'Create category' }));

        expect(fetchMock).toHaveBeenCalledWith('/api/me/categories', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'Co-op', color: '#123456' }),
        });
        expect(await within(section()).findByText('Co-op', { selector: 'span' })).toBeTruthy();
        expect(within(row('Co-op')).getByRole('button', { name: 'Edit Co-op' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Create category' })).toBeNull();
    });

    it('says why a category could not be created', async () => {
        stubAccount({ '/api/me/categories': { status: 409, body: { error: 'categoryName' } } });
        const { user } = renderApp('/account');

        await user.click(await screen.findByRole('button', { name: 'New category' }));
        await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Tried');
        await user.click(screen.getByRole('button', { name: 'Create category' }));

        expect((await screen.findByRole('alert')).textContent).toBe('You already have a category with that name.');
    });

    it('checks the name before sending it', async () => {
        const fetchMock = stubAccount();
        const { user } = renderApp('/account');

        await user.click(await screen.findByRole('button', { name: 'New category' }));
        await user.click(screen.getByRole('button', { name: 'Create category' }));

        expect(screen.getByRole('textbox', { name: 'Name' }).getAttribute('aria-invalid')).toBe('true');
        expect(fetchMock.mock.calls.some(([path]) => path === '/api/me/categories')).toBe(false);
    });

    it('edits the name and colour of a category of its own', async () => {
        const own = { id: 'c-0a1b2c3d', name: 'Co-op', color: 'p2' } as const;
        const fetchMock = stubAccount({
            '/api/me/backlog': backlog({ removed: [], custom: [own], colors: {} }),
            '/api/me/categories/c-0a1b2c3d': backlog({
                removed: [],
                custom: [{ ...own, name: 'Friends', color: 'p3' }],
                colors: {},
            }),
        });
        const { user } = renderApp('/account');

        await user.click(await screen.findByRole('button', { name: 'Edit Co-op' }));
        expect(screen.getByRole('radio', { name: 'Colour 2' })).toHaveProperty('checked', true);
        expect(screen.queryByRole('radio', { name: 'Default' })).toBeNull();
        const name = screen.getByRole('textbox', { name: 'Name' });
        await user.clear(name);
        await user.type(name, 'Friends');
        await user.click(screen.getByRole('radio', { name: 'Colour 3' }));
        await user.click(screen.getByRole('button', { name: 'Save' }));

        expect(fetchMock).toHaveBeenCalledWith('/api/me/categories/c-0a1b2c3d', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'Friends', color: 'p3' }),
        });
        expect(await within(section()).findByText('Friends', { selector: 'span' })).toBeTruthy();
    });

    it('cannot delete anything while the library is unknown, and says so', async () => {
        stubAccount({ [`/api/library/${ID}`]: { status: 500, body: {} } });
        renderApp('/account');

        const message = 'Your library could not be loaded, so it is not known whether this category is empty.';
        expect(
            (await within(await screen.findByRole('region', { name: 'Categories' })).findAllByText(message)).length
        ).toBe(5);
        expect(
            within(row('Abandoned')).getByRole('button', { name: 'Delete Abandoned' }).getAttribute('aria-disabled')
        ).toBe('true');
    });

    it('offers no new category at the limit', async () => {
        const custom = Array.from({ length: 6 }, (_, index) => ({
            id: `c-0000000${index}` as const,
            name: `Shelf ${index}`,
            color: 'p1',
        }));
        stubAccount({ '/api/me/backlog': backlog({ removed: [], custom, colors: {} }) });
        renderApp('/account');

        expect(
            await screen.findByText('You have the maximum of 12 categories. Delete one to make another.')
        ).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'New category' })).toBeNull();
    });

    it('changes only the colour of a built-in category, and can give it its own back', async () => {
        const fetchMock = stubAccount({
            '/api/me/backlog': backlog({ removed: [], custom: [], colors: { paused: 'p4' } }),
            '/api/me/categories/paused': backlog(),
        });
        const { user } = renderApp('/account');

        await user.click(await screen.findByRole('button', { name: 'Edit Paused' }));
        expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
        expect(screen.getByRole('radio', { name: 'Colour 4' })).toHaveProperty('checked', true);
        await user.click(screen.getByRole('radio', { name: 'Default' }));
        await user.click(screen.getByRole('button', { name: 'Save' }));

        expect(fetchMock).toHaveBeenCalledWith('/api/me/categories/paused', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ color: null }),
        });
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).toBeNull());
    });

    it('offers the deleted built-in categories back when making a new one', async () => {
        const fetchMock = stubAccount({
            '/api/me/backlog': backlog({ removed: ['paused', 'abandoned'], custom: [], colors: {} }),
            '/api/me/categories/abandoned/restore': backlog({ removed: ['paused'], custom: [], colors: {} }),
        });
        const { user } = renderApp('/account');

        await user.click(await screen.findByRole('button', { name: 'New category' }));
        const choices = screen.getByRole('group', { name: 'Bring back a built-in one:' });
        expect(
            within(choices)
                .getAllByRole('button')
                .map((button) => button.getAttribute('aria-label'))
        ).toEqual(['Bring back Paused', 'Bring back Abandoned']);
        await user.click(within(choices).getByRole('button', { name: 'Bring back Abandoned' }));

        expect(fetchMock).toHaveBeenCalledWith('/api/me/categories/abandoned/restore', { method: 'POST' });
        expect(await within(section()).findByText('Abandoned', { selector: 'span' })).toBeTruthy();
        expect(screen.queryByRole('group', { name: 'Bring back a built-in one:' })).toBeNull();
    });

    it('says why a built-in category could not come back', async () => {
        stubAccount({
            '/api/me/backlog': backlog({ removed: ['paused'], custom: [], colors: {} }),
            '/api/me/categories/paused/restore': { status: 409, body: { error: 'categoryLimit' } },
        });
        const { user } = renderApp('/account');

        await user.click(await screen.findByRole('button', { name: 'New category' }));
        await user.click(screen.getByRole('button', { name: 'Bring back Paused' }));

        expect((await screen.findByRole('alert')).textContent).toBe('You already have the maximum of 12 categories.');
    });
});
