# Hoardex — Arquitectura

> **Estado:** decisiones cerradas el 2026-10-07 tras investigación. Pendiente: spike de validación (§14).
> Las versiones que aparecen son las últimas verificadas ese día; fijarlas al crear el proyecto.
> Convención de fiabilidad: **(verificado)** = probado con curl, Postman o contra la doc oficial ese día · **(secundaria)** = fuente no oficial · **(sin verificar)** = suposición. Todo lo (secundaria) o (sin verificar) se comprueba en el spike antes de depender de ello.

## 1. Qué es y alcance

Dashboard web de la biblioteca de Steam de un usuario: horas jugadas, backlog, logros y wishlist, con gráficas animadas y mucha animación (datos que "se construyen" en pantalla).

- **Audiencia:** demo pública de portfolio. Tráfico bajo, visitantes anónimos. No es un producto.
- **Uso:** cualquier visitante introduce un perfil (URL, vanity o SteamID64). Más adelante, "Sign in through Steam" opcional.
- **Coste:** 0 €. Si algo exige pago, se descarta.
- **Monetización:** ninguna. Vercel Hobby es solo uso no comercial; pedir donaciones está permitido, anuncios y cobros no.
- **Futuro:** más stores (RetroAchievements primero; GOG, Epic, PSN, Xbox son frágiles) y backlog editable.
- **Repo:** público en GitHub, sin aceptar contribuciones. Nombre del proyecto: **Hoardex** (nombre de repo a confirmar al crearlo; `hoardex` está libre en la cuenta).

## 2. Decisiones cerradas

| Tema | Decisión | Motivo / alternativa descartada |
|---|---|---|
| Shell | **Vite 8 + React 19 + TypeScript** (SPA) | Modelo mental simple, sin RSC. Plan B: Next.js 16 "fino" si el spike falla |
| API | **Hono** en una Vercel Function (`/api`) | Request/Response estándar, portable fuera de Vercel, tipos extremo a extremo con `hc` |
| Hosting | **Vercel Hobby** | Ya lo usas; gratis. Cloudflare descartado (§16) |
| Caché | **CDN (`s-maxage` + SWR) + Upstash Redis free** | Persistente y barata en comandos si se diseña bien (§8) |
| Base de datos | **Ninguna en el MVP.** Neon (Postgres) solo en fase 4 | Snapshots opt-in y backlog editable lo necesitarán |
| Cliente Steam | **Propio**: `fetch` + Zod 4 | `steamapi` descartado (§16) |
| Fetching | **TanStack Query 5** | Ya lo usas en `spa-anicalendar` |
| Estilos | **SCSS** + variables CSS, sin Tailwind | Reutilizar convenciones de tus repos (stylelint + BEM) |
| Animación | **Motion** + **GSAP** (§10) | Cada uno donde es mejor; nunca sobre el mismo elemento |
| Gráficas | **Recharts 3** + SVG a mano | ECharts 6 queda como alternativa "espectacular" |
| Router | **TanStack Router** (rutas por ficheros con el plugin de Vite) | Parámetros de búsqueda tipados para los filtros en la URL; misma familia que Query. Sus peers aceptan React 19 y el plugin acepta Vite 8 (metadatos de npm); **verificado en la práctica** (fase 1, paso 4): con Vite 8.3 el plugin genera `routeTree.gen.ts` y parte el código por ruta |
| i18n | `en` (por defecto) y `es` con **`use-intl`** | Núcleo de `next-intl`, que ya usas en `spa-anicalendar`: mismo JSON anidado, ICU y `useTranslations`/`useFormatter`, sin paso de compilación. Lingui exige Babel dentro de Vite 8; `react-i18next`, otra API |
| Logros | **Lotes de ~12 juegos** pedidos por el cliente | `GetAchievementsProgress` no funciona con key de desarrollador (§16) |
| Historial | **Solo con login y opt-in** (fase 4) | No guardar datos de terceros sin consentimiento |
| Tests | Vitest + MSW 3 + fixtures anonimizados | §13 |

## 3. Stack (versiones a 2026-10-07)

React 19.3 · Vite 8.3 · TypeScript · Hono 4.13 · Zod 4.6 · TanStack Query 5.104 · Motion 14 · GSAP 3.15 + `@gsap/react` · Recharts 3.10 · use-intl 4.14 · TanStack Router 1.170 · Vitest 5 · MSW 3 (ESM-only, Node ≥ 22.12) · `sass` · pnpm (como en tus otros repos).

