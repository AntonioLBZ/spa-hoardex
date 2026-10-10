import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { BacklogData, CategoryOutcome, GameMinutes } from '../core/accounts/index.js';
import {
    categoryColorSchema,
    categoryNameSchema,
    customIdSchema,
    storedStateSchema,
} from '../core/accounts/schemas.js';
import {
    FALLBACK_STATE,
    MAX_BULK_CHANGE,
    hasCategory,
    isBuiltInState,
    type CategoryId,
} from '../core/backlog/index.js';
import type { CachedAdapter } from '../core/cache/cached-adapter.js';
import type { EntityId } from '../core/domain/index.js';
import type { AuthDeps } from './auth.js';
import type { Accounts } from './deps.js';
import { NO_STORE, access, failure } from './http.js';
import { requireOwner, type Owner } from './owner.js';
import { readSession, type Session } from './session.js';

export interface BacklogRouteDeps {
    getData: () => CachedAdapter;
    getAuth: () => AuthDeps;
    getAccounts: () => Accounts;
}

const APPID_PATTERN = /^\d{1,10}$/;
// A tab still on the previous build may send a retired state
const stateBodySchema = z.object({ state: storedStateSchema });
const bulkBodySchema = z.object({
    appids: z.array(z.string()).min(1).max(MAX_BULK_CHANGE),
    state: storedStateSchema.nullable(),
});
const categoryBodySchema = z.object({ name: categoryNameSchema, color: categoryColorSchema });

interface Change {
    appids: readonly string[];
    // Null: back to the computed state
    state: CategoryId | null;
}

function steamIdentity(session: Session): EntityId {
    return { source: 'steam', externalId: session.steamId };
}

function ok(c: Context, data: BacklogData) {
    c.header('Cache-Control', NO_STORE);
    return c.json({ kind: 'ok', data });
}

function outcome(c: Context, result: CategoryOutcome) {
    switch (result.kind) {
        case 'ok':
            return ok(c, result.data);
        case 'limit':
            return failure(c, 'categoryLimit', 409);
        case 'name':
            return failure(c, 'categoryName', 409);
        case 'notEmpty':
            return failure(c, 'categoryNotEmpty', 409);
        case 'notFound':
            return failure(c, 'unknownCategory', 404);
        case 'fixed':
            return failure(c, 'fixedCategory', 400);
    }
}

// Public reads are cached like the library; the owner reads its own past the CDN
export function createBacklogRoutes({ getData, getAuth, getAccounts }: BacklogRouteDeps) {
    const routes = new Hono();

    // Same input as /profile and /library
    routes.get('/backlog/:input', async (c) => {
        const data = getData();
        const input = data.parseInput(c.req.param('input'));
        if (input.kind === 'invalid') return failure(c, 'invalidInput', 400);
        const id = await data.resolveId(input);
        if (id.kind !== 'ok') return access(c, id);
        return access(c, { kind: 'ok', data: await getAccounts().backlog.read(id.data) });
    });

    routes.get('/me/backlog', async (c) => {
        const session = await readSession(c, getAuth().secret);
        if (session === null) return failure(c, 'signedOut', 401);
        return ok(c, await getAccounts().backlog.read(steamIdentity(session)));
    });

    const owner = (c: Context) => requireOwner(c, getAuth, getAccounts, { mutation: true });

    // Only games of the owner's own library; a new state keeps their playtime at that moment
    async function write(c: Context, change: Change | null) {
        const found = await owner(c);
        if ('error' in found) return found.error;
        if (change === null || !change.appids.every((appid) => APPID_PATTERN.test(appid)))
            return failure(c, 'invalidInput', 400);
        const { appids, state } = change;
        const { accounts, account, identity } = found;
        if (state === null) return ok(c, await accounts.backlog.clear(account, identity, appids));
        const { categories } = await accounts.backlog.read(identity);
        if (!hasCategory(categories, state)) return failure(c, 'unknownCategory', 404);

        const library = await getData().getLibrary(identity);
        if (library.kind !== 'ok') return failure(c, 'library', 409);
        const minutes = new Map(library.data.games.map((game) => [game.id.externalId, game.playtime.totalMinutes]));
        const games: GameMinutes[] = [];
        for (const appid of appids) {
            const played = minutes.get(appid);
            if (played === undefined) return failure(c, 'notOwned', 404);
            games.push({ gameId: appid, minutes: played });
        }
        return ok(c, await accounts.backlog.set(account, identity, games, state));
    }

    // Several games at once; a null state sends them back to the computed one
    routes.put('/me/backlog', async (c) => {
        const body = bulkBodySchema.safeParse(await c.req.json().catch(() => null));
        return write(c, body.success ? body.data : null);
    });

    routes.put('/me/backlog/:appid', async (c) => {
        const body = stateBodySchema.safeParse(await c.req.json().catch(() => null));
        return write(c, body.success ? { appids: [c.req.param('appid')], state: body.data.state } : null);
    });

    routes.delete('/me/backlog/:appid', (c) => write(c, { appids: [c.req.param('appid')], state: null }));

    async function withCategory(c: Context, run: (found: Owner) => Promise<Response>) {
        const found = await owner(c);
        return 'error' in found ? found.error : run(found);
    }

    routes.post('/me/categories', (c) =>
        withCategory(c, async ({ accounts, account, identity }) => {
            const body = categoryBodySchema.safeParse(await c.req.json().catch(() => null));
            if (!body.success) return failure(c, 'invalidInput', 400);
            return outcome(c, await accounts.backlog.createCategory(account, identity, body.data));
        })
    );

    // Only an owner's own categories; built-in ones keep their translated names
    routes.patch('/me/categories/:id', (c) =>
        withCategory(c, async ({ accounts, account, identity }) => {
            const id = customIdSchema.safeParse(c.req.param('id'));
            if (!id.success) return failure(c, 'unknownCategory', 404);
            const body = categoryBodySchema.safeParse(await c.req.json().catch(() => null));
            if (!body.success) return failure(c, 'invalidInput', 400);
            return outcome(c, await accounts.backlog.updateCategory(account, identity, id.data, body.data));
        })
    );

    // Only while empty; a built-in state needs the library to know that
    routes.delete('/me/categories/:id', (c) =>
        withCategory(c, async ({ accounts, account, identity }) => {
            const id = c.req.param('id');
            if (id === FALLBACK_STATE) return failure(c, 'fixedCategory', 400);
            if (isBuiltInState(id)) {
                const library = await getData().getLibrary(identity);
                if (library.kind !== 'ok') return failure(c, 'library', 409);
                return outcome(c, await accounts.backlog.removeState(account, identity, id, library.data.games));
            }
            const custom = customIdSchema.safeParse(id);
            if (!custom.success) return failure(c, 'unknownCategory', 404);
            return outcome(c, await accounts.backlog.deleteCategory(account, identity, custom.data));
        })
    );

    return routes;
}
