# Hoardex — Arquitectura

> **Estado (2026-10-09):** decisiones cerradas el 2026-10-07 tras investigación; el spike de la fase 0 pasó su puerta (§14) y la fase 1 está en curso. Lo que falta está en `TODO.md` (la lista viva); este fichero guarda el porqué.
> Las versiones exactas están fijadas en `package.json`, que manda sobre las de §3.
> Convención de fiabilidad: **(verificado)** = probado con curl, Postman o contra la doc oficial ese día · **(secundaria)** = fuente no oficial · **(sin verificar)** = suposición. Todo lo (secundaria) o (sin verificar) se comprueba en el spike antes de depender de ello.

## 1. Qué es y alcance

Dashboard web de la biblioteca de Steam de un usuario: horas jugadas, backlog, logros y wishlist, con gráficas animadas y mucha animación (datos que "se construyen" en pantalla).

- **Audiencia:** demo pública de portfolio. Tráfico bajo, visitantes anónimos. No es un producto.
- **Uso:** cualquier visitante introduce un perfil (URL, vanity o SteamID64). Más adelante, "Sign in through Steam" opcional.
- **Coste:** 0 €. Si algo exige pago, se descarta.
- **Monetización:** ninguna. Vercel Hobby es solo uso no comercial; pedir donaciones está permitido, anuncios y cobros no.
- **Futuro:** más stores (RetroAchievements primero; GOG, Epic, PSN, Xbox son frágiles) y backlog editable.
- **Repo:** `spa-hoardex`, hoy **privado**; se hará público sin aceptar contribuciones (las restricciones de PR se verán entonces, decisión del dueño de 2026-10-09). Proyecto **Hoardex**; dominio de producción `hoardex.vercel.app`, el gratuito de Vercel (decisión del dueño, 2026-10-09: sin dominio propio).

## 2. Decisiones cerradas

| Tema | Decisión | Motivo / alternativa descartada |
|---|---|---|
| Shell | **Vite 8 + React 19 + TypeScript** (SPA) | Modelo mental simple, sin RSC. El spike pasó (§14): el Plan B (Next.js 16 "fino") no hace falta |
| API | **Hono** en una Vercel Function (`/api`) | Request/Response estándar, portable fuera de Vercel, tipos extremo a extremo con `hc` |
| Hosting | **Vercel Hobby** | Ya lo usas; gratis. Cloudflare descartado (§16) |
| Caché | **CDN (`s-maxage` + SWR) + Upstash Redis free** | Persistente y barata en comandos si se diseña bien (§8) |
| Base de datos | **Ninguna en el MVP.** Neon (Postgres) solo en fase 4, con Redis delante para las lecturas públicas (§19) | Snapshots opt-in y backlog editable lo necesitarán. Solo Redis descartado: Upstash free archiva tras 14–30 días sin actividad y los snapshots casan mal con un key-value |
| Cliente Steam | **Propio**: `fetch` + Zod 4 | `steamapi` descartado (§16) |
| Fetching | **TanStack Query 5** | Ya lo usas en `spa-anicalendar` |
| Estilos | **SCSS** + variables CSS, sin Tailwind | Reutilizar convenciones de tus repos (stylelint + BEM) |
| Animación | **Motion** + **GSAP** (§10) | Cada uno donde es mejor; nunca sobre el mismo elemento |
| Gráficas | **Recharts 3** + SVG a mano | ECharts 6 queda como alternativa "espectacular" |
| Router | **TanStack Router** (rutas por ficheros con el plugin de Vite) | Parámetros de búsqueda tipados para los filtros en la URL; misma familia que Query. Sus peers aceptan React 19 y el plugin acepta Vite 8 (metadatos de npm); **verificado en la práctica** (fase 1, paso 4): con Vite 8.3 el plugin genera `routeTree.gen.ts` y parte el código por ruta |
| i18n | `en` (por defecto) y `es` con **`use-intl`** | Núcleo de `next-intl`, que ya usas en `spa-anicalendar`: mismo JSON anidado, ICU y `useTranslations`/`useFormatter`, sin paso de compilación. Lingui exige Babel dentro de Vite 8; `react-i18next`, otra API |
| Logros | **Lotes de ~12 juegos** pedidos por el cliente | `GetAchievementsProgress` no funciona con key de desarrollador (§16) |
| Historial | **Solo con login y opt-in** (fase 4) | No guardar datos de terceros sin consentimiento |
| Tests | Vitest + Testing Library + `fetch` inyectado + fixtures anonimizados o sintéticos | §13. **MSW descartado el 2026-10-07**: el modo demo vive en el servidor (§10) y los tests ya inyectan `fetch`; un service worker habría quedado instalado en el navegador de los visitantes |

## 3. Stack (versiones a 2026-10-07)

React 19.3 · Vite 8.3 · TypeScript 6.0 · Hono 4.13 + `@hono/vercel` 1.0 · `@upstash/redis` 1.39 · `@vercel/analytics` 2.0.1 · Zod 4.6 · TanStack Query 5.104 · Motion 14.0.0 · GSAP 3.15.0 + `@gsap/react` 2.1.2 · Recharts 3.10 · use-intl 4.14 · TanStack Router 1.170 · Vitest 5 · `sass` · pnpm (como en tus otros repos).

## 4. Estructura del repo

Una sola regla: **`core/` no importa nada de React, Vite ni Hono.** Así cambiar de shell (Next, otro host) cuesta poco.

```
core/            dominio y lógica pura
  domain/        Game, Playtime, Profile, ProfileAccess, ids (Achievement y WishlistItem llegan en las fases 2 y 3)
  adapters/
    steam/       SteamAdapter: cliente fetch, schemas Zod, normalizadores, imágenes y modo demo (tipos crudos de Steam SOLO aquí)
  cache/         CacheStore + Upstash, adapter con caché, presupuesto diario, claves y TTLs
  backlog/       clasificación de estados (función pura, umbrales configurables)
  stats/         resúmenes de la biblioteca para el dashboard (puro)
  browse/        filtro, búsqueda y orden de la biblioteca (puro)
api/             punto de entrada de Vercel (cada fichero se vuelve una función)
server/          Hono: rutas, validación de entrada, cabeceras de caché, cableado de entorno
src/             frontend: routes/ (por ficheros), features/, components/, lib/, assets/ (textos y estilos SCSS)
fixtures/        anonimizados/sintéticos (los completos, fuera del repo)
scripts/         extracción y anonimizado de fixtures desde Postman, y los spikes
tests/           test anti-fuga y de ficheros estáticos
public/          favicon, logo, avatar de la demo y robots.txt
```

## 5. API de Steam

### 5.1 Endpoints que usamos

| Endpoint | Para qué | Key | Notas |
|---|---|---|---|
| `ISteamUser/ResolveVanityURL` | vanity → SteamID64 | sí | caché larga |
| `ISteamUser/GetPlayerSummaries` | perfil y `communityvisibilitystate` | sí | solo se han visto 1 (no visible) y 3 (público) (secundaria) |
| `IPlayerService/GetOwnedGames` (`include_appinfo=1`, `include_played_free_games=1`) | biblioteca completa en 1 llamada | sí | ~191 KB para 334 juegos; normalizar antes de cachear |
| `ISteamUserStats/GetPlayerAchievements` (`l=<idioma>`) | logros de un juego y usuario | sí | el status HTTP no es fiable (§5.4) |
| `ISteamUserStats/GetSchemaForGame` | iconos y `hidden` | sí | global, compartido entre usuarios |
| `ISteamUserStats/GetGlobalAchievementPercentagesForApp` | rareza | no | `percent` llega como **string** |
| `IWishlistService/GetWishlist` | appid, prioridad, fecha | sí | |
| `IWishlistService/GetWishlistItemCount` | sonda barata de wishlist | sí | |
| `IStoreBrowseService/GetItems` | nombre, precio, assets en lote | no | GET con `input_json`: el límite es la **longitud de la URL** (250 ids ok, 275 → 414, 300 → 400); usar ≤ 150 con margen. Sin `data_request` trae nombre y precio (`best_purchase_option`) a ~0,8 KB/ítem (verificado). `Cache-Control: public, max-age=120` |
| `IPlayerService/GetSteamLevel`, `GetBadges` | extras cosméticos del perfil | sí | opcional |

### 5.2 Endpoints que no usamos

| Endpoint | Motivo |
|---|---|
| `GetFriendList` | Devuelve `401 {}` si es privada; no hay forma de distinguir causas |
| `GetRecentlyPlayedGames` | Redundante: `GetOwnedGames` ya incluye `playtime_2weeks` y `rtime_last_played` |
| `GetUserStatsForGame` | Solo estado de logros, sin metadatos; redundante |
| `GetWishlistSortedFiltered` | ~14 KB por ítem con todos los flags (1 MB para 94 ítems) |
| `store.steampowered.com/api/appdetails` | 1 appid por llamada y rate limit sin documentar |
| `IPlayerService/GetAchievementsProgress` | POST; devuelve 401 con key de desarrollador (verificado con tu key) |
| `IStoreService/GetAppList` | 1000 apps por página (~203 KB). Solo útil en fase 5 para cruzar stores |

### 5.3 Rarezas de los datos (de las respuestas reales)

- **Casing inconsistente:** `GetPlayerBans` usa PascalCase (`SteamId`, `VACBanned`); el resto, snake_case o minúsculas.
- **Horas:** en 26 de 334 juegos `playtime_forever` ≠ suma de plataformas + `playtime_disconnected` (16 con desglose 0, 3 por debajo, 7 por encima). `playtime_forever` es la verdad; el desglose por plataforma es aproximado. En la muestra `playtime_mac_forever` y `playtime_deck_forever` valen siempre 0, y `playtime_2weeks` aparece en un solo juego.
- **Juegos sin jugar:** `rtime_last_played` vale 0 en los 217 juegos a 0 min.
- **`has_community_visible_stats`:** ausente (no `false`) en 30 de 334 juegos (11 de ellos con horas jugadas); nunca vale `false`. Tratar "ausente" como "sin stats".
- **Logros ocultos:** vienen con `description` vacía.
- **Sin caché gratis:** la Web API responde `Cache-Control: no-cache`.
- **429:** HTTP 429 con cabecera `x-eresult: 84`, cuerpo `{"response":{}}` y **sin `Retry-After`**. El bucket parece compartido. Se recupera en menos de 1 min (verificado con curl por el agente, endpoint sin key).
- **Imágenes de juego (verificado con un appid, HEAD 200):** icono `https://media.steampowered.com/steamcommunity/public/images/apps/<appid>/<img_icon_url>.jpg` (lo construye el adapter), cabecera `https://cdn.cloudflare.steamstatic.com/steam/apps/<appid>/header.jpg` y portada vertical `…/library_600x900.jpg`. **Comprobado el 2026-10-07** cargando las imágenes en el navegador con 44 appids públicos: 39 tienen portada vertical (el fichero `library_600x900.jpg` se sirve a 300×450 px), pero cuatro herramientas de Steam (`228980`, `1493710`, `1628350`, `1007`) solo tienen `header.jpg` y `480` (Spacewar) no tiene ninguna. Por eso la UI prueba la portada, luego la cabecera y al final un relleno de color.
- **Datos personales en respuestas:** `GetPlayerSummaries` trae `realname`, avatar y URL del perfil.

### 5.4 Perfil privado: la regla es decidir por el cuerpo, nunca solo por el status HTTP

| Caso | Respuesta | Fiabilidad |
|---|---|---|
| Wishlist privada | 200, `{"response":{}}`, `x-eresult: 15` | (verificado) |
| Wishlist pública y vacía | 200, `{"response":{}}`, `x-eresult: 1` | (verificado) |
| `GetOwnedGames`, perfil público con biblioteca visible | 200, `x-eresult: 1`, `game_count` + `games` (334 juegos, ~109 KB con `include_appinfo`) | (verificado) |
| `GetOwnedGames`, cuenta ajena de solo amigos (se supone que no amiga de la key; no se anotó en su día) | 200, **`x-eresult: 15`**, `{"response":{}}` (15 B, sin `game_count`); el adapter devuelve `profilePrivate` | (verificado) |
| `GetOwnedGames`, cuenta de solo amigos que **es amiga de la key** | 200, `x-eresult: 1`, `game_count` y `games` con `playtime_forever`, pero **sin** `rtime_last_played` ni desgloses por plataforma (639 juegos, ver §7); la API la trata como amiga | (verificado con una cuenta; la causa es la explicación del dueño, §7) |
| `GetOwnedGames`, perfil público con "game details" privado (`libraryPrivate`) | se espera el mismo cuerpo vacío | (sin verificar): hace falta una cuenta pública ajena con los detalles de juego privados |
| `GetOwnedGames`, público sin juegos | 200, `{"response":{"game_count":0}}` | (secundaria) |
| `GetPlayerAchievements`, "game details" privado con perfil público (`communityvisibilitystate: 3`) | 403, `{"playerstats":{"error":"Profile is not public","success":false}}` | (verificado) |
| `GetPlayerAchievements`, perfil de solo amigos o privado | 403 esperado | (sin verificar) → spike 0B.6 |
| `GetOwnedGames`, `GetWishlist` y `GetWishlistItemCount` con "game details" privado, **consultando la propia cuenta del dueño de la key** | 200 con **todos** los datos, idénticos a los del perfil público (probado dos veces, con minutos de diferencia) | (verificado). Parece que la key ve los datos de su propia cuenta (sin verificar); **no sirve para probar privacidad** |
| `GetPlayerAchievements`, juego sin stats (con o sin horas) | 400, `{"playerstats":{"error":"Requested app has no stats","success":false}}` | (verificado) |
| `GetPlayerAchievements`, poseído, 0 min y con stats | **200 con la lista completa de logros** (el 500 que citaban fuentes secundarias no se reprodujo) | (verificado) |
| `GetPlayerAchievements`, perfil público con logros | 200, `playerstats.achievements[]` | (verificado) |
| `GetWishlist`, pública con ítems | 200, `x-eresult: 1`, `response.items[]` | (verificado) |
| `GetPlayerSummaries` | 200, sin `x-eresult`; `communityvisibilitystate: 3` si es público | (verificado) |
| `GetPlayerSummaries`, id inexistente | 200, `{"response":{"players":[]}}`, sin `x-eresult` | (verificado) |
| `GetPlayerSummaries`, cuenta ajena de solo amigos | 200 con el perfil visible (nombre y avatar) y `communityvisibilitystate: 2`; el adapter lo mapea a `friends` | (verificado con el adapter, sin inspeccionar el cuerpo crudo) |
| `ResolveVanityURL`, vanity inexistente | 200, `{"response":{"success":42,"message":"No match"}}`, sin `x-eresult` | (verificado) |

Que `communityvisibilitystate` sea 3 **no** implica logros visibles: "game details" es un ajuste aparte y su valor no aparece en `GetPlayerSummaries` (verificado: con 3 y detalles privados, los logros dan 403). "Detalles de los juegos" controla juntos la lista de juegos, la wishlist, los logros y el tiempo de juego; la wishlist **no tiene ajuste propio** (verificado en los ajustes de Steam). Para validar los casos de biblioteca y wishlist privadas hace falta una cuenta **distinta** de la del dueño de la key (§14).

## 6. Dominio y adapters

El front solo conoce el modelo propio. Los tipos crudos de Steam no salen del `SteamAdapter`.