## 4. Estructura propuesta del repo

Una sola regla: **`core/` no importa nada de React, Vite ni Hono.** Así cambiar de shell (Next, otro host) cuesta poco.

```
core/            dominio y lógica pura
  domain/        Game, Playtime, Achievement, Profile, WishlistItem, ProfileAccess
  adapters/
    steam/       SteamAdapter: cliente fetch, schemas Zod, normalizadores (tipos crudos de Steam SOLO aquí)
  cache/         interfaz Cache + implementación Upstash + claves y TTLs
  backlog/       clasificación de estados (función pura, umbrales configurables)
api/             Hono: rutas, validación de entrada, rate limiting, cabeceras de caché
src/             frontend: vistas, componentes, hooks de Query, i18n, estilos SCSS
fixtures/        anonimizados/sintéticos (los completos, fuera del repo)
scripts/         extracción y anonimizado de fixtures desde Postman
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
- **Imágenes de juego (verificado con un appid, HEAD 200):** icono `https://media.steampowered.com/steamcommunity/public/images/apps/<appid>/<img_icon_url>.jpg` (lo construye el adapter), cabecera `https://cdn.cloudflare.steamstatic.com/steam/apps/<appid>/header.jpg` y portada vertical `…/library_600x900.jpg`. Que **todos** los juegos tengan portada vertical no está verificado: la UI necesita un respaldo a `header.jpg`.
- **Datos personales en respuestas:** `GetPlayerSummaries` trae `realname`, avatar y URL del perfil.

### 5.4 Perfil privado: la regla es decidir por el cuerpo, nunca solo por el status HTTP

| Caso | Respuesta | Fiabilidad |
|---|---|---|
| Wishlist privada | 200, `{"response":{}}`, `x-eresult: 15` | (verificado) |
| Wishlist pública y vacía | 200, `{"response":{}}`, `x-eresult: 1` | (verificado) |
| `GetOwnedGames`, perfil público con biblioteca visible | 200, `x-eresult: 1`, `game_count` + `games` (334 juegos, ~109 KB con `include_appinfo`) | (verificado) |
| `GetOwnedGames`, cuenta ajena de solo amigos | 200, **`x-eresult: 15`**, `{"response":{}}` (15 B, sin `game_count`); el adapter devuelve `profilePrivate` | (verificado) |
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
- **Pausado** rellena el hueco entre 90 días y 12 meses, que la tabla acordada dejaba sin estado. Se puede fusionar con *En curso* si no gusta.
- **Backlog = Sin tocar + Probado.** Filtro opcional para incluir *Pausado*. La wishlist va aparte.
- **Dependencia de datos:** todos los estados salvo *Completado* salen solo de la biblioteca (fase 1). *Completado* necesita logros (fase 2); hasta que lleguen, el juego conserva su estado provisional sin marcarlo como incompleto.
- Los juegos sin logros visibles nunca pasan a *Completado* automáticamente.
- **Distribución real de la biblioteca de ejemplo** (adapter + `classifyGame` contra Steam, 2026-10-07, sin logros todavía): 217 sin tocar, 16 probados, 6 en curso, 23 pausados, 72 acabados, 0 completados (suman 334). 304 de 334 tienen `has_community_visible_stats`. Cero reports de deriva de Zod.
- Datos de tu biblioteca de ejemplo: 217 de 334 sin tocar, 16 probados. En esa muestra **ningún** juego tiene ≥ 60 min con `rtime_last_played` = 0 (ni minutos > 0 con fecha 0), así que la regla de fecha desconocida (→ *Acabado*) es teórica por ahora; se mantiene por robustez.

**Métricas derivadas:** horas totales, horas por año de última partida, reparto por plataforma (aproximado), % de backlog, **valor sin jugar** (suma del precio actual de Sin tocar + Probado vía `GetItems`, fase 3), logros desbloqueados, % medio, logros raros (< 5 %) y actividad por fecha de desbloqueo.

## 8. Caché

Dos niveles. **El CDN es optimización, nunca fuente de verdad:** es regional y "best-effort". La correctitud descansa en Redis.

### Nivel 1 — CDN

Respuestas `GET` públicas de `/api` con `Cache-Control: s-maxage=…, stale-while-revalidate=…`. Requisitos del CDN: solo GET/HEAD, sin `Authorization` ni `Set-Cookie`. Máximo 10 MB por entrada.

