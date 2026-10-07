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
| i18n | `en` (por defecto) y `es` | Librería por decidir (§17) |
| Logros | **Lotes de ~12 juegos** pedidos por el cliente | `GetAchievementsProgress` no funciona con key de desarrollador (§16) |
| Historial | **Solo con login y opt-in** (fase 4) | No guardar datos de terceros sin consentimiento |
| Tests | Vitest + MSW 3 + fixtures anonimizados | §13 |

## 3. Stack (versiones a 2026-10-07)

React 19.3 · Vite 8.3 · TypeScript · Hono 4.13 · Zod 4.6 · TanStack Query 5.104 · Motion 14 · GSAP 3.15 + `@gsap/react` · Recharts 3.10 · Vitest 5 · MSW 3 (ESM-only, Node ≥ 22.12) · `sass` · pnpm (como en tus otros repos).

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
| `IStoreBrowseService/GetItems` | nombre, precio, assets en lote | no | ~150 ids por llamada; con 300 da 400 (URL larga); `Cache-Control: public, max-age=120` |
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
- **Horas:** en 26 de 334 juegos `playtime_forever` ≠ suma de plataformas + `playtime_disconnected`. `playtime_forever` es la verdad; el desglose por plataforma es aproximado.
- **Juegos sin jugar:** `rtime_last_played` vale 0 en los 217 juegos a 0 min.
- **`has_community_visible_stats`:** ausente (no `false`) en 30 de 334 juegos. Tratar "ausente" como "sin stats".
- **Logros ocultos:** vienen con `description` vacía.
- **Sin caché gratis:** la Web API responde `Cache-Control: no-cache`.
- **429:** HTTP 429 con cabecera `x-eresult: 84`, cuerpo `{"response":{}}` y **sin `Retry-After`**. El bucket parece compartido. Se recupera en menos de 1 min (verificado con curl por el agente, endpoint sin key).
- **Datos personales en respuestas:** `GetPlayerSummaries` trae `realname`, avatar y URL del perfil.

### 5.4 Perfil privado: la regla es decidir por el cuerpo, nunca solo por el status HTTP

| Caso | Respuesta | Fiabilidad |
|---|---|---|
| Wishlist privada | 200, `{"response":{}}`, `x-eresult: 15` | (verificado) |
| Wishlist pública y vacía | 200, `{"response":{}}`, `x-eresult: 1` | (verificado) |
| `GetOwnedGames`, perfil o "game details" privado | 200, `{"response":{}}` (sin `game_count`) | (secundaria) |
| `GetOwnedGames`, público sin juegos | 200, `{"response":{"game_count":0}}` | (secundaria) |
| `GetPlayerAchievements`, perfil privado | 403, `"Profile is not public"` | (secundaria) |
| `GetPlayerAchievements`, juego sin stats | 400, `"Requested app has no stats"` | (secundaria) |
| `GetPlayerAchievements`, poseído y nunca lanzado | 500 | (secundaria) |

Que `communityvisibilitystate` sea 3 **no** implica biblioteca visible: "game details" es un ajuste aparte. El spike confirma todo esto con la key real (§14).

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
- Datos de tu biblioteca de ejemplo: 217 de 334 sin tocar, 16 probados.

**Métricas derivadas:** horas totales, horas por año de última partida, reparto por plataforma (aproximado), % de backlog, **valor sin jugar** (suma del precio actual de Sin tocar + Probado vía `GetItems`, fase 3), logros desbloqueados, % medio, logros raros (< 5 %) y actividad por fecha de desbloqueo.

## 8. Caché

Dos niveles. **El CDN es optimización, nunca fuente de verdad:** es regional y "best-effort". La correctitud descansa en Redis.

### Nivel 1 — CDN

Respuestas `GET` públicas de `/api` con `Cache-Control: s-maxage=…, stale-while-revalidate=…`. Requisitos del CDN: solo GET/HEAD, sin `Authorization` ni `Set-Cookie`. Máximo 10 MB por entrada.

### Nivel 2 — Upstash Redis (free: 256 MB, 500 k comandos/mes)

**Presupuesto de comandos:** guardar los logros de un usuario como **un hash** (`HSET` con varios campos = 1 comando, `HGETALL` = 1 comando) en lugar de una clave por juego. Guardar la biblioteca **normalizada**, no el JSON crudo (~190 KB → decenas de KB).

| Dato | Clave (propuesta) | TTL |
|---|---|---|
| Vanity → ID | `vanity:{vanity-en-minúsculas}` | 24 h – 7 d |
| Perfil y privacidad | `profile:{steamid}` | 1 h |
| Biblioteca normalizada | `lib:{steamid}` | 30–60 min (+ SWR en CDN) |
| Logros por usuario | hash `ach:{steamid}`, campo = appid | invalidación por huella, máximo 7 d |
| Esquema (iconos, `hidden`) | `schema:{appid}` | 30 d (compartido) |
| Textos localizados | `txt:{appid}:{lang}` | 30 d (compartido) |
| Rareza global | `rare:{appid}` | 7 d (compartido) |
| Ítems de tienda (precio) | `item:{appid}:{lang}:{cc}` | 6–24 h |
| Resultado negativo ("privado", "no encontrado") | dentro de `profile:` | 5–60 min |
| Presupuesto diario de Steam | `budget:steam:{YYYYMMDD}` | contador con expiración diaria |
| Cooldown de refresco | `refresh:{steamid}` | 10 min |