- **Entidades:** `Profile`, `Game`, `Playtime`, `Achievement`, `WishlistItem`.
- **Identidad:** `{ source, externalId }` (p. ej. `steam:1091500`). Un `canonicalGameId` opcional servirá en fase 5 para cruzar stores.
- **`Playtime`:** `totalMinutes`, `lastPlayedAt`, desglose por plataforma opcional y marcado como aproximado.
- **`ProfileAccess`** (unión discriminada, tratada como **dato**, no excepción): `ok | profilePrivate | libraryPrivate | wishlistPrivate | notFound | rateLimited`.
- **Interfaz del adapter:** `resolveProfile`, `getLibrary`, y opcionales `getAchievements`, `getWishlist`.
- **Capacidades declaradas** por adapter (logros por juego / por lote / ninguno; wishlist sí/no). El front lee las capacidades y oculta los paneles que no aplican, así añadir una store no obliga a tocar vistas.
- **Zod en el borde:** `safeParse` sobre la respuesta cruda, `z.looseObject`, campos opcionales, `.catch()` en enums dudosos. Si la forma cambia se **registra la deriva**, no se lanza. Schemas generados con quicktype (target `typescript-zod`) a partir de varias muestras y retocados a mano.

## 7. Backlog y estados

Steam no tiene backlog; se calcula en cliente con una función pura. Los umbrales son constantes configurables en `core/backlog`.

**Orden de evaluación** (el primero que se cumple gana):

| Prioridad | Estado | Regla |
|---|---|---|
| 1 | **Completado** | 100 % de logros (`unlocked == total`, `total > 0`). Pisa a todos los demás |
| 2 | **Sin tocar** | `playtime == 0` |
| 3 | **Probado** | `0 < playtime < 60 min` |
| 4 | **En curso** | `playtime ≥ 60 min` y última partida ≤ 90 días |
| 5 | **Pausado** | `playtime ≥ 60 min` y última partida entre 90 días y 12 meses |
| 6 | **Acabado** | `playtime ≥ 60 min` y última partida > 12 meses |

- **Acabados vs. Completados:** *Acabado* es "lo jugué y ya no lo toco" (heurística por inactividad); *Completado* es el 100 % de logros. Steam no permite saber si se pasó la historia, así que *Acabado* es un proxy. En la fase 4 el usuario podrá marcarlo a mano.
- **Pausado** rellena el hueco entre 90 días y 12 meses, que la tabla acordada dejaba sin estado. Se mantiene separado de *En curso* (decisión del dueño, 2026-10-09): será útil cuando el estado sea editable (fase 4).
- **Backlog = Sin tocar + Probado.** Filtro opcional para incluir *Pausado*. La wishlist va aparte.
- **Observado el 2026-10-07 (una sola cuenta):** en un perfil ajeno de 639 juegos cuyo dueño tiene los detalles de juego en *solo amigos*, `GetOwnedGames` responde 200 con `x-eresult: 1` y `playtime_forever` (219 juegos con más de 0 min), pero **ninguna entrada trae `rtime_last_played` ni los desgloses por plataforma**. Sin fecha no se pueden distinguir *En curso*, *Pausado* y *Acabado*: la regla de fecha desconocida manda todo juego con ≥ 60 min a *Acabado*, así que ese perfil sale con 219 acabados. **La cuenta de la key es amiga de esa cuenta** (confirmado por el dueño), así que la API la trata como amiga.
- **Causa, según el dueño (2026-10-09; no está en la documentación de Steam que hemos leído):** `rtime_last_played` y los desgloses solo se entregan si los detalles de juego son **públicos**; con *solo amigos* llegan las horas pero no las fechas, ni siquiera a un amigo. Encaja con lo observado. La UI sigue sin afirmar la causa y bloquea «Horas por año» con `LockedChart`. **Decidido el 2026-10-09:** un juego jugado sin fecha cuenta como *Acabado*, como hasta ahora; no hay estado aparte.
- **Dependencia de datos:** todos los estados salvo *Completado* salen solo de la biblioteca (fase 1). *Completado* necesita logros (fase 2); hasta que lleguen, el juego conserva su estado provisional sin marcarlo como incompleto.
- Los juegos sin logros visibles nunca pasan a *Completado* automáticamente.
- **Distribución real de la biblioteca de ejemplo** (adapter + `classifyGame` contra Steam, 2026-10-07, sin logros todavía): 217 sin tocar, 16 probados, 6 en curso, 23 pausados, 72 acabados, 0 completados (suman 334). 304 de 334 tienen `has_community_visible_stats`. Cero reports de deriva de Zod.
- En esa biblioteca (pública) **ningún** juego tiene minutos > 0 con `rtime_last_played` = 0. La regla de fecha desconocida (→ *Acabado*) solo se ejercita con perfiles de solo amigos (punto anterior).

**Métricas derivadas:** horas totales, horas por año de última partida, reparto por plataforma (aproximado), % de backlog, **valor sin jugar** (suma del precio actual de Sin tocar + Probado vía `GetItems`, fase 3), logros desbloqueados, % medio, logros raros (< 5 %) y actividad por fecha de desbloqueo.

## 8. Caché

Dos niveles. **El CDN es optimización, nunca fuente de verdad:** es regional y "best-effort". La correctitud descansa en Redis.

### Nivel 1 — CDN

Respuestas `GET` públicas de `/api` con `Cache-Control: s-maxage=…, stale-while-revalidate=…`. Requisitos del CDN: solo GET/HEAD, sin `Authorization` ni `Set-Cookie`. Máximo 10 MB por entrada.

### Nivel 2 — Upstash Redis (free: 256 MB, 500 k comandos/mes)

**Presupuesto de comandos:** guardar los logros de un usuario como **un hash** (`HSET` con varios campos = 1 comando, `HGETALL` = 1 comando) en lugar de una clave por juego. Guardar la biblioteca **normalizada**, no el JSON crudo (~190 KB → decenas de KB). **Medido el 2026-10-09:** un `HSET` de 200 campos suma **una** escritura (`total_writes_processed` de `INFO` pasó de 307 a 308), así que el hash por usuario cuenta como se diseñó. `INFO` por REST (`GET <url>/info`, con el token) da `total_writes_processed` y `total_reads_processed` del servidor al instante, sin esperar al panel; las escrituras coinciden con las del panel (307 frente a 303, con algo de retraso), las lecturas no (919 frente a 1 792) y una lectura puede caer en otra instancia con contadores distintos, así que sirve para escrituras y no para el total. Uso del panel ese día, tras tres días de desarrollo y pruebas: 2,1 mil de 500 mil al mes (303 escrituras, 1 792 lecturas).

| Dato | Clave (propuesta) | TTL |
|---|---|---|
| Alias (vanity) → ID | `alias:{source}:{alias-en-minúsculas}` | 24 h (inexistente: 5 min) |
| Perfil | `profile:{source}:{steamid}` | 2 h (no encontrado: 5 min) |
| Biblioteca normalizada y su acceso | `lib:{source}:{steamid}` | 1 h (privado: 60 s; no encontrado: 5 min) (+ SWR en CDN) |
| Logros por usuario | hash `ach:{steamid}`, campo = appid | invalidación por huella, máximo 7 d |
| Esquema (iconos, `hidden`) | `schema:{appid}` | 30 d (compartido) |
| Textos localizados | `txt:{appid}:{lang}` | 30 d (compartido) |
| Rareza global | `rare:{appid}` | 7 d (compartido) |
| Ítems de tienda (precio) | `item:{appid}:{lang}:{cc}` | 6–24 h |
| Resultado negativo ("privado", "no encontrado") | dentro de la propia entrada (`alias:`, `profile:`, `lib:`) | 60 s (privado) – 5 min (no encontrado). `rateLimited` no se cachea |
| Presupuesto diario de Steam | `shared:budget:steam:{YYYYMMDD}` (**sin prefijo de entorno**: el límite es de la key) | contador, 2 días |
| Cooldown de refresco | `refresh:{source}:{steamid}` (valor = fin del cooldown en ms) | 10 min; 60 s si Steam falla o limita |

- **Invalidación de logros por "huella":** cada campo del hash guarda `hash(playtime_forever, rtime_last_played)` del momento en que se pidió. Si la biblioteca nueva trae la misma huella, no se vuelve a pedir ese juego. Un refresco normal cuesta unas pocas llamadas.
- **Idioma:** el progreso por usuario va **sin idioma** (`apiname`, `achieved`, `unlocktime`). Los textos se guardan por `(appid, lang)` y se rellenan de forma oportunista con la primera respuesta de `GetPlayerAchievements`. La rareza y el esquema no dependen del idioma.
- **Juegos sin stats** (400 "no stats"): se guarda un marcador `none` en el hash para no preguntar de nuevo.
- **Refresco manual (diseño del 2026-10-08, arquitecto Opus 5.5; implementado):** `POST /api/refresh/:input`, con la misma entrada que los GET y `Cache-Control: no-store`. La lógica va en `CachedAdapter.refresh` (sin Hono; la ruta solo traduce a HTTP):
  1. Valida la entrada (400) y obtiene el id; un alias desconocido da 200 `notFound` sin gastar cooldown.
  2. Reclama el cooldown con `SET refresh:{source}:{id} <fin en ms> NX GET EX 600` (un comando; si ya existía devuelve el valor previo, de donde sale el tiempo restante). Si Redis falla se deja pasar, igual que el presupuesto. `CacheStore.setIfAbsent` (en Upstash, `SET … NX GET EX`). **Verificado con Upstash real (2026-10-08):** la primera llamada devuelve `null`, la segunda devuelve el valor existente sin tocarlo y el TTL no se alarga.
  3. Pide perfil y biblioteca a Steam saltándose Redis y sobrescribe `profile:` y `lib:` solo con resultados cacheables. **No borra nada:** si Steam falla o limita, siguen los datos anteriores. No refresca `alias:` (24 h) ni, en la fase 2, `ach:` (la huella decide qué juegos vuelven a pedirse).
  4. Si Steam limita o falla, acorta el cooldown a 60 s (`CACHE_TTL.refreshRetry`).
  - Respuestas: 200 `{kind:'refreshed', cooldownSeconds, profile, library}` (el acceso puede ser `ok` o privado), 429 `{error:'cooldown', retryAfterSeconds}`, 503 `{error:'rateLimited', retryAfterSeconds}` (un 429 de Steam y el presupuesto agotado se ven igual) y 502 `upstream`. 429 y 503 llevan `Retry-After`. `api/index.ts` exporta también `POST` (verificado en `vercel dev`: la rewrite `/api/:path*` deja pasar el POST; falta verlo desplegado, punto «Check in production» de `TODO.md`).
  - Coste: unos 5 comandos de Redis (cooldown, 2 `INCR` del presupuesto, 2 `SET`) y 2 llamadas a Steam; con el cooldown activo, 1 comando y ninguna llamada (+1 con vanity).
  - **CDN:** tras refrescar, el CDN puede servir la copia previa de `GET /api/library/:input` hasta 60 + 300 s. El cliente siembra la caché de Query con el cuerpo del POST (no hace GET) y, `libraryQuery` conserva la biblioteca con `fetchedAt` más reciente (`newerLibrary`). Los demás visitantes ven la copia anterior hasta `s-maxage` y luego Redis, ya fresco. Descartados: un parámetro cache-buster (abre un bypass del CDN que cuesta Redis), la purga por tag (disponible en Hobby, pero «invalidate» sirve una copia vieja una vez más y `vercel dev` no emula el CDN; mejora futura) y acortar `s-maxage`. **En `vercel dev`** no hay CDN y la cabecera llega tal cual al navegador, que aplica el SWR él mismo: la primera recarga tras refrescar enseña la copia vieja y la segunda la nueva (verificado el 2026-10-08 con un servidor de prueba en Vivaldi; con `cache-control: public`, lo que ve el navegador en producción, no ocurre). En producción el mismo síntoma viene del CDN y dura como mucho esos 60 + 300 s.
  - Descartados en el servidor: borrar las claves y hacer un GET normal (un `rateLimited` dejaría la caché vacía), un `Map` de cooldowns en memoria (estado oculto, no determinista en Fluid) y derivar el cooldown de `fetchedAt` (carrera entre peticiones paralelas).
- **Normalizar siempre** el SteamID antes de usarlo como clave (un vanity y su ID resuelto deben compartir caché de datos).
- **Implementación (Fase 1, paso 3):** `core/cache` (`CacheStore`, `createCachedAdapter`, `createDailyBudget`) y `server/` (Hono). Las lecturas se validan con Zod: una entrada con otra forma cuenta como fallo de caché. Si Redis falla, la petición sigue contra Steam; si falla el contador, se deja pasar. Superado el presupuesto, `withBudget` responde como un 429 de Steam y el adapter devuelve `rateLimited`. Sin caché negativa para 429 de Steam hasta observarlo.
- **Medido en local con Steam y Upstash reales (2026-10-07):** el contador sube solo con llamadas reales a Steam (caliente = 0); los TTL salen como en la tabla; la biblioteca normalizada de 334 juegos pesa **144 KB** (~430 B por juego), más que las "decenas de KB" estimadas, aún muy por debajo de 5 MB. Si molesta se puede recortar (`iconUrl` se deriva del hash, `platforms`). Tiempos locales (España → Steam/Upstash): ~1,9 s en frío, ~0,8 s en caliente; no son referencia para producción.
- **Verificado desplegado (2026-10-07, producción):** los imports ESM de `server/` funcionan, Redis de producción responde, `x-vercel-cache: HIT` en repeticiones (el cliente ve `cache-control: public`), función en `iad1` servida desde el borde `cdg1`. Biblioteca fría ~0,7 s, en el CDN ~0,1–0,2 s. **Contabilidad de comandos de Upstash:** medida el 2026-10-09, §8 «Presupuesto de comandos».
- **Ids falsos de las fixtures:** el rango reservado puede coincidir con cuentas reales. Las fixtures solo se usan sin red, pero `profileUrl` apunta a `steamcommunity.com/profiles/{id}`. El modo demo lo respeta: su perfil usa `https://example.invalid/demo` (un test lo exige) y la UI no enlaza ningún perfil.

## 9. Carga progresiva de logros

1. Llega la biblioteca (1 llamada). Se pinta el dashboard base: horas, estados, gráficas.
2. **Candidatos a pedir logros:** `playtime_forever > 0` **y** `has_community_visible_stats` presente. En tu biblioteca: **106** juegos, no 334.
3. Se descartan los que la huella cacheada ya cubre.
4. Se ordenan por horas jugadas descendente, así las gráficas grandes se llenan primero.
5. El cliente pide **lotes de ~12 juegos** con 2–3 en vuelo. `GET /api/profile/{steamid}/achievements?appids=…&lang=…`.
6. El servidor atiende cada lote con concurrencia 5–8 hacia Steam, backoff exponencial con jitter ante 429 (3 reintentos) y completa esquema y rareza desde Redis (o los pide si faltan).
7. Cada lote que llega **dispara la animación** de las gráficas: es el efecto de "datos que se construyen".
8. El detalle de rareza por juego puede ser perezoso (al abrir la ficha).

- **Seguridad del lote:** el servidor ordena los appids, limita el tamaño del lote y solo acepta appids que pertenezcan a la biblioteca cacheada de ese `steamid`. Esto da una clave de caché determinista y evita usar el endpoint como proxy genérico de logros.
- **Estimación (mía, sin medir):** ~112 llamadas a Steam por usuario en frío → ~900 usuarios/día con el límite de 100 k llamadas/día.
- **Estado parcial:** el cliente deriva `loading | error | private | partial | complete` a partir de las queries pendientes y fallidas.

## 10. Frontend