### Nivel 2 — Upstash Redis (free: 256 MB, 500 k comandos/mes)

**Presupuesto de comandos:** guardar los logros de un usuario como **un hash** (`HSET` con varios campos = 1 comando, `HGETALL` = 1 comando) en lugar de una clave por juego. Guardar la biblioteca **normalizada**, no el JSON crudo (~190 KB → decenas de KB).

| Dato | Clave (propuesta) | TTL |
|---|---|---|
| Alias (vanity) → ID | `alias:{source}:{alias-en-minúsculas}` | 24 h (inexistente: 5 min) |
| Perfil | `profile:{source}:{steamid}` | 1 h (no encontrado: 5 min) |
| Biblioteca normalizada y su acceso | `lib:{source}:{steamid}` | 30 min (privado: 60 s; no encontrado: 5 min) (+ SWR en CDN) |
| Logros por usuario | hash `ach:{steamid}`, campo = appid | invalidación por huella, máximo 7 d |
| Esquema (iconos, `hidden`) | `schema:{appid}` | 30 d (compartido) |
| Textos localizados | `txt:{appid}:{lang}` | 30 d (compartido) |
| Rareza global | `rare:{appid}` | 7 d (compartido) |
| Ítems de tienda (precio) | `item:{appid}:{lang}:{cc}` | 6–24 h |
| Resultado negativo ("privado", "no encontrado") | dentro de la propia entrada (`alias:`, `profile:`, `lib:`) | 60 s (privado) – 5 min (no encontrado). `rateLimited` no se cachea |
| Presupuesto diario de Steam | `shared:budget:steam:{YYYYMMDD}` (**sin prefijo de entorno**: el límite es de la key) | contador, 2 días |
| Cooldown de refresco | `refresh:{steamid}` | 10 min (**sin implementar**: llega con el botón de la UI) |

- **Invalidación de logros por "huella":** cada campo del hash guarda `hash(playtime_forever, rtime_last_played)` del momento en que se pidió. Si la biblioteca nueva trae la misma huella, no se vuelve a pedir ese juego. Un refresco normal cuesta unas pocas llamadas.
- **Idioma:** el progreso por usuario va **sin idioma** (`apiname`, `achieved`, `unlocktime`). Los textos se guardan por `(appid, lang)` y se rellenan de forma oportunista con la primera respuesta de `GetPlayerAchievements`. La rareza y el esquema no dependen del idioma.
- **Juegos sin stats** (400 "no stats"): se guarda un marcador `none` en el hash para no preguntar de nuevo.
- **Refresco manual:** botón con cooldown por perfil (`refresh:{steamid}`).
- **Normalizar siempre** el SteamID antes de usarlo como clave (un vanity y su ID resuelto deben compartir caché de datos).
- **Implementación (Fase 1, paso 3):** `core/cache` (`CacheStore`, `createCachedAdapter`, `createDailyBudget`) y `server/` (Hono). Las lecturas se validan con Zod: una entrada con otra forma cuenta como fallo de caché. Si Redis falla, la petición sigue contra Steam; si falla el contador, se deja pasar. Superado el presupuesto, `withBudget` responde como un 429 de Steam y el adapter devuelve `rateLimited`. Sin caché negativa para 429 de Steam hasta observarlo.
- **Medido en local con Steam y Upstash reales (2026-10-07):** el contador sube solo con llamadas reales a Steam (caliente = 0); los TTL salen como en la tabla; la biblioteca normalizada de 334 juegos pesa **144 KB** (~430 B por juego), más que las "decenas de KB" estimadas, aún muy por debajo de 5 MB. Si molesta se puede recortar (`iconUrl` se deriva del hash, `platforms`). Tiempos locales (España → Steam/Upstash): ~1,9 s en frío, ~0,8 s en caliente; no son referencia para producción.
- **Verificado desplegado (2026-10-07, producción):** los imports ESM de `server/` funcionan, Redis de producción responde, `x-vercel-cache: HIT` en repeticiones (el cliente ve `cache-control: public`), función en `iad1` servida desde el borde `cdg1`. Biblioteca fría ~0,7 s, en el CDN ~0,1–0,2 s. **Sin verificar:** la contabilidad de comandos de Upstash.
- **Ids falsos de las fixtures:** el rango reservado puede coincidir con cuentas reales. Las fixtures solo se usan sin red, pero `profileUrl` apunta a `steamcommunity.com/profiles/{id}`: el modo demo no debe enlazar ese perfil.

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
- **Implementación (Fase 1, paso 4):** `src/routes` (`__root`, `/`, `/p/$profile`), `src/features` (header, footer, entry-form, profile-page), `src/components` (button, state-message), `src/lib` (`api`, `i18n`, `query-client`, `profile-slug`). La pantalla de entrada normaliza lo escrito con `parseProfileInput` (solo importa `profile-input.ts`, sin Zod en el bundle) y navega a `/p/{vanity en minúsculas | id64}`; una entrada inválida se rechaza sin tocar la red. `QueryClient` con `retry: false`, `refetchOnWindowFocus: false` y `staleTime` de 60 s (igual que el `s-maxage`). El perfil y la biblioteca son dos queries: si la biblioteca es privada, el perfil se sigue mostrando. `routeTree.gen.ts` va **commiteado** (`tsc` corre antes de `vite build`) y Prettier lo ignora. Los tests del front usan el árbol de rutas real con historial en memoria y un `fetch` falso (`src/lib/test/render-app.tsx`); 29 tests, proyecto `front` de Vitest (jsdom).
- Router de cliente: **TanStack Router** con rutas por ficheros (`@tanstack/router-plugin/vite`, que genera `routeTree.gen.ts`). Rutas previstas: `/` (introducir perfil) y `/p/$profile` (dashboard) con los filtros (estado, orden, vista) como parámetros de búsqueda tipados. Alternativa descartada: React Router 8 (sin búsqueda tipada).

