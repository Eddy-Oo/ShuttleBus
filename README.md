# ShuttleTrack — Group A

Campus shuttle bus tracking system for Rangsit University. **Group A's Sprint 2.5 focus is recovery, integration, and staging deployment**: connect the Flutter driver app, backend, database, Public Web, and Admin Dashboard into one working system. This sprint is for completing and stabilizing existing work, not adding major new features.

## Group A — Sprint 2.5 Goal

Our target end-to-end flow is:

```text
Flutter Driver App (real GPS)
          |
          v
     Backend API
          |
          v
       Neon DB
          |
     Socket.IO
       /     \
      v       v
 Public Web  Admin Dashboard
   live map     live map
```

By the end of this sprint, another Group A member should be able to clone the repository, configure environment variables, start the project, connect to shared staging services, and continue development without rebuilding the setup manually.

### Group A Priority Checklist

| # | Requirement | What must be demonstrated |
|---|---|---|
| 1 | Complete Mobile GPS receiving | Flutter obtains real device coordinates with permission granted. |
| 2 | Send GPS to Backend | Authenticated mobile app sends coordinates for the correct vehicle and active trip. |
| 3 | Backend realtime handling | Backend validates, receives, persists, and broadcasts GPS through Socket.IO. |
| 4 | Public Web integration | Public map receives and displays the live vehicle location. |
| 5 | Admin Dashboard integration | Admin map/dashboard receives and displays the live vehicle location and trip status. |
| 6 | Main layout and map visibility | Public and Admin layouts make the map a clear main feature. |
| 7 | Mobile login/authentication | Vehicle ID and device token login work; JWT is stored securely and validated. |
| 8 | Full integration test | Demonstrate Mobile → Backend → Socket.IO → Public/Admin, and verify the database record. |
| 9 | Shared staging deployment | Deploy and verify the connected web, API, and database environment for team/mentor access. |
| 10 | Recovery and team setup | Test reconnect/recovery and let another member clone, configure, and run the project. |

**Current tracking limitation:** The Flutter implementation is intended for foreground tracking while the app is open and a trip is active. Background GPS tracking is not enabled. Physical-device GPS, end-to-end staging behavior, and clean-clone setup must be tested before they are marked complete.

## Project Features

- **Public Web:** Active shuttle routes, stops, route lines, and live vehicle locations.
- **Admin Dashboard:** Vehicle, route, stop, device credential, and active trip management.
- **Backend API:** REST API built with Node.js, Express, Prisma, and PostgreSQL/PostGIS.
- **Real-time tracking:** Socket.IO receives authenticated vehicle GPS updates, stores locations, and broadcasts updates to web clients.
- **Driver Mobile App:** Flutter app for vehicle login, assigned route loading, trip start/end, and foreground GPS tracking.
- **Vehicle Simulator:** Simulates vehicle movement for development and demonstrations without a physical phone.

## Technology Stack

| Area | Technologies |
|---|---|
| Public Web and Admin Dashboard | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL, PostGIS, Prisma |
| Real-time communication | Socket.IO |
| Driver mobile app | Flutter, Dart, Geolocator, flutter_secure_storage |
| Staging deployment | Render (API), Neon PostgreSQL (database); web hosting configured for the team |
| Local development | Docker Compose, npm |

## Sprint History

### Sprint 1 — Foundation and Core System

- Repository and development environment setup
- Vehicle, Route, Stop, and RouteStop database models
- Database migrations and seed data
- Validated CRUD APIs
- Admin management pages connected to backend
- Public routes, stops, and map display

### Sprint 2 — Real-time Tracking

- Admin and vehicle authentication
- Vehicle device-token generation and JWT login
- Start-trip and end-trip APIs
- Authenticated Socket.IO GPS updates
- Vehicle location persistence
- Live vehicle markers on Public Web and Admin Dashboard
- Route geometry and vehicle simulator

### Sprint 2.5 — Recovery, Integration, and Deployment Foundation

Group A is prioritizing the mobile-to-web GPS flow, the visibility of maps in Public and Admin, mobile authentication, full-stack verification, and shared staging deployment. Do not treat a feature as complete just because code exists; demonstrate it working across the connected services.

## Getting Started — Local Development

