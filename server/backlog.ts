import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { storedStateSchema } from '../core/accounts/schemas.js';
import type { CachedAdapter } from '../core/cache/cached-adapter.js';
import type { EntityId } from '../core/domain/index.js';
import type { AuthDeps } from './auth.js';
import type { Accounts } from './deps.js';
import { NO_STORE, access, failure } from './http.js';
import { requireOwner } from './owner.js';
import { readSession, type Session } from './session.js';

export interface BacklogRouteDeps {
    getData: () => CachedAdapter;
    getAuth: () => AuthDeps;
    getAccounts: () => Accounts;
}

const APPID_PATTERN = /^\d{1,10}$/;
// A tab still on the previous build may send a retired state
const stateBodySchema = z.object({ state: storedStateSchema });

function steamIdentity(session: Session): EntityId {
    return { source: 'steam', externalId: session.steamId };
}

function ok(c: Context, overrides: unknown) {
    c.header('Cache-Control', NO_STORE);
    return c.json({ kind: 'ok', data: { overrides } });
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
        const overrides = await getAccounts().backlog.read(id.data);
        return access(c, { kind: 'ok', data: { overrides } });
    });

    routes.get('/me/backlog', async (c) => {
        const session = await readSession(c, getAuth().secret);
        if (session === null) return failure(c, 'signedOut', 401);
        return ok(c, await getAccounts().backlog.read(steamIdentity(session)));
    });

    // The checks every write shares: the owner, a valid appid
    async function writer(c: Context) {
        const owner = await requireOwner(c, getAuth, getAccounts, { mutation: true });
        if ('error' in owner) return owner;
        const appid = c.req.param('appid') ?? '';
        if (!APPID_PATTERN.test(appid)) return { error: failure(c, 'invalidInput', 400) };
        const game: EntityId = { source: 'steam', externalId: appid };
        return { ...owner, game };
    }

    // Only games of the owner's own library, with their playtime at that moment
    routes.put('/me/backlog/:appid', async (c) => {
        const body = stateBodySchema.safeParse(await c.req.json().catch(() => null));
        const write = await writer(c);
        if ('error' in write) return write.error;
        if (!body.success) return failure(c, 'invalidInput', 400);

        const library = await getData().getLibrary(write.identity);
        if (library.kind !== 'ok') return failure(c, 'library', 409);
        const owned = library.data.games.find((game) => game.id.externalId === write.game.externalId);
        if (owned === undefined) return failure(c, 'notOwned', 404);

        const { accounts, account, identity, game } = write;
        const minutes = owned.playtime.totalMinutes;
        return ok(c, await accounts.backlog.set(account, identity, game, body.data.state, minutes));
    });

    routes.delete('/me/backlog/:appid', async (c) => {
        const write = await writer(c);
        if ('error' in write) return write.error;
        const { accounts, account, identity, game } = write;
        return ok(c, await accounts.backlog.clear(account, identity, game));
    });

    return routes;
}