### Animación y gráficas

| Pieza | Elección | Reglas |
|---|---|---|
| Layout, exit, contadores | **Motion** con `LazyMotion` + `domMax` (~30 KB gzip) | `layout` no funciona en SVG. No combinar `layout` con `animate`/`whileHover` en el mismo cambio |
| Stagger en cuadrícula, entradas por scroll | **GSAP** (gratis, plugins incluidos) con `useGSAP`, `grid` stagger y `ScrollTrigger.batch` | Nunca sobre el mismo elemento ni la misma propiedad que Motion. Nunca sobre nodos que desmonta `AnimatePresence`. Nunca dentro del SVG de Recharts |
| Barras, líneas, donut, radial | **Recharts 3** | Usar `animationMatchBy` para actualizaciones en vivo |
| Heatmap de actividad, rareza | **SVG a mano** (d3-scale + Motion) | Recharts no trae heatmap |
| Cambio de vista | View Transitions / `<ViewTransition>` de React 19.3 | No para animar 300 elementos |
| Cuadrícula de 300 portadas | `content-visibility: auto` + carga diferida de imágenes | Sin virtualización; virtualizar solo una tabla > 1000 filas |
| Smooth scroll | **Lenis fuera del shell** | Solo en una intro si acaso |

- **`prefers-reduced-motion`:** `MotionConfig reducedMotion="user"` y `gsap.matchMedia`.
- **Accesibilidad:** Recharts trae `accessibilityLayer`; los gráficos propios llevan alternativa en tabla o texto.
- **Rendimiento:** animar solo `transform` y `opacity`. **No hay benchmarks públicos de 300 elementos** con Motion ni GSAP Flip, así que se mide con un spike propio (§14).
- **Alternativa "espectacular" (no ahora):** ECharts 6 en canvas (`universalTransition`, `realtimeSort`, calendar heatmap) a cambio de ~150 KB y de no poder orquestar el interior con GSAP.

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
  - Vanity: `^[A-Za-z0-9_-]{2,32}$` (el mínimo real, 2 o 3, está sin verificar).
  - También aceptar SteamID2/ID3 convertidos con `BigInt` (`[U:1:N]` → `76561197960265728n + N`).
  - Extraer el identificador de URLs `/id/<vanity>` y `/profiles/<id64>`.
- **Rate limiting propio:**
  - WAF de Vercel por IP (en Hobby solo hay **1 regla por proyecto**, contadores por región). Debe permitir las ~10 llamadas por carga completa.
  - Contador diario en Redis como **presupuesto global de Steam** (techo blando, p. ej. 80 k). Al superarlo se sirve solo caché y se avisa en la UI.
