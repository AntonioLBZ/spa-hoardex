import { rootRouteId, type AnyRouter } from '@tanstack/react-router';
import { inject, pageview, type BeforeSend } from '@vercel/analytics';

// Keeps the path (profile name included); the query string holds what the visitor typed in the search box
export function withoutQuery(url: string): string {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.href;
}

// A route as the Routes panel lists it: `/p/$profile` becomes `/p/[profile]`
export function routePattern(fullPath: string): string {
    return fullPath.replace(/\$([A-Za-z0-9_]+)/g, '[$1]');
}

const beforeSend: BeforeSend = (event) => ({ ...event, url: withoutQuery(event.url) });

// One page view per resolved path with its route pattern, read from the route tree so a new route needs no change here.
// A change of the query string only (filters, search) is not a page view
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

// Page views are sent by hand (no auto tracking): the script cannot know the route of a client-side navigation.
// Development logs to the console instead of sending
// The build config (set by Vercel, absent locally) moves the script and its endpoints to a per-project path
export function startAnalytics(router: AnyRouter): void {
    inject(
        { mode: import.meta.env.PROD ? 'production' : 'development', disableAutoTrack: true, beforeSend },
        import.meta.env.VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG
    );
    trackPageViews(router);
}
