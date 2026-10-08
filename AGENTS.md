# Hoardex

Web dashboard for a Steam library (hours, backlog, achievements, wishlist) with animated charts. Public portfolio demo: any visitor enters a profile (URL, vanity or SteamID64). Zero cost, Vercel Hobby, no monetization.

## Status

Phase 1 in progress. **Read `ARCHITECTURE.md` (Spanish) before any work: it is the source of truth** for decisions, Steam API behavior, cache keys/TTLs and the roadmap. This file only distills the rules that are easy to break. If a decision changes, update `ARCHITECTURE.md` first, then this file.

- Phase 0 spike passed its gate (`ARCHITECTURE.md` §14): Vite + Hono as one Vercel project works, so Plan B (thin Next.js 16) is not needed.
- Built so far: `core/domain`, `core/backlog`, `core/stats`, `core/adapters/steam` (incl. the demo), `core/cache` (store, budget, cached adapter), the API (`GET /api/profile/:input`, `GET /api/library/:input`), fixtures and the privacy-leak test. The front: entry screen, `/p/$profile` with a library dashboard (KPIs, backlog-state donut, top games, hours by year), `en`/`es`, Valve footer, a server-side demo (`/demo`), the library view (cover grid with state filters, search and sort in the URL, `core/browse`). The animation (page-load sequence, count-up, card fade-in; `ARCHITECTURE.md` §10) is built. The manual refresh (`POST /api/refresh/:input`, cooldown, `RefreshControl`) and the Vercel Web Analytics page views are built; Web Analytics is enabled and receiving data, and the per-project script path (blocker-proof) is pending verification on a deploy. Achievements and wishlist are not built yet.
- The API key acts as its owner: for the owner's friends Steam answers with "friends only" data and the public app shows it (known risk, postponed, `ARCHITECTURE.md` §12). Never test privacy with a friend's account and assume a stranger sees the same.
- Items marked *(secundaria)* or *(sin verificar)* in `ARCHITECTURE.md` are unverified. Private-library and private-wishlist behavior cannot be tested with the key owner's own account.
- Remaining work is the *To do* list in `README.md`; delete an item there when it is completed.
- Open decisions (license, domain, whether to merge *Pausado* into *En curso*): ask the owner, don't pick silently.

## Commands

pnpm only. Pin dependencies exactly (no `^`): pnpm 11 ignores `save-exact` in `.npmrc`, so use `pnpm add -E` or strip the caret afterwards. `ARCHITECTURE.md` §3 lists the intended versions as of 2026-10-07.

```bash
pnpm dlx vercel@62.7.0 dev    # the way to run and test the app: serves the SPA and /api (needs .env.local)
pnpm dev                       # Vite alone, no /api: the app is useless this way, only for quick UI work with a patched fetch
pnpm build                     # tsc --noEmit && vite build
pnpm typecheck                 # tsc --noEmit over src, api, core, scripts, fixtures, tests
pnpm test                      # vitest run: `node` project (core, server, scripts, tests) + `front` project (jsdom, src/)
pnpm exec vitest run <path>    # a single test file
pnpm format / format:check     # Prettier
pnpm lint:css / lint:css:fix    # stylelint over **/*.scss
node scripts/extract-fixtures.ts [--anonymize]   # Postman -> fixtures/full/postman (and /anon); gitignored
node scripts/init-private-terms.ts               # writes fixtures/full/private-terms.json for the leak test
node --env-file=.env.local scripts/spike-steam.ts <resolve|probe|items|burst>   # spike 0B, needs the real key
pnpm dlx vercel@62.7.0 deploy --yes              # preview deploy; test with `vercel curl <path> --deployment <url>`
```

- Previews sit behind Vercel Authentication, so plain `curl` gets 401; use `vercel curl`.
- Tests in `scripts/` import `.ts` extensions (`allowImportingTsExtensions`, safe because `noEmit`); everything else imports `.js`.

## Architecture

