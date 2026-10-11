# Hoardex

Web dashboard for a Steam library (hours, backlog, achievements, wishlist) with animated charts. Public portfolio demo: any visitor enters a profile (URL, vanity, SteamID64/2/3). Zero cost, Vercel Hobby, no monetization. `README.md` is the public front page.

## Source of truth

- **`ARCHITECTURE.md` (Spanish) is the source of truth** for decisions, Steam API behavior, cache keys/TTLs and the roadmap; read it before any work. This file only distills the rules that are easy to break. If a decision changes, update `ARCHITECTURE.md` first, then this file.
- Remaining work is `TODO.md`; delete an item when it is done.
- Items marked *(secundaria)* or *(sin verificar)* in `ARCHITECTURE.md` are unverified.
- Status: phases 1 (library dashboard, library view, board, refresh, demo, privacy page, CSP, analytics) and most of 4 (Steam login, Neon backlog, opt-in snapshots, `/account`) are built. Not built: achievements (2), wishlist (3), charts from the snapshot history. The WAF rate limit over `/api` (60 req/min per IP) lives in the Vercel project, not in the repo (§11).

### Owner decisions (don't revisit silently)

- No license (all rights reserved, `UNLICENSED`, no `LICENSE` file). Domain `hoardex.vercel.app`. PR restrictions are decided when the repo goes public (visibility only, no contributions).
- The weight of Motion and GSAP is an open decision left for the end (`TODO.md`): ask the owner, don't pick.
- *Pausado* stays separate from *En curso*.
- The API key acts as its owner: for the owner's friends Steam returns "friends only" data and the app shows it (accepted risk, §12). **Privacy can't be tested with the owner's account or a friend's**: `GetOwnedGames`/`GetWishlist` ignore the setting for the owner, and friends see more than a stranger.

## Commands

pnpm only. Pin dependencies exactly (`pnpm add -E`, or strip the `^`: pnpm 11 ignores `save-exact` in `.npmrc`). Intended versions: `ARCHITECTURE.md` §3.

```bash
pnpm dev:api                   # terminal 1 (vercel dev): /api on :3000. Needs .env.local and no stale .env (read first). Its own page is blank (CSP blocks Vite's inline scripts)
pnpm dev                       # terminal 2: UI on :5173, proxies /api to :3000 with X-Forwarded-Host (Steam sign-in returns to :5173)
pnpm build                     # tsc --noEmit && vite build
pnpm typecheck
pnpm test                      # vitest: `node` project (core, server, scripts, fixtures, tests) + `front` project (jsdom, src/)
pnpm exec vitest run <path>    # one test file
pnpm format / format:check     # Prettier
pnpm lint:css / lint:css:fix   # stylelint over **/*.scss
node --env-file=.env.local scripts/migrate.ts    # apply db/migrations (pnpm db:migrate on Vercel)
node scripts/extract-fixtures.ts [--anonymize]   # Postman -> fixtures/full/ (gitignored)
node scripts/init-private-terms.ts               # fixtures/full/private-terms.json for the leak test
node --env-file=.env.local scripts/spike-steam.ts <resolve|probe|items|burst>   # needs the real key
pnpm dlx vercel@62.7.0 deploy --yes              # preview; previews sit behind Vercel Authentication: use `vercel curl <path> --deployment <url>`
```

Env (`vercel env pull`): `STEAM_API_KEY`, `UPSTASH_KV_REST_API_URL`/`_TOKEN` (memory fallback locally), `STEAM_DAILY_BUDGET`, `DATABASE_URL` (dev branch; production uses `NEON_STORAGE_DATABASE_URL`), `SESSION_SECRET`, `CRON_SECRET`. The key lives only in Vercel env vars (sensitive), server side: never in the client, logs, fixtures or repo; never log full headers.

## Architecture

Vite 8 + React 19 + TypeScript SPA and a Hono API in one Vercel Function (`api/index.ts` via `@hono/vercel`), same origin.

```
core/      pure logic: domain/, adapters/steam/ (incl. demo, OpenID), cache/, backlog/, stats/, browse/, accounts/ (Neon), auth/
server/    Hono app: routes, validation, CDN headers, session, cron, env wiring (deps.ts)
api/       Vercel entry only: every file under api/ becomes a function
db/        SQL migrations
src/       SPA: routes/ (file-based), features/, components/, lib/, assets/ (locales, styles)
tests/     repo-wide checks: privacy leak, security headers, static assets
fixtures/  anonymized or synthetic only
```

