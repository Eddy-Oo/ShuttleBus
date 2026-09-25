# Sprint 1 and Sprint 2 implementation map

The repository implements the web/backend side of both sprints and provides a simulator for the Sprint 2 demo. Native mobile development remains separate, consistent with the agreed no-mobile-app scope; do not mark the mobile application tasks completed by this repository.

## Sprint 1 — foundation and core domain

| Requirement | Implementation |
|---|---|
| Clone/configure/run | Root README, npm workspaces (`package-lock.json`), env examples, PostGIS Docker Compose |
| Vehicle, Route, Stop, RouteStop | `backend/prisma/schema.prisma` and versioned migrations |
| Migrations and development fixtures | `backend/prisma/migrations/`, `backend/prisma/seed.ts` |
| Core CRUD | `backend/src/http/catalog-routes.ts` |
| Input validation | Zod in `backend/src/validation/schemas.ts` |
| Consistent error responses | `backend/src/http/errors.ts`; 400/401/403/404/409/413/429/500/503 (table in backend/README.md) |
| Health/database check | `GET /health` |
| Admin real API + assignment | `src/api/backendApi.ts`, Admin Vehicles/Routes/Stops pages |
| RouteStop membership and order | Admin Routes page; route-stop endpoints |
| Public active routes, bilingual stops, map | `src/pages/HomePage.tsx`, `LeafletMap.tsx` |
| Test coverage | Existing suites plus adapter tests and opt-in database integration suite; see TESTING.md |

Development mock mode remains available when `VITE_API_URL` is unset. It is not the sprint's real-backend demonstration mode. Render builds require explicit real API URLs.

Validation rules include nonempty names; unique route names; foreign-key validity; finite latitude [-90,90] and longitude [-180,180]; unique route/stop membership; contiguous ordering through membership endpoints; positive integer stop order; hex route color; GeoJSON LineString coordinate validation. Adding at an occupied order inserts/shifts existing stops rather than overwriting them. Vehicles/stops are not globally unique by display name.

## Sprint 2 — realtime and visualization

| Requirement | Implementation |
|---|---|
| Admin and vehicle authentication | JWT REST authentication; hashed vehicle device credentials |
| Start/end trip | `backend/src/http/trip-routes.ts` |
| Mobile-compatible vehicle/route data | `/api/vehicles/me`, `/api/routes`, `/api/routes/:id`, ordered stops |
| Socket.IO location contract | `docs/SOCKET_IO.md`; authenticated vehicle publishes, public read-only subscribers |
| Persistence, broadcast, reconnect snapshot | `backend/src/realtime/socket.ts` |
| Route geometry | GeoJSON LineString stored on Route, edited in Admin Routes (JSON field + "Generate from stops"), drawn solid on maps; dashed fallback through ordered stops when absent |
| Public marker updates | Shared realtime hook + HomePage; markers move in place, filtered to the selected route, removed on `trip:ended` |
| Dashboard maps and active trip status | `src/pages/admin/DashboardPage.tsx`: all route lines, route filter, live markers coloured by route, Vehicle & Active Trip status table (Live / Waiting for GPS / Idle, last update), admin End trip |
| Test vehicle simulator | `simulator/`, `npm run simulate` (looping, headings, optional admin auto-provisioning), `docs/SIMULATOR.md` |
| Render API + database + website | Root `render.yaml`, `docs/RENDER.md` |

## Mobile learning/preparation handoff (not an implemented native app)

1. Learn the chosen mobile framework's project structure, screens/navigation, app state and Git workflow.
2. Configure an API origin outside source code; keep secrets out of bundled public configuration.
3. Provision a vehicle device credential through the admin workflow; exchange it for a JWT.
4. Store device secrets using platform secure storage, not ordinary app preferences.
5. Load `/api/vehicles/me`, the assigned route, geometry and ordered stops.
6. Start a trip with `POST /api/trips/start`, retaining the returned trip ID.
7. Learn foreground/background location permissions, denied/restricted states, accuracy, battery use and platform background limitations.
8. Connect Socket.IO with the JWT; publish validated GPS coordinates with the trip ID and timestamp, handle acknowledgements and connectivity failures.
9. Reauthenticate when expired/revoked; do not impersonate another vehicle or replay stale points blindly.
10. Stop GPS collection and end the trip when appropriate. Handle interruption/recovery explicitly.

Sprint 2 demonstration without mobile hardware: select a route → display route + stops → run simulator → backend persists/broadcasts → both website maps update. Use the acceptance checklist in SIMULATOR.md and TESTING.md. ETA, user geolocation, production fleet scaling and native mobile UI are not delivered here.
