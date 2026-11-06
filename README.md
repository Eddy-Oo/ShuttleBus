# ShuttleTrack

Campus shuttle bus tracking system for Rangsit University. ShuttleTrack connects a driver mobile app, a real-time tracking backend, a public shuttle map, and an administrator dashboard.

## Project Features

- **Public Web:** View active shuttle routes, stops, route lines, and live vehicle locations.
- **Admin Dashboard:** Manage vehicles, routes, stops, route-stop order, device credentials, and active trips.
- **Backend API:** REST API built with Node.js, Express, Prisma, and PostgreSQL/PostGIS.
- **Real-time tracking:** Socket.IO receives authenticated vehicle GPS updates, stores locations, and broadcasts updates to connected web clients.
- **Driver Mobile App:** Flutter app for vehicle login, assigned route loading, trip start/end, and foreground GPS tracking.
- **Vehicle Simulator:** Simulate vehicle movement for development and demonstrations without a physical phone.

## Technology Stack

| Area | Technologies |
|---|---|
| Public Web and Admin Dashboard | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL, PostGIS, Prisma |
| Real-time communication | Socket.IO |
| Driver mobile app | Flutter, Dart, Geolocator, flutter_secure_storage |
| Deployment | Render |
| Hosted database option | Neon PostgreSQL |

## Sprint Overview

### Sprint 1 — Foundation and Core System

- Repository setup and development environment
- Vehicle, Route, Stop, and RouteStop database models
- Database migrations and seed data
- Validated CRUD APIs
- Admin management pages connected to the backend
- Public routes, stops, and map display

### Sprint 2 — Real-time Tracking

- Admin and vehicle authentication
- Vehicle device-token generation and JWT login
- Start-trip and end-trip APIs
- Authenticated Socket.IO GPS updates
- Vehicle location persistence
- Live vehicle markers on the Public Web and Admin Dashboard
- Route geometry and vehicle simulator

### Sprint 2.5 — Recovery, Integration, and Deployment

The integration phase connects the Flutter driver app with the deployed backend, database, Public Web, and Admin Dashboard. The app implementation includes vehicle login, secure JWT storage, route loading, trip controls, and foreground GPS publishing.

**Sprint 2.5 acceptance checks still require end-to-end verification on the target devices and deployment environment:**

- Confirm Android/iOS location permissions and run on a physical phone.
- Start a trip and confirm real device coordinates are sent with the correct vehicle and trip IDs.
- Confirm the location is saved in PostgreSQL/Neon.
- Confirm the Public Web map and Admin Dashboard show the phone's live location.
- Test network interruption, Socket.IO reconnection, and recovery.
- Verify the deployed API, web app, and database work together.
- Clone the repository on a clean machine and follow the setup instructions successfully.

**Tracking limitation:** The current mobile app is designed for foreground tracking while the app is open and a trip is active. Background GPS tracking is not enabled.

See [docs/SPRINTS.md](docs/SPRINTS.md), [docs/TESTING.md](docs/TESTING.md), and [mobile/README.md](mobile/README.md) for implementation details and test instructions.

## Getting Started — Web and Backend

### Requirements

- Node.js 22 or 24
- npm
- Docker Desktop (only if using the local PostgreSQL/PostGIS database)
- Git

The repository uses npm workspaces and `package-lock.json`. Use npm rather than pnpm or yarn.

### 1. Clone and install

```bash
git clone https://github.com/Eddy-Oo/ShuttleBus.git
cd ShuttleBus
npm install
```

### 2. Configure the database

Choose **one** database option.

**Option A — Local PostgreSQL/PostGIS with Docker**

```bash
npm run db:up
cp backend/.env.example backend/.env
```

**Option B — Neon PostgreSQL**

Create a Neon project and configure the pooled connection string as `DATABASE_URL` and the direct connection string as `DIRECT_URL` in `backend/.env`. Do not run `npm run db:up` when using Neon. Follow [docs/NEON.md](docs/NEON.md).

For either option, edit `backend/.env` and set the required secrets, including a strong `JWT_SECRET` (32+ characters) and `ADMIN_PASSWORD` (12+ characters). Then run:

```bash
npm run db:generate
npm run db:deploy
npm run db:seed
```

### 3. Start the backend and website

Open two terminal windows from the repository root.

**Terminal 1 — Backend API and Socket.IO**

```bash
npm run dev:api
```

The API runs at `http://localhost:3000`.

**Terminal 2 — Public Web and Admin Dashboard**

```bash
cp .env.example .env
```

Set the following values in the root `.env` file:

```env
VITE_API_URL=http://localhost:3000
VITE_SOCKET_URL=http://localhost:3000
```

Then start the website:

```bash
npm run dev
```

Open `http://127.0.0.1:5173`. Sign in at `/login` using the `ADMIN_USERNAME` and `ADMIN_PASSWORD` configured in `backend/.env`.

> **Important:** If `VITE_API_URL` is not configured, the web app may use its in-memory mock API. Use the real backend URLs above for an integrated sprint demonstration.

## Getting Started — Flutter Driver App

The Flutter project is inside the `mobile/` directory. Install Flutter first, then run:

```bash
cd mobile
flutter pub get
flutter analyze
```

If the Android and iOS platform folders have not been generated yet, create them with:

```bash
flutter create --platforms=android,ios .
```

Configure the API and Socket.IO addresses for the device you are using:

| Target | API URL |
|---|---|
| Android emulator | `http://10.0.2.2:3000` |
| iOS simulator | `http://127.0.0.1:3000` |
| Physical phone | `http://YOUR_COMPUTER_LAN_IP:3000` |

For example, on an Android emulator:

```bash
flutter run --dart-define=API_URL=http://10.0.2.2:3000 --dart-define=SOCKET_URL=http://10.0.2.2:3000
```

For a physical phone, replace the example address with your computer's LAN IP and connect both devices to the same Wi-Fi network. Configure the required Android/iOS location permissions as described in [mobile/README.md](mobile/README.md).

In the Admin Dashboard, open **Vehicles** and generate a device token for the vehicle. Copy the raw token when it is displayed; it is shown only once. Use the vehicle ID and device token to sign in to the Flutter app.

## Realtime Simulator Demo

The simulator can demonstrate Sprint 2 without a physical phone:

```bash
cp simulator/.env.example simulator/.env
```

Configure the simulator environment values, including the vehicle ID and admin credentials, then run:

```bash
npm run simulate
```

Open the Public Web map and `/admin/dashboard` to observe the simulated vehicle. See [docs/SIMULATOR.md](docs/SIMULATOR.md) for the complete instructions.

## Useful Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Public Web and Admin Dashboard |
| `npm run dev:api` | Start the backend API and Socket.IO |
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
| `cd mobile && flutter analyze` | Analyze Flutter source code |
| `cd mobile && flutter run` | Run the driver app (configure API URLs as above) |

## Deployment

The repository includes a Render Blueprint in `render.yaml` for the API, database, and static website. Follow [docs/RENDER.md](docs/RENDER.md) to configure and deploy the services. Configure production environment variables and verify the deployed API, database, web app, and mobile app together before treating the end-to-end deployment as complete.

## Project Structure

```text
ShuttleBus/
├── backend/       # Express API, Prisma schema, migrations, seed
├── mobile/        # Flutter driver GPS application
├── simulator/    # Vehicle location simulator
├── src/           # React Public Web and Admin Dashboard
├── docs/          # Sprint, setup, testing, Socket.IO and deployment docs
├── render.yaml    # Render deployment blueprint
├── compose.yaml   # Local database services
└── README.md
```

## Documentation

- [Sprint implementation map](docs/SPRINTS.md)
- [Testing and acceptance checklist](docs/TESTING.md)
- [Flutter mobile app setup](mobile/README.md)
- [Socket.IO event and payload contract](docs/SOCKET_IO.md)
- [Neon database setup](docs/NEON.md)
- [Render deployment guide](docs/RENDER.md)
- [Vehicle simulator guide](docs/SIMULATOR.md)
- [Project details](PROJECT.md)