### Requirements

- Node.js 22 or 24
- npm
- Git
- Docker Desktop (for local PostgreSQL/PostGIS)
- Flutter SDK (for the driver app)

This repository uses npm workspaces and `package-lock.json`. Use npm rather than pnpm or yarn.

### 1. Clone and install

```bash
git clone https://github.com/Eddy-Oo/ShuttleBus.git
cd ShuttleBus
npm install
```

### 2. Configure the database

Choose **one** database option.

**Option A — Local PostgreSQL/PostGIS with Docker Compose**

```bash
cp backend/.env.example backend/.env
npm run db:up
```

**Option B — Shared Neon PostgreSQL**

Create or use the team's Neon project. Set the pooled connection string as `DATABASE_URL` and the direct connection string as `DIRECT_URL` in `backend/.env`. Do not run `npm run db:up` when using Neon. Follow [docs/NEON.md](docs/NEON.md).

For either option, edit `backend/.env` and set the required secrets, including a strong `JWT_SECRET` (32+ characters) and `ADMIN_PASSWORD` (12+ characters). Then run:

```bash
npm run db:generate
npm run db:deploy
npm run db:seed
```

Do not commit `.env` files or real credentials to GitHub.

### 3. Start Backend and Web

Open two terminal windows from the repository root.

**Terminal 1 — Backend API and Socket.IO**

```bash
npm run dev:api
```

The local API runs at `http://localhost:3000`.

**Terminal 2 — Public Web and Admin Dashboard**

Create the root environment file:

```bash
cp .env.example .env
```

Set these values in the root `.env`:

```env
VITE_API_URL=http://localhost:3000
VITE_SOCKET_URL=http://localhost:3000
```

Then start the web app:

```bash
npm run dev
```

Open `http://127.0.0.1:5173`. Sign in at `/login` with the `ADMIN_USERNAME` and `ADMIN_PASSWORD` configured in `backend/.env`.

> **Important:** If `VITE_API_URL` is not configured, the web app may use its in-memory mock API. Use the real backend URLs for Group A's integration test.

## Getting Started — Flutter Driver App

The Flutter app is in `mobile/`. Install the Flutter SDK, then run:

```bash
cd mobile
flutter pub get
flutter analyze
```

If platform folders do not exist yet, generate them:

```bash
flutter create --platforms=android,ios .
```

Configure API and Socket.IO addresses for the target device:

| Target | API URL |
|---|---|
| Android emulator | `http://10.0.2.2:3000` |
| iOS simulator | `http://127.0.0.1:3000` |
| Physical phone | `http://YOUR_COMPUTER_LAN_IP:3000` |

Example for Android emulator:

```bash
flutter run --dart-define=API_URL=http://10.0.2.2:3000 --dart-define=SOCKET_URL=http://10.0.2.2:3000
```

For a physical phone, use your computer's LAN IP and connect both devices to the same Wi-Fi network. Configure Android/iOS location permissions as described in [mobile/README.md](mobile/README.md).

In the Admin Dashboard, open **Vehicles** and generate a device token for the selected vehicle. Copy the raw token when shown; it is displayed only once. Sign in to the Flutter app using that vehicle ID and device token.

## Group A — End-to-End Integration Test

Use a physical phone for the real GPS test. A browser or simulator-based location demo does not prove physical-device GPS works.

1. Start the backend and confirm its health endpoint responds.
2. Confirm the backend is connected to the intended local or staging PostgreSQL database.
3. Sign in to the Flutter app using a valid vehicle ID and device token.
4. Grant location permission and start a trip outdoors or where the phone can obtain a GPS fix.
5. Confirm the app sends coordinates with the correct vehicle ID, active trip ID, and timestamp.
6. Confirm the backend accepts the Socket.IO event and acknowledges it.
7. Confirm the new location is persisted in the database.
8. Confirm the Public Web map updates the vehicle marker.
9. Confirm the Admin Dashboard map and vehicle/trip status update.
10. Temporarily interrupt network access, restore it, and verify the app reconnects and resumes updates.
11. Repeat using another team member's clean clone and setup instructions.
12. Repeat the integration flow against the shared staging environment.

Example SQL to inspect recent location records (use the actual database connection configured for the test):

