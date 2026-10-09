import { createMemoryHistory } from '@tanstack/react-router';
import type { BeforeSend } from '@vercel/analytics';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAppRouter } from '@/router';

import { routePattern, startAnalytics, withoutQuery } from './analytics';

const routerAt = (path: string) => createAppRouter(createMemoryHistory({ initialEntries: [path] }));
const pageviews = () => (window.vaq ?? []).filter(([name]) => name === 'pageview').map(([, props]) => props);

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

describe('routePattern', () => {
    it('writes the params in brackets, as the Routes panel lists them', () => {
        expect(routePattern('/p/$profile')).toBe('/p/[profile]');
        expect(routePattern('/p/$profile/games/$appid')).toBe('/p/[profile]/games/[appid]');
    });

    it('leaves static routes alone', () => {
        expect(routePattern('/')).toBe('/');
        expect(routePattern('/demo')).toBe('/demo');
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
        const router = routerAt('/');
        startAnalytics(router);
        startAnalytics(router);

        const scripts = document.head.querySelectorAll('script[src*="vercel-scripts.com"]');
        expect(scripts).toHaveLength(1);
        expect((scripts[0] as HTMLScriptElement).defer).toBe(true);
    });

    it('moves the script and its endpoints to the path of the build config', () => {
        const analytics = { scriptSrc: 'abc123/script.js', viewEndpoint: 'abc123/view' };
        vi.stubEnv('VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG', JSON.stringify({ analytics }));

        startAnalytics(routerAt('/'));

        const script = document.head.querySelector('script') as HTMLScriptElement;
        expect(script.getAttribute('src')).toBe('/abc123/script.js');
        expect(script.dataset.viewEndpoint).toBe('/abc123/view');
    });

    it('registers a beforeSend that strips the query string', () => {
        startAnalytics(routerAt('/'));

        const entry = window.vaq?.find(([name]) => name === 'beforeSend');
        const beforeSend = entry?.[1] as BeforeSend;
        expect(beforeSend({ type: 'pageview', url: 'https://hoardex.vercel.app/demo?q=abc' })).toEqual({
            type: 'pageview',
            url: 'https://hoardex.vercel.app/demo',
        });
    });

    it('turns off the automatic page views: the script cannot know the route of a navigation', () => {
        startAnalytics(routerAt('/'));

        expect((document.head.querySelector('script') as HTMLScriptElement).dataset.disableAutoTrack).toBe('1');
    });

    it('sends the first page view with its route pattern', async () => {
        const router = routerAt('/p/some-name?q=zelda');
        startAnalytics(router);
        await router.load();

        expect(pageviews()).toEqual([{ route: '/p/[profile]', path: '/p/some-name' }]);
    });

    it('sends the page view of a router that resolved before the call', async () => {
        const router = routerAt('/demo');
        await router.load();
        startAnalytics(router);

        expect(pageviews()).toEqual([{ route: '/demo', path: '/demo' }]);
    });

    it('sends one page view per path change, each with its own route', async () => {
        const router = routerAt('/');
        startAnalytics(router);
        await router.load();
        await router.navigate({ to: '/demo' });
        await router.navigate({ to: '/privacy' });

        expect(pageviews()).toEqual([
            { route: '/', path: '/' },
            { route: '/demo', path: '/demo' },
            { route: '/privacy', path: '/privacy' },
        ]);
    });

    it('does not count a change of filter or search as a page view', async () => {
        const router = routerAt('/demo');
        startAnalytics(router);
        await router.load();
        await router.navigate({ to: '/demo', search: { state: 'backlog' } });
        await router.navigate({ to: '/demo', search: { state: 'backlog', q: 'zelda' } });

        expect(pageviews()).toHaveLength(1);
    });

    it('sends a path that matches no route without a route', async () => {
        const router = routerAt('/nope');
        startAnalytics(router);
        await router.load();

        expect(pageviews()).toEqual([{ route: null, path: '/nope' }]);
    });
});
