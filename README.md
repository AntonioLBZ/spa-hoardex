# spa-hoardex

## To do

Delete each item when it is done. Design notes for every item are in `ARCHITECTURE.md`.

### Phase 1, in order

- Animation: install Motion and GSAP, counters and entrances; spike 0C (300 covers, fps on a modest phone).
- Refresh button with a `refresh:{steamid}` cooldown (§8).
- Analytics: `@vercel/analytics` with the automatic page views only (`<Analytics />` at the root; no `track()`, no custom events). Enable Web Analytics in the Vercel project. The profile name stays in the recorded URL. Free plan: 50k events per month, 30 days of history.
- Privacy policy page (new route, needs its own `vercel.json` rewrite). It must say that analytics record the visited URL, profile name included, and that covers and avatars load from Steam's CDN, which sees the visitor's IP.
- Public README, favicon, per-route title and metadata.
- `Content-Security-Policy` (§11); it must allow the analytics script and the Steam image hosts (`cdn.cloudflare.steamstatic.com` for covers; the avatar host is not checked against a real profile yet).

### After the next deploy

- Page views reach the analytics dashboard.

### Unverified with real data

- "Show more" on a modest phone: at CPU x4 to x6 in headless Chromium every batch keeps the main thread busy for a second or two while its covers arrive, and the cost grows with the cards already on screen (none at x1). Check on a real phone; if it shows, trace the paint cost and consider unmounting the first cards or smaller later batches (§10).
- How the Upstash dashboard counts commands (does `HSET` with N fields count as 1?).
- `libraryPrivate` and `wishlistPrivate` (needs another account).
- Minimum length of a vanity (2 or 3).
- Why a third-party profile with friends-only game details comes without `rtime_last_played` even though the key's account is friends with it (one account, §7).
- The Steam privacy settings pages `/id/{vanity}/edit/settings` and `/profiles/{id64}/edit/settings` (owner-only, so not checkable without a login).
- Where the analytics script is served from (for the CSP).

### Owner decisions

- Repo license.
- Own domain or `*.vercel.app`.
- PR restrictions on GitHub.
- Merge *Pausado* into *En curso*.
- The key acts as its owner, so friends-only data of the owner's friends is shown to every visitor (§12): accept it or warn the visitor. Postponed.
- What to show for a played game with no last-played date: today it counts as *Finished* (§7). Proposal: a separate *Played, date unknown* state.

### Later phases

- 2: achievements, rarity, the *Completado* state.
- 3: wishlist and unplayed value.
- 4: Steam login, Neon, editable backlog, opt-in snapshots.
- 5: other adapters, RetroAchievements first.
