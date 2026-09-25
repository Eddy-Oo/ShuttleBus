# Render deployment — Sprint 1 + Sprint 2 (npm)

`render.yaml` defines:

- **shuttletrack-api** — Node/Express + Socket.IO on one HTTP server, **one instance**.
- **shuttletrack-db** — PostgreSQL 16; migrations enable PostGIS and create tables, indexes and constraints.
- **shuttletrack-web** — Vite static site (Public Web + Admin Dashboard) with SPA rewrite `/* → /index.html`.

All commands use **npm** (`npm ci` from `package-lock.json`). `NODE_VERSION=22` is pinned per service.

> The Blueprint uses paid plans for the API and database because Render's `preDeployCommand` (used for migrations) is only available on paid web services. Check current pricing before applying. For a free trial, see [Free-tier variant](#free-tier-variant).

## 1. Create the Blueprint

1. Push the repository to GitHub (including `package-lock.json`).
2. Render → **New → Blueprint** → select the repo (root `render.yaml`).
3. Fill in the prompted variables:

| Service | Variable | Value |
|---|---|---|
| API | `ADMIN_USERNAME` | Initial admin username |
| API | `ADMIN_PASSWORD` | ≥ 12 characters |
| API | `CORS_ORIGINS` | Exact website origin, e.g. `https://shuttletrack-web.onrender.com` (comma-separated, no trailing slash) |
| Web | `VITE_API_URL` | API origin, e.g. `https://shuttletrack-api.onrender.com` (no `/api`) |
| Web | `VITE_SOCKET_URL` | Same API origin (no `/socket.io`) |

Render supplies `DATABASE_URL` and generates `JWT_SECRET`. Never put secrets in `VITE_*` (they are public in the bundle).

Render may assign a different hostname than the service name. After the first deploy, copy the **actual** URLs from each service page, update `CORS_ORIGINS` / `VITE_*`, then redeploy the API and rebuild the website. The website build (`npm run build:render`) deliberately fails if the VITE URLs are missing, not HTTPS, or localhost — so you never ship mock mode by accident.

## 2. What each deploy does

| Step | Command |
|---|---|
| API build | `npm ci --include=dev && npm run build:api` (Prisma generate + `tsc`) |
| API pre-deploy | `npm run db:deploy && npm run seed:admin --workspace @shuttletrack/backend` |
| API start | `npm run start:api` |
| Web build | `npm ci --include=dev && npm run build:render` |

`seed:admin` only creates the admin if missing; it never resets a password and never inserts demo catalog data.

For a **demo** deployment, load the sample catalog once (API service → Shell, repo root):

```bash
npm run db:seed
```

(3 routes, 10 bilingual stops, 4 vehicles, ordered RouteStops, straight-line sample geometry.) Do not re-run it after editing the sample data.

## 3. Verify

1. `https://<api>/health` → `{"success":true,"data":{"status":"ok","database":"ok",…}}` (503 if the DB is unreachable).
2. `https://<api>/api/routes` → active routes.
3. Website → `/login` → admin credentials → Dashboard shows route lines and a **Live** badge.
4. Create/edit a route, stops and a vehicle; assign the route; add/reorder stops; in the route edit dialog use **Generate from stops** to save a geometry.
5. Public page → select the route → line + ordered stops.
6. Run the simulator locally against the API (`SIM_API_URL=https://<api>`), see [SIMULATOR.md](SIMULATOR.md).
7. Both the public page and the dashboard show the moving marker; the dashboard shows the active trip; refreshing restores the marker.

## Socket.IO notes

- Use a Socket.IO v4 client (not raw WebSocket). Path `/socket.io`, same origin as the API.
- Browsers only subscribe; only vehicle JWTs can publish.
- Keep `numInstances: 1`. Horizontal scaling requires a shared adapter (e.g. Redis) and sticky sessions.
- On Render's free web instances the service sleeps after inactivity; the first request/socket after sleep takes a while and sockets reconnect automatically.

## Free-tier variant

Free web services cannot run `preDeployCommand`. To try the stack for free, change the API service to:

```yaml
    plan: free
    buildCommand: npm ci --include=dev && npm run build:api
    startCommand: npm run db:deploy && npm run seed:admin --workspace @shuttletrack/backend && npm run start:api
```

remove `preDeployCommand`, and set the database `plan: free`. Free Postgres databases expire after a limited period and free web services spin down when idle — fine for a class demo, not for production.

## Troubleshooting

| Symptom | Check |
|---|---|
| Website shows mock data | Set both VITE URLs and rebuild (Clear build cache & deploy) |
| Browser fetch fails, API healthy | `CORS_ORIGINS` exactly matches the website origin (scheme, host, no slash) |
| Socket stays "Connecting" | `VITE_SOCKET_URL` is the API origin; API awake; CORS origin set |
| `npm ci` fails | `package-lock.json` committed and in sync (`npm install` locally, commit the lockfile) |
| Vehicle auth fails | Vehicle `active`, correct ID, latest device token |
| `TRIP_ALREADY_ACTIVE` | End the trip from the Admin Dashboard |
| Empty route line | Geometry must be a LineString of `[longitude, latitude]`; or add ≥2 stops (dashed fallback) |
| Migration failure | Pre-deploy logs; PostGIS is supported on Render Postgres 13+ |
| Deep links 404 | Keep the static site `/* → /index.html` rewrite |
