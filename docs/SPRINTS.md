# Sprint 1, Sprint 2, and Group A Sprint 2.5

This document maps the sprint requirements to the current ShuttleTrack repository. A listed implementation means code is present; it does not by itself prove that the feature has passed a complete local, physical-device, or staging integration test.

## Sprint 1 — Foundation and Core System

| Requirement | Implementation |
|---|---|
| Clone/configure/run | Root README, npm workspaces (`package-lock.json`), environment examples, PostGIS Docker Compose |
| Vehicle, Route, Stop, RouteStop | `backend/prisma/schema.prisma` and versioned migrations |
| Migrations and development fixtures | `backend/prisma/migrations/`, `backend/prisma/seed.ts` |
| Core CRUD | `backend/src/http/catalog-routes.ts` |
| Input validation | Zod in `backend/src/validation/schemas.ts` |
| Consistent error responses | `backend/src/http/errors.ts`; documented API error codes in `backend/README.md` |
| Health/database check | `GET /health` |
| Admin real API and assignment | `src/api/backendApi.ts`, Admin Vehicles/Routes/Stops pages |
| RouteStop membership and order | Admin Routes page and route-stop endpoints |
| Public active routes, bilingual stops, map | `src/pages/HomePage.tsx`, map components |
| Test coverage | Unit/adapter tests and opt-in database integration suite; see [TESTING.md](TESTING.md) |

Development mock mode remains available when `VITE_API_URL` is unset. It is not the real-backend sprint demonstration mode. Configure real API URLs for integration testing.

## Sprint 2 — Mobile Foundation, Realtime, and Route Visualization

### Official Sprint 2 requirements and repository implementation

#### Backend

| Requirement | Implementation / evidence |
|---|---|
| Basic Admin and Vehicle authentication | JWT authentication and hashed vehicle device credentials in backend auth/catalog routes |
| Start Trip / End Trip | `backend/src/http/trip-routes.ts` |
| Set up Socket.IO | `backend/src/realtime/socket.ts` |
| Define Vehicle location events | `docs/SOCKET_IO.md` |
| Broadcast Vehicle locations to Public and Admin | Authenticated vehicle publisher and read-only web subscribers in realtime socket implementation |
| Provide Mobile APIs for Vehicle and Route data | `/api/auth/vehicle/login`, `/api/vehicles/me`, `/api/routes`, and route detail APIs |
| Support Route Geometry | GeoJSON LineString geometry stored on Route and served by backend |

#### Public Web

| Requirement | Implementation / evidence |
|---|---|
| Load Routes and Stops from Backend | Public API adapter and Home page |
| Select a Route | Public route selection |
| Display Stops in correct `stopOrder` | Ordered route-stop data |
| Display Stops on map | Public map component |
| Draw selected Route path | Route geometry line, with ordered-stop fallback |
| Connect using Socket.IO | Shared realtime hook |
| Receive realtime Vehicle locations | Realtime location subscription |
| Display/update Vehicle markers | Markers update in place and are filtered to the selected route |

#### Admin Dashboard

| Requirement | Implementation / evidence |
|---|---|
| Display Routes and Vehicles on map | Admin Dashboard map |
| Draw Route paths | GeoJSON route geometry and route-stop fallback |
| Connect using Socket.IO | Shared realtime hook |
| Receive realtime Vehicle locations | Realtime location subscription |
| Display/update Vehicle markers | Live markers on dashboard |
| Basic Vehicle / Active Trip status | Vehicle and Active Trip status table; Live / Waiting for GPS / Idle and last update |

#### Mobile

The repository now contains a Flutter driver application in `mobile/`. This is beyond the original mobile learning/preparation handoff described in earlier project notes.

| Requirement | Implementation / evidence |
|---|---|
| Start Mobile application | Flutter project in `mobile/` |
| Project structure and navigation | `mobile/lib/main.dart` and Flutter project structure |
| Connect to Backend API | Configurable `API_URL` and HTTP API client |
| Load Vehicle and Route information | Vehicle identity and route loading APIs |
| Prepare authentication | Vehicle ID + device token login; JWT saved with secure storage |
| Start Trip / End Trip | Trip start and end API calls |
| GPS permission and location handling | Geolocator permission checks and foreground GPS stream on native platforms; platform permission declarations must be verified on the target device |