Vite 8 + React 19 + TypeScript SPA, Hono API in one Vercel Function (`api/index.ts` via `@hono/vercel`, with `vercel.json` rewriting `/api/:path*` to `/api`), same origin. `vercel.json` also pins `"framework": "vite"`: Vercel auto-detects the `hono` dependency as the backend preset and the deploy fails with "No entrypoint found". Catch-all file names (`[[...route]].ts`, `[...route].ts`) only match one path segment outside Next.js. The SPA fallback is one rewrite per client route (`/p/:profile` → `/index.html`); never a catch-all `/(.*)`: `vercel dev` would rewrite `/src/main.tsx` and `/@vite/client` to the HTML and Vite fails with "Failed to parse source for import analysis". A new client route needs its own rewrite. Relative imports inside `api/` and `core/` need a `.js` extension (`'../core/cache/redis.js'`): the project is `"type": "module"` and Vercel emits ESM, so extensionless imports crash the function with `ERR_MODULE_NOT_FOUND`.

```
core/       pure domain + logic: domain/, adapters/steam/, cache/, backlog/, stats/
api/        Vercel entry point only: every file under api/ becomes a function
server/     Hono app: routes, input validation, CDN headers, env wiring (`deps.ts`)
src/        SPA: routes/ (file-based), features/, components/, lib/ (api, i18n, query client), assets/ (locales, styles)
fixtures/   anonymized or synthetic only (full ones are gitignored)
scripts/    extract + anonymize fixtures from the Postman collection
```

- **`core/` imports nothing from React, Vite or Hono.** This is what keeps the Plan B migration cheap.
- **Raw Steam types never leave `core/adapters/steam`.** The front only knows the domain model (`Profile`, `Game`, `Playtime`, `Achievement`, `WishlistItem`), keyed by `{ source, externalId }`.
- Each adapter declares **capabilities** (achievements per game / per batch / none; wishlist yes/no). The UI reads them and hides panels that don't apply, so adding a store doesn't touch views.
- **`ProfileAccess` is data, not an exception:** `ok | profilePrivate | libraryPrivate | wishlistPrivate | notFound | rateLimited`. Queries use `retry: false` for it.
- **Decide privacy by response body and `x-eresult`, never by HTTP status alone.** Steam returns 200 `{}` for both a private and an empty wishlist (`x-eresult` 15 vs 1). `GetOwnedGames` on a friends-only third-party profile: 200, `x-eresult` 15, `{"response":{}}` (verified; the `libraryPrivate` case, a public profile with private game details, is still unverified). A public profile (`communityvisibilitystate` 3) does not imply visible achievements: "game details" (library, wishlist, achievements, playtime) is a separate setting that `GetPlayerSummaries` does not expose. Privacy can't be tested on the key owner's own account: `GetOwnedGames`/`GetWishlist` ignored the setting there, only achievements returned 403.
- **Zod at the border:** `safeParse`, `z.looseObject`, optional fields, `.catch()` on dubious enums. On shape drift, log it; don't throw.
- **Backlog state is a pure function in `core/backlog`** with configurable thresholds. First match wins: Completado (100 % achievements, total > 0) → Sin tocar (0 min) → Probado (< 60 min) → En curso (≥ 60 min, played ≤ 90 d ago) → Pausado (90 d–12 mo) → Acabado (> 12 mo; inactivity heuristic, not a real "finished"). Backlog = Sin tocar + Probado. Only Completado needs achievements.

### Cache

- **Redis (Upstash free, 500k commands/month) is the source of truth; the CDN (`s-maxage` + SWR) is only an optimization** (regional, best-effort). Never rely on it for correctness.
- Budget commands: per-user achievements are **one hash** (`ach:{steamid}`, field = appid); the library is stored **normalized**, not raw (~190 KB → tens of KB); use `MGET`/pipelines.
- Prefix every key with the environment (`VERCEL_ENV`: `production:`, `preview:`, `development:`); the free plan gives one database and all environments share it. The one exception is the Steam budget counter (`shared:budget:steam:YYYYMMDD`): the limit belongs to the key, not to the environment.
- **The refresh never deletes:** `CachedAdapter.refresh` claims `refresh:{source}:{id}` with `setIfAbsent` (`SET NX GET EX`, 10 min; 60 s after a throttle or failure), re-asks Steam past Redis and overwrites `profile:`/`lib:` only with cacheable results, so a failed refresh keeps the previous data. The POST answer carries the fresh data because the CDN may still hold the old GET.
- `createCachedAdapter` wraps a `StoreAdapter`: keys `alias:|profile:|lib:` + `{source}:{id}`, every read validated with Zod (a mismatch is a miss), `rateLimited` never cached, a failing store never fails a request. TTLs live in `CACHE_TTL`. `withBudget(fetch, budget)` counts every Steam request and, past the cap, answers like a throttle so the adapter yields `rateLimited`.
- Always normalize the SteamID before using it in a key, so a vanity and its resolved ID share cache.
- Achievement invalidation by fingerprint `hash(playtime_forever, rtime_last_played)`. Per-user progress is language-neutral; texts are shared per `(appid, lang)`.

