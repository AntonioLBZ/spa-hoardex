import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Library, Profile } from '@core/domain';
import { renderApp, stubApi } from '@/lib/test/render-app';

const ID = '76561198000000078';

const PROFILE: Profile = {
    id: { source: 'steam', externalId: ID },
    displayName: 'Test Person',
    avatarUrl: 'https://example.invalid/avatar.jpg',
    profileUrl: 'https://example.invalid/profile',
    visibility: 'public',
    createdAt: null,
};

const LIBRARY: Library = { owner: PROFILE.id, fetchedAt: new Date().toISOString(), games: [] };

const PAGE = {
    '/api/profile/someone': { body: { kind: 'ok', data: PROFILE } },
    '/api/library/someone': { body: { kind: 'ok', data: LIBRARY } },
};

const bubble = () => screen.queryByRole('complementary', { name: 'Is this library yours?' });

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('owner bubble', () => {
    it('invites a signed-out visitor of a profile to sign in and come back to it', async () => {
        stubApi(PAGE);
        renderApp('/p/someone');

        const link = await screen.findByRole('link', { name: 'Continue with Steam' });
        expect(link.getAttribute('href')).toBe(`/api/auth/steam/login?returnTo=${encodeURIComponent('/p/someone')}`);
        expect(bubble()).toBeTruthy();
    });

    it('is not shown to a signed-in visitor', async () => {
        stubApi({
            ...PAGE,
            '/api/me': { body: { user: { steamId: ID } } },
            [`/api/profile/${ID}`]: { body: { kind: 'ok', data: PROFILE } },
        });
        renderApp('/p/someone');

        await screen.findByRole('button', { name: 'Account menu' });
        expect(bubble()).toBeNull();
    });

    it('is not shown in the demo', async () => {
        stubApi({
            '/api/demo/profile': { body: { kind: 'ok', data: PROFILE } },
            '/api/demo/library': { body: { kind: 'ok', data: LIBRARY } },
        });
        renderApp('/demo');

        await screen.findByRole('heading', { name: 'Test Person' });
        await screen.findByRole('link', { name: /^Sign in/ });
        expect(bubble()).toBeNull();
    });

    it('stays closed on every profile once dismissed', async () => {
        stubApi(PAGE);
        const { user } = renderApp('/p/someone');

        await user.click(await screen.findByRole('button', { name: 'Dismiss' }));
        expect(bubble()).toBeNull();

        cleanup();
        renderApp('/p/someone');
        await screen.findByRole('link', { name: /^Sign in/ });
        await waitFor(() => expect(screen.getByRole('heading', { name: 'Test Person' })).toBeTruthy());
        expect(bubble()).toBeNull();
    });
});
