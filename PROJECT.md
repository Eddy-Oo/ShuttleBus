# ShuttleTrack — Rangsit University Shuttle Bus System

## Overview

Campus shuttle bus tracking system for **Rangsit University**. Local routes travel between campus buildings.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   FRONTEND (this repo)                │
│  React + TypeScript + Tailwind + Leaflet/OSM          │
│  Public Route Viewer + Admin Dashboard               │
└──────────────────┬───────────────────────────────────┘
       REST + Socket.IO (vehicle location updates)
┌──────────────────▼───────────────────────────────────┐
│                   BACKEND (backend/)                 │
│  Express + TypeScript + Socket.IO                    │
│  Prisma + PostgreSQL/PostGIS + Docker Compose         │
└──────────────────────────────────────────────────────┘
```

## Database Models (Prisma)

| Model | Key Fields | Notes |
|-------|-----------|-------|
| **Route** | id, name, color, status, geometry | GeoJSON LineString path |
| **Vehicle** | id, name, type, assignedRouteId, status | Current position + device token hash |
| **Stop** | id, nameTh, nameEn, latitude, longitude, imageUrl, status | PostGIS spatial index |
| **RouteStop** | id, routeId, stopId, stopOrder | Unique per route/order and route/stop |
| **User** | id, username, passwordHash, role | Admin auth |
| **Trip** | id, vehicleId, routeId, startedAt, endedAt, status | Start / end lifecycle |
| **VehicleLocation** | id, tripId, vehicleId, latitude, longitude, speed, heading, recordedAt | GPS history + latest position |

## Frontend Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Public Home | Select route → view stops on OSM map |
| `/login` | Login | Admin credentials configured in backend environment |
| `/admin/dashboard` | Dashboard | Stats + map overview |
| `/admin/vehicles` | Vehicles | CRUD (name, type, assignedRouteId, status) |
| `/admin/routes` | Routes | CRUD + manage stops per route (add/remove/reorder) |
| `/admin/stops` | Stops | CRUD (nameTh, nameEn, lat, lng, imageUrl, status) |

## Campus Stops (Rangsit University)

1. Main Gate
2. Admin Building
3. Faculty of Engineering
4. Faculty of Science
5. Faculty of Business
6. Central Library
7. Student Union
8. Sports Complex
9. Canteen Area
10. Computer Center

## Routes

- **Blue Line** — Main Gate Loop
- **Green Line** — Academic Zone
- **Red Line** — Student Services

## Tech Stack

**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Zustand, Leaflet/OSM
**Backend:** Express, TypeScript, PostgreSQL, PostGIS, Prisma ORM, Docker
**Realtime:** Backend-authenticated Socket.IO location updates are broadcast to Public Web and Admin Dashboard. See [docs/SOCKET_IO.md](./docs/SOCKET_IO.md) and [backend/README.md](./backend/README.md).

**Mobile:** No native app is included; the backend exposes a vehicle login, trip lifecycle, and location event contract for a future mobile client.

**Simulator:** `npm run simulate` runs the authenticated route-geometry simulator in `simulator/`. It uses the same vehicle REST/Socket.IO contract intended for mobile clients. See [docs/SIMULATOR.md](./docs/SIMULATOR.md).

**Render:** `render.yaml` includes the API, PostGIS database and static website. Follow [docs/RENDER.md](./docs/RENDER.md); demo seeding is manual and distinct from admin-only deployment bootstrap.

**Sprint coverage and testing:** [docs/SPRINTS.md](./docs/SPRINTS.md) maps requirements to code. [docs/TESTING.md](./docs/TESTING.md) separates unit/transport checks from opt-in live database and manual browser acceptance.

**Future:** LoRaWAN (TTN) GPS ingestion