### Fetching
- `useQuery` para el perfil y la biblioteca. `useQueries` con `combine` para los lotes de logros, con concurrencia limitada.
- `streamedQuery` sigue **experimental** en TanStack Query: no se usa.
- Perfil privado y demás `ProfileAccess` se tratan como **datos** (`retry: false`), no como excepciones.
- **Implementación (Fase 1, paso 4):** `src/routes` (`__root`, `/`, `/p/$profile`), `src/features` (header, footer, entry-form, profile-page), `src/components` (button, state-message), `src/lib` (`api`, `i18n`, `query-client`, `profile-slug`). La pantalla de entrada normaliza lo escrito con `parseProfileInput` (solo importa `profile-input.ts`, sin Zod en el bundle) y navega a `/p/{vanity en minúsculas | id64}`; una entrada inválida se rechaza sin tocar la red. `QueryClient` con `retry: false`, `refetchOnWindowFocus: false` y `staleTime` de 60 s (igual que el `s-maxage`). El perfil y la biblioteca son dos queries: si la biblioteca es privada, el perfil se sigue mostrando. `routeTree.gen.ts` va **commiteado** (`tsc` corre antes de `vite build`) y Prettier lo ignora. Los tests del front usan el árbol de rutas real con historial en memoria y un `fetch` falso (`src/lib/test/render-app.tsx`); proyecto `front` de Vitest (jsdom).
- **Implementación (Fase 1, paso 5):** `core/stats` (`summarizeLibrary`: totales, horas recientes, backlog, recuento por estado, top 10 por horas, minutos por año de última partida; función pura con tests) y `src/features/dashboard` (KPIs, donut de estados con leyenda, top de juegos con barras CSS `scaleX`, barras por año con tabla oculta). *Completado* no se muestra hasta tener logros (fase 2). Verificado en navegador real con datos sintéticos inyectados en `fetch` (sin cuentas reales): el `fill` en los datos funciona sin `Cell` (deprecado en Recharts 3), el modo de movimiento reducido pinta el estado final y no hay desbordamiento horizontal a 320, 360 y 414 px. **Las animaciones de Recharts no avanzan en una pestaña oculta** (usan `requestAnimationFrame`), así que una captura automática las ve a medias.
- **Implementación (Fase 1, paso 6, modo demo):** `GET /api/demo/profile` y `GET /api/demo/library` (`server/app.ts`), con `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`. No tocan `getData()`: funcionan sin key, sin Redis y sin red. La biblioteca es **sintética y determinista** (`core/adapters/steam/demo.ts`): 96 juegos con nombres ficticios (`Crimson Orbit`…), appids desde 4 200 000 000 (fuera de cualquier app real), cuota fija por estado (36 sin tocar, 9 probados, 12 en curso, 11 pausados, 28 acabados), unas 3 700 h, jugados repartidos de 2020 a 2026 y fechas **relativas al reloj** (así los estados no envejecen; un test lo comprueba moviendo el reloj dos años). Se sirve por el **adapter real de Steam** con un `fetch` falso (`GetPlayerSummaries` y `GetOwnedGames`), así que ejercita Zod y el normalizador. Id `76561198000009999` (ventana ficticia, nunca enviado a Steam) y avatar `public/demo-avatar.svg`. En el cliente, la ruta `/demo` reutiliza `ProfilePage` con `source: { kind: 'demo' }` y muestra un aviso de datos ficticios; la pantalla de entrada enlaza a ella. `vercel.json` lleva su regla de rewrite. **Para la cuadrícula de portadas (fase 1):** los appids de la demo no existen en Steam, así que la demo no puede pedir imágenes a su CDN; necesita portadas de relleno.
- **Implementación (Fase 1, paso 7, vista de biblioteca):** `core/browse` (puro, con tests): `classifyLibrary` empareja cada juego con su estado, `browseLibrary` filtra (estado o *backlog* = sin tocar + probado), busca por nombre ignorando mayúsculas, acentos y signos (`Portal™ 2` se encuentra con `portal 2`) y ordena (`hours`, `recent` con los nunca jugados al final, `name` con orden numérico y por idioma; los empates se rompen por nombre y luego por appid), y `countByFilter` da el contador de cada chip. `src/features/library-view`: barra con buscador, orden y chips de estado (radios nativos; *Completado* no se ofrece hasta tener logros) y cuadrícula de tarjetas (`content-visibility: auto`, imágenes `loading="lazy"`, sin virtualización). Los filtros son parámetros de búsqueda `state`, `sort` y `q`, validados a mano con `parseLibrarySearch` (sin Zod) y compartidos por `/p/$profile` y `/demo`: lo no válido se descarta, el orden por defecto y el texto vacío no se escriben, y los cambios usan `replace` y `resetScroll: false` para no llenar el historial ni saltar al inicio. El buscador guarda su texto en estado local y solo sigue a la URL cuando no tiene el foco: sincronizarlo mientras se escribe puede devolver un valor viejo sobre las teclas siguientes. Las portadas (`src/lib/covers.ts` sobre `steamCoverUrls`, en `core/adapters/steam/images.ts`) pasan de portada vertical a cabecera (se muestra entera) y a un relleno con iniciales y un color estable por juego; llevan `referrerPolicy="no-referrer"` y `alt` vacío (el nombre va debajo). La demo recibe `withImages={false}` y nunca pide imágenes a Steam. Verificado con `vercel dev` en navegador real con appids públicos (portada, cabecera, relleno), a 356 px sin desbordamiento horizontal, en tema claro y oscuro y con la URL cargada directamente. **Las imágenes `lazy` no se cargan en una pestaña oculta hasta pasado un rato**, igual que las animaciones.
- **Implementación (Fase 1, paso 8, paneles bloqueados):** `src/components/locked-panel` (`LockedPanel`) es `StateMessage` más una silueta `aria-hidden` de lo que falta (4 KPIs, 2 paneles y 12 portadas, con un degradado que la desvanece y un pulso de opacidad solo si el movimiento no está reducido). `Problem` lo usa para `profilePrivate`, `libraryPrivate` y `wishlistPrivate`; el resto de problemas siguen siendo un `StateMessage`. Con un perfil de Steam añade un botón-enlace a los ajustes de privacidad (`steamPrivacySettingsUrl` en `src/lib/steam-links.ts`: `/id/{vanity}/edit/settings` o `/profiles/{id64}/edit/settings`, sacado de la ruta con `parseProfileInput` para no enlazar texto arbitrario), que abre en pestaña nueva con `rel="noopener noreferrer"`; en la demo no hay enlace. Los tres estados ofrecen *Reintentar*: tras cambiar el ajuste en Steam el resultado tarda hasta un minuto (30 s en el CDN, 60 s en Redis), y el texto lo dice. Los textos nombran los ajustes tal como los llama Steam (*Mi perfil*, *Detalles del juego*). Hoy la silueta cubre toda la página; cuando existan los paneles de logros y wishlist tendrá que admitir una forma por panel. **Panel por gráfica:** `LockedChart` (mismo componente) sustituye a «Horas por año» cuando hay juegos jugados pero ninguno trae fecha de última partida (silueta de barras, texto y el mismo botón a los ajustes, `PrivacySettingsLink`); si nadie ha jugado nada, el panel sigue ocultándose. El texto no afirma la causa («Si es tu perfil, puedes revisar tus ajustes de privacidad»), porque solo la respalda la explicación del dueño (§7). Las URL de los ajustes solo las abre el dueño del perfil. **Verificado por el dueño el 2026-10-09** con su sesión de Steam: `/id/{vanity}/edit/settings` y `/profiles/{id64}/edit/settings` llevan a sus ajustes de privacidad.
- **Medido con 639 juegos (2026-10-07, escritorio, sin móvil):** abrir el perfil real en `vercel dev` tarda ~2,0 s hasta tener las tarjetas, y casi todo es la **cascada de red**: `/api/profile` 0,86 s y, cuando termina, `/api/library` 0,90 s (la biblioteca necesita el id), 200 KB sin comprimir (32 KB con gzip). Pintar las 639 tarjetas cuesta ~26 ms en el build de producción y ~76 ms en desarrollo (5 400 nodos DOM; `content-visibility: auto` evita el layout de las que no se ven). Cambiar de orden o filtro: 11–50 ms; teclear en el buscador: ≤10 ms por tecla. Las portadas piden ~39 imágenes al principio (lazy) y tardan varios segundos en llegar desde España. Con esos números, paginar o cargar al hacer scroll no atacaría lo lento; el móvil queda por medir (spike 0C, con imágenes).
- **Análisis de rendimiento con un subagente arquitecto (2026-10-07; Chromium headless con CDP, ralentización de CPU y Long Animation Frames; el `<select>` real y el móvil real siguen sin medirse):** el bloqueo de «Ordenar por» no se reproduce en escritorio ni en producción a CPU×1; a CPU×6 los primeros ~1,5 s tras llegar los datos acumulan 0,7–1,5 s de frames largos (commit de las 639 tarjetas ~310 ms, una tarea posterior de Recharts de 120–190 ms y relayouts de la rejilla cuando llegan las imágenes). Lo que escala con el número de juegos es el **relayout de toda la rejilla por cada imagen que llega o falla** (con 3 000 tarjetas, 300–700 ms por relayout; `contain: strict` en `.cover` no lo arregla y quitar `content-visibility` lo empeora, 2 032 ms). **Fallo encontrado y corregido:** `LibrarySection` se vuelve a renderizar con cada cambio de orden, filtro o tecla (lee la URL) y eso reanimaba el donut y las barras enteros (151 llamadas a `requestAnimationFrame` durante 1,9 s tras un cambio de orden; ahora 0). Arreglo: `Dashboard` en `memo` y datos de las gráficas con `useMemo`, con un test que falla sin `memo`. Recomendación del arquitecto para las tarjetas, aceptada por el dueño e implementada (punto siguiente): «Mostrar más» por tandas (48 y luego 96) con autocarga por IntersectionObserver limitada a 336 tarjetas, reinicio al cambiar la búsqueda, sin virtualizar (se reconsideraría por encima de ~1 500 tarjetas cargadas); descartados paginado, scroll infinito sin límite y renderizado progresivo con todo el DOM.
- **Implementación (Fase 1, paso 9, rendimiento):** 
  - *Tandas* (`use-revealed-count.ts`): primera tanda de 48 tarjetas y 96 más cada vez, con un IntersectionObserver (`rootMargin` de 800 px) que carga la siguiente al acercarse al final solo hasta 336 tarjetas; a partir de ahí, el botón «Mostrar 96 más». Vuelve a 48 al cambiar la búsqueda ya asentada (clave `state|sort|q`, sin efectos). Sin IntersectionObserver (jsdom) solo hay botón. El `role="status"` sigue diciendo «Mostrando N de M juegos» (los que cumplen el filtro), y un pie fuera de la zona viva dice «48 de 639 mostrados», para que la autocarga no anuncie nada.
  - *Biblioteca por vanity:* `GET /api/library/:input` acepta lo mismo que `/api/profile/:input`. `StoreAdapter.resolveAlias` (solo `ResolveVanityURL`) y `CachedAdapter.resolveLibrary` comparten la clave `alias:` con el perfil; en frío son 4 llamadas a Steam en vez de 3 (resolver el alias dos veces si las dos peticiones se cruzan; no se coalesce). El cliente pide perfil y biblioteca a la vez (`libraryQuery(input)` con la misma entrada) y el error del perfil manda sobre el de la biblioteca.
  - *Skeletons:* `src/components/skeleton` (`PageSkeleton`, `ChartSkeleton`) sirve a los estados de carga de `ProfilePage` y `LibrarySection` (`Pending`, con el texto de carga oculto en un `role="status"`) y a las siluetas de `LockedPanel` y `LockedChart`.
  - *Gráficas:* `useAfterPaint` (`useDeferredValue(true, false)`) monta Recharts después del primer commit, con un esqueleto del mismo tamaño; la animación dura 800 ms y empieza a la vez.
  - *Resultados (producción, headless a CPU ×6, 639 y 3 000 juegos con portadas sintéticas):* peor frame largo tras las tarjetas de 419 ms a 69 ms y de 716 ms a 78 ms; total de frames largos de 1 473 ms a 131 ms; clic en «Ordenar por» de 176 ms (retraso de entrada 153) a 16 ms (retraso 5–12); nodos DOM de ~5 450 a ~730. 
  - *Lo que sigue pendiente:* cada «Mostrar más» a CPU ×4–×6 deja el hilo ocupado 1–2 s mientras llegan las portadas (script ~40 ms; el resto es pintado/decodificación) y crece con las tarjetas ya montadas; a ×1 no hay ni un frame largo. La ráfaga de imágenes de la prueba (192 en ~1,5 s) es un caso extremo. Medir en un móvil real.
- **Alias de importación (solo en `src/`):** `@/` apunta a `src/` y `@core/` a `core/`, declarados en `tsconfig.json` (`paths`) y leídos por Vite 8 con `resolve.tsconfigPaths` (también en el proyecto `front` de Vitest). `./` se mantiene dentro de la misma carpeta; `../` ya no se usa. No valen en `api/`, `server/`, `core/` ni `scripts/`: corren en Node, que no los conoce (ahí siguen los relativos con `.js`, ver §14 0A). `core/` queda fuera de `src/`, de ahí el segundo alias.
- Router de cliente: **TanStack Router** con rutas por ficheros (`@tanstack/router-plugin/vite`, que genera `routeTree.gen.ts`). Rutas: `/` (introducir perfil), `/p/$profile` (dashboard y biblioteca, con los filtros de estado, orden y búsqueda como parámetros de búsqueda), `/demo` y `/privacy`. Alternativa descartada: React Router 8 (sin búsqueda tipada).

### Refresco y analíticas (diseño del 2026-10-08, arquitecto Opus 5.5; implementado)

