import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { CACHE_TTL } from '@core/cache/cached-adapter';
import en from '@/assets/locales/en.json';
import { renderApp } from '@/lib/test/render-app';

beforeEach(() => localStorage.clear());

// 3600 -> "1 hour", 600 -> "10 minutes"
function describeDuration(seconds: number): string {
    const [unit, size] =
        seconds % 86400 === 0 ? ['day', 86400] : seconds % 3600 === 0 ? ['hour', 3600] : ['minute', 60];
    const count = seconds / Number(size);
    return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

describe('privacy policy', () => {
    it('opens from the footer', async () => {
        const { router, user } = renderApp('/');
        await user.click(await screen.findByRole('link', { name: 'Privacy policy' }));

        expect(router.state.location.pathname).toBe('/privacy');
        expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Privacy policy');
    });

    it('is translated', async () => {
        localStorage.setItem('hoardex:locale', 'es');
        renderApp('/privacy');

        expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Política de privacidad');
    });

    it('mails the address with the repo tag but shows it without', async () => {
        renderApp('/privacy');

        const mail = await screen.findByRole('link', { name: /^[^@+\s]+@[^@+\s]+$/ });
        expect(mail.textContent).toContain('+hoard@');
        expect(mail.getAttribute('href')).toBe(`mailto:${mail.textContent}`);
    });

    it('opens the host policy in a new tab without a referrer', async () => {
        renderApp('/privacy');

        const link = await screen.findByRole('link', { name: /Vercel’s privacy policy/ });
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('states the durations the cache really uses', () => {
        const { items } = en.policy.storage;

        expect(items.alias).toContain(describeDuration(CACHE_TTL.alias));
        expect(items.profile).toContain(describeDuration(CACHE_TTL.profile));
        expect(items.library).toContain(describeDuration(CACHE_TTL.library));
        expect(items.misses).toContain(describeDuration(CACHE_TTL.notFound));
        expect(items.misses).toContain(describeDuration(CACHE_TTL.private));
        expect(items.cooldown).toContain(describeDuration(CACHE_TTL.refresh));
        expect(items.cooldown).toContain(describeDuration(CACHE_TTL.refreshRetry));
    });
});
