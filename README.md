# spa-hoardex

## To do

Delete each item when it is done. Design notes for every item are in `ARCHITECTURE.md`.

### Phase 1, in order

- Locked panels: when a piece cannot be drawn because of Steam privacy (private profile or game details now; achievements and wishlist later), show a skeleton in its place that says what is missing and links to the Steam privacy settings, `https://steamcommunity.com/id/{vanity}/edit/settings`. A profile without a vanity needs the `/profiles/{id64}/edit/settings` form (unverified). One reusable component, no link in demo mode, `en` and `es` copy. The current `profilePrivate` and `libraryPrivate` messages are plain text without the link.
- Animation: install Motion and GSAP, counters and entrances; spike 0C (300 covers, fps on a modest phone).
- Refresh button with a `refresh:{steamid}` cooldown (§8).
- Analytics: `@vercel/analytics` with the automatic page views only (`<Analytics />` at the root; no `track()`, no custom events). Enable Web Analytics in the Vercel project. The profile name stays in the recorded URL. Free plan: 50k events per month, 30 days of history.
- Privacy policy page (new route, needs its own `vercel.json` rewrite). It must say that analytics record the visited URL, profile name included, and that covers and avatars load from Steam's CDN, which sees the visitor's IP.
- Public README, favicon, per-route title and metadata.
- `Content-Security-Policy` (§11); it must allow the analytics script and the Steam image hosts (`cdn.cloudflare.steamstatic.com` for covers; the avatar host is not checked against a real profile yet).

### After the next deploy

- Direct load of `/p/...` and `/demo` (SPA rewrites).
- `/api/demo/*` answers `x-vercel-cache: HIT` on the second request.
- Page views reach the analytics dashboard.

### Unverified with real data

- How the Upstash dashboard counts commands (does `HSET` with N fields count as 1?).
- `libraryPrivate` and `wishlistPrivate` (needs another account).
- Minimum length of a vanity (2 or 3).
- Where the analytics script is served from (for the CSP).

### Owner decisions

- Repo license.
- Own domain or `*.vercel.app`.
- PR restrictions on GitHub.
- Merge *Pausado* into *En curso*.

### Later phases

- 2: achievements, rarity, the *Completado* state.
- 3: wishlist and unplayed value.
- 4: Steam login, Neon, editable backlog, opt-in snapshots.
- 5: other adapters, RetroAchievements first.
