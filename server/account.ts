import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { takeSnapshot } from '../core/accounts/index.js';
import type { CachedAdapter } from '../core/cache/cached-adapter.js';
import type { AuthDeps } from './auth.js';
import type { Accounts } from './deps.js';
import { NO_STORE } from './http.js';
import { requireOwner, type Owner } from './owner.js';
import { endSession } from './session.js';

export interface AccountRouteDeps {
    getData: () => CachedAdapter;
    getAuth: () => AuthDeps;
    getAccounts: () => Accounts;
    now?: () => Date;
}

const settingsBodySchema = z.object({ snapshots: z.boolean() });

// Everything the account page shows and changes; always the signed-in owner's own
export function createAccountRoutes({ getData, getAuth, getAccounts, now = () => new Date() }: AccountRouteDeps) {
    const routes = new Hono();

    async function settings(c: Context, { accounts, account }: Owner) {
        c.header('Cache-Control', NO_STORE);
        return c.json(await accounts.repository.getSettings(account.userId));
    }

    routes.get('/me/account', async (c) => {
        const owner = await requireOwner(c, getAuth, getAccounts, { mutation: false });
        if ('error' in owner) return owner.error;
        return settings(c, owner);
    });

    // Turning snapshots on takes today's at once, so the page shows the first one; off deletes the history
    routes.put('/me/settings', async (c) => {
        const body = settingsBodySchema.safeParse(await c.req.json().catch(() => null));
        const owner = await requireOwner(c, getAuth, getAccounts, { mutation: true });
        if ('error' in owner) return owner.error;
        if (!body.success) {
            c.header('Cache-Control', NO_STORE);
            return c.json({ error: 'invalidInput' }, 400);
        }

        const { accounts, account, identity } = owner;
        await accounts.repository.setSnapshots(account.userId, body.data.snapshots, now());
        if (body.data.snapshots) {
            const library = await getData().getLibrary(identity);
            if (library.kind === 'ok') await takeSnapshot(accounts.repository, account.userId, library.data, now());
        }
        return settings(c, owner);
    });

    // Every device, this one included
    routes.post('/me/sessions/end', async (c) => {
        const owner = await requireOwner(c, getAuth, getAccounts, { mutation: true });
        if ('error' in owner) return owner.error;
        await owner.accounts.repository.endSessions(owner.account.userId);
        endSession(c);
        c.header('Cache-Control', NO_STORE);
        return c.json({ user: null });
    });

    routes.delete('/me', async (c) => {
        const owner = await requireOwner(c, getAuth, getAccounts, { mutation: true });
        if ('error' in owner) return owner.error;
        await owner.accounts.repository.deleteAccount(owner.account.userId);
        await owner.accounts.backlog.forget(owner.identity);
        endSession(c);
        c.header('Cache-Control', NO_STORE);
        return c.json({ user: null });
    });

    return routes;
}
