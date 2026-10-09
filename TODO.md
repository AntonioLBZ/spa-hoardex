# To do

Delete each item when it is done. Design notes for every item are in `ARCHITECTURE.md`.

### Check in production


- Open your own profile in production (the CSP is live since 2026-10-09): the covers of a public library must load, and nothing must be blocked. If images break, `ARCHITECTURE.md` §11 lists the hosts to allow. (On previews the Vercel comments toolbar is blocked by the CSP; that is expected.)
- The new icons in production: `/favicon.ico` and `/apple-touch-icon.png` load, Safari shows the chest in its tab, and "Add to Home Screen" on an iPhone shows it too (`ARCHITECTURE.md` §10, «Iconos»).
- `POST /api/refresh/<name>` works in production: 200, then 429 with `Retry-After` near 600. The button shows the cooldown and swaps the data without a second GET. This also confirms that the `/api/:path*` rewrite lets a POST through (only checked in `vercel dev`).

### Unverified with real data

- A modest phone (owner, evening of 2026-10-09): "Show more", plus the count-up, the donut and the card fade-in. On a vivo X300 Pro (high end) the animations run smoothly. In headless Chromium at CPU x4 to x6 every "Show more" batch keeps the main thread busy for a second or two while its covers arrive, and the cost grows with the cards already on screen (none at x1). If it shows, trace the paint cost and consider unmounting the first cards or smaller later batches (§10); if the cards stutter, `ARCHITECTURE.md` §14 lists the cuts in order.
- `libraryPrivate` and `wishlistPrivate` (needs another account).

### UI (owner, 2026-10-09)

- Bug: on desktop the board view leaves one column out of view.
- Edit the filters and the sort order (the library toolbar).
- One set of corner radii across the app: the redesign mixed `--size-border-radius`, `--size-border-radius-large` and literal values.
- Better copy and look for the "Is this your library?" bubble on profiles.
- Extract styled, parametrizable components into `src/components/`: buttons (primary, secondary…), switch, radio button, form fields, cards. Then replace the ad hoc styles with them.
- Check whether Steam exposes how many times a game was launched (or sessions). `GetOwnedGames` only gives playtime and the last-played date; if nothing else gives it, drop the idea.

### Later phases

- 2: achievements and rarity. Review the WAF rate limit (60 requests per minute per IP) when the achievement batches arrive (`ARCHITECTURE.md` §11).
- 3: wishlist and unplayed value.
- 4: Steam login, Neon, editable backlog, opt-in snapshots (design in `ARCHITECTURE.md` §19, in this order):
    - Finish one sign-in on `localhost`: `vercel dev` plus `pnpm dev`, opened on :5173 (only the preview was tried).
    - Measure a cold Neon read from `iad1` (only warm reads were seen, `ARCHITECTURE.md` §19.10).
    - By hand: drag a card on the board with a real mouse and on a phone (synthetic events cannot start a native drag), the card state menu on a phone (and its flip above near the bottom edge), and an owner edit in a preview.
    - After the next production deploy: the first cron run in the Vercel logs (`[cron] snapshots`), `/account` in the browser (history on and off, sign out everywhere, delete), and a sign-in started on the deployment URL landing on `hoardex.vercel.app`.
    - Charts from the playtime history (data is saved since 4e).
    - Bulk move: select several cards (grid and board) and set one state for all of them in a single request.
- 5: other adapters, RetroAchievements first.

### At the very end (owner, 2026-10-09)

- A theme selector (light, dark, system), maybe more than two themes. Today the theme only follows `prefers-color-scheme`.
- A preview when the URL is shared: Open Graph and Twitter tags plus a 1200×630 image (for example a capture of `/demo`), with `https://hoardex.vercel.app` as the absolute URL.
- Screenshots in the README, of `/demo` only (fictional data), kept in `docs/`.
- Animation weight (measured 2026-10-09, gzip, in the deferred chunk of 156 KB): GSAP 28 KB, Motion 19 KB, both 47 KB. Motion only runs the counters (`CountUp`, 59 lines) until phase 2, and GSAP only the card fade-in and the list fade (`use-grid-reveal.ts`), which Web Animations can do natively. Keep both (the plan for phase 2: `AnimatePresence`, heatmap, rarity), drop GSAP only, or drop both?