- **Botón de refresco** (`RefreshControl`, en `src/features/profile-page`): en la cabecera del perfil, solo con `source.kind === 'steam'` y la biblioteca `ok`. No aparece en la demo ni en los paneles bloqueados: su *Reintentar* sigue siendo el GET (un refresco gastaría los 10 min de cooldown si el ajuste de Steam aún no ha cambiado).
- **Estados:** `idle → refreshing → coolingDown{done | cooldown | rateLimited}`, o `failed`. Se deshabilita con `aria-disabled` y una guarda en `onClick` (sigue siendo enfocable); el motivo («Disponible de nuevo en N min») va en `aria-describedby`; al refrescar el texto pasa a «Actualizando…» (no solo el color). Un `<p role="status">` siempre presente habla solo en las transiciones, nunca en cada tic; el mensaje desaparece con el cooldown que explica (el de fallo, al siguiente intento). Un reloj propio del control (`useState` + `setInterval` de 10 s, y la hora se renueva al volver el POST) alimenta la cuenta atrás y «Actualizado hace X» (`Library.fetchedAt`, con `format.relativeTime`); `useNow` de use-intl no permite renovar la hora al terminar el POST y la cuenta atrás saldría sobrada hasta 10 s. Sin spinner: el marco no se mueve.
- **Cooldown del cliente:** una pista, no la verdad (esa es el servidor). `refresh-cooldowns.ts` guarda el fin de cada cooldown por SteamID en un `Map` en memoria y, además, en `localStorage` (`hoardex:refresh-cooldowns`, un objeto `{steamId: fin en ms}`), y `useSyncExternalStore` lee el mayor de los dos. Así, tras recargar (o en otra pestaña) el botón sigue deshabilitado mientras dure el cooldown; antes parecía habilitado hasta que el POST respondía 429. Al escribir se descartan las entradas caducadas, así que no queda más que lo de los últimos 10 min; si el almacenamiento está bloqueado o ilegible vale solo el `Map`. Los GET no llevan el cooldown: seguirían siendo iguales para todos y cacheables. Un cooldown iniciado por otro visitante o dispositivo sigue sin verse hasta el 429.
- **Petición:** `useMutation` sobre `postRefresh(input)` (200, 429 y 503 como datos; el resto, `ApiError`). `onSuccess` hace `setQueryData` en `profileQuery` y `libraryQuery`.
- **Sin reanimar:** `Dashboard` pasa a recibir `games` en vez de `library`, y `LibraryView` memoiza sobre `library.games`. `fetchedAt` cambia en cada refresco, pero el *structural sharing* de Query conserva la referencia de `games` si nada cambió, y Recharts no repite la animación. Si hay cambios, `CountUp` sigue desde su valor, Recharts anima los datos nuevos y las tarjetas con `key` = appid no se vuelven a fundir (solo entran las nuevas, con opacidad). `useRevealedCount` no se reinicia (su clave es `state|sort|q`).
- **Textos** (`refresh.*`, en y es): `action`, `busy`, `updatedAgo`, `done`, `cooldown`, `availableIn`, `rateLimited`, `failed`. El botón usa `.button--secondary`, y `.button[aria-disabled='true']` lo pinta como un relleno gris con el texto apagado, sin borde visible y sin `:active`. No basta con atenuarlo (`opacity`): un botón transparente con borde fino atenuado solo se distingue del activo si se ven juntos. En `forced-colors` el texto y el borde pasan a `GrayText`.
- **Analíticas:** `@vercel/analytics` 2.0.1 fijado; `startAnalytics(router)` en `src/lib/analytics.ts`, llamado en `main.tsx` tras el render. No va en el árbol de rutas, así que `renderApp` no lo carga; sus tests usan el router real de la app con un historial en memoria; sí corre en `pnpm dev` y `vercel dev`, con `mode: import.meta.env.PROD ? 'production' : 'development'` (en desarrollo es el script de depuración de `va.vercel-scripts.com`, que escribe en consola en vez de enviar; leído en el código, sin ver en ejecución). Solo páginas vistas, **enviadas a mano** (`inject({ disableAutoTrack: true })`): con esa opción el script no envía la primera visita ni parchea `pushState`, así que no sabría la ruta de una navegación del cliente. `trackPageViews` se suscribe a `router.subscribe('onResolved')` y llama a `pageview({ route, path })` cuando cambia el **pathname** (`pathChanged`), no la query: los filtros y el buscador no cuentan. Si el router ya se había resuelto al llamar, envía la visita actual. La ruta sale del árbol de rutas (`routesById[leaf.routeId].fullPath`, con `$param` escrito como `[param]`: `/p/[profile]`, `/demo`, `/`), así que **una ruta nueva se cuenta sola sin tocar este código**; un pathname sin ruta (la raíz es la única coincidencia) se envía con `route: null`. `path` es el pathname sin query (el script además vacía la query al usar `path`) y `beforeSend` sigue quitando query y hash (el buscador pone el texto del visitante en `q`); el nombre de perfil de la ruta se conserva. `/demo` y las previews se cuentan. Sin `track()` ni eventos propios. El panel *Routes* de Vercel salía vacío porque `inject()` en un SPA no envía `route` (solo las integraciones de frameworks lo calculan con `computeRoute`); leído en el script de producción el 2026-10-09 (el campo viaja como `dp`), **verificado en producción por el dueño el 2026-10-09:** *Routes* lista las rutas. **Ruta del script:** `inject()` recibe como segundo argumento `import.meta.env.VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG`, el JSON que Vercel inyecta en el build con una ruta única por proyecto para `script.js` y `view` (así lo usa `<Analytics />` en Next.js, con `NEXT_PUBLIC_*`). Sin esa configuración (en local) el script va a `/_vercel/insights/script.js`, que un bloqueador de contenido filtra por URL (comprobado 2026-10-08: la petición falla en el navegador del dueño y no se registra ninguna visita suya). Verificado 2026-10-08: el build de Vercel para Vite recibe la variable (el bundle desplegado lleva la configuración con la ruta única) y una visita con el bloqueador activo se cuenta. Descartado: `<Analytics />` de `@vercel/analytics/react` (el mismo `inject()` en un `useEffect`, que lee `REACT_APP_*`, variables que Vite no expone).

### Animación y gráficas

| Pieza | Elección | Reglas |
|---|---|---|
| Contadores; en la fase 2, layout y exit | **Motion**: hoy solo `animate()` en `CountUp` (~20 KB gzip). `LazyMotion` + `domAnimation` con el primer `m.*`; `domMax` solo si algo usa `layout` | `layout` no funciona en SVG. No combinar `layout` con `animate`/`whileHover` en el mismo cambio |
| Stagger en cuadrícula, entradas por scroll | **GSAP** (gratis) con `useGSAP`, `grid` stagger e **IntersectionObserver** (no `ScrollTrigger.batch`, ver «Coreografía de movimiento») | Nunca sobre el mismo elemento ni la misma propiedad que Motion. Nunca sobre nodos que desmonta `AnimatePresence`. Nunca dentro del SVG de Recharts |
| Entradas de página, barras del top, portadas, pulsación | **CSS** (`@keyframes`, `@starting-style`, `transition`) | Sin JS, así que la pantalla de entrada no carga ni Motion ni GSAP |
| Barras, líneas, donut, radial | **Recharts 3** | Usar `animationMatchBy` para actualizaciones en vivo |
| Heatmap de actividad, rareza | **SVG a mano** (d3-scale + Motion) | Recharts no trae heatmap |
| Cambio de vista | View Transitions / `<ViewTransition>` de React 19.3 | No para animar 300 elementos |
| Cuadrícula de 300 portadas | `content-visibility: auto` + carga diferida de imágenes | Sin virtualización; virtualizar solo una tabla > 1000 filas |
| Smooth scroll | **Lenis fuera del shell** | Solo en una intro si acaso |

- **`prefers-reduced-motion`:** `MotionConfig reducedMotion="user"` y `gsap.matchMedia`.
- **Accesibilidad:** Recharts trae `accessibilityLayer`; los gráficos propios llevan alternativa en tabla o texto.
- **Rendimiento:** animar solo `transform` y `opacity`. **No hay benchmarks públicos de 300 elementos** con Motion ni GSAP Flip, así que se mide con un spike propio (§14).
- **Alternativa "espectacular" (no ahora):** ECharts 6 en canvas (`universalTransition`, `realtimeSort`, calendar heatmap) a cambio de ~150 KB y de no poder orquestar el interior con GSAP.

#### Coreografía de movimiento (diseño del 2026-10-08, arquitecto Opus 5.5)

- **Personalidad: «un contador que cuadra las cuentas».** Preciso, rápido, sin rebote (nada de `back`/`elastic`, ni parallax). Se mueven los datos; el contenido entra una sola vez; las respuestas a una acción son breves; **el marco nunca se mueve** (cabecera, pie, selector de idioma, foco, mensajes de estado).
- **Momento firma, «la cuenta»:** al llegar la biblioteca los cuatro KPI y el total del donut cuentan desde 0, el donut barre y las barras del top se llenan. Arrancan en cascada (60 ms entre bloques, la cifra 80 ms después de que su panel empiece a aparecer) y cada una dura 900 ms. En la fase 2 cada lote de logros repite la cuenta desde el valor anterior (500 ms, §9.7). Fuera de ahí, el movimiento es contenido a propósito: una secuencia de entrada, no un efecto por sección.
- **Tokens** (`--motion-*` y `--ease-*` en `_tokens.scss`, espejo en `src/lib/motion/tokens.ts`): `quick` 120 ms (pulsar), `swift` 200 ms (fundido de portada y de lista), `reveal` 450 ms (bloques y tarjetas), `build` 900 ms (contadores, Recharts, barras); en la fase 2 se añadirá `batch` (500 ms); `settle` = `cubic-bezier(0.25, 1, 0.5, 1)` (`power3.out` en GSAP) para entradas y datos, `standard` = `cubic-bezier(0.2, 0, 0, 1)` para cambios de estado; desplazamiento de entrada de los bloques 12 px (solo `transform` de CSS, que va por el compositor), escalonado 60 ms entre bloques y 35 ms entre tarjetas (tope total 0,3 s). **`CustomEase` descartado:** no se distingue de `power3.out`.
- **Dueño por elemento (nada tiene dos):** GSAP solo toca `li.game-card` y `ul.library-view__grid`; Motion solo el texto de los contadores (`animate()`; en la fase 2 `m.*` dentro de `AnimatePresence`); el CSS anima los descendientes (`.cover`, barras, paneles); Recharts su SVG. El hover y la pulsación van siempre en un hijo, nunca en el `li` que mueve GSAP.
- **Reparto:**

| Pieza | Motor | Detalle |
|---|---|---|
| Entrada de ruta, cabecera de perfil, KPI, paneles | CSS | `@keyframes rise-in` (opacidad + 12 px) con `--i` para el escalonado; solo dentro de `prefers-reduced-motion: no-preference`; el skeleton desaparece en seco y el contenido entra (mismo tamaño: se lee como fundido cruzado) |
| Cifras de los KPI y total del donut | Motion (`animate` numérico) | `CountUp`: el texto final está siempre en el DOM para el lector de pantalla y la copia que cuenta va en `aria-hidden`; no re-cuenta si el valor no cambia (de ahí el `memo` de `Dashboard`) |
| Donut y barras por año | Recharts | `useChartMotion`: 900 ms y `cubic-bezier(0.25,1,0.5,1)`; `animationMatchBy` en la fase 2 |
| Barras del top | CSS `@starting-style` | `transition: transform` con `--i`; en la fase 2 cambiar `--share` vuelve a transicionar solo |
| Cuadrícula (primera tanda y siguientes) | GSAP + IntersectionObserver | Solo las tarjetas **nuevas** de cada tanda se ocultan antes de pintar y se funden **en ola diagonal** al entrar en pantalla (`useGridReveal`); las ya montadas no se tocan. **Solo opacidad:** cualquier desplazamiento (`y` con o sin 3D, de 6 o 16 px) añadió ~300 ms de frames largos a CPU ×6 y la opacidad sola costó lo mismo que no animar. La ola sale de los rectángulos que ya entrega el observer, no de `stagger.grid`, que lee el layout de todas las tarjetas en cada tanda. IO (una API nativa del navegador, compatible en todos; la decisión es no usar el plugin `ScrollTrigger` de GSAP, **aceptada por el dueño el 2026-10-09**) en lugar de `ScrollTrigger.batch`: entrega en una llamada las entradas del mismo frame, no necesita `refresh()` con cada tanda, convive con `content-visibility`, el repo ya lo usa y ahorra ~12 KB gzip |
| Filtro y orden | GSAP sobre el `<ul>` | Un fundido corto de la lista (0,55 → 1; un tween, igual con 48 que con 3 000 tarjetas), solo al cambiar el estado o el orden, no en cada tecla del buscador. **`Flip`/`layout` sobre cientos de tarjetas descartado:** `getState` lee el rect de hasta 336 nodos y los que salen exigen posicionado absoluto |
| Portada (relleno → imagen), chips, botones | CSS | `data-loaded` en el `<img>` al cargar (sin re-render); `:active` con `scale`; el chip seleccionado funde un `::before` |
| Pantalla de entrada (`src/features/home`) | CSS | Hero con `rise-in` escalonado y una vista previa decorativa del panel (`aria-hidden`, cifras inventadas) que repite «la cuenta» en miniatura: contadores con `@property --n` (entero registrado) y `counter()`, barrido del donut con `stroke-dashoffset`, barras con `scaleY` y portadas con opacidad. Las tarjetas de «Qué hace» suben con `animation-timeline: view()` donde existe y, si no, tras el hero. Sin Motion ni GSAP (2026-10-09) |
| Tarjetas | nada | No son interactivas; elevarlas al pasar el ratón promete un clic que no existe |

- **Movimiento reducido y pruebas:** `MotionConfig reducedMotion="user"` solo cubre los `m.*`; `animate()` no lo respeta, así que `CountUp` comprueba `useReducedMotion` por su cuenta. Hoy no hay `LazyMotion` ni `MotionConfig` porque nada usa `m.*`: se montan (con `domAnimation`) con el primer componente `m`. jsdom no tiene `window.matchMedia` y `gsap.matchMedia()` lo llama sin comprobar: `src/lib/test/setup.ts` lo define en modo reducido (los tests ven el estado final).
- **Si el hilo está saturado:** `isBusy()` (un frame largo de más de 100 ms en el último 1,5 s, vía Long Animation Frames, solo Chromium) hace que revelados y fundidos de portada sean instantáneos. Recortes por orden si la medición del spike 0C no pasa: tandas posteriores a la primera solo con opacidad; stagger solo en la primera tanda; portadas sin fundido; sin revelado de la rejilla con `hardwareConcurrency <= 4`; al final, solo «la cuenta».
- **Carga:** las queries arrancan en `ProfilePage`, así que todo lo que pese en el chunk de esa ruta retrasa los datos. `Dashboard` y `LibraryView` (con Recharts, Motion y GSAP) van en un chunk diferido (`profile-content`) que `useProfileContent` empieza a pedir en cuanto se evalúa el chunk de la ruta. **No `React.lazy`:** su primer render suspende aunque el módulo ya esté cargado y React retiene el contenido 300 ms tras mostrar un fallback (medido: los KPI salían 300 ms tarde). Los módulos que importa una ruta fuera de su `component` (p. ej. `parseLibrarySearch` en `validateSearch`) se importan desde su fichero, no desde el índice de la feature: el índice arrastraba la vista entera, GSAP incluido, al chunk principal.
- **Resultados (2026-10-08; Chromium 152 headless por CDP, build de producción, biblioteca sintética de 639 juegos con portadas de relleno, sin GPU; móvil real sin medir):** ruta `profile-page` 111 KB → 5 KB gzip, principal 91 → 95 KB, contenido diferido 156 KB (Recharts, Motion `animate` ~20 KB, GSAP ~29 KB; +50 KB gzip en total). **Medido de nuevo el 2026-10-09** con alias a módulos vacíos: el contenido diferido pasa de 156,1 KB gzip a 128,1 sin GSAP (GSAP = 28,0 KB), 137,1 sin Motion (Motion = 19,0 KB) y 108,9 sin ninguno (47,2 KB); el chunk principal no cambia (99,0 KB). La primera petición a la API sale ~110 ms antes y los KPI aparecen antes que en la versión anterior (Fast 4G emulada, 390 px: 639 frente a 730 ms a ×1 y 773 frente a 886 ms a ×4). Entrada de la rejilla a ×6 (mediana de 3, LoAF total / p95 de frame): base 252 ms / 17 ms; fundido con desplazamiento 570–681 ms / 67–83 ms; **solo fundido 300 ms / 33 ms**; sin animar la rejilla 307 ms / 17 ms. Bajar por 240 tarjetas: a ×1 ningún frame largo (igual que la base); a ×4 LoAF total 307 ms frente a 145 ms y p95 de frame 50 frente a 17 ms (peor frame 77 ms en ambos). Con movimiento reducido ninguna opacidad baja de 1 y los contadores muestran el texto plano.