```sql
SELECT
  "vehicleId",
  "tripId",
  "latitude",
  "longitude",
  "recordedAt"
FROM "VehicleLocation"
ORDER BY "recordedAt" DESC
LIMIT 10;
```

## Realtime Simulator

The simulator is useful for checking backend broadcasting and the two web maps before physical-phone testing:

```bash
cp simulator/.env.example simulator/.env
```

Configure the vehicle ID and admin credentials in `simulator/.env`, then run:

```bash
npm run simulate
```

Open the Public Web map and `/admin/dashboard` to observe the simulated vehicle. See [docs/SIMULATOR.md](docs/SIMULATOR.md).

## Shared Staging and CI/CD

Group A needs one shared staging environment accessible to team members and mentors. The intended service layout is:

```text
Public Web ──┐
Admin Web  ──┼──> Staging Backend (Render) ──> Neon PostgreSQL
Flutter    ──┘             |
                         Socket.IO
```

Use the team's agreed web hosting provider for the Public Web and Admin Dashboard. The repository includes a Render Blueprint in `render.yaml`; follow [docs/RENDER.md](docs/RENDER.md) and confirm the actual deployed service URLs and environment variables with the team.

Basic CI/CD workflow:

```text
Commit / Pull Request
        ↓
Review and automated checks
        ↓
Merge to shared branch
        ↓
Deploy to staging
        ↓
Verify API, database, web, and mobile integration
```

At minimum, verify that the web and backend builds and automated tests pass before merging. Do not commit secrets; configure staging secrets in the hosting provider's environment settings. A successful build or deployment alone does not prove the complete GPS integration works.

## Useful Commands

| Command | Purpose |
|---|---|
| `npm install` | Install web/backend dependencies |
| `npm run dev` | Start Public Web and Admin Dashboard |
| `npm run dev:api` | Start backend API and Socket.IO |
| `npm run build` / `npm run build:api` | Build web / backend |
| `npm run typecheck` | Type-check the web application |
| `npm test` | Run web and backend unit/adapter tests |
| `npm run test:simulator` | Run simulator and Socket.IO transport tests |
| `npm run test:live` | Run database/API/realtime integration tests (requires a test database) |
| `npm run db:up` / `npm run db:down` | Start / stop local database services |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:deploy` | Apply database migrations |
| `npm run db:seed` | Seed development data |
| `npm run simulate` | Start the vehicle simulator |
| `cd mobile && flutter pub get` | Install Flutter dependencies |
| `cd mobile && flutter analyze` | Analyze Flutter source code |
| `cd mobile && flutter run` | Run the driver app with configured API URLs |

## Definition of Done — Group A

Sprint 2.5 is complete when:

- [ ] A team member can clone, configure, and run the local project.
- [ ] Docker Compose can start the local database, and the backend connects to it.
- [ ] Public Web and Admin Dashboard use the real backend, not mock data.
- [ ] Flutter vehicle login and authentication work.
- [ ] A physical phone sends real GPS coordinates to the backend.
- [ ] Backend persists and broadcasts GPS updates through Socket.IO.
- [ ] Public Web and Admin Dashboard both display the live vehicle location.
- [ ] The map is a clear main feature in both web interfaces.
- [ ] Network interruption and reconnection are tested.
- [ ] Shared staging services are deployed and accessible to the team/mentors.
- [ ] Basic automated checks/builds run through the team's agreed CI workflow.
- [ ] A second team member successfully repeats the setup and integration test.

## Not in Sprint 2.5 Scope

Do not spend this sprint on major new features such as LoRaWAN, ESP32/IoT modules, advanced ETA, large new modules, or production release. Focus on:

**Fix → Integrate → Standardize → Deploy → Continue**

## Documentation

- [Sprint implementation map](docs/SPRINTS.md)
- [Testing and acceptance checklist](docs/TESTING.md)
- [Flutter mobile app setup](mobile/README.md)
- [Socket.IO event and payload contract](docs/SOCKET_IO.md)
- [Neon database setup](docs/NEON.md)
- [Render deployment guide](docs/RENDER.md)
- [Vehicle simulator guide](docs/SIMULATOR.md)
- [Project details](PROJECT.md)