- **`core/` imports nothing from React, Vite or Hono** (keeps a Next.js migration cheap). **Raw Steam types never leave `core/adapters/steam`**: the rest knows only the domain model, keyed by `{ source, externalId }`.
- Adapters declare **capabilities** (achievements per game / per batch / none; wishlist yes/no); the UI hides panels that don't apply.
- **`ProfileAccess` is data, not an exception:** `ok | profilePrivate | libraryPrivate | wishlistPrivate | notFound | rateLimited`; queries use `retry: false`. A 429 on a GET is the firewall (plain text) and shows as `tooManyRequests`; our API answers 429 only to the refresh POST, with JSON.
- **Backlog state is a pure function in `core/backlog`**, first match wins: Backlog (`untouched`, 0 min) → Probado (< 60 min) → En curso (played ≤ 90 d ago) → Pausado (90 d–12 mo) → Completado (`finished`, > 12 mo). Achievements never change the state; a stored `completed` reads as `finished` (`upgradeState`). A manual state (`overrides`) wins everywhere (`resolveState`, `classifyLibrary`) while its category exists. Summaries live in `core/stats` (`summarizeLibrary`), never in components.
- **Categories (§19.16, §19.17):** a category is a state (`CategoryId` = built-in or `c-` + 8 hex); an owner creates, edits and deletes them in `/account` only, at most 12 including the built-in ones. Built-in ones keep their name but can be recoloured (`Categories.colors`). Any empty one can be deleted except Backlog; a removed built-in can be restored (it counts toward the 12 and comes back in its own colour). A rule whose category is gone sends the game straight to Backlog (`computedState`). Pass `categories` (stable reference) wherever states are classified or counted; never iterate `BACKLOG_STATES` in the UI, use `useCategoryCatalog`.

### Vercel wiring (breaks silently)

- `vercel.json` pins `"framework": "vite"` (the `hono` dependency makes Vercel pick the backend preset: "No entrypoint found") and rewrites `/api/:path*` → `/api` (catch-all file names only match one segment outside Next.js).
- SPA fallback is **one rewrite per client route** (`/p/:profile`, `/demo`, `/privacy`, `/account` → `/index.html`); a new route needs its own. Never a catch-all `/(.*)`: `vercel dev` would rewrite Vite's module requests to HTML.
- `api/index.ts` exports one handler per HTTP method; Vercel answers 405 to a method it doesn't export (`tests/api-entry.test.ts`).
- Relative imports in `api/`, `server/`, `core/` need `.js` extensions (ESM, else `ERR_MODULE_NOT_FOUND`). `scripts/` imports `.ts` (`allowImportingTsExtensions`, safe under `noEmit`).
- `buildCommand` runs migrations before the new deployment is live: each one must work with the previous code (add, never rename or drop).
- **CSP** (`vercel.json`): `'self'` plus `cdn.cloudflare.steamstatic.com`, `shared.steamstatic.com` and `avatars.steamstatic.com` for images, no inline code. A new third-party host or an inline `<script>`/`<style>` needs the CSP changed first, or production blocks it with no build error.

### Cache

- **Redis (Upstash free, 500k commands/month) is the source of truth; the CDN (`s-maxage` + SWR) is only an optimization.** Never rely on it for correctness. Public GETs must never read the session or send `Set-Cookie` (the CDN would stop caching them).
- Keys are prefixed with `VERCEL_ENV` (one shared database), except the Steam budget counter `shared:budget:steam:YYYYMMDD` (the limit belongs to the key). Normalize the SteamID before keying, so a vanity and its ID share cache.
- Save commands: per-user achievements in **one hash** (`ach:{steamid}`, field = appid); the library stored **normalized**; `MGET`/pipelines.
- `createCachedAdapter` wraps a `StoreAdapter` (`alias:|profile:|lib:|art:` + `{source}:{id}`): every read Zod-validated (mismatch = miss), `rateLimited` never cached, a failing store never fails a request. TTLs live in `CACHE_TTL`. `withBudget` counts Steam requests and past the cap answers like a throttle.
- **The refresh never deletes:** it claims `refresh:{source}:{id}` with `SET NX GET EX` (10 min; 60 s after a failure) and overwrites only with cacheable results. The POST returns the fresh data because the CDN may still hold the old GET.
- Achievements: invalidate by fingerprint `hash(playtime_forever, rtime_last_played)`; progress is language-neutral, texts are per `(appid, lang)`.
- Accounts (§19): Neon is the truth; `bl:` in Redis is a write-through copy. Steam login gives only the SteamID64, never unlocks a private library. Snapshots are opt-in (daily cron); turning them off or deleting the account deletes the data.

### Progressive achievements (phase 2, designed)

The library renders first; the **client** then requests achievements in batches of ~12 games (2–3 in flight) by hours descending. Candidates: `playtime_forever > 0` and `has_community_visible_stats` present (absent means no stats). The server accepts only appids in that SteamID's cached library, sorts and caps the batch (so it is no generic proxy); Steam concurrency 5–8, exponential backoff + jitter on 429.

## Steam API

