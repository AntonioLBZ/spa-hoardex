import { timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { runSnapshots } from '../core/accounts/index.js';
import type { CachedAdapter } from '../core/cache/cached-adapter.js';
import type { Accounts } from './deps.js';
import { failure, noStore } from './http.js';

export interface CronRouteDeps {
    getData: () => CachedAdapter;
    getAccounts: () => Accounts;
    // Vercel sends it as a bearer token on every cron call
    getCronSecret: () => string;
    // Milliseconds a run may start new accounts; the function itself may last 300 s
    budgetMs?: number;
}

const DEFAULT_BUDGET_MS = 240_000;

function sameSecret(given: string, expected: string): boolean {
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

export function createCronRoutes({ getData, getAccounts, getCronSecret, budgetMs = DEFAULT_BUDGET_MS }: CronRouteDeps) {
    const routes = new Hono();

    routes.get('/cron/snapshots', async (c) => {
        const header = c.req.header('authorization') ?? '';
        if (!sameSecret(header, `Bearer ${getCronSecret()}`)) return failure(c, 'unauthorized', 401);

        const data = getData();
        const result = await runSnapshots({
            repository: getAccounts().repository,
            getLibrary: (identity) => data.getLibrary(identity),
            deadline: Date.now() + budgetMs,
        });
        console.info('[cron] snapshots', JSON.stringify(result));
        noStore(c);
        return c.json(result);
    });

    return routes;
}
