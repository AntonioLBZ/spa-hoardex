# Hoardex

A dashboard for your Steam library: hours played, backlog state and most played games, with animated charts.

**Live:** <https://hoardex.vercel.app>, or [explore a fictional library](https://hoardex.vercel.app/demo) without entering anything.

Hoardex is a personal portfolio project and it is still in progress: achievements and the wishlist are not built yet.

## Features

- Enter a Steam profile as a URL, a custom name or a SteamID64 (SteamID2 and SteamID3 work too).
- A dashboard with the number of games and hours, the games by state (backlog, tried, in progress, paused, finished), the most played games and how much of the hours they hold, the games by year of last play and the games by hours played (under 1 h up to 100+ h).
- A library view: a cover grid with state filters, search and sorting, all kept in the URL.
- Optional sign-in with Steam: set a game's state by hand (drag it onto a state chip or pick it from its card), create, edit and delete your own categories, recolour or bring back the built-in ones, and turn on a daily playtime history from your account page.
- A manual refresh with a cooldown, so one profile cannot drain the Steam API.
- A demo library with fictional data that needs no Steam key.
- English and Spanish, light and dark.
- Short-lived caches, and cookies only if you sign in: see the [privacy policy](https://hoardex.vercel.app/privacy).

## Stack

Vite 8, React 19 and TypeScript; TanStack Router and Query; Recharts, Motion and GSAP; SCSS. A Hono API served as one Vercel Function, with Upstash Redis as the cache and Neon Postgres for accounts. Vitest and Testing Library. pnpm. Hosted on Vercel Hobby.

## How it works

The browser talks to `/api` on the same origin. The server asks Steam's Web API through an adapter, so Steam's types never reach the front. Redis is the source of truth for the cache; the CDN is only an optimization. Signing in gives Hoardex only your SteamID (Steam OpenID): it never makes a private library visible. The design, the Steam API behaviour and the decisions behind them are in [`ARCHITECTURE.md`](ARCHITECTURE.md) (in Spanish).

## Run it locally

You need Node.js 24 and pnpm.

```bash
pnpm install
cp .env.example .env.local   # then put your Steam API key in it
pnpm dev:api                 # the API on :3000; the first run asks to link a Vercel project
pnpm dev                     # the app on :5173, with /api sent to :3000
```

| Variable                                                  | Use                                                                                                                  |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `STEAM_API_KEY`                                           | Required for real profiles. Get one at <https://steamcommunity.com/dev/apikey>. The demo does not need it.           |
| `UPSTASH_KV_REST_API_URL`, `UPSTASH_KV_REST_API_TOKEN`    | Upstash Redis REST credentials. Required in production; locally the cache falls back to memory.                      |
| `STEAM_DAILY_BUDGET`                                      | Optional. Daily cap on Steam requests (a positive integer, 80000 by default); past it only cached data is served.   |
| `DATABASE_URL`                                            | Neon Postgres connection string, for sign-in and manual states. Apply the schema with `node --env-file=.env.local scripts/migrate.ts`.             |
| `SESSION_SECRET`                                          | Signs the sign-in cookie; at least 32 characters. Required for sign-in.                                              |
| `CRON_SECRET`                                             | Protects the daily playtime-history job; at least 32 characters.                                                     |

```bash
pnpm test           # unit and component tests
pnpm typecheck
pnpm build          # typecheck, then Vite
pnpm format:check
pnpm lint:css
```

## Steam and Valve

Hoardex is an independent project. It is not affiliated with or endorsed by Valve Corporation. Steam and the Steam logo are trademarks and/or registered trademarks of Valve Corporation in the U.S. and/or other countries. Data comes from Steam's official Web API; enter your own profile, and keep it private on Steam if you do not want it shown.

## More

- [`ARCHITECTURE.md`](ARCHITECTURE.md): design and decisions (Spanish).
- [`AGENTS.md`](AGENTS.md): conventions for working in this repo.
- [`TODO.md`](TODO.md): what is left.

## License

None for now: all rights reserved. The source is public so it can be read; ask before reusing it (the contact address is in the [privacy policy](https://hoardex.vercel.app/privacy)).
