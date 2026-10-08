import { inject, type BeforeSend } from '@vercel/analytics';

// Keeps the path (profile name included); the query string holds what the visitor typed in the search box
export function withoutQuery(url: string): string {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.href;
}

const beforeSend: BeforeSend = (event) => ({ ...event, url: withoutQuery(event.url) });

// Automatic page views only: no track(), no custom events. Development logs to the console instead of sending
// The build config (set by Vercel, absent locally) moves the script and its endpoints to a per-project path
export function startAnalytics(): void {
    inject(
        { mode: import.meta.env.PROD ? 'production' : 'development', beforeSend },
        import.meta.env.VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG
    );
}
