import type { Context } from 'hono';
import type { Account } from '../core/accounts/index.js';
import type { EntityId } from '../core/domain/index.js';
import { isSameOrigin, type AuthDeps } from './auth.js';
import type { Accounts } from './deps.js';
import { failure } from './http.js';
import { readSession } from './session.js';

export interface Owner {
    auth: AuthDeps;
    accounts: Accounts;
    account: Account;
    identity: EntityId;
}

// A live session whose account still exists with the same epoch; mutations must also come from our own pages
export async function requireOwner(
    c: Context,
    getAuth: () => AuthDeps,
    getAccounts: () => Accounts,
    { mutation }: { mutation: boolean }
): Promise<Owner | { error: Response }> {
    const auth = getAuth();
    if (mutation && !isSameOrigin(c, auth)) return { error: failure(c, 'origin', 403) };
    const session = await readSession(c, auth.secret);
    if (session === null) return { error: failure(c, 'signedOut', 401) };

    const accounts = getAccounts();
    const identity: EntityId = { source: 'steam', externalId: session.steamId };
    const account = await accounts.repository.findAccount(identity);
    if (account === null || account.sessionEpoch !== session.epoch) return { error: failure(c, 'signedOut', 401) };
    return { auth, accounts, account, identity };
}
