# To do

Delete each item when it is done. Design notes for every item are in `ARCHITECTURE.md`.

### Unverified with real data

- `libraryPrivate`: needs a public profile whose game details the key's account can't see (a non-friend with friends-only or private details, or a friend with private ones). None of the four accounts tried on 2026-10-11 was one (`ARCHITECTURE.md` §5.4, §17). `wishlistPrivate` is verified at Steam's end; the adapter maps it in phase 3.

### Owner decisions from the 2026-10-11 real-data check

- Games without a last-played date: Steam sends `rtime_last_played` only for the key's own account, so on every other profile *En curso* and *Pausado* are 0 and every game played for 60 minutes or more is *Completado*, even ones played in the last two weeks (`ARCHITECTURE.md` §7). Keep that, use `playtime_2weeks` to mark *En curso*, or something else? The locked «Games by year» text sends people to privacy settings that can't fix it.
- The friends-only leak (§12, confirmed): before serving a library, check `GetWishlistItemCount` without the key and answer `libraryPrivate` on `x-eresult: 15`?

### Later phases

- 2: achievements and rarity. Review the WAF rate limit (60 requests per minute per IP) when the achievement batches arrive (`ARCHITECTURE.md` §11).
- 3: wishlist and unplayed value.
- 4: Steam login, Neon, editable backlog, opt-in snapshots (design in `ARCHITECTURE.md` §19, in this order):
    - In production: a cron run the day after turning history on (`taken` once playtime changed), and a sign-in started on the deployment URL landing on `hoardex.vercel.app`.
- 5: other adapters, RetroAchievements first.

### At the very end (owner, 2026-10-09)

- Charts from the playtime history (data is saved since 4e). Wait until there are some days of real snapshots to try them on (owner, 2026-10-10).
- A theme selector (light, dark, system), maybe more than two themes. Today the theme only follows `prefers-color-scheme`.
- A preview when the URL is shared: Open Graph and Twitter tags plus a 1200×630 image (for example a capture of `/demo`), with `https://hoardex.vercel.app` as the absolute URL.
- Screenshots in the README, of `/demo` only (fictional data), kept in `docs/`.
- Animation weight (measured 2026-10-09, gzip, in the deferred chunk of 156 KB): GSAP 28 KB, Motion 19 KB, both 47 KB. Motion only runs the counters (`CountUp`, 59 lines) until phase 2, and GSAP only the card fade-in and the list fade (`use-grid-reveal.ts`), which Web Animations can do natively. Keep both (the plan for phase 2: `AnimatePresence`, heatmap, rarity), drop GSAP only, or drop both?
