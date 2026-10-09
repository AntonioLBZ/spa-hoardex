import { screen, waitFor } from '@testing-library/react';
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
    });

    it('links to the visitor’s own profile once signed in, and signs out', async () => {
        const fetchMock = stubApi({
            '/api/me': { body: { user: { steamId: ID } } },
            '/api/auth/logout': { body: { user: null } },
        });
        const { user } = renderApp('/privacy');

        const profile = await screen.findByRole('link', { name: 'My profile' });
        expect(profile.getAttribute('href')).toBe(`/p/${ID}`);
        expect(screen.queryByRole('link', { name: 'Sign in with Steam' })).toBeNull();

        await user.click(screen.getByRole('button', { name: 'Sign out' }));
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
