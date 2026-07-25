# FP Clash — Web Client

Companion web client for **Siegebreak / FP Clash**, a Clash-Royale-style game.
Built with Vite + React + TypeScript. It talks to the game backend in
`../services/`.

## Quick start

```bash
cd web
npm install
npm run dev        # http://localhost:5173
```

Set the backend origin (optional — defaults to `http://localhost:8080`):

```bash
cp .env.example .env
# edit VITE_API_URL if your backend runs elsewhere
```

## Scripts

| Command           | What it does                              |
| ----------------- | ----------------------------------------- |
| `npm run dev`     | Start the Vite dev server                 |
| `npm run build`   | Type-check (`tsc --noEmit`) + `vite build`|
| `npm run preview` | Serve the production build locally        |
| `npm test`        | Run the Vitest suite once                 |
| `npm run typecheck` | Type-check only                         |

## Backend connection

The app reads the API origin from `import.meta.env.VITE_API_URL`
(default `http://localhost:8080`) and sends **full-origin** requests to it.
This is the cleaner choice for this repo: the app and backend stay decoupled,
and there is no proxy config to keep in sync.

> **CORS:** the backend in `../services/` ships `@fastify/cors`. It reflects any
> origin by default, or restricts to a comma-separated `CORS_ORIGINS` list (set
> `CORS_ORIGINS=http://localhost:5173` in `services/.env` to pin it to this dev
> server). So cross-origin dev calls (`localhost:5173` → `localhost:8080`) work
> out of the box. A same-origin `server.proxy` block in `vite.config.ts` remains
> available as an alternative.

### Endpoint map

| UI area            | Backend endpoint(s)                                             |
| ------------------ | -------------------------------------------------------------- |
| Login (guest)      | `POST /auth/guest`, `POST /auth/refresh`                       |
| Collection / Decks | `GET /cards`, `GET /players/me/decks`, `POST /players/me/decks`|
| Nav wallet         | `GET /economy/wallet`                                          |
| Queue              | `POST /matchmaking/queue`, `GET /matchmaking/status`, `POST /matchmaking/cancel` |
| Leaderboard        | `GET /leaderboard/:seasonId`                                   |
| Analytics          | `POST /analytics/event` (fired on login, best-effort)         |

## Auth model

- Guest login generates and persists a stable random `deviceId` in
  `localStorage`, then calls `POST /auth/guest`.
- Access + refresh tokens are stored in `localStorage`.
- The API client attaches `Authorization: Bearer <accessToken>` to protected
  calls. On a `401` it performs **one** refresh via the refresh token and
  retries the request; if the refresh fails it clears the session (forcing a
  return to Login).

## Project layout

```
src/
  api/client.ts        Typed fetch wrapper + 401 refresh/retry + endpoint fns
  auth/                Session store (localStorage) + React context/hook
  components/          NavBar, WalletBadge, ProtectedRoute, CardTile
  deck/deckSlots.ts    Pure deck-slot helpers (slot-0 = hero rule)
  pages/               Login, Collection (deck builder), Queue, Leaderboard
  types.ts             Domain types mirroring the backend contract
```

## Tests

`npm test` covers:

- **api client** — bearer token attachment, single refresh + retry on 401,
  session clearing when refresh fails (mocked `fetch`).
- **deck builder** — slot 0 rejects non-hero cards and blocks saving.
- **deck slots** — pure helper behaviour (immutability, completion, validation).
- **Login** — renders and calls `login()` on click.
```
