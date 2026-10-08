# spa-hoardex

## To do

Delete each item when it is done. Design notes for every item are in `ARCHITECTURE.md`.

### Phase 1, in order

- Analytics: the code is in (`src/lib/analytics.ts`, called from `main.tsx`; §10). Enable Web Analytics in the Vercel project (project → Analytics tab → Enable) and redeploy. Free plan: 50k events per month for the whole account, 1 month of history.
- Privacy policy page (new route, needs its own `vercel.json` rewrite). It must say that analytics record the visited path (profile name included, no query string, no cookies), that the refresh cooldown keeps the SteamID for 10 min, and that covers and avatars load from Steam's CDN, which sees the visitor's IP.
- Public README, favicon, per-route title and metadata.
- `Content-Security-Policy` (§11); it must allow the analytics script (same origin: `script-src 'self'`, `connect-src 'self'`) and the Steam image hosts (`cdn.cloudflare.steamstatic.com` for covers; the avatar host is not checked against a real profile yet).
- Vercel WAF rate-limit rule over `/api/`, GET and POST (Hobby allows one rule per project; leave room for ~10 calls per full page load, §11). Before sharing the URL publicly.

### After the next deploy

- Page views reach the analytics dashboard as `/demo` and `/p/<name>`, without the query string; changing a filter adds none.
- `POST /api/refresh/<name>` works in production: 200, then 429 with `Retry-After` near 600. The button shows the cooldown and swaps the data without a second GET.

### Unverified with real data

- The count-up, the donut and the card fade-in on a real phone (spike 0C was run in headless Chromium with CPU throttling and no GPU, `ARCHITECTURE.md` §14). If the cards stutter, `ARCHITECTURE.md` §14 lists the cuts in order.
- "Show more" on a modest phone: at CPU x4 to x6 in headless Chromium every batch keeps the main thread busy for a second or two while its covers arrive, and the cost grows with the cards already on screen (none at x1). Check on a real phone; if it shows, trace the paint cost and consider unmounting the first cards or smaller later batches (§10).
- How the Upstash dashboard counts commands (does `HSET` with N fields count as 1?).
- `libraryPrivate` and `wishlistPrivate` (needs another account).
- Minimum length of a vanity (2 or 3).
- Why a third-party profile with friends-only game details comes without `rtime_last_played` even though the key's account is friends with it (one account, §7).
- The Steam privacy settings pages `/id/{vanity}/edit/settings` and `/profiles/{id64}/edit/settings` (owner-only, so not checkable without a login).
- The `/api/:path*` rewrite lets a POST through once deployed (checked in `vercel dev`).
- That the production analytics script behaves like the debug one (path-only page views, `beforeSend` applied), and that `vercel project web-analytics` exists in CLI 62.7.0.

### Owner decisions

- Repo license.
- PR restrictions on GitHub.
- Merge *Pausado* into *En curso*.
- Animation weight: Motion (`animate`, ~20 KB gzip) and GSAP (~29 KB gzip) cost +50 KB gzip, loaded beside the API call. Motion only runs the counters until phase 2, and GSAP only the card fade-in, which Web Animations could do in ~1.5 KB. Keep both (the plan for phase 2: `AnimatePresence`, heatmap, rarity) or drop one?s
- The grid reveal uses IntersectionObserver instead of `ScrollTrigger.batch` (`ARCHITECTURE.md` §10 explains why). Accept it?
- The bars of hours by year animate on load, so on a phone they probably play off screen. Animate them when they scroll into view (a step the design left optional)?
- The key acts as its owner, so friends-only data of the owner's friends is shown to every visitor (§12): accept it or warn the visitor. Postponed.
- What to show for a played game with no last-played date: today it counts as *Finished* (§7). Proposal: a separate *Played, date unknown* state.

### Later phases

- 2: achievements, rarity, the *Completado* state.
- 3: wishlist and unplayed value.
- 4: Steam login, Neon, editable backlog, opt-in snapshots.
- 5: other adapters, RetroAchievements first.