- **429 de Steam:** concurrencia limitada, backoff con jitter, caché negativa corta, y estado `rateLimited` visible.
- **Cabeceras:** CORS mismo origen (el front y la API comparten dominio), `Content-Security-Policy` restrictiva, sin cookies en `/api` públicas (así el CDN puede cachear).
- **Login con Steam (fase 4):** OpenID 2.0, sin OAuth/OIDC. Verificar con `check_authentication` por `fetch` directo (~40 líneas), más comprobar `mode=id_res`, `op_endpoint`, `return_to` propio, regex del `claimed_id` y frescura del nonce. Sesión sin BD: cookie HttpOnly, Secure, SameSite=Lax con JWT HS256 (`jose`). Solo se obtiene el SteamID64.
- **Logs:** nunca registrar la key ni cabeceras completas.

## 12. Términos de Steam y privacidad

- **Riesgo principal:** los términos dicen que solo se recuperan datos de un usuario "as requested by the end user" (steamcommunity.com/dev/apiterms, versión de 2010). Consultar perfiles de terceros **no queda amparado expresamente**, y Valve puede revocar la key "at any time for any reason, without notice" (§11). Que Valve lo tolere de hecho es una suposición.
- **Mitigaciones:**
  1. Texto de la UI que pide el perfil **propio**.
  2. Cachés cortas para datos por usuario; sin historial salvo opt-in.
  3. Login con Steam como vía limpia, en cuanto exista (fase 4).
  4. **Modo demo con fixtures anonimizados:** la demo del portfolio sigue funcionando aunque la key se pierda.
  5. Plan de contingencia: la capa Steam está aislada en el adapter.
- **Obligaciones:** política de privacidad (qué datos, dónde se guardan, cuánto tiempo), atribución a Valve, no parecer oficial, borrar copias cuando corresponda. No existe el literal "Powered by Steam": el pie debe incluir el aviso de marcas de Valve (revisar el texto exacto en `partner.steamgames.com/doc/marketing/branding`) y un descargo de no afiliación.
- **Uso no comercial:** requisito de Vercel Hobby (§1).

## 13. Testing y fixtures

- **Fuente:** la colección de Postman `v2Steam Web API.postman_collection.json` (no entra al repo). Cada ejemplo está en `item[].response[].body`. **Cuidado:** cada respuesta incluye `originalRequest`, que puede llevar la API key; el extractor solo lee `code` y `body`.
- **Script de extracción** (Node sin dependencias): recorre `item[]`, parsea cada `body` (tolerando vacíos o no JSON) y escribe `fixtures/<carpeta>-<nombre>.<código>.json` con claves ordenadas para diffs limpios.
- **Anonimizado:** sustituir con un **mapa de IDs ficticios consistentes**, no con hashes (los SteamID son enumerables y un hash sin sal se revierte). Tocar `steamid`, `personaname`, `realname`, avatares, `profileurl`, `primaryclanid`.
- **Datos de biblioteca:** la lista de juegos y horas sigue siendo tuya. Los fixtures **completos van fuera del repo (gitignored)**; en el repo, solo **recortes o conjuntos sintéticos**. Las fixtures de 1 MB (wishlist) se cargan de forma perezosa.
- **Test anti-fuga** (`tests/privacy-leak.test.ts`): recorre `git ls-files --cached --others --exclude-standard` (docs incluidos; nada está exento) y falla si hay un SteamID64 fuera de la ventana ficticia (`76561198000000000` + 10 000) o de una lista pública corta, si aparece algún término de `fixtures/full/private-terms.json` (steamid, realname, personaname, vanity, hash de avatar; se crea con `node scripts/init-private-terms.ts` y se omite si falta, p. ej. en CI), o si aparece la `STEAM_API_KEY` de `.env.local`. Los fallos nombran el fichero y el tipo de fuga, nunca el valor.
- **Fixtures públicas** (`fixtures/steam/<Endpoint>.<caso>.json`, forma `{ status, eresult, body }`): sintéticas, con la forma real de Steam y todos los casos de §7 (0 min, 59/60 min, 10/120/400 días, `has_community_visible_stats` ausente, desgloses que no suman). `GetPlayerSummaries.friends/.private` son **inferidas**, no observadas. `GetOwnedGames.private` reproduce lo observado en una cuenta ajena de solo amigos (200, `x-eresult: 15`, `{"response":{}}`). `ResolveVanityURL.notFound` y `GetPlayerSummaries.empty` coinciden con la respuesta real (verificado).
- **Contrato:** cada fixture debe parsear con su schema Zod, y el normalizador debe producir el dominio esperado.
- **Unitarios:** clasificación de backlog (todas las ramas de §7), validación de entrada, huellas de caché.
- **Adapter de Steam:** recibe `fetch` por inyección, así que sus tests usan un `fetch` falso sin MSW. **MSW 3** llega con el modo demo y los tests del front: `setupServer` en Vitest y `setupWorker` en dev/modo demo, con los mismos handlers. Soporte de streaming sin confirmar (no lo necesitamos: usamos lotes).
- **Herramientas:** Vitest, Testing Library y jsdom, como en `spa-anicalendar`.