### Progressive achievements

The library arrives in one call and the dashboard renders. Then the **client** requests achievements in batches of ~12 games (2–3 in flight), ordered by hours descending. Candidates: `playtime_forever > 0` and `has_community_visible_stats` present (absent means no stats, not `false`). Each batch that lands triggers the chart animations. The server only accepts appids that belong to that `steamid`'s cached library, sorts them, and caps the batch size. That also keeps the endpoint from becoming a generic proxy. Server concurrency to Steam is 5–8 with exponential backoff + jitter on 429.

## Steam API rules

- Own client with `fetch` + Zod 4. **Do not use the `steamapi` npm package** (no wishlist/`GetItems`, no 429 handling, in-memory cache only, `[]` for both private and empty).
- The API key lives only in Vercel env vars (sensitive), server side. Never in the client, logs, fixtures or repo. Locally, `vercel env pull`. Never log full headers.
- **No generic proxy.** Closed host allowlist (`api.steampowered.com`, `store.steampowered.com`, `steamcommunity.com` for OpenID only); build every upstream request server side.
- Input validation: SteamID64 `^765611\d{11}$`; vanity `^[A-Za-z0-9_-]{2,32}$`; accept SteamID2/3 via `BigInt`; extract from `/id/<vanity>` and `/profiles/<id64>` URLs.
- 429 is HTTP 429 with `x-eresult: 84`, body `{"response":{}}` and **no `Retry-After`**; the bucket seems shared. Surface it as `rateLimited`.
- Quirks: `percent` in global achievement rarity is a **string**; `playtime_forever` is the truth (platform breakdown is approximate); hidden achievements have an empty `description`; `GetPlayerBans` is PascalCase.
- Unusable: `GetAchievementsProgress` (401 with a developer key). Wishlist = `GetWishlist` + `IStoreBrowseService/GetItems` (no key; the limit is URL length, so keep it to ≤ 150 ids per GET: 275 gives 414; omit `data_request` to get name + price at ~0.8 KB per item).
- Steam terms only clearly cover data "as requested by the end user", and Valve can revoke the key anytime. Keep the Steam layer isolated in the adapter, keep per-user caches short, and keep the **demo mode on fixtures** working without a key. The footer needs a Valve trademark notice and a non-affiliation disclaimer, and the site needs a privacy policy. There is no literal "Powered by Steam".

## Frontend rules

