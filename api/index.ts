import { Hono } from 'hono';
import { handle } from 'hono/vercel';

import { createRedis, nsKey } from '../core/cache/redis.js';

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

// Spike 0A.5: Redis round trip. Never served in production
app.get('/spike/redis', async (c) => {
    const namespace = process.env.VERCEL_ENV ?? 'development';
    if (namespace === 'production') return c.json({ error: 'not found' }, 404);

    const url = process.env.UPSTASH_KV_REST_API_URL;
    const token = process.env.UPSTASH_KV_REST_API_TOKEN;
    if (!url || !token) return c.json({ error: 'Upstash env vars are not set' }, 500);

    const redis = createRedis({ url, token, namespace });
    const timings: Record<string, number> = {};
    const time = async <T>(label: string, run: () => Promise<T>) => {
        const start = performance.now();
        const result = await run();
        timings[label] = Math.round(performance.now() - start);
        return result;
    };

    const k = nsKey({ namespace }, 'spike', 'roundtrip');
    const h = nsKey({ namespace }, 'spike', 'hash');
    const ping = await time('ping', () => redis.ping());
    await time('set', () => redis.set(k, { at: Date.now() }, { ex: 60 }));
    const got = await time('get', () => redis.get(k));
    await time('hset', () => redis.hset(h, { '1': 'a', '2': 'b', '3': 'c' }));
    const all = await time('hgetall', () => redis.hgetall(h));
    await time('del', () => redis.del(k, h));

    return c.json({ namespace, ping, got, all, timingsMs: timings });
});

export const GET = handle(app);
