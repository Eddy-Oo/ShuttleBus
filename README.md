# ShuttleTrack

A campus shuttle bus tracking system for Rangsit University. The system provides live vehicle locations, route and stop information, and tools for managing shuttle operations.

## Features

- **Public Web:** View shuttle routes, stops, route paths, and live vehicle locations.
- **Admin Dashboard:** Manage vehicles, routes, stops, device credentials, and active trips.
- **Backend API:** REST API for authentication, route data, vehicles, trips, and location updates.
- **Real-time tracking:** Socket.IO receives vehicle GPS updates and broadcasts them to web clients.
- **Driver Mobile App:** Flutter app for vehicle login, route information, trip start/end, and foreground GPS tracking.
- **Vehicle Simulator:** Simulate vehicle movement for development and testing.

## Technology Stack

| Area | Technologies |
|---|---|
| Public Web and Admin Dashboard | React, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL, PostGIS, Prisma |
| Real-time communication | Socket.IO |
| Driver mobile app | Flutter, Dart, Geolocator |
| Local development | npm, Docker Compose |
| Hosting | Render (backend), Neon PostgreSQL (database) |

## Requirements

- Node.js 22 or 24
- npm
- Git
- Docker Desktop (for a local PostgreSQL/PostGIS database)
- Flutter SDK (for the driver mobile app)

## Web and Backend Setup

### 1. Clone the repository

```bash
git clone https://github.com/Eddy-Oo/ShuttleBus.git
cd ShuttleBus
npm install
```

### 2. Configure the backend

```bash
cp backend/.env.example backend/.env
```

Set the required values in `backend/.env`, including:

- `DATABASE_URL`
- `DIRECT_URL` (when required by your database setup)
- `JWT_SECRET`
- `ADMIN_PASSWORD`

Use a strong secret and password. Never commit `.env` files or credentials.

### 3. Start the database

For local PostgreSQL/PostGIS with Docker Compose:

```bash
npm run db:up
```

For the shared Neon database, configure its connection strings in `backend/.env` instead. Do not run the local database command when using Neon.

### 4. Prepare the database

```bash
npm run db:generate
npm run db:deploy
npm run db:seed
```

### 5. Start the backend

In one terminal, from the repository root:

```bash
npm run dev:api
```

The local API runs at `http://localhost:3000`.

### 6. Start the web application

In another terminal, from the repository root:

```bash
cp .env.example .env
```

Set the following values in the root `.env` file:

```env
VITE_API_URL=http://localhost:3000
VITE_SOCKET_URL=http://localhost:3000
```

Then run:

```bash
npm run dev
```

Open `http://127.0.0.1:5173` in your browser. Use the admin credentials configured in `backend/.env` to sign in.

## Flutter Driver App Setup

The Flutter application is located in `mobile/`.

```bash
cd mobile
flutter pub get
flutter analyze
```

Run the app with the API and Socket.IO URLs for your target device.

**Android emulator:**

```bash
flutter run --dart-define=API_URL=http://10.0.2.2:3000 --dart-define=SOCKET_URL=http://10.0.2.2:3000
```

**iOS simulator:**

```bash
flutter run --dart-define=API_URL=http://127.0.0.1:3000 --dart-define=SOCKET_URL=http://127.0.0.1:3000
```

For a physical phone, use your computer's LAN IP address and connect both devices to the same Wi-Fi network. See [mobile/README.md](mobile/README.md) for mobile setup and location permissions.

To log in, generate a device token for a vehicle in the Admin Dashboard. Copy the token when it is displayed because the raw token is shown only once.

## Vehicle Simulator

The simulator can send test vehicle locations without using a physical phone.

```bash
cp simulator/.env.example simulator/.env
```

Configure the required values in `simulator/.env`, then run:

```bash
npm run simulate
```

See [docs/SIMULATOR.md](docs/SIMULATOR.md) for details.

## Useful Commands

| Command | Purpose |
|---|---|
| `npm install` | Install project dependencies |
| `npm run dev` | Start the web application |
| `npm run dev:api` | Start the backend API |
| `npm run build` | Build the web application |
| `npm run build:api` | Build the backend |
| `npm run typecheck` | Check TypeScript types |
| `npm test` | Run tests |
| `npm run db:up` | Start the local database |
| `npm run db:down` | Stop the local database |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:deploy` | Apply database migrations |
| `npm run db:seed` | Add development seed data |
| `npm run simulate` | Run the vehicle simulator |
| `cd mobile && flutter analyze` | Analyze the Flutter app |

## Documentation

- [Flutter mobile app setup](mobile/README.md)
- [Testing guide](docs/TESTING.md)
- [Socket.IO events](docs/SOCKET_IO.md)
- [Neon database setup](docs/NEON.md)
- [Render deployment guide](docs/RENDER.md)
- [Vehicle simulator guide](docs/SIMULATOR.md)
- [Project overview](PROJECT.md)