### Iconos
El cofre es `public/favicon.svg` (con baldosa) y `public/logo.svg` (la marca de la cabecera, sin baldosa), con el mismo dibujo. `public/favicon.ico` y `public/apple-touch-icon.png` se generan del SVG con `rsvg-convert` (soporta `<mask>`) e ImageMagick; hay que rehacerlos si cambia el dibujo:

```
sed 's/rx="7"/rx="0"/' public/favicon.svg > square.svg   # iOS pone sus esquinas; las transparentes saldrían negras
rsvg-convert -w 180 -h 180 square.svg -o public/apple-touch-icon.png
for n in 16 32 48; do rsvg-convert -w $n -h $n public/favicon.svg -o $n.png; done
magick 16.png 32.png 48.png public/favicon.ico
```

`index.html` enlaza el `.ico` (`sizes="32x32"`: para Safari y otros navegadores sin favicon SVG, y para quien pide `/favicon.ico`), el SVG y el `apple-touch-icon`. Los renders salen siempre en el tema claro (`rsvg` ignora `prefers-color-scheme`): baldosa azul y cofre blanco, que se ve bien en ambos. A 16 px las bandas finas se difuminan (miden 0,6 px); el SVG no tiene ese problema. Un test comprueba que los ficheros existen, el tamaño del PNG y los fotogramas del `.ico`, no que sigan al día respecto al SVG.

### Estilos
SCSS + variables CSS (tema claro/oscuro), BEM y stylelint con la configuración que ya usas en `dev-portfolio` y `spa-anicalendar`. Sin Tailwind.

### i18n
UI en `en` (por defecto) y `es` con `use-intl` (`IntlProvider` + mensajes en `src/assets/locales/{en,es}.json`, como en `spa-anicalendar`). El idioma sale de la preferencia guardada, luego de `navigator.language` y por defecto `en`; **no va en la URL**: el routing por prefijo es de `next-intl`, no de `use-intl`. Las claves se tipan declarando `Messages` y `useFormatter` da números, fechas, tiempos relativos y precios. **Verificado** (fase 1, paso 4): `use-intl` funciona sin Next en el SPA de Vite; las claves están tipadas (`tsc` rechaza una clave inexistente) y `Record<AppLocale, typeof en>` hace fallar el build si `es` pierde o sobra una clave. El selector de idioma guarda la preferencia en `localStorage` (con `try/catch`) y actualiza `<html lang>`.

El idioma de la UI se traduce al parámetro `l=` de Steam (`english`, `spanish`). El país para precios (`cc`) se deriva del idioma con selector manual; entra en la clave de caché de ítems.

## 11. Seguridad

- **API key:** solo en variables de entorno de Vercel (marcada como sensible) y nunca en el cliente. En local, `vercel env pull`. Ni `.env*` ni la colección de Postman entran al repo.
- **Sin proxy genérico:** lista cerrada de hosts (`api.steampowered.com`, `store.steampowered.com`, `steamcommunity.com` solo para OpenID) y de métodos. Los parámetros se construyen en el servidor; no se reenvía nada del usuario tal cual. Esto elimina el riesgo de SSRF.
- **Validación de entrada:**
  - SteamID64: `^765611\d{11}$`.
  - Vanity: `^[A-Za-z0-9_-]{2,32}$`. Se acepta desde 2 por prudencia: si Steam exigiera 3, un nombre de 2 caracteres solo cuesta una consulta que responde *no encontrado* (se cachea 5 min), mientras que exigir 3 sin saberlo rechazaría perfiles reales. No hay nada más que verificar.
  - También aceptar SteamID2/ID3 convertidos con `BigInt` (`[U:1:N]` → `76561197960265728n + N`).
  - Extraer el identificador de URLs `/id/<vanity>` y `/profiles/<id64>`.
- **Rate limiting propio:**
  - WAF de Vercel por IP (en Hobby solo hay **1 regla de rate limit por proyecto** según la investigación del 2026-10-07; la doc consultada el 2026-10-09 no da el límite por plan), contadores por región. Debe cubrir todo `/api/` (GET y POST) y dejar pasar una carga completa (fase 1: 2 llamadas; fase 2: ~10 más por los lotes de logros). Es la única defensa real contra un script: corta **antes** de ejecutar la función, que es lo que gasta invocaciones de Vercel, comandos de Redis y llamadas a Steam.
  - **Aplicada el 2026-10-09** («Throttle API per IP»): `path` empieza por `/api`, clave `ip`, `fixed_window` de 60 s con 60 peticiones, acción `rate_limit` (429). **Vive en la configuración del proyecto de Vercel, no en el repo**: si se recrea el proyecto hay que recrearla (`vercel firewall rules add "Throttle API per IP" --action rate_limit --rate-limit-window 60 --rate-limit-requests 60 --condition '{"type":"path","op":"pre","value":"/api"}'`, y `vercel firewall publish`: los cambios quedan en borrador hasta publicar). Los valores son iniciales: una IP compartida (oficina, operadora) suma varios visitantes, y en la fase 2 una carga con una biblioteca grande puede llegar a ~27 llamadas (2 más los lotes de 12), así que habrá que revisarlos.
  - **Comprobada en producción:** una ráfaga de 75 `GET /api/health` dio 60 respuestas 200 y 15 respuestas 429; el HTML no se ve afectado y a los 70 s volvía a dar 200. El 429 del firewall es **texto plano y sin `Retry-After`** (`x-vercel-mitigated: deny`), no el JSON de §8, así que el cliente lo reconoce como un 429 sin datos (nuestra API solo responde 429 al POST de refrescar, y con JSON): `Problem` muestra «Demasiadas peticiones, espera un minuto» (`tooManyRequests`) y el botón de refrescar su aviso, sin iniciar cooldown.
  - Contador diario en Redis como **presupuesto global de Steam** (techo blando, p. ej. 80 k). Al superarlo se sirve solo caché y se avisa en la UI.
- **429 de Steam:** concurrencia limitada, backoff con jitter, sin caché negativa hasta observarlo (§8), y estado `rateLimited` visible.
- **Cabeceras:** CORS mismo origen (el front y la API comparten dominio), `Content-Security-Policy` restrictiva, sin cookies en `/api` públicas (así el CDN puede cachear).
- **Refresco:** cualquier visitante puede refrescar cualquier perfil, como mucho una vez cada 10 min por perfil y entorno; el techo global sigue siendo el presupuesto diario. Un script que recorra ids (enumerables) gasta Steam igual que hoy con GET en frío, y un query string aleatorio salta el CDN y gasta Redis (ya ocurre hoy): de ahí la regla de WAF sobre `/api/`.
- **CSP y analíticas:** el script es `/<ruta única>/script.js` si el build trae la configuración (si no, `/_vercel/insights/script.js`) y envía a `<ruta>/view` (mismo origen), así que basta `script-src 'self'` y `connect-src 'self'` (`inject()` crea un `<script src>`, sin script en línea). Leído en el código de `@vercel/analytics` 2.0.1; la ruta única está verificada desplegada (2026-10-08).
- **CSP (aplicada el 2026-10-09):** va en `vercel.json` (`headers`, para toda ruta), porque el HTML es estático y no pasa por Hono. `tests/security-headers.test.ts` comprueba que cubre los hosts de portadas y avatares y que no admite código en línea. `default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' https://cdn.cloudflare.steamstatic.com https://avatars.steamstatic.com; style-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`.
  - **Hosts:** las portadas salen de `cdn.cloudflare.steamstatic.com` y el avatar de `avatars.steamstatic.com` (**verificado el 2026-10-09** pidiendo a producción un perfil público conocido). `avatarUrl` llega tal cual de Steam, así que si Steam cambiara de host el avatar dejaría de verse. `media.steampowered.com` (icono del juego) no se usa en la UI.
  - **Sin `'unsafe-inline'`:** el `index.html` construido no lleva scripts ni estilos en línea (comprobado en `dist/`), el CSS no usa `data:`, `url()` ni fuentes externas, y el análisis va por mismo origen. Los `style={…}` de React, Motion, GSAP y Recharts se aplican desde JS (CSSOM), que `style-src` no bloquea (la página sale con todos sus estilos).
  - **Comprobación (preview y Chrome, 2026-10-09):** se fue directo a la cabecera real, sin el modo solo-aviso, porque la señal que se mira (el evento `securitypolicyviolation`) es la misma al bloquear y al avisar. Recorrí `/`, `/demo` (filtros, «Mostrar más», enlaces) y `/privacy`, y `/p/<perfil público>` con su avatar de `avatars.steamstatic.com`: ningún evento y ninguna imagen rota; una imagen de prueba de otro host sí disparó el evento. **Límites:** el detector se engancha tras la carga (la consola de la herramienta no muestra los avisos de CSP), así que una violación solo en la carga inicial no se habría visto, y no se vieron portadas de una biblioteca pública real (su host sale de la misma constante que usa el test). **Solo en previews:** la barra de comentarios de Vercel (`vercel.live`) queda bloqueada por `script-src 'self'`; no existe en producción.
- **Login con Steam (fase 4):** OpenID 2.0, sin OAuth/OIDC. Verificar con `check_authentication` por `fetch` directo (~40 líneas), más comprobar `mode=id_res`, `op_endpoint`, `return_to` propio, regex del `claimed_id` y frescura del nonce. Sesión sin BD: cookie HttpOnly, Secure, SameSite=Lax con JWT HS256 (`hono/jwt`, ya incluido en Hono; `jose` no hace falta). Solo se obtiene el SteamID64. Diseño completo en §19.
- **Logs:** nunca registrar la key ni cabeceras completas.

## 12. Términos de Steam y privacidad

- **Riesgo principal:** los términos dicen que solo se recuperan datos de un usuario "as requested by the end user" (steamcommunity.com/dev/apiterms, versión de 2010). Consultar perfiles de terceros **no queda amparado expresamente**, y Valve puede revocar la key "at any time for any reason, without notice" (§11). Que Valve lo tolere de hecho es una suposición.
- **Mitigaciones:**
  1. Texto de la UI que pide el perfil **propio** (hecho: etiqueta «Tu perfil de Steam» y aviso «Introduce tu propio perfil»).
  2. Cachés cortas para datos por usuario; sin historial propio salvo opt-in. Las analíticas de Vercel registran la ruta visitada (nombre de perfil incluido, **sin query string**: se quita antes de enviar), sin cookies y con un hash diario del visitante; la ventana de informes en Hobby es de 1 mes y solo la ve el dueño. El cooldown `refresh:` guarda el SteamID y una marca de tiempo durante 10 min; el navegador guarda lo mismo de los perfiles que ese visitante ha refrescado (`localStorage`, solo en su dispositivo; las entradas caducadas se ignoran y se borran en el siguiente refresco). Todo se declara en la política de privacidad, ya hecha: ruta `/privacy` (`src/features/policy-page`, textos `policy` en en/es; contacto por correo con etiqueta oculta, solo en `mail-link.tsx`). Los plazos salen de `CACHE_TTL` (`core/cache/ttl.ts`, sin dependencias para que el front no cargue Zod), así que cambiar un TTL no obliga a tocar el texto; lo que sí hay que revisar a mano cuando cambie es qué se guarda, los terceros (Vercel, Upstash en AWS us-east-1, CDN de Steam) y las analíticas.
  3. Login con Steam como vía limpia, en cuanto exista (fase 4).
  4. **Modo demo con datos sintéticos:** la demo del portfolio sigue funcionando aunque la key se pierda (hecho, §10).
  5. Plan de contingencia: la capa Steam está aislada en el adapter.
- **Riesgo conocido (2026-10-07):** la key actúa como su dueño. Para las cuentas que son amigas de esa cuenta, Steam responde con datos de «solo amigos» (visto con un perfil ajeno cuyos detalles de juego son solo para amigos) y la app los enseña a cualquier visitante. **Aceptado por el dueño (2026-10-09):** no se avisa al visitante. La diferencia con una cuenta que no es amiga se vio una sola vez por caso (§5.4) y podría ser casualidad; se confirmaría con otra cuenta. Si se reabre: avisar al visitante cuando `communityvisibilitystate` no sea 3.
- **Obligaciones:** política de privacidad (qué datos, dónde se guardan, cuánto tiempo), atribución a Valve, no parecer oficial, borrar copias cuando corresponda. No existe el literal "Powered by Steam": el pie debe incluir el aviso de marcas de Valve y un descargo de no afiliación. **Texto comprobado el 2026-10-07** en `partner.steamgames.com/doc/marketing/branding` (público, sin login; leído mediante un resumen automático, así que conviene un vistazo humano): «©{año} Valve Corporation. Steam and the Steam logo are trademarks and/or registered trademarks of Valve Corporation in the U.S. and/or other countries.» Se mantiene en inglés en los dos idiomas (texto legal); el descargo de no afiliación sí se traduce.
- **Uso no comercial:** requisito de Vercel Hobby (§1).

## 13. Testing y fixtures

- **Fuente:** la colección de Postman `v2Steam Web API.postman_collection.json` (no entra al repo). Cada ejemplo está en `item[].response[].body`. **Cuidado:** cada respuesta incluye `originalRequest`, que puede llevar la API key; el extractor solo lee `code` y `body`.
- **Script de extracción** (Node sin dependencias): recorre `item[]`, parsea cada `body` (tolerando vacíos o no JSON) y escribe `fixtures/<carpeta>-<nombre>.<código>.json` con claves ordenadas para diffs limpios.
- **Anonimizado:** sustituir con un **mapa de IDs ficticios consistentes**, no con hashes (los SteamID son enumerables y un hash sin sal se revierte). Tocar `steamid`, `personaname`, `realname`, avatares, `profileurl`, `primaryclanid`.
- **Datos de biblioteca:** la lista de juegos y horas sigue siendo tuya. Los fixtures **completos van fuera del repo (gitignored)**; en el repo, solo **recortes o conjuntos sintéticos**. Las fixtures de 1 MB (wishlist) se cargan de forma perezosa.
- **Test anti-fuga** (`tests/privacy-leak.test.ts`): recorre `git ls-files --cached --others --exclude-standard` (docs incluidos; nada está exento) y falla si hay un SteamID64 fuera de la ventana ficticia (`76561198000000000` + 10 000) o de una lista pública corta, si aparece algún término de `fixtures/full/private-terms.json` (steamid, realname, personaname, vanity, hash de avatar; se crea con `node scripts/init-private-terms.ts` y se omite si falta, p. ej. en CI), o si aparece la `STEAM_API_KEY` de `.env.local`. Única excepción: `mail-link.tsx` (la dirección de contacto publicada a propósito) queda exenta del chequeo de términos, no del de SteamID. Los fallos nombran el fichero y el tipo de fuga, nunca el valor.
- **Fixtures públicas** (`fixtures/steam/<Endpoint>.<caso>.json`, forma `{ status, eresult, body }`): sintéticas, con la forma real de Steam y todos los casos de §7 (0 min, 59/60 min, 10/120/400 días, `has_community_visible_stats` ausente, desgloses que no suman). `GetPlayerSummaries.friends/.private` son **inferidas**, no observadas. `GetOwnedGames.private` reproduce lo observado en una cuenta ajena de solo amigos (200, `x-eresult: 15`, `{"response":{}}`). `ResolveVanityURL.notFound` y `GetPlayerSummaries.empty` coinciden con la respuesta real (verificado).
- **Contrato:** cada fixture debe parsear con su schema Zod, y el normalizador debe producir el dominio esperado.
- **Unitarios:** clasificación de backlog (todas las ramas de §7), validación de entrada, huellas de caché.
- **Adapter de Steam:** recibe `fetch` por inyección, así que sus tests usan un `fetch` falso sin MSW. Los tests del front usan un `fetch` falso (`stubApi`). **MSW queda descartado** (decisión del 2026-10-07): el modo demo no necesita interceptar nada en el navegador.
- **Herramientas:** Vitest, Testing Library y jsdom, como en `spa-anicalendar`.