**Mobile tracking limitation:** The current implementation is foreground tracking while the app is open and a trip is active. Background GPS tracking is not enabled. A browser run uses simulated route movement; it is not evidence of physical-phone GPS.

#### Route Visualization

| Requirement | Implementation / evidence |
|---|---|
| Provide Route Geometry for each Route | GeoJSON LineString field on Route |
| Load selected Route Geometry | Route API provides geometry |
| Draw Route as a line on map | Public and Admin map render route lines |
| Display Stops together with Route | Ordered stops are rendered with route line |

Route geometry can be edited in Admin Routes; a helper can generate a line from ordered stops when geometry is absent. When no geometry is provided, the map can use a dashed fallback through stops.

#### Vehicle Simulator

The `simulator/` application sends test vehicle locations to the backend. Run it with `npm run simulate`; it is used to test persistence, Socket.IO broadcasting, and Public/Admin map updates without relying on physical mobile GPS. See [SIMULATOR.md](SIMULATOR.md).

### Sprint 2 demonstration target

```text
Select Route
    ↓
Display Route + Stops
    ↓
Simulator sends Vehicle Location
    ↓
Backend receives and persists location
    ↓
Socket.IO broadcasts location
    ↓
Public Web + Admin Dashboard
    ↓
Vehicle Marker updates in realtime
```

Use [SIMULATOR.md](SIMULATOR.md) and [TESTING.md](TESTING.md) for the demonstration and acceptance checks.

## Group A — Sprint 2.5 Recovery, Integration, and Deployment

Sprint 2.5 should finish unfinished work from Sprint 1 and Sprint 2 and make the project reliable for team development. Do not add major new features.

### Group A priority requirements

1. Complete GPS receiving on the Flutter Mobile app using a physical phone.
2. Send real GPS data from Mobile to the Backend for the authenticated vehicle and active trip.
3. Confirm the Backend receives, validates, persists, and broadcasts GPS through Socket.IO.
4. Confirm Public Web receives and displays realtime vehicle locations.
5. Confirm Admin Dashboard receives and displays realtime vehicle locations and trip status.
6. Improve the main Public and Admin layouts so the map is a clear main feature.
7. Complete and verify Mobile login and authentication.
8. Verify the full Mobile → Backend → Socket.IO → Public/Admin integration.
9. Deploy and verify the shared Staging environment.
10. Verify local setup, recovery after connection interruption, and clean-clone onboarding for another team member.

### Local development and shared staging

The expected team workflow is:

```text
Clone
  ↓
Configure .env
  ↓
Run Docker / local services
  ↓
Frontend ↔ Backend ↔ Database
  ↓
Connect Mobile
  ↓
Deploy and verify Staging
  ↓
Develop together
```

The intended shared service layout is Public Web + Admin Web + Flutter → Staging Backend (Render) → Neon PostgreSQL, with Socket.IO broadcasting live vehicle updates to the web clients. Confirm the current staging URLs and environment settings with the team; deployment configuration files alone do not prove that the staging flow has passed testing.

### Basic CI/CD expectation

```text
Code / Pull Request
        ↓
Review and automated checks
        ↓
Merge
        ↓
Deploy to Staging
        ↓
Verify integration
```

At minimum, builds and basic automated checks should run before merging. Store secrets in local environment files or hosting-provider environment settings; never commit credentials.

### Group A Definition of Done

- [ ] Another team member can clone the repository and follow the setup instructions.
- [ ] Local backend and database start and connect successfully.
- [ ] Public Web and Admin Dashboard connect to the real backend.
- [ ] Flutter vehicle login and authentication work.
- [ ] A physical phone obtains GPS coordinates with the required permissions.
- [ ] Mobile sends GPS with the correct vehicle ID, trip ID, and timestamp.
- [ ] Backend persists and broadcasts the received GPS through Socket.IO.
- [ ] Public Web map updates the vehicle marker in realtime.
- [ ] Admin Dashboard map and vehicle/trip status update in realtime.
- [ ] Network interruption and reconnect/recovery are tested.
- [ ] Shared staging services are deployed and accessible to team members and mentors.
- [ ] Basic build/test checks run through the agreed team workflow.
- [ ] A second team member successfully repeats the setup and integration test.

## Out of Scope for Sprint 2.5

Do not prioritize LoRaWAN, ESP32/IoT modules, advanced ETA, large new modules, or production release. Focus on:

**Fix → Integrate → Standardize → Deploy → Continue**