- Router: TanStack Router, file-based via its Vite plugin; list filters live in typed search params. `src/routeTree.gen.ts` is generated but committed (`tsc` runs before `vite build`); Prettier ignores it.
- Imports in `src/`: `./` inside the same folder, otherwise the aliases `@/` (= `src/`) and `@core/` (= `core/`), never `../`. Declared in `tsconfig.json` `paths`; Vite and the Vitest `front` project read them with `resolve.tsconfigPaths`. **Aliases only work in `src/`**: `api/`, `server/`, `core/` and `scripts/` run in Node, which does not know them (keep relative imports with `.js` there).
- Layout follows `spa-anicalendar`: a folder per component/feature (`name.tsx`, `name.scss`, `index.ts`), BEM class names, no cross-imports from `components/` into `features/`.
- The entry screen canonicalizes input with `parseProfileInput` (import that file only, never the adapter index: it pulls Zod into the bundle). `src/lib/profile-slug.ts` is the one place the front touches the Steam adapter.
- Front tests render the real route tree with `renderApp` and a fake `fetch` (`stubApi`) from `src/lib/test/render-app.tsx` (no MSW); the setup file stubs `window.scrollTo`.
- TanStack Query 5: `useQuery` for profile/library, `useQueries` + `combine` for achievement batches. `streamedQuery` is experimental, don't use it.
- **Motion** (`animate()` in `CountUp` today; `LazyMotion` + `domAnimation` with the first `m.*` component, `domMax` if something uses `layout`): counters, exit. **GSAP** (`useGSAP`, only in `use-grid-reveal.ts`): the card fade-in; IntersectionObserver decides when, not `ScrollTrigger`. **CSS** (`.rise-in` with `--i`, `@starting-style`, transitions): entrances, top-games bars, covers, chips. **Nobody shares an element**: GSAP owns `li.game-card` and `ul.library-view__grid`, Motion owns the counter text, CSS owns their descendants. Never run GSAP on nodes that `AnimatePresence` unmounts, or inside Recharts SVG. Motion `layout` does not work in SVG.
- **Cards animate opacity only**: any translation cost ~300 ms of long frames at CPU ×6 (`ARCHITECTURE.md` §10). Tokens live in `_tokens.scss` and `src/lib/motion/tokens.ts`; the steps of the page-load sequence in `src/lib/motion/sequence.ts`. `isBusy()` makes reveals instant after a long frame.
- **Chunks**: `Dashboard` and `LibraryView` load through `useProfileContent` (not `React.lazy`: it holds the content back 300 ms). A route file imports `parseLibrarySearch` from `library-view/library-search`, never from the feature index, or the whole view lands in the main chunk. The test setup defines `matchMedia` in reduced-motion mode (GSAP calls it unguarded and jsdom has none), so tests see final states.
- Recharts 3 for standard charts; heatmap and rarity are hand-built SVG (d3-scale + Motion). `Cell` is deprecated: put `fill` in the data. Recharts animates with `requestAnimationFrame`, so in a hidden tab (also the Chrome automation window) it freezes mid-animation; to look at the final state force `prefers-reduced-motion` (`isAnimationActive={!reducedMotion}`, via `src/lib/use-reduced-motion.ts`). Charts sit in `aria-hidden` and the same data is given as a legend or a visually-hidden table.
- `Dashboard` takes `games`, not `library`: a refresh renews `fetchedAt`, but Query's structural sharing keeps the `games` array when nothing changed, so the charts do not replay. `libraryQuery` keeps the newer library by `fetchedAt` (`newerLibrary`) against a stale CDN copy. The refresh cooldown on the client (`refresh-cooldowns.ts`) is a hint kept in memory and in `localStorage` so a reload keeps the button disabled; the server is the truth.
- Analytics: `startAnalytics()` (`src/lib/analytics.ts`) is called from `main.tsx`, never from the route tree, so tests do not load it; page views only, no `track()`, and `beforeSend` strips the query string (the search box text). `inject()` also gets `VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG` (set by Vercel at build) so the script loads from a per-project path that content blockers do not list.
- Summaries are computed in `core/stats` (`summarizeLibrary`, pure, tested), never inside components. "Completed" is hidden from the state chart until achievements exist (phase 2): a 0 there would read as "none completed" when it is unknown.
- Grids use `minmax(min(Nrem, 100%), 1fr)` so nothing overflows below ~350 px.
- Animate only `transform` and `opacity`. Respect `prefers-reduced-motion` (`MotionConfig reducedMotion="user"`, `gsap.matchMedia`). Custom charts need a table or text alternative.
- 300 covers: `content-visibility: auto` + lazy images, no virtualization. Lenis stays out of the app shell.
- Privacy states (`profilePrivate`, `libraryPrivate`, `wishlistPrivate`) render `LockedPanel` (`src/components/locked-panel`): the message plus an `aria-hidden` ghost of the missing page, a link to the owner's Steam privacy settings (`steamPrivacySettingsUrl`, built from the route with `parseProfileInput`, none in demo mode) and a retry. `LockedChart` does the same for one chart (hours by year when no game has a last-played date). The page ghost covers the whole page for now; give it one shape per panel when achievements and wishlist panels exist.
- Loading and performance rules: profile and library are requested together with the same input (`GET /api/library/:input` takes a vanity, id or URL, resolved through `StoreAdapter.resolveAlias`); loading states are skeletons (`src/components/skeleton`, loading text in a visually-hidden `role="status"`); the library renders 48 cards, then 96 per "Show more" or auto-load capped at 336 (`use-revealed-count.ts`), and resets when search, filter or sort change; `Dashboard` is `memo`ized and the chart data is `useMemo`ized, because Recharts replays its animation when the data array is a new reference, and Recharts mounts after the first commit (`useAfterPaint`). Measure with CPU throttling in a headless Chromium, not in the extension tab.
- Library view (`src/features/library-view`; filter, search and sort are pure code in `core/browse`): `state`, `sort` and `q` are search params validated by hand with `parseLibrarySearch` (no Zod), shared by `/p/$profile` and `/demo`. Defaults stay out of the URL; changes use `replace` and `resetScroll: false`. The search box keeps local state and follows the URL only while unfocused (syncing while typing drops keystrokes). Covers go portrait capsule → header → coloured placeholder, with `referrerPolicy="no-referrer"` and an empty `alt` (the name is the caption). Lazy images do not load in a hidden tab: wait or scroll when checking in the browser. To time things in that tab never use `requestAnimationFrame` (frozen) or `setTimeout` (clamped to 1 s): wait with a `MessageChannel` tick, the way React's scheduler does.
- Styles: SCSS + CSS variables (light/dark via `prefers-color-scheme`), BEM kebab-case, stylelint copied from `dev-portfolio` (`.stylelintrc.mjs`, no `!important`, alphabetical properties). No Tailwind.
- i18n: `en` (default) and `es` with `use-intl` (same API as `next-intl` in `spa-anicalendar`): messages in `src/assets/locales/{en,es}.json`, locale from stored preference → `navigator.language` → `en`, not in the URL. The UI language maps to Steam's `l=` (`english`/`spanish`); `cc` for prices comes from the language with a manual selector and is part of the item cache key.