## 14. Roadmap y spike

### Fase 0 — Spike (primero, antes de crear nada más)

Tiene una **puerta de decisión**: si el despliegue de B da guerra más de ~2 horas, se pasa al Plan B (Next 16 fino) y `core/` no cambia. **Puerta superada el 2026-10-07** (resultados de 0A): el Plan B no hace falta.

**0A. Despliegue**
1. Vite 8 + React + Hono (`@hono/vercel`) en **un único proyecto** de Vercel.
2. Rutas `GET /api/health` y `GET /api/resolve/:vanity` (usa la key desde env).
3. Comprobar en un preview que `s-maxage` produce `x-vercel-cache: HIT`.
4. `vercel dev` en local con el mismo comportamiento.
5. Upstash Redis desde el Marketplace: ping, `SET`/`GET`, contar comandos, y tamaño máximo de valor.

**Resultados de 0A (2026-10-07, verificados con previews reales)**
- **Un solo proyecto Vite + Hono funciona en Vercel Hobby.** Los puntos 1 a 4 están cerrados. El 5 (Upstash) está cerrado salvo el recuento de comandos contra el panel de uso.
- **`/api/resolve/gabelogannewell` con la key real** devuelve `{"response":{"steamid":"76561197960287930","success":1}}` en preview y en `vercel dev`. `ResolveVanityURL` no envía `x-eresult`.
- **`s-maxage` produce `x-vercel-cache: HIT`** en la segunda petición a `/api/health` (MISS → HIT → HIT). Vercel quita `s-maxage` de la cabecera que ve el cliente (queda `public`). Las respuestas 4xx/5xx sin `Cache-Control` explícito no se cachean.
- **`vercel dev` reproduce el enrutado y las cabeceras** del preview; arranca Vite como dev command.
- **Preset de framework:** Vercel detecta `hono` en `dependencies` y asigna el preset de backend Hono, que falla con `No entrypoint found`. Solución: `"framework": "vite"` en `vercel.json`.
- **`api/[[...route]].ts` no sirve fuera de Next.js:** ni `[[...route]]` ni `[...route]` enrutan más de un segmento (`/api/a/b` da 404 de la plataforma, `x-vercel-error: NOT_FOUND`). Solución: `api/index.ts` + `rewrites: [{ "source": "/api/:path*", "destination": "/api" }]`. Hono recibe la ruta original, así que `basePath('/api')` sigue valiendo.
- **Imports relativos con extensión `.js`:** con `"type": "module"` Vercel compila `api/index.ts` a ESM y Node exige extensión. `import … from '../core/cache/redis'` dio `ERR_MODULE_NOT_FOUND` (`FUNCTION_INVOCATION_FAILED`, también en rutas que no usaban Redis); `'../core/cache/redis.js'` funciona en preview, en `vercel dev`, con `tsc` y con Vite. Vale para todo import relativo dentro de `api/` y `core/`.
- **Upstash (verificado en preview desde `iad1` y en local):** `ping`, `SET`/`GET` con JSON, `HSET` con varios campos y `HGETALL` funcionan. Latencia desde la función: 5–60 ms por comando; desde España, ~110 ms. **Tamaño de valor:** un `SET` de 5 MB y un `HSET` de ~4,9 MB en un comando funcionaron sin error en el plan free (no se probó más arriba); nuestros valores serán de decenas de KB. Un `HSET` con varios campos es **una sola petición**; se comprobó después que cuenta como una escritura (§8).
- **Claves con prefijo de entorno** (`production:`, `preview:`, `development:`, de `VERCEL_ENV`): el plan free solo da una base y todos los entornos la comparten. Las rutas `/api/spike/*` devuelven 404 en producción.
- Los previews llevan Vercel Authentication; para probarlos con `curl` se usa `vercel curl <ruta> --deployment <url>`.
- Una variable creada solo para *Production* no llega a los previews (verificado: el preview daba "STEAM_API_KEY is not set"). Hay que añadirla también a *Preview*. Para local, `vercel env pull` solo trae las variables asignadas a *Development*: con la key solo en Production trajo únicamente `VERCEL_OIDC_TOKEN`; al asignarla también a Development, trajo `STEAM_API_KEY` con su valor (tipo "Secret" en `vercel env ls`; no está claro si eso equivale a la marca "sensitive").
- Las integraciones del Marketplace (Upstash) se conectan por entorno; si se omite *Development*, `.env.local` no recibe sus variables.

**0B. Steam con la key real**
6. Poner tu propio perfil en privado, solo amigos y con "game details" privado, y registrar HTTP, cuerpo y `x-eresult` de `GetPlayerSummaries`, `GetOwnedGames`, `GetPlayerAchievements`, `GetWishlist` y `GetWishlistItemCount` (cierra la tabla de §5.4).
7. Códigos reales de un juego sin logros y de uno poseído pero nunca lanzado.
8. `GetItems`: tamaño máximo de lote que funciona, campos necesarios y precio por `cc`.
9. Comportamiento del 429 con key.

**Resultados de 0B (2026-10-07, cuenta del dueño de la key, `scripts/spike-steam.ts`)**
- **Línea base con perfil público** (tabla de §5.4): todos los endpoints responden 200 con la forma esperada, salvo `GetPlayerAchievements` de juegos sin stats (400). Falta repetirlo con el perfil en privado (punto 6).
- **Punto 7:** un juego con stats y 0 minutos devuelve 200 con los logros; uno sin stats devuelve 400 tenga horas o no. El 500 de las fuentes secundarias no existe en estos casos. Consecuencia: el candidato a logros puede ser `has_community_visible_stats` presente aunque `playtime_forever` sea 0, pero seguimos excluyendo los de 0 min por coste.
- **Punto 6, parcial (perfil público + "game details" privado):** `communityvisibilitystate` sigue en 3 y los logros dan **403 `Profile is not public`**. `GetOwnedGames`, `GetWishlist` y `GetWishlistItemCount` devuelven todo igual que en público: la key no permite probar la privacidad de su propia cuenta. **Esto limita el spike:** `libraryPrivate` y `wishlistPrivate` no se pueden validar con la cuenta del dueño de la key; hace falta otra cuenta privada (propia o de alguien que preste su SteamID64). Mientras tanto, esos dos casos se implementan según la tabla secundaria de §5.4 y quedan marcados sin verificar.
- **Punto 6, con "Mi perfil" en privado (cuenta del dueño de la key):** la página de la comunidad ya lo veía privado (`privacyState: private`, `visibilityState: 1` en `steamcommunity.com/id/<vanity>/?xml=1`, y "This profile is private" en el HTML), pero la Web API con la key siguió devolviendo `communityvisibilitystate: 3`, la biblioteca (334 juegos) y la wishlist (94) completas, sin cabeceras de caché; un parámetro para saltarse la caché y `GetPlayerSummaries` v1 dieron lo mismo. Los logros siguieron en 403 `Profile is not public`, y los juegos sin stats en 400 (esa comprobación va antes que la de privacidad). Sin resolver si es un estado atrasado en el servidor o que la key ve su propia cuenta; se recomprueba pasados unos minutos.
- **Punto 8, `GetItems`:** 50–250 ids funcionan; 275 da **414** y 300 da 400, porque el límite es la longitud de la URL (~8 KB). Tamaño de respuesta: 80 KB por 100 ítems sin `data_request`, 120 KB con `include_basic_info`, 177 KB añadiendo `include_assets`. El precio cambia por país (`US $1.99` / `ES 1,95€` para el mismo appid), así que `cc` va en la clave de caché.
- **Punto 9, 429 con key:** **no se reprodujo.** 100 peticiones en serie (~15/s) y 200 con 8 en vuelo (~137/s) a `GetPlayerAchievements`, todas 200. El 429 de §5.3 (con `x-eresult: 84`) viene de endpoints sin key; si aparece con key, se vigila en producción.

**0C. Animación (puede aplazarse a la fase 1)**
10. 300 portadas + 3 gráficas con datos entrando por lotes; medir fps en un móvil modesto con Motion y GSAP.

**Resultados de 0C (2026-10-08, parcial):** hecho en Chromium headless con CPU ×1, ×4 y ×6 y sin GPU (cifras en §10, «Coreografía de movimiento»). A ×1 no hay frames largos y a ×4 el peor frame no empeora (77 ms); a ×6 la entrada de la rejilla cuesta lo mismo que no animarla siempre que sea solo opacidad. **Móvil real (2026-10-09):** el dueño lo probó en un vivo X300 Pro (gama alta, con GPU) y las animaciones (la cuenta, el donut y el fundido de tarjetas) van fluidas. **Sigue sin probarse un móvil modesto**, que es donde se notaría (el dueño lo hará con «Mostrar más», `TODO.md`). Si allí se nota, los recortes por orden son: tandas posteriores a la primera sin fundido, ola solo en la primera tanda, portadas sin fundido, nada de rejilla con `hardwareConcurrency <= 4`; al final queda solo «la cuenta».

### Fases del producto

**Estado de la fase 1 (actualizado el 2026-10-09).** Hecho: `core` (dominio, adapter, backlog, caché, stats, browse), API con Redis y presupuesto (verificada desplegada), refresco manual con cooldown (el refresco en producción sigue por comprobar) y analíticas (Web Analytics activo; el dueño ve en el panel las visitas de `/demo`), esqueleto del front (router, i18n, Query, entrada), dashboard base (KPIs, estados, top, horas por año), animación de carga (la cuenta, el donut, el fundido de tarjetas), aviso de marcas de Valve, política de privacidad (`/privacy`), modo demo en el servidor, vista de biblioteca, paneles bloqueados por privacidad, favicon y logo (con `.ico` y `apple-touch-icon`), CSP y regla de rate limit del WAF, y el mensaje de «demasiadas peticiones». **Pendiente:** la lista viva está en `TODO.md`; se borra de allí cada punto al completarlo. Decisión sobre analíticas (2026-10-07, matizada el 2026-10-08): se registra la ruta, incluido el nombre de perfil de `/p/{vanity}`, sin la query string (`beforeSend`), y se declara en la política de privacidad.

| Fase | Contenido |
|---|---|
| 1 | Perfil → biblioteca, horas, estados de backlog (excepto Completado), gráficas, caché, i18n base, modo demo con fixtures |
| 2 | Logros progresivos, rareza, estado *Completado* |
| 3 | Wishlist (`GetWishlist` + `GetItems`) y valor sin jugar |
| 4 | Login con Steam, Neon, backlog editable y snapshots opt-in (diseño en §19) |
| 5 | Otros adapters. RetroAchievements primero (API pública); GOG, Epic, PSN y Xbox son frágiles |

## 15. Riesgos

| Riesgo | Mitigación |
|---|---|
| Revocación de la key por los términos de Steam | Modo demo con fixtures; capa Steam aislada; login propio en fase 4 (§12) |
| Superar cuotas de Hobby (1 M invocaciones/mes, 4 h de CPU activa) → **bloqueo de 30 días, no cobro** | Cachés largas, rate limiting, presupuesto en Redis, vigilar el panel de uso |
| Redis free (500 k comandos/mes) | Hash por usuario, valores normalizados, `MGET`/pipeline |
| Steam bloquea IPs de Vercel (IPs de salida dinámicas) | No hay reportes fiables; backoff y caché; si ocurre, valorar otro host (Hono es portable) |
| Neon/Supabase se pausan por inactividad | Solo entran en fase 4 y con diseño tolerante a arranque en frío |
| Runtime Cache efímero y compartido entre tus proyectos | No depender de él para correctitud |
| Valve cambia respuestas | Zod laxo + registro de deriva + tests de contrato |

## 16. Descartado y por qué

| Opción | Motivo |
|---|---|
| `steamapi` (npm 3.1.5) | Sin wishlist ni `GetItems`; sin manejo de 429; caché solo en memoria (inútil en serverless); devuelve `[]` tanto para privado como vacío |
| Cloudflare Workers | 50 subrequests por invocación en free; la cabecera `Cf-Worker` provoca 403 en el OpenID de Steam |
| Next.js 16 | El spike pasó (§14), así que no hace falta. Con `core/` aislado, migrar seguiría siendo barato |
| TanStack Start | La web oficial sigue mostrando la insignia "RC" y tuvo un aviso de seguridad (30-sep-2026) |
| Astro (islas) | El dashboard sería casi todo isla |
| Vercel Services, Queues, Workflow | En Beta. Se reconsideran solo si la fase 5 necesita trabajos largos o sincronización |
| Vercel Blob | Solo 2 k escrituras avanzadas al mes |
| Global Config (Edge Config) | 100 escrituras al mes; es para configuración |
| `GetAchievementsProgress` | 401 con key de desarrollador (verificado) |
| Lenis en el shell de la app | Conflictos con scroll interno de paneles y coste de rendimiento |

## 17. Sin verificar y decisiones abiertas

- `libraryPrivate` y `wishlistPrivate` (§5.4): necesitan una cuenta distinta de la del dueño de la key. El spike 0B.6 quedó parcial (§14).
- Si una respuesta en streaming se cachea en el CDN, y si el tope de 4,5 MB aplica al streaming (no lo usamos, pero conviene saberlo).
- **Rewrite de SPA en `vercel.json` (verificado; se deja aquí como regla, no está abierto):** una regla por ruta del cliente (`/p/:profile` → `/index.html`, después de la de `/api`). **No usar un comodín `/(.*)`**: `vercel dev` reescribe también `/src/main.tsx` y `/@vite/client` a `index.html` y Vite falla con "Failed to parse source for import analysis" (reproducido 2026-10-07). Con la regla acotada, `vercel dev` sirve los módulos como JavaScript y la carga directa de `/p/...` funciona (verificado en local, incluido en navegador). Reglas actuales: `/p/:profile`, `/demo` y `/privacy`. Consecuencias: cada ruta nueva del cliente necesita su regla, y una ruta desconocida fuera de `/p/` la contesta el 404 de Vercel, no la página 404 del SPA. **Verificado desplegado (2026-10-07)** en `https://hoardex.vercel.app` (dominio de producción, público): `/`, `/demo`, `/demo?state=backlog` y `/p/foo` devuelven 200 con `index.html`, una ruta desconocida (`/nope`) devuelve el 404 de texto plano de Vercel, y `/api/demo/library` da `x-vercel-cache: HIT` en repeticiones. Los alias con el nombre del equipo (`*-<equipo>.vercel.app`) y las URL de cada despliegue llevan Vercel Authentication (`ssoProtection: all_except_custom_domains`): solo el dominio de producción es público.
- Cuota gratuita y tamaño total de Runtime Cache en Hobby.
- Script de Web Analytics: ruta única del build (`VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG`) o, sin ella, `/_vercel/insights/script.js` (leído en el código de `@vercel/analytics` 2.0.1; verificado desplegado 2026-10-08 que Vercel inyecta la variable en un build de Vite; falta ver que el script de producción cuente solo cambios de ruta como el de depuración). Hobby (doc de precios, 2026-10-08): 50 k eventos al mes para toda la cuenta, ventana de 1 mes, sin eventos propios; al pasar el límite hay 3 días de gracia y la recogida se pausa. El comando `vercel project web-analytics` existe en la CLI 62.7.0 (comprobado con `--help`, 2026-10-09). El dueño ve en el panel las visitas de `/demo` y comprobó que *Pages* muestra solo la ruta, sin query string (2026-10-09). *Routes* sale vacío (§10, «Analíticas»).
- Refresco: la rewrite `/api/:path*` deja pasar el POST en `vercel dev` (verificado 2026-10-08); falta verlo desplegado (`TODO.md`, «Check in production»). `SET … NX GET` en Upstash: verificado (§8).
- Si Valve tolera de hecho las consultas a terceros.
- **Licencia (2026-10-08; cerrada el 2026-10-09: sin licencia):** sin licencia por ahora (todos los derechos reservados: se puede leer, no reutilizar; `package.json` dice `UNLICENSED`). Se valoró MIT (permite usar y vender, incluso en código cerrado), PolyForm Noncommercial 1.0.0 (uso no comercial permitido, no es open source de la OSI) y AGPL-3.0; no se cambia.
- **Decisiones cerradas el 2026-10-09:** dominio `hoardex.vercel.app`, sin licencia, restricciones de PR cuando se haga público el repo, *Pausado* separado de *En curso* (§7), IntersectionObserver en la cuadrícula (§10) y las barras de horas por año animan al cargar, sin esperar a entrar en pantalla. **Abierta:** el peso de Motion y GSAP (`TODO.md`, «At the very end»; el dueño la deja para el final).

