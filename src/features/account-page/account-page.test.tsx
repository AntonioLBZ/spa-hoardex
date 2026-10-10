import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderApp, stubApi } from '@/lib/test/render-app';

const ID = '76561198000000099';
const SIGNED_IN = { '/api/me': { body: { user: { steamId: ID } } } };
const OFF = { snapshotsSince: null, snapshotDays: 0, lastSnapshotOn: null };
const ON = { snapshotsSince: '2026-10-09T16:00:00.000Z', snapshotDays: 1, lastSnapshotOn: '2026-10-09' };

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('account page', () => {
    it('asks a signed-out visitor to sign in and come back here', async () => {
        stubApi({});
        renderApp('/account');

        const link = await screen.findByRole('link', { name: 'Sign in with Steam' });
        expect(screen.getByRole('heading', { name: 'You are not signed in' })).toBeTruthy();
        expect(link.getAttribute('href')).toBe(`/api/auth/steam/login?returnTo=${encodeURIComponent('/account')}`);
    });

    it('turns the playtime history on and shows since when', async () => {
        const fetchMock = stubApi({
            ...SIGNED_IN,
            '/api/me/account': { body: OFF },
            '/api/me/settings': { body: ON },
        });
        const { user } = renderApp('/account');

        const toggle = await screen.findByRole('switch', { name: 'Save my playtime every day' });
        expect(toggle).toHaveProperty('checked', false);
        expect(screen.getByText('Off. Turning it off deletes the saved history.')).toBeTruthy();

        await user.click(toggle);
        expect(fetchMock).toHaveBeenCalledWith('/api/me/settings', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ snapshots: true }),
        });
        expect(await screen.findByText('On since October 9, 2026. 1 day saved.')).toBeTruthy();
        expect(toggle).toHaveProperty('checked', true);
    });

    it('signs out everywhere and goes home signed out', async () => {
        const fetchMock = stubApi({
            ...SIGNED_IN,
            '/api/me/account': { body: OFF },
            '/api/me/sessions/end': { body: { user: null } },
        });
        const { user, router } = renderApp('/account');

        await user.click(await screen.findByRole('button', { name: 'Sign out everywhere' }));
        await waitFor(() => expect(router.state.location.pathname).toBe('/'));
        expect(fetchMock).toHaveBeenCalledWith('/api/me/sessions/end', { method: 'POST' });
        expect(await screen.findByRole('link', { name: 'Sign in with Steam' })).toBeTruthy();
    });

    it('asks before deleting the account, and can be cancelled', async () => {
        const fetchMock = stubApi({
            ...SIGNED_IN,
            '/api/me/account': { body: OFF },
            '/api/me': { body: { user: { steamId: ID } } },
        });
        const { user } = renderApp('/account');

        await user.click(await screen.findByRole('button', { name: 'Delete my account…' }));
        expect(screen.getByText('This cannot be undone. Delete everything?')).toBeTruthy();
        await user.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(screen.queryByRole('button', { name: 'Delete for good' })).toBeNull();
        expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
    });

    it('deletes the account and goes home signed out', async () => {
        const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
            const path = String(input);
            if (path === '/api/me' && init?.method === 'DELETE') return Promise.resolve(Response.json({ user: null }));
            if (path === '/api/me') return Promise.resolve(Response.json({ user: { steamId: ID } }));
            if (path === '/api/me/account') return Promise.resolve(Response.json(OFF));
            return Promise.reject(new Error(`Unexpected request: ${path}`));
        });
        vi.stubGlobal('fetch', fetchMock);
        const { user, router } = renderApp('/account');

        await user.click(await screen.findByRole('button', { name: 'Delete my account…' }));
        await user.click(screen.getByRole('button', { name: 'Delete for good' }));
        await waitFor(() => expect(router.state.location.pathname).toBe('/'));
        expect(fetchMock).toHaveBeenCalledWith('/api/me', { method: 'DELETE' });
        expect(await screen.findByRole('link', { name: 'Sign in with Steam' })).toBeTruthy();
    });
});
