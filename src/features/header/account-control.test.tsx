import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderApp, stubApi } from '@/lib/test/render-app';

const ID = '76561198000000001';

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('account control', () => {
    it('offers to sign in with Steam and come back to the same page', async () => {
        stubApi({});
        renderApp('/privacy');

        const link = await screen.findByRole('link', { name: 'Sign in with Steam' });
        expect(link.getAttribute('href')).toBe(`/api/auth/steam/login?returnTo=${encodeURIComponent('/privacy')}`);
        expect(screen.queryByRole('link', { name: 'My library' })).toBeNull();
    });

    it('links to the own library in the header, keeps the rest behind the avatar, and signs out', async () => {
        const fetchMock = stubApi({
            '/api/me': { body: { user: { steamId: ID } } },
            [`/api/profile/${ID}`]: {
                body: {
                    kind: 'ok',
                    data: {
                        id: { source: 'steam', externalId: ID },
                        displayName: 'Menu Person',
                        avatarUrl: 'https://example.invalid/avatar.jpg',
                        profileUrl: 'https://example.invalid/profile',
                        visibility: 'public',
                        createdAt: null,
                    },
                },
            },
            '/api/auth/logout': { body: { user: null } },
        });
        const { user } = renderApp('/privacy');

        const trigger = await screen.findByRole('button', { name: 'Account menu' });
        await waitFor(() =>
            expect(trigger.querySelector('img')?.getAttribute('src')).toBe('https://example.invalid/avatar.jpg')
        );
        const menu = document.getElementById(trigger.getAttribute('aria-controls') ?? '');
        expect(menu?.hidden).toBe(true);
        await user.click(trigger);
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        expect(menu?.hidden).toBe(false);
        expect(within(menu!).getByText('Menu Person')).toBeTruthy();
        expect(within(menu!).queryByRole('link', { name: 'My library' })).toBeNull();
        const library = screen.getByRole('link', { name: 'My library' });
        expect(library.getAttribute('href')).toBe(`/p/${ID}`);
        expect(within(menu!).getByRole('link', { name: 'Account settings' }).getAttribute('href')).toBe('/account');
        expect(screen.queryByRole('link', { name: 'Sign in with Steam' })).toBeNull();

        await user.keyboard('{Escape}');
        expect(menu?.hidden).toBe(true);
        expect(document.activeElement).toBe(trigger);
        await user.click(trigger);
        await user.click(within(menu!).getByRole('button', { name: 'Sign out' }));
        expect(await screen.findByRole('link', { name: 'Sign in with Steam' })).toBeTruthy();
        expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    });

    it('shows nothing until the session is known', async () => {
        let answer: (response: Response) => void = () => {};
        vi.stubGlobal(
            'fetch',
            vi.fn(() => new Promise<Response>((resolve) => (answer = resolve)))
        );
        renderApp('/privacy');

        await screen.findByRole('heading', { level: 1 });
        expect(screen.queryByRole('link', { name: 'Sign in with Steam' })).toBeNull();
        answer(Response.json({ user: null }));
        await waitFor(() => expect(screen.getByRole('link', { name: 'Sign in with Steam' })).toBeTruthy());
    });

    it('says so on the entry screen when a sign-in failed', async () => {
        stubApi({});
        renderApp('/?login=failed');

        expect((await screen.findByRole('alert')).textContent).toBe('Signing in with Steam did not work. Try again.');
    });
});
