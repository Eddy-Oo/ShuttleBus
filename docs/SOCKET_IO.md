# Socket.IO vehicle location contract

The vehicle (mobile client or simulator), Express backend, Public Web, and Admin Dashboard use one Socket.IO endpoint. No native mobile app is included; the backend exposes the protocol mobile can use.

```text
Vehicle client --authenticated emit--> Express/Socket.IO + PostgreSQL
                                              |
                       snapshot + broadcast --+--> Public Web / Admin Dashboard
```

## Configure the website

Set build-time `VITE_API_URL` to the backend origin. `VITE_SOCKET_URL` may be set to the same origin; when omitted, the frontend uses `VITE_API_URL` for Socket.IO too. For local development, both are `http://localhost:3000`. On Render, set both to the deployed API origin and set backend `CORS_ORIGINS` to the website's exact origin(s).

## Vehicle authentication

1. An admin signs in at `POST /api/auth/admin/login`.
2. An admin provisions a vehicle credential with `POST /api/vehicles/:id/device-token` (the Vehicles page also offers this action). The raw device token is shown once; only a hash is stored. Rotating the token revokes previously issued vehicle JWTs and blocks existing sockets from publishing further updates.
3. The vehicle client sends `{ "vehicleId": "v-1", "deviceToken": "..." }` to `POST /api/auth/vehicle/login` and receives a signed JWT.
4. Connect to Socket.IO with `auth: { token: "<JWT>" }`.

Unauthenticated browser clients may subscribe to the public `web` room, but only a JWT whose role is `VEHICLE` may publish GPS updates. The backend verifies that the payload `vehicleId` matches the vehicle bound to the token.

## Events

### Vehicle → backend: `vehicle:location:update`

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

`vehicleId`, latitude, and longitude are required. `tripId`, speed, heading, and recordedAt are optional. Longitude is validated in `[-180, 180]`, latitude in `[-90, 90]`, speed is non-negative, and heading is `[0, 360]`. The server resolves/validates an active trip, saves the history row and latest Vehicle position transactionally, then broadcasts the canonical update to browser clients. If the client supplies a Socket.IO acknowledgement callback, it receives `{ success:true, data }` or `{ success:false, error, code }`.

### Backend → browser on connection: `vehicle:location:snapshot`

An array of the latest positions for active vehicles **that are currently on an active trip**, using the same properties as updates. Example:

```json
[
  { "vehicleId": "v-1", "vehicleName": "Shuttle Bus 01", "tripId": "…", "routeId": "route-1",
    "latitude": 14.032, "longitude": 100.651, "recordedAt": "2026-09-25T10:00:00.000Z" }
]
```

Server broadcasts of `vehicle:location:update` have the same shape (`vehicleName` and `routeId` are added by the server; vehicles do not send them).

An empty array is valid. Browser clients replace their current positions on a snapshot and upsert a marker on each subsequent `vehicle:location:update`.

### Trip lifecycle events

The backend broadcasts `trip:started` and `trip:ended` with the trip record to the browser room after successful lifecycle API calls. On `trip:ended` the website removes that vehicle's marker and refreshes the dashboard trip table. An admin can end a trip from the dashboard; the simulator then stops cleanly.

See [backend/README.md](../backend/README.md) for REST endpoints, [RENDER.md](RENDER.md) for deployment, and [SIMULATOR.md](SIMULATOR.md) for `npm run simulate`. The simulator exercises vehicle login → trip start → acknowledged location updates → trip end without a mobile application.

Timestamps older than the latest persisted position are rejected; timestamps more than five minutes ahead of server time are rejected. Vehicle JWT expiry is rechecked on each publish, not only at the initial connection. A failed acknowledgement must not be treated as an accepted GPS fix.