- **Invalidación de logros por "huella":** cada campo del hash guarda `hash(playtime_forever, rtime_last_played)` del momento en que se pidió. Si la biblioteca nueva trae la misma huella, no se vuelve a pedir ese juego. Un refresco normal cuesta unas pocas llamadas.
- **Idioma:** el progreso por usuario va **sin idioma** (`apiname`, `achieved`, `unlocktime`). Los textos se guardan por `(appid, lang)` y se rellenan de forma oportunista con la primera respuesta de `GetPlayerAchievements`. La rareza y el esquema no dependen del idioma.
- **Juegos sin stats** (400 "no stats"): se guarda un marcador `none` en el hash para no preguntar de nuevo.
- **Refresco manual:** botón con cooldown por perfil (`refresh:{steamid}`).
- **Normalizar siempre** el SteamID antes de usarlo como clave (un vanity y su ID resuelto deben compartir caché de datos).
- **Por verificar en el spike:** tamaño máximo de valor en Upstash free.

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
- Router de cliente: propuesta TanStack Router (parámetros de búsqueda tipados para filtros en la URL, misma familia que Query). **No investigado** → decidir en el spike.

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
UI en `en` (por defecto) y `es`. El idioma de la UI se traduce al parámetro `l=` de Steam (`english`, `spanish`). El país para precios (`cc`) se deriva del idioma con selector manual; entra en la clave de caché de ítems.

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

- **Fuente:** la colección de Postman `v2Steam Web API.postman_collection.json` (no entra al repo). Cada ejemplo está en `item[].response[].body`.
- **Script de extracción** (Node sin dependencias): recorre `item[]`, parsea cada `body` (tolerando vacíos o no JSON) y escribe `fixtures/<carpeta>-<nombre>.<código>.json` con claves ordenadas para diffs limpios.
- **Anonimizado:** sustituir con un **mapa de IDs ficticios consistentes**, no con hashes (los SteamID son enumerables y un hash sin sal se revierte). Tocar `steamid`, `personaname`, `realname`, avatares, `profileurl`, `primaryclanid`.
- **Datos de biblioteca:** la lista de juegos y horas sigue siendo tuya. Los fixtures **completos van fuera del repo (gitignored)**; en el repo, solo **recortes o conjuntos sintéticos**. Las fixtures de 1 MB (wishlist) se cargan de forma perezosa.
- **Test de CI** que falla si aparece tu SteamID real o tu `realname` en cualquier fichero versionado.
- **Contrato:** cada fixture debe parsear con su schema Zod, y el normalizador debe producir el dominio esperado.
- **Unitarios:** clasificación de backlog (todas las ramas de §7), validación de entrada, huellas de caché.
- **MSW 3:** `setupServer` en Vitest y `setupWorker` en dev/modo demo, con los mismos handlers. Soporte de streaming sin confirmar (no lo necesitamos: usamos lotes).
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

**0B. Steam con la key real**
6. Poner tu propio perfil en privado, solo amigos y con "game details" privado, y registrar HTTP, cuerpo y `x-eresult` de `GetPlayerSummaries`, `GetOwnedGames`, `GetPlayerAchievements`, `GetWishlist` y `GetWishlistItemCount` (cierra la tabla de §5.4).
7. Códigos reales de un juego sin logros y de uno poseído pero nunca lanzado.
8. `GetItems`: tamaño máximo de lote que funciona, campos necesarios y precio por `cc`.
9. Comportamiento del 429 con key.

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

- Que la combinación SPA + `/api` + Hono en **un solo proyecto** de Vercel funcione sin fricción (solo vista en fuentes de terceros) → spike 0A.
- Respuestas de privacidad con key real (§5.4) → spike 0B.
- Tamaño máximo de lote de `GetItems` y de valor en Upstash → spike.
- Si una respuesta en streaming se cachea en el CDN, y si el tope de 4,5 MB aplica al streaming (no lo usamos, pero conviene saberlo).
- Mínimo real del vanity (2 o 3 caracteres).
- Cuota gratuita y tamaño total de Runtime Cache en Hobby.
- Si Valve tolera de hecho las consultas a terceros.
- **Decisiones abiertas:** librería de i18n (`react-i18next` o Lingui), router de cliente (TanStack Router propuesto), licencia del repo (sin licencia = visible pero no reutilizable), restricciones de PR en GitHub (revisar los ajustes del repo), dominio propio frente a `*.vercel.app`, y si fusionar *Pausado* con *En curso*.

## 18. Para retomar

1. Crear el repo vacío y copiar este fichero a la raíz.
2. Añadir a `.gitignore`: `.env*`, la colección de Postman, `fixtures/full/` y `.vercel/`.
3. Empezar por el spike de la fase 0 (§14), sin scaffolding de producto hasta pasar la puerta de decisión.
