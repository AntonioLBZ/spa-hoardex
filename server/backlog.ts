import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { MANUAL_STATES } from '../core/backlog/index.js';
import type { CachedAdapter } from '../core/cache/cached-adapter.js';
import type { EntityId } from '../core/domain/index.js';
import { isSameOrigin, type AuthDeps } from './auth.js';
import type { Accounts } from './deps.js';
import { NO_STORE, access, failure } from './http.js';
import { readSession, type Session } from './session.js';

export interface BacklogRouteDeps {
    getData: () => CachedAdapter;
    getAuth: () => AuthDeps;
    getAccounts: () => Accounts;
}

const APPID_PATTERN = /^\d{1,10}$/;
const stateBodySchema = z.object({ state: z.enum(MANUAL_STATES) });

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

    // The checks every write shares: our origin, a live session, a valid appid
    async function writer(c: Context) {
        const auth = getAuth();
        if (!isSameOrigin(c, auth)) return { error: failure(c, 'origin', 403) };
        const session = await readSession(c, auth.secret);
        if (session === null) return { error: failure(c, 'signedOut', 401) };
        const appid = c.req.param('appid') ?? '';
        if (!APPID_PATTERN.test(appid)) return { error: failure(c, 'invalidInput', 400) };

        const accounts = getAccounts();
        const identity = steamIdentity(session);
        const account = await accounts.repository.findAccount(identity);
        if (account === null || account.sessionEpoch !== session.epoch) return { error: failure(c, 'signedOut', 401) };
        const game: EntityId = { source: 'steam', externalId: appid };
        return { accounts, account, identity, game };
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
