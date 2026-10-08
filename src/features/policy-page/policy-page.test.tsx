import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { renderApp } from '@/lib/test/render-app';

beforeEach(() => localStorage.clear());

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
});
