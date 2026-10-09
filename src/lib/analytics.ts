import { rootRouteId, type AnyRouter } from '@tanstack/react-router';
import { inject, pageview, type BeforeSend } from '@vercel/analytics';

// Drops the query string: it holds the search box text
export function withoutQuery(url: string): string {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.href;
}

// `/p/$profile` as the Routes panel lists it: `/p/[profile]`
export function routePattern(fullPath: string): string {
    return fullPath.replace(/\$([A-Za-z0-9_]+)/g, '[$1]');
}

const beforeSend: BeforeSend = (event) => ({ ...event, url: withoutQuery(event.url) });

// One page view per path change; a search-only change is not one
function trackPageViews(router: AnyRouter): void {
    const send = (path: string) => {
        const leaf = router.state.matches.at(-1);
        const fullPath = leaf && leaf.routeId !== rootRouteId ? router.routesById[leaf.routeId]?.fullPath : undefined;
        pageview({ route: fullPath ? routePattern(fullPath) : null, path });
    };
    router.subscribe('onResolved', ({ pathChanged, toLocation }) => {
        if (pathChanged) send(toLocation.pathname);
    });
    if (router.state.resolvedLocation) send(router.state.resolvedLocation.pathname);
}

// Page views are sent by hand: the script cannot know the route of a client-side navigation
export function startAnalytics(router: AnyRouter): void {
    inject(
        { mode: import.meta.env.PROD ? 'production' : 'development', disableAutoTrack: true, beforeSend },
        import.meta.env.VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG
    );
    trackPageViews(router);
}