## Fixtures and testing

- Vitest, Testing Library, jsdom, an injected `fetch` (no MSW: the demo lives on the server, see below).
- **Demo mode is server-side:** `GET /api/demo/profile` and `/api/demo/library` answer from `createDemoData` (`core/adapters/steam/demo.ts`): a deterministic fictional library (96 games, appids from 4.2 billion, dates relative to the clock) read through the real Steam adapter with a fake `fetch`. It never calls `getData()`, so it needs no key, Redis or network. The client page `/demo` reuses `ProfilePage` with `source: { kind: 'demo' }` and shows a fictional-data notice. Demo appids do not exist on Steam: never request Steam CDN images for them (the library view gets `withImages={false}` and draws placeholders).
- Fixtures come from the owner's Postman collection, which contains their real SteamID, `realname` and avatar. **Never commit the collection, `.env*`, `.vercel/` or `fixtures/full/`.**
- Fake SteamID64s live in the window `76561198000000000` + 10 000 (`scripts/lib/anonymize.ts`). **Those ids can belong to real people** (a live lookup of one returned a stranger's profile): never send a fixture id to the live API, not even in a manual check, and never render or link a fixture profile URL as if it were fake. The Steam adapter takes `fetch` by injection, so its tests need no MSW.
- Anonymize with a **fake-ID map**, not hashes (SteamIDs are enumerable). Touch `steamid`, `personaname`, `realname`, avatars, `profileurl`, `primaryclanid`. Public fixtures are cut-down or synthetic.
- `tests/privacy-leak.test.ts` fails if any tracked or untracked-not-ignored file carries a SteamID64 outside the fake window, a term from `fixtures/full/private-terms.json`, or the `STEAM_API_KEY` from `.env.local`. Docs are scanned too: don't name the owner's profile in them (nor their handle, which also appears in the team-scoped Vercel URLs `*-<team>.vercel.app`). Every fixture must parse with its Zod schema and normalize to the expected domain output.

## Constraints and conventions

- Free tiers only: if something needs payment, drop it. Vercel Hobby is non-commercial (no ads, no charging); exceeding quotas means a 30-day block, not a charge. Public repo, visibility only, no contributions.
- Match the owner's other repos: Prettier with 4 spaces, single quotes, `printWidth` 120, `trailingComma: es5`, LF. Code comments: English, minimal, short. At most a one-line definition of what something is (or a non-obvious constraint). Never explain the code, narrate it or write paragraphs; if it needs that much, rename or split instead.
