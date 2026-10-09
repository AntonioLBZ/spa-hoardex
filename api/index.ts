// Entry point only: every file under api/ becomes a function
import { handle } from '@hono/vercel';

import type { CachedAdapter } from '../core/cache/cached-adapter.js';
import { createApp } from '../server/app.js';
import type { AuthDeps } from '../server/auth.js';
import { buildAccounts, buildAuth, buildCachedAdapter, cronSecret, type Accounts } from '../server/deps.js';

let data: CachedAdapter | undefined;
let auth: AuthDeps | undefined;
let accounts: Accounts | undefined;

const getAccounts = () => (accounts ??= buildAccounts(process.env));

const app = createApp(() => (data ??= buildCachedAdapter(process.env)), {
    getAuth: () => (auth ??= buildAuth(process.env, { getAccounts })),
    getAccounts,
    getCronSecret: () => cronSecret(process.env),
});

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
