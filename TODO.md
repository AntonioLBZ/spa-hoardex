# To do

Delete each item when it is done. Design notes for every item are in `ARCHITECTURE.md`.

### Unverified with real data

- `libraryPrivate` and `wishlistPrivate` (needs another account).

### UI (owner, 2026-10-09)


### Later phases

- 2: achievements and rarity. Review the WAF rate limit (60 requests per minute per IP) when the achievement batches arrive (`ARCHITECTURE.md` §11).
- 3: wishlist and unplayed value.
- 4: Steam login, Neon, editable backlog, opt-in snapshots (design in `ARCHITECTURE.md` §19, in this order):
    - In production: a cron run the day after turning history on (`taken` once playtime changed), and a sign-in started on the deployment URL landing on `hoardex.vercel.app`.
    - Charts from the playtime history (data is saved since 4e).
    - Bulk move: select several cards (grid and board) and set one state for all of them in a single request.
- 5: other adapters, RetroAchievements first.

### At the very end (owner, 2026-10-09)

- A theme selector (light, dark, system), maybe more than two themes. Today the theme only follows `prefers-color-scheme`.
- A preview when the URL is shared: Open Graph and Twitter tags plus a 1200×630 image (for example a capture of `/demo`), with `https://hoardex.vercel.app` as the absolute URL.
- Screenshots in the README, of `/demo` only (fictional data), kept in `docs/`.
- Animation weight (measured 2026-10-09, gzip, in the deferred chunk of 156 KB): GSAP 28 KB, Motion 19 KB, both 47 KB. Motion only runs the counters (`CountUp`, 59 lines) until phase 2, and GSAP only the card fade-in and the list fade (`use-grid-reveal.ts`), which Web Animations can do natively. Keep both (the plan for phase 2: `AnimatePresence`, heatmap, rarity), drop GSAP only, or drop both?
