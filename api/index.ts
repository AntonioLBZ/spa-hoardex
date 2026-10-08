// Entry point only: every file under api/ becomes a function
import { handle } from '@hono/vercel';

import type { CachedAdapter } from '../core/cache/cached-adapter.js';
import { createApp } from '../server/app.js';
import { buildCachedAdapter } from '../server/deps.js';

let data: CachedAdapter | undefined;

const app = createApp(() => (data ??= buildCachedAdapter(process.env)));

export const GET = handle(app);
export const POST = handle(app);