## 18. Para retomar

1. Leer `AGENTS.md` (reglas fáciles de romper) y este fichero (el porqué).
2. Seguir `TODO.md`; se borra cada punto al completarlo.
3. Probar la app con dos terminales: `pnpm dlx vercel@62.7.0 dev` (la API en :3000; necesita `.env.local`, de `vercel env pull`, y ningún `.env`, que `vercel dev` lee antes) y `pnpm dev` (la interfaz en :5173, con `/api` hacia :3000). La página de `vercel dev` sale en blanco: la CSP bloquea los scripts en línea de Vite en desarrollo (§19.11).
4. Antes de cerrar un cambio: `pnpm typecheck`, `pnpm test`, `pnpm format:check` y `pnpm lint:css`. El test anti-fuga (§13) también lee los documentos.

## 19. Fase 4: login, cuentas, backlog editable y snapshots (diseño del 2026-10-09, Opus 5.5)

Decisiones del dueño (2026-10-09): estados manuales = los seis actuales más *Abandonado*; arrastre en una **vista tablero**; los estados manuales son **públicos** (los visitantes los ven en solo lectura); los **snapshots entran en esta misma fase**. Todo en planes gratuitos.

### 19.1 Qué da y qué no da el login

- Steam OpenID solo devuelve el SteamID64: **no hay token** para leer datos privados. Con "detalles de juego" privados, la biblioteca sigue sin verse aunque el dueño inicie sesión (la key no es suya). El login prueba la propiedad del perfil y habilita la edición; además encaja mejor con «as requested by the end user» (§12).
- Sin sesión, todo sigue como hoy. Con sesión, `/p/X` entra en modo edición solo si X resuelve al SteamID de la sesión; cualquier otro perfil es de solo lectura.

### 19.2 Login (OpenID 2.0)

1. `GET /api/auth/steam/login?returnTo=/p/…` → 302 a `https://steamcommunity.com/openid/login` con `openid.mode=checkid_setup`, `identity`/`claimed_id` = `identifier_select`, `realm` = origen propio y `return_to` = `/api/auth/steam/callback?state=<aleatorio>`. Guarda el `state` en una cookie `HttpOnly` de 10 min (contra el CSRF de login). Es un **enlace**, no un `<form>`: `form-action 'self'` de la CSP también bloquea las redirecciones de un formulario.
2. `GET /api/auth/steam/callback`: `state` igual que la cookie; `openid.mode=id_res`; `op_endpoint` exacto; `return_to` igual al nuestro; `claimed_id` con `^https://steamcommunity\.com/openid/id/(765611\d{11})$`; `response_nonce` con menos de 5 min y no usado (`SET NX` de 10 min en Redis, 1 comando); y `check_authentication` por POST a Steam con `is_valid:true`. Host en la lista cerrada (§11).
3. Upsert de la cuenta en Neon, marcador en Redis (§19.4), cookie de sesión y 302 a `returnTo` (solo rutas propias: empieza por `/` y no por `//`).
- **Sesión:** cookie `hx_session`, `HttpOnly; Secure; SameSite=Lax; Path=/`, JWT HS256 (`hono/jwt`) con `sub` (SteamID), `exp` 30 días y `epoch`. `SESSION_SECRET` (≥ 32 bytes, sensible) en Vercel. `epoch` = `users.session_epoch`, comprobado en cada escritura (ya va a Neon): «cerrar todas las sesiones» lo incrementa.
- `GET /api/me` (`no-store`): `{ user: null }` o `{ user: { steamId } }`. `POST /api/auth/logout` borra la cookie.
- **Mutaciones:** SameSite=Lax más comprobar que `Origin` es el propio.
- **CDN:** ningún GET público lee la sesión ni envía `Set-Cookie`; solo `/api/me*` y `/api/auth/*` dependen de ella (`no-store`). Así `/api/profile` y `/api/library` siguen cacheándose. Que el CDN de Vercel siga dando HIT a peticiones con cookie está **(sin verificar)** → spike 4.0.
- **Entornos:** `realm` y `return_to` salen de una lista cerrada (`https://hoardex.vercel.app`, la URL de rama del preview vía `VERCEL_BRANCH_URL`, `http://localhost:3000`), nunca de la cabecera `Host`. Que Steam acepte `localhost` y que el callback funcione detrás de Vercel Authentication está **(sin verificar)** → spike 4.0.

### 19.3 Almacenamiento

