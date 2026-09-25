# Vehicle simulator

A Node command-line simulator (not a mobile app). It exercises the exact contract the future mobile app will use:

```text
Vehicle login → Load assigned route → Start trip
  → Interpolate GeoJSON positions (+ heading) → Socket.IO publish + acknowledgement
  → Backend persists → Broadcast to Public Web + Admin Dashboard
  → End trip
```

## Prerequisites

- Node 22 or 24, `npm install` from the repository root.
- Running API with migrations applied and a route with LineString geometry (the seed provides three).
- An **active** vehicle assigned to that route (seed: `v-1`→Blue, `v-2`→Green, `v-3`→Red).
- A device credential — either:
  - **A (recommended):** Admin → Vehicles → key icon → copy the one-time token into `SIM_DEVICE_TOKEN`, or
  - **B (local/demo):** leave `SIM_DEVICE_TOKEN` empty and set `SIM_ADMIN_USERNAME` / `SIM_ADMIN_PASSWORD`. The simulator rotates the vehicle's token on every run, which revokes previously issued tokens for that vehicle.

## Run

```bash
cp simulator/.env.example simulator/.env
# edit: SIM_VEHICLE_ID and a credential (A or B)
npm run simulate
```

Several vehicles at once (each in its own terminal, env vars override the file):

```bash
SIM_VEHICLE_ID=v-1 SIM_LOOPS=0 npm run simulate
SIM_VEHICLE_ID=v-2 SIM_LOOPS=0 npm run simulate
```

For Render, set `SIM_API_URL` to the API's HTTPS origin (not the website URL). Remote plain-HTTP URLs are rejected.

| Variable | Default | Purpose |
|---|---|---|
| `SIM_API_URL` | `http://localhost:3000` | Backend origin |
| `SIM_VEHICLE_ID` | required | Vehicle ID |
| `SIM_DEVICE_TOKEN` | — | Device credential (option A) |
| `SIM_ADMIN_USERNAME` / `SIM_ADMIN_PASSWORD` | — | Auto-provision a device token (option B) |
| `SIM_ROUTE_ID` | vehicle's assigned route | Optional override; backend assignment rules still apply |
| `SIM_LOOPS` | `1` | Passes over the route; `0` = loop until Ctrl+C |
| `SIM_INTERVAL_MS` | `1000` | Delay between acknowledged updates; 250–60000 ms |
| `SIM_STEPS_PER_SEGMENT` | `20` | Interpolation steps between geometry vertices; 1–1000 |

Each point carries a heading computed from the segment bearing and a constant nominal speed (18 km/h). This is for visualization, not a physical model.

`npm run simulate -- --help` prints a short reminder. Never put credentials in a `VITE_*` variable.

## Demo acceptance (Sprint 2 result)

1. Public page: select the simulator's route → route line + ordered bilingual stops.
2. Admin Dashboard in another tab (optionally filter by route).
3. `npm run simulate`.
4. Console prints the trip ID and `Accepted N` lines (acknowledged, not just sent).
5. The bus marker moves on both maps; the dashboard row shows **On trip / Live**.
6. Refresh a tab: the snapshot restores the marker.
7. Ctrl+C, loop completion, or **End trip** on the dashboard ends the trip; the marker disappears and the row returns to **Idle**.

## Failure behaviour

- Invalid config/geometry is rejected before a trip starts.
- HTTP timeout 30 s; Socket.IO acknowledgement timeout 10 s.
- A rejected GPS update, revoked JWT, or lost socket stops the run — no blind retries or replay.
- If an admin ends the trip, the simulator reports it and exits cleanly.
- If a vehicle already has an active trip, start is rejected with `TRIP_ALREADY_ACTIVE`; end it on the dashboard and rerun.
- Force-killing the process can leave an active trip; end it from the dashboard.

See [SOCKET_IO.md](SOCKET_IO.md).