- Own client with `fetch` + Zod 4, `fetch` injected (tests need no MSW). **Not the `steamapi` npm package.** Zod at the border: `safeParse`, `z.looseObject`, optional fields, `.catch()` on dubious enums; on drift log, don't throw.
- **No generic proxy:** closed host allowlist (`api.steampowered.com`, `store.steampowered.com`, `steamcommunity.com` for OpenID only); every upstream URL built server side.
- Input: SteamID64 `^765611\d{11}$`; vanity `^[A-Za-z0-9_-]{2,32}$`; SteamID2/3 via `BigInt`; `/id/<vanity>` and `/profiles/<id64>` URLs.
- **Decide privacy by body and `x-eresult`, never by status alone.** Wishlist: 200 `{}` for both private and empty (`x-eresult` 15 vs 1). `GetOwnedGames` on a friends-only profile: 200, `x-eresult` 15, `{"response":{}}`. A public profile does not imply visible game details (a separate setting `GetPlayerSummaries` doesn't expose).
- 429: `x-eresult: 84`, body `{"response":{}}`, **no `Retry-After`**, bucket seems shared → `rateLimited`.
- Quirks: rarity `percent` is a **string**; `playtime_forever` is the truth; hidden achievements have an empty `description`; `GetPlayerBans` is PascalCase. `GetAchievementsProgress` is unusable (401). Wishlist = `GetWishlist` + `IStoreBrowseService/GetItems` (≤ 150 ids per GET, 275 gives 414; omit `data_request`).
- Terms only clearly cover data "as requested by the end user" and Valve can revoke the key: keep the Steam layer isolated, per-user caches short, the demo working without a key, the Valve trademark notice and non-affiliation disclaimer in the footer, and the privacy policy. No literal "Powered by Steam".

## Frontend

- TanStack Router (file-based, Vite plugin). `src/routeTree.gen.ts` is generated but committed (Prettier ignores it). TanStack Query 5: `useQuery` for profile/library (requested together with the same input), `useQueries` + `combine` for achievement batches; no `streamedQuery`.
- Imports in `src/`: `./` in the same folder, else `@/` (`src/`) and `@core/` (`core/`), never `../`. Aliases work only in `src/`. `src/lib/profile-slug.ts` is the one place the front touches the Steam adapter; import `parseProfileInput`'s file, never the adapter index (it pulls Zod into the bundle).
- Layout as in `spa-anicalendar`: folder per component/feature (`name.tsx`, `name.scss`, `index.ts`), BEM; `components/` never imports from `features/`.
- Controls and surfaces come from `src/components/` (`Button`/`IconButton`/`buttonClass`, `Switch`, `TextField`, `SegmentedControl`, `RadioChip`, `Card`); features only place them. Radii use the scale in `_tokens.scss` (`-small`, base, `-large`, `-xlarge`, `-pill`), never literal values.
- **Chunks:** `Dashboard` and `LibraryView` load through `useProfileContent` (not `React.lazy`). Route files import `parseLibrarySearch` from `library-view/library-search`, never the feature index.
- **Animation ownership — nobody shares an element:** GSAP (`useGSAP`, only `use-grid-reveal.ts`, IntersectionObserver not `ScrollTrigger`) owns `li.game-card` and `ul.library-view__grid`; Motion owns counter text (`CountUp`; `LazyMotion` + `domAnimation` with the first `m.*`); CSS (`.rise-in` with `--i`, `@starting-style`) owns everything inside. Never GSAP on nodes `AnimatePresence` unmounts or inside Recharts SVG; Motion `layout` doesn't work in SVG.
- Animate only `transform` and `opacity`; **cards opacity only** (translation cost ~300 ms of long frames at CPU ×6, §10). Respect `prefers-reduced-motion` (`MotionConfig reducedMotion="user"`, `gsap.matchMedia`). Tokens in `_tokens.scss` and `src/lib/motion/tokens.ts`, load sequence in `sequence.ts`; `isBusy()` makes reveals instant after a long frame.
- **Charts:** Recharts 3 (`fill` in the data, `Cell` is deprecated); heatmap and rarity hand-built SVG (d3-scale + Motion). Charts are `aria-hidden` with a legend or visually-hidden table. Recharts replays when its data is a new reference: `Dashboard` is `memo`ized, takes `games` (not `library`, whose `fetchedAt` changes on refresh), chart data is `useMemo`ized, `overrides` and `categories` must be stable references, and charts mount after paint (`useAfterPaint`). "Abandoned" and an owner's own categories show only when some game has them (`isShownState`), except to an editor's chips.
- **Library view:** filter/search/sort are pure (`core/browse`); `state`, `sort`, `dir`, `q` are search params parsed by hand (`parseLibrarySearch`, no Zod), defaults kept out of the URL, changes with `replace` + `resetScroll: false`. The search box follows the URL only while unfocused. 24 cards, then 48 per "Show more" (never auto-loaded, reset on filter change); grid of fixed 2/3/4/6 columns by container query so batches fill rows; `content-visibility: auto` + lazy images, no virtualization. No board view (retired): the toolbar is sticky from 42rem up, and an editor drags a card (native HTML5, not on `(pointer: coarse)`) onto a state chip; while selecting, the selection goes with it. Other grids use `minmax(min(Nrem, 100%), 1fr)`.
- Covers: portrait capsule → header → placeholder; when the guessed portrait 404s (recent games use hashed paths), `src/lib/art.ts` batches `/api/art/:input?appids=` (only that library's appids, `GetItems` without key, cached per appid in `art:`) and tries the store's paths first; `referrerPolicy="no-referrer"` on every Steam image, empty `alt`. Demo appids don't exist: no Steam CDN requests for them (`withImages={false}`).
- Loading = skeletons (`src/components/skeleton`) with a visually-hidden `role="status"`. Privacy states render `LockedPanel` (ghost page, link to Steam privacy settings except in demo, retry); `LockedChart` for one chart.
- Refresh: `libraryQuery` keeps the newer library by `fetchedAt` (`newerLibrary`) against a stale CDN copy; the client cooldown (`refresh-cooldowns.ts`, memory + `localStorage`) is a hint, the server is the truth.
- Analytics: `startAnalytics(router)` from `main.tsx` only (so tests don't load it). Page views only, sent by hand, one per pathname with the route pattern; `beforeSend` strips the query string.
- Privacy policy (`src/features/policy-page`) reads durations from `CACHE_TTL` but describes stored data, third parties and analytics by hand: update it when they change. The contact address lives only in `mail-link.tsx`.
- Head: `PageTitle` per route; `LocaleProvider` swaps the `index.html` description (a test keeps it equal to `metadata.description`). `public/favicon.svg` and `public/logo.svg` must draw the same chest (tested); after changing it re-render `favicon.ico` and `apple-touch-icon.png` (§10, «Iconos»).
- Styles: SCSS + CSS variables (light/dark via `prefers-color-scheme`), BEM kebab-case, stylelint (no `!important`, alphabetical properties), no Tailwind. Reuse global `.eyebrow`, `.gradient-text`, `.glow` (`_brand.scss`). Page width `--size-page-width`, text `--size-content-width`. Lenis stays out.
- i18n: `use-intl`, `en` (default) and `es` in `src/assets/locales/`, locale from stored preference → `navigator.language` → `en`, not in the URL. Maps to Steam's `l=`; `cc` for prices is part of the item cache key.

## Testing and fixtures

- Vitest + Testing Library, no MSW. Front tests render the real route tree with `renderApp` and a fake `fetch` (`stubApi`, `src/lib/test/render-app.tsx`); `stubApi` answers `/api/me` (signed out) and `/api/backlog/*` by default and keeps them out of recorded calls. The setup stubs `scrollTo` and defines `matchMedia` as reduced motion, so tests see final states. Account tests use PGlite with every migration (`core/accounts/test-db.ts`).
- **Demo is server-side:** `/api/demo/*` answer from `createDemoData` (96 fictional games, appids from 4.2 billion, dates relative to now) through the real adapter with a fake `fetch`: no key, Redis or network. `/demo` reuses `ProfilePage` with `source: { kind: 'demo' }`; its backlog edits stay in `localStorage`.
- Fixtures come from the owner's Postman collection (real SteamID, name, avatar). **Never commit the collection, `.env*`, `.vercel/` or `fixtures/full/`.** Anonymize with a fake-ID map (not hashes; SteamIDs are enumerable) over `steamid`, `personaname`, `realname`, avatars, `profileurl`, `primaryclanid`. Fake IDs are `76561198000000000` + 10 000, **which can be real people**: never send one to the live API or render it as a real link.
- `tests/privacy-leak.test.ts` fails on any tracked or untracked-not-ignored file with a SteamID64 outside the fake window, a term from `fixtures/full/private-terms.json`, or the real `STEAM_API_KEY`. Docs are scanned too: never name the owner's profile or handle (it also appears in team-scoped `*-<team>.vercel.app` URLs). Only `mail-link.tsx` is exempt.
- Browser checks: the automation tab is hidden, so `requestAnimationFrame` freezes (Recharts stops mid-animation: force reduced motion), `setTimeout` clamps to 1 s (wait with a `MessageChannel` tick) and lazy images don't load. Measure performance with CPU throttling in headless Chromium, not in that tab.

## Conventions

- Free tiers only; if something needs payment, drop it (Hobby: no ads, no charging; over quota = 30-day block).
- Prettier: 4 spaces, single quotes, `printWidth` 120, `trailingComma: es5`, LF.
- Comments in English, at most one short line (what something is, or a non-obvious constraint). Never narrate code; rename or split instead. **No comments in tests.**
