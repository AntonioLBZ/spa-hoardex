// Spike 0A.5: largest value Upstash free accepts. Run: node --env-file=.env.local scripts/spike-redis-limits.ts
import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_KV_REST_API_URL;
const token = process.env.UPSTASH_KV_REST_API_TOKEN;
if (!url || !token) throw new Error('Upstash env vars are not set');

const redis = new Redis({ url, token });
const prefix = 'development:spike:size';
const KB = 1024;
const made: string[] = [];

async function attempt(label: string, run: () => Promise<unknown>) {
    const start = performance.now();
    try {
        await run();
        console.log(`ok    ${label} (${Math.round(performance.now() - start)} ms)`);
        return true;
    } catch (error) {
        console.log(`FAIL  ${label}: ${error instanceof Error ? error.message.slice(0, 160) : String(error)}`);
        return false;
    }
}

try {
    for (const kb of [100, 500, 900, 1024, 2048, 5120]) {
        const key = `${prefix}:string:${kb}`;
        made.push(key);
        const ok = await attempt(`SET one string of ${kb} KB`, () => redis.set(key, 'x'.repeat(kb * KB), { ex: 120 }));
        if (!ok) break;
        const back = await redis.get<string>(key);
        if (back?.length !== kb * KB) console.log(`      GET returned ${back?.length} chars, expected ${kb * KB}`);
    }

    // Same total size split across hash fields, in one command
    for (const [fields, kbEach] of [
        [10, 100],
        [10, 500],
    ] as const) {
        const key = `${prefix}:hash:${fields}x${kbEach}`;
        made.push(key);
        const data = Object.fromEntries(Array.from({ length: fields }, (_, i) => [`f${i}`, 'y'.repeat(kbEach * KB)]));
        await attempt(`HSET ${fields} fields x ${kbEach} KB (one command, ${(fields * kbEach) / KB} MB)`, () =>
            redis.hset(key, data)
        );
    }
} finally {
    await redis.del(...made);
    console.log(`cleaned ${made.length} keys`);
}
