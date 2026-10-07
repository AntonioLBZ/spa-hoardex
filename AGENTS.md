# Hoardex

Web dashboard for a Steam library (hours, backlog, achievements, wishlist) with animated charts. Public portfolio demo: any visitor enters a profile (URL, vanity or SteamID64). Zero cost, Vercel Hobby, no monetization.

## Status

Pre-code: the repo holds only docs. **Read `ARCHITECTURE.md` (Spanish) before any work: it is the source of truth** for decisions, Steam API behavior, cache keys/TTLs and the roadmap. This file only distills the rules that are easy to break. If a decision changes, update `ARCHITECTURE.md` first, then this file.

- The first task is the **Phase 0 spike** (`ARCHITECTURE.md` §14). Do not scaffold product code until it passes its decision gate: if deploying Vite + Hono as one Vercel project fights back for more than ~2 h, switch to Plan B (thin Next.js 16) without touching `core/`.
- Items marked *(secundaria)* or *(sin verificar)* in `ARCHITECTURE.md` are unverified. Confirm them in spike 0B with the real key before building on them.
- Open decisions (i18n library, client router, license, domain, whether to merge *Pausado* into *En curso*): ask the owner, don't pick silently.

## Commands

None yet. Add the real ones (dev, build, lint, test, single test) here when the spike creates `package.json`.

- pnpm only. Pin exact versions (no `^`); `.npmrc` `save-exact=true` is ignored by pnpm 11, so use `pnpm add -E` or strip the caret afterwards.
- `ARCHITECTURE.md` §3 lists the intended versions as of 2026-10-07; re-check and pin them when creating the project.

## Architecture

Vite 8 + React 19 + TypeScript SPA, Hono API in a Vercel Function (`api/[[...route]].ts` via `hono/vercel`), same origin.

```
core/       pure domain + logic: domain/, adapters/steam/, cache/, backlog/
api/        Hono routes, input validation, rate limiting, cache headers
src/        SPA: views, components, TanStack Query hooks, i18n, SCSS
fixtures/   anonymized or synthetic only (full ones are gitignored)
scripts/    extract + anonymize fixtures from the Postman collection
```

- **`core/` imports nothing from React, Vite or Hono.** This is what keeps the Plan B migration cheap.
- **Raw Steam types never leave `core/adapters/steam`.** The front only knows the domain model (`Profile`, `Game`, `Playtime`, `Achievement`, `WishlistItem`), keyed by `{ source, externalId }`.
- Each adapter declares **capabilities** (achievements per game / per batch / none; wishlist yes/no). The UI reads them and hides panels that don't apply, so adding a store doesn't touch views.
- **`ProfileAccess` is data, not an exception:** `ok | profilePrivate | libraryPrivate | wishlistPrivate | notFound | rateLimited`. Queries use `retry: false` for it.
- **Decide privacy by response body and `x-eresult`, never by HTTP status alone.** Steam returns 200 `{}` for both a private and an empty wishlist (`x-eresult` 15 vs 1). A public profile (`communityvisibilitystate` 3) does not imply a visible library.
- **Zod at the border:** `safeParse`, `z.looseObject`, optional fields, `.catch()` on dubious enums. On shape drift, log it; don't throw.
- **Backlog state is a pure function in `core/backlog`** with configurable thresholds. First match wins: Completado (100 % achievements, total > 0) → Sin tocar (0 min) → Probado (< 60 min) → En curso (≥ 60 min, played ≤ 90 d ago) → Pausado (90 d–12 mo) → Acabado (> 12 mo; inactivity heuristic, not a real "finished"). Backlog = Sin tocar + Probado. Only Completado needs achievements.

### Cache

- **Redis (Upstash free, 500k commands/month) is the source of truth; the CDN (`s-maxage` + SWR) is only an optimization** (regional, best-effort). Never rely on it for correctness.
- Budget commands: per-user achievements are **one hash** (`ach:{steamid}`, field = appid); the library is stored **normalized**, not raw (~190 KB → tens of KB); use `MGET`/pipelines.
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
- Unusable: `GetAchievementsProgress` (401 with a developer key). Wishlist = `GetWishlist` + `IStoreBrowseService/GetItems` (no key, ~150 ids per call; 300 gives 400).
- Steam terms only clearly cover data "as requested by the end user", and Valve can revoke the key anytime. Keep the Steam layer isolated in the adapter, keep per-user caches short, and keep the **demo mode on fixtures** working without a key. The footer needs a Valve trademark notice and a non-affiliation disclaimer, and the site needs a privacy policy. There is no literal "Powered by Steam".

## Frontend rules

- TanStack Query 5: `useQuery` for profile/library, `useQueries` + `combine` for achievement batches. `streamedQuery` is experimental, don't use it.
- **Motion** (`LazyMotion` + `domMax`): layout, exit, counters. **GSAP** (`useGSAP`, grid stagger, `ScrollTrigger.batch`): grid entrances. **Never both on the same element or property.** Never run GSAP on nodes that `AnimatePresence` unmounts, or inside Recharts SVG. Motion `layout` does not work in SVG.
- Recharts 3 for standard charts; heatmap and rarity are hand-built SVG (d3-scale + Motion).
- Animate only `transform` and `opacity`. Respect `prefers-reduced-motion` (`MotionConfig reducedMotion="user"`, `gsap.matchMedia`). Custom charts need a table or text alternative.
- 300 covers: `content-visibility: auto` + lazy images, no virtualization. Lenis stays out of the app shell.
- Styles: SCSS + CSS variables (light/dark), BEM kebab-case, stylelint configured as in `dev-portfolio` / `spa-anicalendar`. No Tailwind.
- i18n: `en` (default) and `es`. The UI language maps to Steam's `l=` (`english`/`spanish`); `cc` for prices comes from the language with a manual selector and is part of the item cache key.

## Fixtures and testing

- Vitest, MSW 3 (ESM-only, Node ≥ 22.12; same handlers for `setupServer` in tests and `setupWorker` in dev/demo), Testing Library, jsdom.
- Fixtures come from the owner's Postman collection, which contains their real SteamID, `realname` and avatar. **Never commit the collection, `.env*`, `.vercel/` or `fixtures/full/`.**
- Anonymize with a **fake-ID map**, not hashes (SteamIDs are enumerable). Touch `steamid`, `personaname`, `realname`, avatars, `profileurl`, `primaryclanid`. Public fixtures are cut-down or synthetic.
- A CI test must fail if the real SteamID or `realname` appears in any tracked file. Every fixture must parse with its Zod schema and normalize to the expected domain output.

## Constraints and conventions

- Free tiers only: if something needs payment, drop it. Vercel Hobby is non-commercial (no ads, no charging); exceeding quotas means a 30-day block, not a charge. Public repo, visibility only, no contributions.
- Match the owner's other repos: Prettier with 4 spaces, single quotes, `printWidth` 120, `trailingComma: es5`, LF. Code comments in English, minimal; say what something is, never narrate the code.