- **Neon free** (2026-10-09, [pricing](https://neon.com/pricing)): 0,5 GB y 100 CU-hora al mes por proyecto, se duerme tras 5 min y despierta en unos cientos de ms; a diferencia de Supabase, no hay que reactivarlo a mano. Desde el Marketplace de Vercel, región `aws-us-east-1` (junto a la función `iad1` y Upstash). Ramas: `main` (producción) y `dev` (preview y desarrollo); una rama por preview agotaría las 10 del plan.
- **Driver:** `@neondatabase/serverless` por HTTP (una petición por consulta, sin pool), SQL a mano y Zod al leer; sin ORM. Migraciones: `db/migrations/NNN_nombre.sql` + `scripts/migrate.ts` con una tabla `schema_migrations`. Va en `core/accounts` (repositorio con interfaz pura e implementación Neon, como `core/cache` con Upstash) más una versión en memoria para tests; PGlite (Postgres en WASM, dev) para probar el SQL sin red.
- **Esquema** (`source` previsto para la fase 5):

```sql
users (id uuid pk, created_at, last_login_at, session_epoch int default 0, snapshots_opt_in_at timestamptz null)
identities (source text, external_id text, user_id uuid → users on delete cascade, pk (source, external_id))
backlog_overrides (user_id, game_source, game_id, state text check (...), minutes_at_set int, set_at timestamptz,
                   pk (user_id, game_source, game_id))
playtime_snapshots (user_id, game_source, game_id, taken_on date, total_minutes int,
                    pk (user_id, game_source, game_id, taken_on))
```

### 19.4 Lectura pública por Redis

Si cada visita a un perfil consultara Neon, lo mantendría despierto. Las lecturas públicas van a Redis: `bl:{source}:{steamid}` es un hash (campo = appid, valor = estado) o un marcador `none` si no hay cuenta. Se escribe a la vez en Neon y Redis (write-through); si falta la clave, se lee Neon y se rellena. TTL largo (30 d), porque la escritura lo mantiene correcto. Coste: +1 comando de Redis por visita a un perfil. Neon solo se despierta con login, escrituras, fallos de caché y el cron.

### 19.5 API

| Ruta | Qué hace | Caché |
|---|---|---|
| `GET /api/backlog/:input` | Estados manuales de un perfil (desde Redis) | `s-maxage` corto, como la biblioteca |
| `PUT /api/me/backlog/:appid` `{state}` | Pone un estado manual | `no-store` |
| `DELETE /api/me/backlog/:appid` | Vuelve al estado automático | `no-store` |
| `PUT /api/me/settings` `{snapshots}` | Activa o desactiva los snapshots | `no-store` |
| `DELETE /api/me` | Borra cuenta, overrides, snapshots y claves de Redis (derecho de supresión) | `no-store` |
| `GET /api/cron/snapshots` | Cron diario, con `Authorization: Bearer CRON_SECRET` | `no-store` |

- El SteamID sale siempre de la sesión, nunca de la URL. El appid debe estar en la biblioteca cacheada de ese usuario (misma regla que los lotes de logros, §9). `state` es un enum Zod.
- El cliente con sesión siembra su caché con la respuesta del PUT (optimista, `useMutation`), como el refresco (§8): el CDN puede tener la copia vieja del GET.
- La regla del WAF sobre `/api` (§11) ya cubre estas rutas.

### 19.6 Estados

- Nuevo estado `abandoned`, **solo manual**. *Completado* a mano significa «lo doy por terminado»; automático solo con el 100 % de logros (§7).
- `resolveState(game, now, override?, progress?)` en `core/backlog`: si hay override, gana; si no, `classifyGame`. `summarizeLibrary` y `classifyLibrary` reciben el mapa de overrides, y gráficas, chips y filtros lo siguen sin tocar las vistas. *Abandonado* no cuenta como backlog.
- El override es **permanente**. Guarda `minutes_at_set`: si el juego suma minutos después, la UI muestra una pista («lo has jugado desde que lo marcaste») en vez de cambiar el estado sola.

### 19.7 Front

- Cabecera: botón «Sign in through Steam» con la imagen oficial de Valve, alojada en `public/` (la CSP no cambia). Con sesión: avatar, «Mi perfil» y «Cerrar sesión». La pantalla de entrada ofrece «Ir a mi perfil». `meQuery` en `src/lib/api`.
- **Menú por tarjeta** («Cambiar estado», «Volver a automático»), solo para el dueño. Es obligatorio aunque exista el tablero: teclado, lector de pantalla y móvil. Los estados manuales llevan una marca visible y un texto accesible.
- **Vista tablero** (`view=board`, parámetro de búsqueda como `state`/`sort`/`q`): una columna por estado con su contador, «Mostrar más» por columna (nunca cientos de tarjetas montadas a la vez) y arrastre con una librería pequeña (Pragmatic drag and drop o dnd-kit; se elige midiendo el peso en el chunk diferido). Fuera de edición, el tablero es de solo lectura. Las animaciones siguen §10: el tablero tiene sus propios elementos; nada de GSAP sobre `li.game-card` mientras se arrastra.
- **Demo editable** sin login: los cambios van a `localStorage` con un aviso de que no se guardan, así el portfolio enseña la función.
- `/account` (rewrite nueva en `vercel.json`): interruptor de snapshots, «Cerrar todas las sesiones» y «Borrar mis datos».
- **Política de privacidad:** Neon (AWS us-east-1) como tercero; qué se guarda (SteamID, estados manuales y sus fechas, snapshots si se activan) y que los estados manuales son públicos; la cookie de sesión (estrictamente necesaria, sin banner); cómo borrar los datos.

### 19.8 Snapshots opt-in

- Cron de Vercel una vez al día (el máximo en Hobby; la hora exacta no está garantizada) en `/api/cron/snapshots`. Recorre los usuarios con `snapshots_opt_in_at` (en tandas, dentro de los 300 s), pide `GetOwnedGames` por el presupuesto diario (§8) y guarda **solo los juegos cuyos minutos han cambiado** desde el último snapshot. Idempotente por día (`on conflict do nothing`).
- Snapshot oportunista: al abrir el dueño su propio perfil, si el último tiene más de 24 h.
- Tamaño: unos pocos juegos cambiados al día por usuario activo (~decenas de bytes por fila): 0,5 GB dan para muchos años con tráfico de portfolio.
- Habilita gráficas nuevas (horas por semana o mes), que Steam no da: solo entrega totales.

### 19.9 Resultados del spike 4.0 y de 4a (2026-10-09)

- **Login en un preview protegido (verificado por el dueño, 2026-10-09):** Steam OpenID completa el ciclo detrás de Vercel Authentication, el origen del preview (`VERCEL_URL`) pasa la lista cerrada y la sesión queda iniciada. **Sin probar todavía con `localhost`** (el 302 a Steam con `realm=http://localhost:3000` sale bien; falta completar el login).
- **CDN con cookie (verificado en el preview):** tres `GET /api/demo/library` con `Cookie: hx_session=…` distinta cada vez dieron MISS, HIT, HIT. El CDN no mete la cookie en la clave, así que los GET públicos siguen cacheándose con sesión. `/api/me` sale `no-store` y con un token falso responde `{ user: null }`.
- **Neon desde local (rama `dev`, 2026-10-09):** Postgres 18.6 en `us-east-1`, primera consulta 434 ms y siguientes ~118 ms desde España por HTTP (`scripts/spike-neon.ts`). Falta medir desde `iad1` (4b).
- **`vercel dev` y un `.env` viejo (2026-10-09):** el login daba 500 `misconfigured` (sin `SESSION_SECRET`) y Redis fallaba con `WRONGPASS`. La causa era un `.env` del 7 de octubre con un token de Upstash ya revocado (la integración se reconectó el 9): con `.env` presente, `vercel dev` lo usa y no toma `.env.local`. Retirado ese fichero, `vercel dev` lee `.env.local` sin más (secretos de 64 caracteres y Redis con HIT). Las variables locales salen solo de `vercel env pull` (a `.env.local`); no crear un `.env`.
- **Variables:** `SESSION_SECRET` y `CRON_SECRET` aleatorias (`openssl rand -base64 48`) en Production y Preview como *sensitive*, y otras distintas en Development. `DATABASE_URL` apunta a la rama `dev` en Preview y Development; producción usará `NEON_STORAGE_DATABASE_URL`, que pone la integración (Neon Auth vino activado y no se usa).
- **Implementado (4a):** `core/adapters/steam/openid.ts` (`buildSteamLoginUrl`, `verifySteamLogin`: todas las comprobaciones de §19.2, el nonce se reclama antes de `check_authentication`), `core/auth/ttl.ts` (`AUTH_TTL`: sesión 30 días, intento de login 10 min; la política los lee), `server/session.ts` (JWT HS256 con `hono/jwt`, cookie `hx_session` con `Path=/api`) y `server/auth.ts` (`/api/auth/steam/login`, `/callback`, `/api/me`, `POST /api/auth/logout`; `safeReturnTo` solo admite rutas propias fuera de `/api`). `server/deps.ts`: `originPolicy` (producción `VERCEL_PROJECT_PRODUCTION_URL`, preview `VERCEL_URL` y `VERCEL_BRANCH_URL`, desarrollo `http://localhost:<puerto>`) y `buildAuth` (secreto de al menos 32 caracteres; nonce en Redis con `SET NX`, y si Redis falla se deja pasar porque `check_authentication` sigue). Un login fallido vuelve a `/?login=failed`, que muestra un aviso; sin `returnTo` (o con `/`) va a `/p/{steamid}`. Front: `AccountControl` en la cabecera (nada hasta conocer la sesión; «Entrar con Steam» o «Mi perfil» y «Cerrar sesión»), `meQuery` con `staleTime: Infinity`. `stubApi` responde «sin sesión» a `/api/me` por defecto y lo deja fuera de las llamadas registradas. Política de privacidad: sección «Iniciar sesión con Steam» y las cookies.

### 19.10 Implementado en 4b (2026-10-09)

- **Esquema:** `db/migrations/001_accounts.sql` (`users`, `identities`, `backlog_overrides`; los snapshots llegan con su propia migración en 4e). `state` lleva un `check` con los siete estados manuales (`MANUAL_STATES` en `core/backlog`: los seis calculados más `abandoned`).
- **Migraciones:** `scripts/migrate.ts` (`pnpm db:migrate`) aplica cada fichero una vez, en orden, dentro de una transacción y con un `pg_advisory_lock` (dos builds a la vez no aplican lo mismo dos veces); lleva la cuenta en `schema_migrations`. Usa `Pool` (WebSocket) porque una migración tiene varias sentencias. **Corre en cada build de Vercel** (`buildCommand` en `vercel.json`: `pnpm db:migrate && pnpm build`), así que preview migra la rama `dev` y producción `main` antes de construir; verificado en un preview. Como el despliegue anterior sigue sirviendo hasta la promoción, **una migración debe ser compatible con el código anterior** (añadir, no renombrar ni borrar). En local: `node --env-file=.env.local scripts/migrate.ts`.
- **Conexión:** `DATABASE_URL` (rama `dev`, en Preview y Development) y si falta `NEON_STORAGE_DATABASE_URL` (producción, de la integración). En tiempo de ejecución, Neon por HTTP (`core/accounts/neon.ts`, una petición por sentencia).
- **`core/accounts`:** `createSqlRepository(query)` (SQL a mano, filas validadas con Zod, errores como `DatabaseError` sin SQL ni valores; el primer login crea usuario e identidad en una sentencia con CTE y reintenta una vez si dos primeros logins se cruzan, lo que puede dejar un `users` huérfano sin identidad) y `createBacklogService` (lee `bl:{source}:{id}` en Redis y, si falta o tiene otra forma, Neon; cada escritura vuelve a leer Neon y reescribe la copia; TTL `CACHE_TTL.backlog`, 1 día). Un perfil sin cuenta también se cachea (vacío), así que una visita normal no despierta Neon más de una vez al día por perfil.
- **Tests:** PGlite (Postgres 17 en WASM, solo en desarrollo) aplica las mismas migraciones (`core/accounts/test-db.ts`); repositorio, servicio y rutas se prueban contra SQL real sin red.
- **API** (`server/backlog.ts`): `GET /api/backlog/:input` (público, misma caché de CDN que la biblioteca), `GET /api/me/backlog` (el dueño, `no-store`, sin pasar por el CDN: si no, tras recargar vería su copia vieja hasta 6 min), `PUT /api/me/backlog/:appid` `{state}` y `DELETE /api/me/backlog/:appid`. Las escrituras exigen `Origin` propio, sesión, cuenta con el mismo `session_epoch` que el token (va en el JWT desde 4b; los tokens sin él cuentan como 0) y, en el PUT, que el juego esté en la biblioteca del dueño (`minutesAtSet` sale de su `playtime`). Respuestas: `{ kind: 'ok', data: { overrides } }`; 401 `signedOut`, 403 `origin`, 404 `notOwned`, 409 `library` (biblioteca privada o no disponible), 503 `database`. `CachedAdapter.resolveId` resuelve un vanity con la caché `alias:`.
- **Login:** el callback registra la cuenta (`recordLogin`) y mete su `session_epoch` en el token; si la base de datos falla, el login falla (sin sesión a medias).
- **Política de privacidad:** sección «Tus estados manuales» (Neon en AWS us-east-1, qué se guarda, que son públicos, la copia en Redis con su TTL y cómo borrar la cuenta, por correo hasta que llegue `/account` en 4e).
- **Latencia (preview, 2026-10-09):** `GET /api/backlog/:id` desde España 0,23–0,49 s de punta a punta, sin diferencia apreciable entre la primera lectura (Neon) y las siguientes (Redis); Neon seguramente estaba despierto, así que el arranque en frío sigue sin medirse desde `iad1`.
- **Concurrencia:** dos escrituras a la vez pueden dejar la copia de Redis sin la segunda hasta la siguiente escritura o el TTL. El cliente (4c) debe serializar sus mutaciones (`scope` de TanStack Query).

### 19.11 Implementado en 4c (2026-10-09)

- **Estados:** `abandoned` entra en `BACKLOG_STATES` (al final; `classifyGame` nunca lo devuelve) y `MANUAL_STATES` es la misma lista. `BacklogOverride` y `Overrides` viven en `core/backlog`. `resolveState` = manual o calculado; `countByState(games, now, { progressByAppId, overrides, thresholds })`, `summarizeLibrary(…, { overrides })` y `classifyLibrary(…, { overrides })`, cuya entrada lleva `state` (el que se ve), `computed` (el de la biblioteca) y `manual`. *Abandonado* no cuenta como backlog.
- **Qué se enseña:** *Completado* y *Abandonado* solo aparecen en el donut y en los chips si algún juego los tiene (`isShownState`, `src/lib/shown-states.ts`): hasta la fase 2 solo los pone el dueño, y un 0 se leería como «ninguno». Un `?state=completed|abandoned` en la URL vale aunque no haya ninguno (el chip seleccionado se muestra).
- **Datos en el cliente** (`useBacklog`, `src/features/profile-page/use-backlog.ts`): el visitante lee `GET /api/backlog/:input` (`backlogQuery`); si `meQuery` dice que la sesión es la del perfil, lee `GET /api/me/backlog` (`myBacklogQuery`, `staleTime: Infinity`) y edita. Las escrituras son un `useMutation` con `scope: { id: 'backlog' }` (de una en una, §19.10), optimistas (se aplica el cambio en `myBacklogQuery` antes de responder, con `minutesAtSet` = horas actuales) y, al volver, se guarda la lista entera que da el servidor; si falla, se restaura la anterior y la vista dice «No se pudo guardar ese cambio» (`role="alert"`). Un error al leer los estados se trata como «sin estados manuales».
- **Demo editable:** `demo-backlog.ts` guarda los estados en `localStorage` (`hoardex:demo-backlog`, validados al leer) y en memoria (si el almacenamiento está bloqueado, el cambio dura lo que la página), con `useSyncExternalStore`. El aviso de la demo lo explica; la política de privacidad lo declara (sección «En tu dispositivo»).
- **Tarjeta** (`GameCard`): para quien puede editar, un `<select>` nativo con etiqueta oculta «Estado de {juego}» y las opciones «{calculado} · auto» y los siete estados (nativo: teclado, lector de pantalla y móvil sin código propio); para el visitante, el texto de siempre. Un estado manual añade «Puesto a mano» y, si el juego suma minutos desde entonces, «Jugado desde entonces» (el estado no cambia solo). El selector ocupa el ancho de la tarjeta (`.game-card__state--editable`): con 9 rem cortaba «Automático: Acabado». Visto en la demo en escritorio con Vite y `/api` real (sin desbordamiento, el estado sobrevive a recargar); **el móvil no se pudo ver** (la ventana de la extensión no cambió de tamaño).
- **`Dashboard` y `LibraryView`** reciben `overrides` (referencia estable: la da Query o el store de la demo; vacío = constante congelada) y `LibraryView` un `editor` (`StateEditor`, `library-view/state-editor.ts`) o `null`.
- **Cabecera en su chunk:** `AccountControl` se carga con `lazy` (no pinta nada hasta conocer la sesión, así que no se nota). Medido el JS inicial de `/` (chunk principal y sus imports estáticos, gzip): 123,7 KB en el último commit, 128,7 KB con la cabecera en el chunk principal y 125,5 KB con `lazy`. El número «chunk principal» solo engaña: antes TanStack Query ya se cargaba al inicio desde otro fichero (`preload-helper`).
- **Tests:** `stubApi` responde por defecto «sin sesión» a `/api/me` y «sin estados» a `/api/backlog/*`, fuera de las llamadas registradas salvo que el test las conteste. `backlog-editing.test.tsx` cubre visitante, dueño (PUT, error y vuelta atrás) y demo.
- **Hallazgo:** `vercel dev` aplica la CSP de `vercel.json`, que bloquea el script en línea de React Refresh que inyecta Vite en desarrollo (y los `<style>` que inyecta su cliente): **la página sale en blanco en local desde que se puso la CSP** (consola: «@vitejs/plugin-react can't detect preamble»). La API sí funciona. En producción no pasa (el build no lleva nada en línea). Para mirar la interfaz: Vite solo con un proxy de `/api` al `vercel dev` (lo que se hizo aquí con una configuración temporal). Pendiente de decidir (`TODO.md`).

### 19.12 Implementado en 4d (2026-10-09)

- **Desarrollo local con la CSP:** `vite.config.ts` manda `/api` a `vercel dev` (`HOARDEX_API_URL`, por defecto `http://localhost:3000`) con `xfwd: true`. Sin `xfwd` el proxy entrega `Host: localhost:3000` y el login mandaba a Steam con `realm` de :3000, cuya página sale en blanco; con `X-Forwarded-Host` Hono ve :5173 y Steam vuelve ahí (comprobado: `realm=http://localhost:5173`). La cookie vale para los dos puertos (las cookies no distinguen puerto). La CSP sigue entera en producción; solo cambia cómo se mira la interfaz en local.
- **Tablero** (`?view=board`, `library-view/board.tsx` y `board-card.tsx`): una columna por estado (`groupByState`, puro, en `core/browse`), en una rejilla que salta de línea (`minmax(min(15rem, 100%), 1fr)`, sin scroll horizontal). La búsqueda y el orden se aplican dentro de cada columna; el filtro de estado no (cada estado es una columna, así que sus chips se ocultan). 12 tarjetas por columna y 24 más por «Mostrar más»; se reinicia al cambiar búsqueda u orden. Tarjetas compactas sin portada (nombre, horas, el mismo selector y la nota «Puesto a mano»). Para quien edita salen las siete columnas (todas son destino); para un visitante, *Completado* y *Abandonado* solo si tienen juegos, y nada se arrastra.
- **Arrastre nativo (HTML5), sin librería:** el tablero solo mueve una tarjeta a otra columna (no reordena), la alternativa accesible ya existe (el selector de cada tarjeta, también para deshacer) y así no suma peso (el chunk diferido crece ~1 KB gzip, todo del tablero). La tarjeta lleva el appid en un tipo propio (`application/x-hoardex-appid`); la columna solo acepta mientras arrastra una tarjeta suya y comprueba que el appid está en la biblioteca, así que un texto u otra cosa soltada encima se ignora. La columna de destino se marca con un contorno discontinuo; la tarjeta arrastrada baja su opacidad (transición solo sin movimiento reducido). **Coste:** el arrastre táctil depende del navegador (Chrome en Android y Safari en iOS 15+ lo dan con pulsación larga, *sin verificar*); donde no exista queda el selector. Descartados: dnd-kit (eventos de puntero, táctil fiable, pero más peso) y Pragmatic drag and drop (sobre el mismo arrastre nativo, aporta autoscroll y vistas previas).
- **Comprobado:** tests en jsdom con `dataTransfer` simulado (mover, ignorar lo ajeno, «Mostrar más», solo lectura) y en Chrome por el proxy: columnas, contadores y selectores a ~945 px. **El arrastre real no se pudo probar en el navegador:** los eventos de ratón sintéticos de la extensión no inician el arrastre nativo. Tampoco el móvil.

### 19.13 Implementado en 4e (2026-10-09)

- **Esquema** (`db/migrations/002_snapshots.sql`): `playtime_snapshots` (una fila por juego y día solo si sus minutos cambiaron desde su fila anterior; los juegos a 0 min no se guardan) y `snapshot_days` (una fila por cuenta y día con snapshot, aunque no cambiara nada: sirve para «ya tomado hoy» y para contar días). `recordSnapshot` hace las dos inserciones en una sentencia (CTE con `unnest` de los appids y minutos y un `lateral` a la fila anterior de cada juego).
- **Cuándo se toma:** al activarlo (el del día, en el momento) y por el **cron diario** de Vercel (`crons` en `vercel.json`, `0 5 * * *` UTC; en Hobby la hora puede variar dentro de esa hora). `GET /api/cron/snapshots` exige `Authorization: Bearer CRON_SECRET` (comparación en tiempo constante; Vercel la envía sola) y recorre las cuentas por páginas de 50, 4 a la vez, sin empezar cuentas nuevas pasados 240 s (la función dura hasta 300 s); lo que quede, al día siguiente. La biblioteca sale de `CachedAdapter.getLibrary` (Redis si hay copia de menos de 1 h; si no, Steam, dentro del presupuesto diario). **Descartado el snapshot oportunista al abrir el propio perfil** (§19.8): despertaría Neon en cada visita del dueño o necesitaría `waitUntil`, y el cron ya cubre el día.
- **Cuentas inactivas:** el cron solo toma las cuentas con login en los últimos 90 días (`SNAPSHOT_ACTIVE_DAYS`); al volver a entrar, siguen. Así una cuenta olvidada no gasta llamadas a Steam para siempre.
- **Desactivar borra el historial** (`setSnapshots(false)`: deja `snapshots_opt_in_at` a `null` y borra las dos tablas de esa cuenta, en una sentencia).
- **API** (`server/account.ts`, todas `no-store` y del dueño, con `requireOwner` de `server/owner.ts`, el mismo control que las escrituras del backlog): `GET /api/me/account` (`snapshotsSince`, `snapshotDays`, `lastSnapshotOn`), `PUT /api/me/settings` `{snapshots}`, `POST /api/me/sessions/end` (sube `session_epoch` y borra la cookie: cierra todas las sesiones) y `DELETE /api/me` (borra el usuario y, en cascada, identidades, estados y snapshots; vacía la copia `bl:` de Redis y borra la cookie).
- **Página `/account`** (`src/features/account-page`, rewrite nueva en `vercel.json`, enlace «Cuenta» en la cabecera): sin sesión, invita a entrar y vuelve a `/account`; con sesión, la casilla del historial (con su estado en un `role="status"`), «Cerrar sesión en todas partes» y «Borrar mi cuenta» en dos pasos (el primer clic solo pregunta; sin diálogos del navegador). Al cerrar todas las sesiones o borrar, el cliente olvida las queries de `me` y vuelve a `/`.
- **Política de privacidad:** sección «Historial de tiempo de juego (opcional)» (qué se guarda, cada cuánto, los 90 días y que desactivarlo lo borra) y el borrado de la cuenta desde `/account` en «Tus estados manuales».
- **Gráficas del historial:** no entran en 4e; los datos se guardan desde ya.
- **Arreglo en producción (2026-10-09):** el login empezado en la URL del despliegue (`spa-hoardex-<hash>-<equipo>.vercel.app`, la que abre el panel de Vercel) daba `400 {"error":"origin"}`, porque en producción solo vale el dominio público. Ahora redirige al mismo login en `https://VERCEL_PROJECT_PRODUCTION_URL` (`canonicalOrigin`, conservando un `returnTo` seguro); la sesión queda en el dominio público.

### 19.14 Orden

0. **Spike 4.0:** OpenID desde `localhost` y desde un preview protegido; latencia de Neon en frío y en caliente desde `iad1`; HIT del CDN con cookie en la petición.
1. **4a** Login, sesión, `/api/me` y UI de cabecera.
2. **4b** Neon, migraciones, repositorio, overrides y la caché `bl:`.
3. **4c** `resolveState`, *Abandonado*, menú por tarjeta y demo editable.
4. **4d** Vista tablero con arrastre.
5. **4e** Snapshots (cron y oportunista), `/account` y la política de privacidad.