## 14. Roadmap y spike

### Fase 0 — Spike (primero, antes de crear nada más)

Tiene una **puerta de decisión**: si el despliegue de B da guerra más de ~2 horas, se pasa al Plan B (Next 16 fino) y `core/` no cambia.

**0A. Despliegue**
1. Vite 8 + React + Hono (`hono/vercel`) en **un único proyecto** de Vercel.
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
- **Upstash (verificado en preview desde `iad1` y en local):** `ping`, `SET`/`GET` con JSON, `HSET` con varios campos y `HGETALL` funcionan. Latencia desde la función: 5–60 ms por comando; desde España, ~110 ms. **Tamaño de valor:** un `SET` de 5 MB y un `HSET` de ~4,9 MB en un comando funcionaron sin error en el plan free (no se probó más arriba); nuestros valores serán de decenas de KB. Un `HSET` con varios campos es **una sola petición**; no se ha comprobado cómo lo contabiliza el panel de uso de Upstash.
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

### Fases del producto

| Fase | Contenido |
|---|---|
| 1 | Perfil → biblioteca, horas, estados de backlog (excepto Completado), gráficas, caché, i18n base, modo demo con fixtures |
| 2 | Logros progresivos, rareza, estado *Completado* |
| 3 | Wishlist (`GetWishlist` + `GetItems`) y valor sin jugar |
| 4 | Login con Steam, Neon, backlog editable y snapshots opt-in |
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
| Next.js 16 | Queda como **Plan B** si el spike falla. Con `core/` aislado, migrar es barato |
| TanStack Start | La web oficial sigue mostrando la insignia "RC" y tuvo un aviso de seguridad (30-sep-2026) |
| Astro (islas) | El dashboard sería casi todo isla |
| Vercel Services, Queues, Workflow | En Beta. Se reconsideran solo si la fase 5 necesita trabajos largos o sincronización |
| Vercel Blob | Solo 2 k escrituras avanzadas al mes |
| Global Config (Edge Config) | 100 escrituras al mes; es para configuración |
| `GetAchievementsProgress` | 401 con key de desarrollador (verificado) |
| Lenis en el shell de la app | Conflictos con scroll interno de paneles y coste de rendimiento |

## 17. Sin verificar y decisiones abiertas

- Respuestas de privacidad con key real con el perfil en privado (§5.4) → spike 0B.6.
- Tamaño máximo de lote de `GetItems` → spike 0B. Contabilidad de comandos de Upstash (¿`HSET` con N campos cuenta 1?) contra el panel de uso.
- Si una respuesta en streaming se cachea en el CDN, y si el tope de 4,5 MB aplica al streaming (no lo usamos, pero conviene saberlo).
- Mínimo real del vanity (2 o 3 caracteres).
- **Rewrite de SPA en `vercel.json`** (`/(.*)` → `/index.html`, después del de `/api`): en local, con el servidor de Vite, la carga directa de `/p/...` funciona, pero el comportamiento desplegado (rutas profundas y assets) **no está verificado** hasta el próximo despliegue.
- Cuota gratuita y tamaño total de Runtime Cache en Hobby.
- Si Valve tolera de hecho las consultas a terceros.
- **Decisiones abiertas:** licencia del repo (sin licencia = visible pero no reutilizable), restricciones de PR en GitHub (revisar los ajustes del repo), dominio propio frente a `*.vercel.app`, y si fusionar *Pausado* con *En curso*.

## 18. Para retomar

1. Crear el repo vacío y copiar este fichero a la raíz.
2. Añadir a `.gitignore`: `.env*`, la colección de Postman, `fixtures/full/` y `.vercel/`.
3. Empezar por el spike de la fase 0 (§14), sin scaffolding de producto hasta pasar la puerta de decisión.
