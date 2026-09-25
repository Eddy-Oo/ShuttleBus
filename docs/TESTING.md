# Sprint verification

## Checks that do not require a database

From the repository root:

```bash
npm ci
npm run db:generate
npm test
npm run test:simulator
npm run typecheck
npm run build:api
npm run build
```

`npm test` covers the existing in-memory CRUD/admin/public data-flow suites, realtime payload parsing, the real-backend frontend adapter with mocked HTTP responses, backend validation and JWT helpers. These are **not** full browser-to-live-database tests.

`npm run test:simulator` covers simulator config (including loops and admin auto-provisioning), geometry interpolation and headings, HTTP errors and real Socket.IO client/server transport with a test server. It does **not** use PostgreSQL or claim to test the production server's persistence logic.

## Real database/API/Socket.IO integration

Use a dedicated disposable database, never the demo or production database. The opt-in test creates isolated fixtures and removes only those fixture IDs. The runner refuses a database whose name does not contain `test`.

```bash
# Start the separate test database, bound only to localhost:5433.
docker compose --profile test up -d --wait postgres-test
cp backend/tests/.env.example backend/tests/.env

# Apply migrations to the test database, NOT the development database.
DATABASE_URL='postgresql://shuttletrack:shuttletrack_test_only@127.0.0.1:5433/shuttletrack_test?schema=public' \
  npm run db:deploy

npm run test:live
```

`backend/tests/.env` sets `ALLOW_DATABASE_TESTS=1` and the test connection URL. Without explicit opt-in, the suite is **skipped**, not passed. No seed or running backend is required: the test creates its own admin fixture and starts the built Express/Socket.IO server on an ephemeral localhost port.

Coverage of `backend/tests/integration.test.mjs`:

- Real database health and admin authentication.
- Auth-required writes, required fields, coordinate validation, duplicate route names, missing IDs.
- Route CRUD, geometry storage, public active-only route lists.
- Stop creation/update/delete and bilingual names.
- RouteStop add, duplicate membership rejection, invalid ordering, reordering, removal.
- Vehicle CRUD, route assignment, private admin reads and credential provisioning.
- Unknown `assignedRouteId` → 400 `INVALID_REFERENCE`; unknown vehicle → 404; out-of-range longitude and missing `nameTh` → 400.
- Deleting a Stop that belongs to a route closes the gap in `stopOrder`.
- Vehicle login, trip start/end, duplicate active-trip rejection (sequential and concurrent).
- Broadcast payload includes `routeId`/`vehicleName`; snapshot includes the active `tripId` and drops the vehicle after its trip ends.
- GPS acknowledgement, database history/latest-position persistence, browser broadcast, new-connection snapshot.
- Unauthorized browser publishes, mismatched vehicle IDs, invalid coordinates, stale timestamps.
- Rotation revokes both HTTP credentials and already-connected vehicle publishing.

The test accesses PostgreSQL directly for persistence assertions and scoped cleanup because trip history intentionally restricts normal API deletion. It starts a real server but does not drive the React UI in a browser.

## CI

`.github/workflows/ci.yml` runs on pushes and pull requests. It starts a dedicated PostGIS service, applies migrations, then runs type checks, unit/adapter tests, simulator tests, the database/API/Socket.IO suite and the website build. The workflow is supplied but has not been run in GitHub during this coding session.

## Manual UI acceptance

Use the real API mode (`VITE_API_URL` configured), not mock mode:

| Area | Check |
|---|---|
| Admin catalog | Create/edit/delete Vehicle, Route, Stop; validation errors are visible |
| Assignment | Assign/change/unassign a vehicle's route |
| RouteStop | Add two stops, reorder them, remove one; refresh and verify persisted order |
| Public Web | Active routes only; select route; bilingual stop names and ordered markers |
| Geometry | Selected LineString and stops appear together; coordinates use longitude first in GeoJSON |
| Responsive | Check narrow mobile-width and desktop layouts, scrolling, route selection |
| Realtime | Run simulator; verify marker movement in public and admin tabs |
| Reconnect | Refresh a tab during simulation; snapshot restores latest location |
| Trip state | Dashboard reflects start and completion |
| Security | Anonymous/incorrect-vehicle GPS is rejected; rotated credentials cannot publish |

## Verification status

Run locally against PostgreSQL 17 + PostGIS 3.5 (all migrations applied to a dev and a `*_test` database):

- `npm test` — 7 files / 121 tests pass; `npm run test:simulator` — 6 pass; `npm run test:live` — all 8 subtests pass; `npm run typecheck`, `npm run build:api`, `npm run build` pass.
- A clean copy of the repo passed `npm ci --include=dev && npm run build:api` and `npm run build:render` (with HTTPS VITE URLs), i.e. the Render build commands.
- Browser acceptance with the built site + real API + 3 simulators: route selection, line + ordered bilingual stops, markers moving on Public Web and Dashboard, dashboard route filter, End trip, add/reorder/remove RouteStops, geometry editor validation and "Generate from stops", vehicle route assignment, admin session restore on reload, 390 px mobile layout.

Not verified here: an actual Render deployment and the GitHub Actions run (Docker Compose itself was also not run; a system PostGIS was used instead).
