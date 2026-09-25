# ShuttleTrack

Campus shuttle bus tracking system for Rangsit University.

## ✨ Key Features

- 🚀 **React 18 + TypeScript** - Modern development experience
- 🎨 **Tailwind CSS** - Utility-first CSS framework
- 🔌 **Socket.IO client** - Live vehicle location updates from the backend
- ⚡ **Vite** - Fast build tool
- 🌐 **i18next** - Complete internationalization solution
- 🎯 **Zustand** - Lightweight state management
- ✨ **Framer Motion** - Smooth animation effects
- 🎭 **Headless UI** - Accessible UI components
- 📦 **Lucide React** - Beautiful icon library
- 🛣️ **React Router** - Single-page application routing

## 🛠️ Tech Stack

### Core Technologies
- React 18.3.1 + TypeScript 5.8.3
- Vite 7.0.0 (Build tool)
- Tailwind CSS 3.4.17 (CSS framework)

### Feature Libraries
- React Router DOM 6.30.1 (Routing)
- Zustand 4.4.7 (State management)
- i18next + react-i18next (Internationalization)
- Framer Motion 11.0.8 (Animations)
- Headless UI 1.7.18 (UI components)
- Lucide React (Icon library)

## Sprint 1 + Sprint 2

The project includes an Express/Prisma/PostGIS backend, API-connected Public Web and Admin Dashboard, Socket.IO vehicle tracking, route geometry, and a vehicle simulator. No native mobile application is included.

- [Sprint coverage and mobile preparation](docs/SPRINTS.md)
- [Render deployment runbook](docs/RENDER.md)
- [Vehicle simulator demo](docs/SIMULATOR.md)
- [Test suites and acceptance checklist](docs/TESTING.md)

## 🚀 Quick Start (npm)

Use **Node 22 or 24** and **npm** (npm workspaces: root = website, `backend/` = API). `package-lock.json` is the only lockfile — do not use pnpm/yarn.

### 1. Install

```bash
npm install
```

### 2. Database (PostgreSQL + PostGIS)

```bash
npm run db:up                       # docker compose: postgis/postgis:16-3.5 on 127.0.0.1:5432
cp backend/.env.example backend/.env
# edit backend/.env: set JWT_SECRET (32+ chars) and ADMIN_PASSWORD (12+ chars)
npm run db:generate                 # Prisma client
npm run db:deploy                   # apply migrations (use db:migrate when authoring new ones)
npm run db:seed                     # admin + 3 routes, 10 stops, 4 vehicles, RouteStops, geometry
```

### 3. Run

```bash
npm run dev:api                     # terminal 1 → http://localhost:3000 (REST + Socket.IO)
cp .env.example .env                # VITE_API_URL / VITE_SOCKET_URL = http://localhost:3000
npm run dev                         # terminal 2 → http://127.0.0.1:5173
```

Log in at `/login` with `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `backend/.env`. If `VITE_API_URL` is unset, the website falls back to an in-memory mock API (not the sprint demo mode).

### 4. Realtime demo (Sprint 2)

```bash
cp simulator/.env.example simulator/.env
# simplest local setup: SIM_VEHICLE_ID=v-1, SIM_ADMIN_USERNAME/SIM_ADMIN_PASSWORD = your admin, SIM_LOOPS=0
npm run simulate
```

Open the public page (select *Blue Line*) and `/admin/dashboard` — the bus marker moves on both. Run a second simulator with `SIM_VEHICLE_ID=v-2` for another route. See [docs/SIMULATOR.md](docs/SIMULATOR.md).

### Useful scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `npm run dev:api` | Website / API dev servers |
| `npm run build` / `npm run build:api` | Production builds |
| `npm run typecheck` | `tsc -b` for the website |
| `npm test` | Unit + adapter tests (website + backend) |
| `npm run test:simulator` | Simulator + Socket.IO transport tests |
| `npm run test:live` | Real PostGIS + REST + Socket.IO integration (needs a `*test*` DB, see docs/TESTING.md) |
| `npm run db:up` / `db:down` / `db:generate` / `db:migrate` / `db:deploy` / `db:seed` | Database helpers |
| `npm run simulate` | Vehicle simulator |

## Deploy on Render

`render.yaml` is a Render Blueprint (API + Postgres + static website) using npm. Follow [docs/RENDER.md](docs/RENDER.md).

## 📁 Project Structure

```
src/
├── api/             # API related code
├── assets/          # Static assets
├── components/      # Reusable components
├── layouts/         # Layout components  
├── pages/           # Page components
├── styles/          # Style files
├── types/           # TypeScript type definitions
├── App.tsx          # Main application component
└── main.tsx         # Application entry point
```

## More Information

For more detailed project structure, tech stack, configuration instructions and development guide, please refer to the [PROJECT.md](./PROJECT.md) file.