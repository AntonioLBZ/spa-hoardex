import type { BeforeSend } from '@vercel/analytics';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { startAnalytics, withoutQuery } from './analytics';

describe('withoutQuery', () => {
    it('keeps the path, profile name included', () => {
        expect(withoutQuery('https://hoardex.vercel.app/p/some-name')).toBe('https://hoardex.vercel.app/p/some-name');
    });

    it('drops the query string and the hash', () => {
        expect(withoutQuery('https://hoardex.vercel.app/demo?q=secret&state=backlog&sort=name#top')).toBe(
            'https://hoardex.vercel.app/demo'
        );
    });
});

describe('startAnalytics', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        document.head.querySelectorAll('script').forEach((script) => script.remove());
        delete window.va;
        delete window.vaq;
        delete window.vam;
    });

    it('adds one deferred script', () => {
        startAnalytics();
        startAnalytics();

        const scripts = document.head.querySelectorAll('script[src*="vercel-scripts.com"]');
        expect(scripts).toHaveLength(1);
        expect((scripts[0] as HTMLScriptElement).defer).toBe(true);
    });

    it('moves the script and its endpoints to the path of the build config', () => {
        const analytics = { scriptSrc: 'abc123/script.js', viewEndpoint: 'abc123/view' };
        vi.stubEnv('VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG', JSON.stringify({ analytics }));

        startAnalytics();

        const script = document.head.querySelector('script') as HTMLScriptElement;
        expect(script.getAttribute('src')).toBe('/abc123/script.js');
        expect(script.dataset.viewEndpoint).toBe('/abc123/view');
    });

    it('registers a beforeSend that strips the query string', () => {
        startAnalytics();

        const entry = window.vaq?.find(([name]) => name === 'beforeSend');
        const beforeSend = entry?.[1] as BeforeSend;
        expect(beforeSend({ type: 'pageview', url: 'https://hoardex.vercel.app/demo?q=abc' })).toEqual({
            type: 'pageview',
            url: 'https://hoardex.vercel.app/demo',
        });
    });
});
