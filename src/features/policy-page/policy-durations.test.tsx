import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderApp } from '@/lib/test/render-app';

vi.mock('@core/cache/ttl', () => ({
    CACHE_TTL: {
        alias: 3 * 86_400,
        profile: 3 * 3600,
        library: 3600,
        private: 60,
        notFound: 90,
        refresh: 15 * 60,
        refreshRetry: 60,
    },
}));

beforeEach(() => localStorage.clear());

describe('privacy policy durations', () => {
    it('are the cache TTLs, with the right plural', async () => {
        renderApp('/privacy');

        const text = (await screen.findByRole('article')).textContent;
        expect(text).toContain('SteamID it matches: 3 days.');
        expect(text).toContain('creation date: 3 hours.');
        expect(text).toContain('last-played dates: 1 hour.');
        expect(text).toContain('“not found” answer: 90 seconds. A “private” answer: 1 minute.');
        expect(text).toContain('the time: 15 minutes (1 minute if the refresh failed)');
        expect(text).toContain('within 3 days, most within 3 hours');
        expect(text).toContain('its wait of 15 minutes ends');
    });

    it('are written in the language of the page', async () => {
        localStorage.setItem('hoardex:locale', 'es');
        renderApp('/privacy');

        const text = (await screen.findByRole('article')).textContent;
        expect(text).toContain('al que corresponde: 3 días.');
        expect(text).toContain('de la última partida: 1 hora.');
        expect(text).toContain('«no encontrado»: 90 segundos. Una respuesta «privado»: 1 minuto.');
        expect(text).toContain('en 3 días como máximo, la mayoría en 3 horas');
    });
});
