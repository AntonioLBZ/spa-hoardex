# To do

Delete each item when it is done. Design notes for every item are in `ARCHITECTURE.md`.

### Check in production

- Open your own profile in production (the CSP is live since 2026-10-09): the covers of a public library must load, and nothing must be blocked. If images break, `ARCHITECTURE.md` §11 lists the hosts to allow. (On previews the Vercel comments toolbar is blocked by the CSP; that is expected.)
- Web Analytics, after this deploy: *Routes* lists `/p/[profile]`, `/demo`, `/privacy` and `/`; *Pages* still shows the plain path; one page view per navigation (not two) and none when you change a filter or type in the search box.
- `POST /api/refresh/<name>` works in production: 200, then 429 with `Retry-After` near 600. The button shows the cooldown and swaps the data without a second GET. This also confirms that the `/api/:path*` rewrite lets a POST through (only checked in `vercel dev`).

### Unverified with real data

- A modest phone (owner, evening of 2026-10-09): "Show more", plus the count-up, the donut and the card fade-in. On a vivo X300 Pro (high end) the animations run smoothly. In headless Chromium at CPU x4 to x6 every "Show more" batch keeps the main thread busy for a second or two while its covers arrive, and the cost grows with the cards already on screen (none at x1). If it shows, trace the paint cost and consider unmounting the first cards or smaller later batches (§10); if the cards stutter, `ARCHITECTURE.md` §14 lists the cuts in order.
- `libraryPrivate` and `wishlistPrivate` (needs another account).

### Extras to review later

- A message for the WAF's 429 (plain text, no `Retry-After`, §11): the client shows its generic error now. Map an `ApiError` 429 to "too many requests, try again in a minute". Review the rule's 60 requests per minute when phase 2 adds the achievement batches.
- A theme selector (light, dark, system), maybe more than two themes. Today the theme only follows `prefers-color-scheme`.
- A preview when the URL is shared: Open Graph and Twitter tags plus a 1200×630 image (for example a capture of `/demo`). The tags need an absolute URL, so it depends on the domain decision.
- Screenshots in the README, of `/demo` only (fictional data), kept in `docs/`.
- A PNG favicon and an `apple-touch-icon` from `public/favicon.svg` (the chest is the chosen icon; today only the SVG exists). The logo options that were not chosen (dragon on a pie chart, card index, gem, pixel H) are not kept in the repo.

### Owner decisions

- Domain: its own, or `hoardex.vercel.app`.
- Repo license: none for now (all rights reserved). Options weighed: PolyForm Noncommercial 1.0.0 (non-commercial use allowed, recommended if code reuse for learning is wanted), MIT (anyone may use and sell it), AGPL-3.0.
- PR restrictions on GitHub.
- Animation weight: Motion (`animate`, ~20 KB gzip) and GSAP (~29 KB gzip) cost +50 KB gzip, loaded beside the API call. Motion only runs the counters until phase 2, and GSAP only the card fade-in, which Web Animations could do in ~1.5 KB. Keep both (the plan for phase 2: `AnimatePresence`, heatmap, rarity) or drop one?
- The grid reveal uses IntersectionObserver instead of `ScrollTrigger.batch` (`ARCHITECTURE.md` §10 explains why). Accept it?
- The bars of hours by year animate on load, so on a phone they probably play off screen. Animate them when they scroll into view (a step the design left optional)?

### Later phases

- 2: achievements, rarity, the *Completado* state.
- 3: wishlist and unplayed value.
- 4: Steam login, Neon, editable backlog, opt-in snapshots.
- 5: other adapters, RetroAchievements first.
