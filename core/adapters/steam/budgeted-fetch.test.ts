import { describe, expect, it } from 'vitest';
import { createDailyBudget } from '../../cache/budget.js';
import { createMemoryStore } from '../../cache/store.js';
import { createSteamAdapter } from './index.js';
import { withBudget } from './budgeted-fetch.js';
import { TEST_KEY, createFakeFetch, routes } from './test-utils.js';

describe('withBudget', () => {
    it('forwards requests while the budget lasts', async () => {
        const fake = createFakeFetch(() => new Response('{}'));
        const budgeted = withBudget(fake.fetch, { tryConsume: async () => true });
        expect((await budgeted('https://api.steampowered.com/x')).status).toBe(200);
        expect(fake.calls).toHaveLength(1);
    });

    it('answers like a Steam throttle without reaching Steam once the budget is spent', async () => {
        const fake = createFakeFetch(() => new Response('{}'));
        const budgeted = withBudget(fake.fetch, { tryConsume: async () => false });
        const response = await budgeted('https://api.steampowered.com/x');
        expect(response.status).toBe(429);
        expect(response.headers.get('x-eresult')).toBe('84');
        expect(await response.json()).toEqual({ response: {} });
        expect(fake.calls).toEqual([]);
    });

    it('makes the adapter report rateLimited and counts every Steam call', async () => {
        const fake = createFakeFetch(routes({ summaries: 'GetPlayerSummaries.public' }));
        const budget = createDailyBudget({ store: createMemoryStore(), name: 'steam', limit: 1 });
        const adapter = createSteamAdapter({ apiKey: TEST_KEY, fetch: withBudget(fake.fetch, budget) });

        const first = await adapter.resolveProfile('76561198000000001');
        expect(first.kind).toBe('ok');
        expect(await adapter.resolveProfile('76561198000000001')).toEqual({ kind: 'rateLimited' });
        expect(fake.calls).toHaveLength(1);
    });
});
