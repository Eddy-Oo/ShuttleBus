# ShuttleTrack Backend

Node.js/Express + Prisma API for ShuttleTrack, including Postgres/PostGIS migrations, admin and vehicle JWT authentication, trips, route geometry, and Socket.IO vehicle locations.

## Run locally

From the repository root:

```bash
npm install
cp backend/.env.example backend/.env
# Edit backend/.env; set a unique JWT_SECRET and local admin credentials.
npm run db:up          # docker compose (PostGIS)
npm run db:generate
npm run db:deploy      # or db:migrate while authoring migrations
npm run db:seed
npm run dev:api
```

The API listens on `http://localhost:3000`. Keep the root website `.env` configured with `VITE_API_URL` and `VITE_SOCKET_URL` pointing to that origin, then start the frontend with `npm run dev` in another terminal. Inside `backend/` you can also run the workspace scripts directly (`npm run dev`, `npm run seed`, `npm run seed:admin`, `npm test`).

### Validation and error format

All errors are `{ success:false, error, code, details? }`:

| Case | Status | `code` |
|---|---|---|
| Missing/invalid field, bad lat/lng (lat −90..90, lng −180..180), bad GeoJSON, bad stopOrder | 400 | `VALIDATION_ERROR` / `INVALID_STOP_ORDER` |
| `assignedRouteId` references a route that does not exist | 400 | `INVALID_REFERENCE` |
| Malformed JSON | 400 | `INVALID_JSON` |
| Missing/expired token | 401 | `UNAUTHENTICATED` / `INVALID_TOKEN` |
| Wrong role | 403 | `FORBIDDEN` |
| Unknown resource ID | 404 | `NOT_FOUND` |
| Duplicate route name / stop already on route | 409 | `DUPLICATE_RESOURCE` (with `details[].path`) / `DUPLICATE_ROUTE_STOP` |
| Vehicle already on an active trip | 409 | `TRIP_ALREADY_ACTIVE` (enforced by a partial unique index) |
| Delete blocked by trip history | 409 | `RESOURCE_IN_USE` |
| Database down on `/health` | 503 | `DATABASE_UNAVAILABLE` |

RouteStop `stopOrder` is always contiguous `1..N`: adding at an occupied position shifts later stops, and removing a RouteStop **or deleting a Stop** closes the gap.

`seed` creates missing fixtures on a fresh development database: an admin using `ADMIN_USERNAME` / `ADMIN_PASSWORD`, 3 campus routes with GeoJSON LineString geometry, 10 bilingual stops, 4 vehicles, and ordered RouteStops. Existing admin credentials are not reset. Do not rerun the full demo seed after customizing sample stop memberships/order; it may restore sample rows or conflict with the edited order. `seed --admin-only` provisions only a missing admin and is safe for deployment bootstrap. It never provisions a plaintext vehicle token. Create a vehicle token from the admin endpoint below and store the one-time value in the vehicle device securely. Rotating the token revokes existing vehicle JWTs.

## API overview

All endpoints return `{ success, data?, error?, code?, message? }`. Validation failures are `400`, missing/invalid credentials are `401`, authorization failures are `403`, missing records are `404`, and duplicate/constraint conflicts are `409`.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/health` | public | Render health check and database check |
| POST | `/api/auth/admin/login` | public, rate limited | Admin username/password → JWT |
| POST | `/api/auth/vehicle/login` | public, rate limited | Vehicle ID + device token → JWT |
| GET | `/api/auth/me` | admin JWT | Validate admin session |
| GET/POST | `/api/routes` | public read / admin write | List active routes / route CRUD |
| GET/PATCH/DELETE | `/api/routes/:id` | public read / admin write | Route detail and CRUD |
| GET | `/api/routes/:id/stops` | public | Route stops sorted by `stopOrder` |
| POST | `/api/routes/:id/stops` | admin JWT | Add stop at an order |
| DELETE | `/api/route-stops/:id` | admin JWT | Remove stop and close order gaps |
| PATCH | `/api/route-stops/:id/order` | admin JWT | Reorder route stop |
| GET/POST | `/api/stops` | public read / admin write | Stops and CRUD |
| GET/POST | `/api/vehicles` | admin JWT | Vehicles and CRUD |
| POST | `/api/vehicles/:id/device-token` | admin JWT | Rotate a one-time vehicle credential |
| GET | `/api/trips/active` | admin JWT | Active trip overview |
| POST | `/api/trips/start` | vehicle JWT | Start a trip for the authenticated vehicle |
| POST | `/api/trips/:id/end` | assigned vehicle or admin JWT | End a trip |

Create/update route `geometry` as a GeoJSON `LineString`; coordinates are `[longitude, latitude]` pairs. If no geometry is supplied, the website can draw the ordered stop coordinates as a fallback.

## Socket.IO protocol

A vehicle first obtains a JWT from `POST /api/auth/vehicle/login`, then connects to the backend using Socket.IO `auth: { token }`. Authenticated vehicle sockets may emit `vehicle:location:update` with:

```json
{
  "vehicleId": "v-1",
  "tripId": "optional-active-trip-id",
  "latitude": 14.032,
  "longitude": 100.651,
  "speed": 18.4,
  "heading": 92,
  "recordedAt": "2026-09-25T10:00:00.000Z"
}
```

The server verifies that `vehicleId` matches the token, validates coordinates/trip ownership, writes both the latest Vehicle location and history, and broadcasts the canonical payload to the `web` room. Public Web/Admin Dashboard receive `vehicle:location:snapshot` (vehicles currently on an active trip) when they connect and `vehicle:location:update` for subsequent fixes. Broadcast payloads also include `vehicleName` and `routeId` (the active trip's route) so maps can label markers and filter by route. Socket acknowledgement returns `{ success, data }` or `{ success:false, error, code }`. Trip start/end events are also broadcast as `trip:started` / `trip:ended`.

Only vehicle-authenticated sockets can publish positions. Browser sockets may subscribe without credentials because this is public vehicle tracking. Configure `CORS_ORIGINS` to the exact frontend origins before deploying.

## Render

`render.yaml` provisions the Node API, Postgres 16/PostGIS database and static website. Pre-deploy applies migrations and provisions only a missing initial admin; it does not seed demo catalog data or reset existing passwords. API and database use paid plans; review pricing before deployment.

Follow [docs/RENDER.md](../docs/RENDER.md) for service URLs, CORS, HTTPS, frontend build variables, one-time demo seeding and deployment verification. Keep the API at one instance until a shared Socket.IO adapter/sticky-session strategy is added.

Run the vehicle simulator with `npm run simulate` from the root after configuring `simulator/.env`. See [SIMULATOR.md](../docs/SIMULATOR.md) and [TESTING.md](../docs/TESTING.md).
