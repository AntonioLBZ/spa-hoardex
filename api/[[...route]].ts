import { Hono } from 'hono';
import { handle } from 'hono/vercel';

const VANITY = /^[A-Za-z0-9_-]{2,32}$/;
const CACHE = 'public, s-maxage=60, stale-while-revalidate=300';

const app = new Hono().basePath('/api');

app.get('/health', (c) => {
    c.header('Cache-Control', CACHE);
    return c.json({ ok: true, at: new Date().toISOString() });
});

app.get('/resolve/:vanity', async (c) => {
    const vanity = c.req.param('vanity');
    if (!VANITY.test(vanity)) return c.json({ error: 'invalid vanity' }, 400);

    const key = process.env.STEAM_API_KEY;
    if (!key) return c.json({ error: 'STEAM_API_KEY is not set' }, 500);

    const url = new URL('https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/');
    url.searchParams.set('key', key);
    url.searchParams.set('vanityurl', vanity);

    const res = await fetch(url);
    const body = await res.json();

    c.header('Cache-Control', CACHE);
    return c.json({ upstreamStatus: res.status, eresult: res.headers.get('x-eresult'), body });
});

export const GET = handle(app);
