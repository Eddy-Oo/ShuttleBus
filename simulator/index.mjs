import { setTimeout as sleep } from 'node:timers/promises';
import { api, configFromEnv, connectVehicle, provisionDeviceToken, publishLocation, routePoints } from './lib.mjs';

const HELP = `ShuttleTrack vehicle simulator

  npm run simulate            (reads simulator/.env)

Logs in as a vehicle, starts a trip on its route, publishes interpolated
GPS positions over Socket.IO, then ends the trip.

  SIM_API_URL             Backend origin (default http://localhost:3000)
  SIM_VEHICLE_ID          Vehicle to drive (e.g. v-1)
  SIM_DEVICE_TOKEN        Device credential from Admin > Vehicles > key icon
  SIM_ADMIN_USERNAME/     ...or admin credentials: the simulator rotates and uses
  SIM_ADMIN_PASSWORD      a fresh device token automatically (dev/demo only)
  SIM_ROUTE_ID            Optional route override
  SIM_LOOPS               Passes over the route; 0 = until Ctrl+C (default 1)
  SIM_INTERVAL_MS         Delay between updates (default 1000)
  SIM_STEPS_PER_SEGMENT   Interpolation steps between vertices (default 20)

See docs/SIMULATOR.md.`;

if (process.argv.includes('--help')) {
  console.info(HELP);
} else {
  let socket;
  let trip;
  let config;
  let token;
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    config = configFromEnv();
    let deviceToken = config.deviceToken;
    if (!deviceToken) {
      deviceToken = await provisionDeviceToken(config);
      console.info(`Provisioned a new device token for ${config.vehicleId} using admin credentials.`);
    }
    const login = await api(config.origin, '/api/auth/vehicle/login', { method: 'POST', body: { vehicleId: config.vehicleId, deviceToken } });
    token = login.token;
    const vehicle = await api(config.origin, '/api/vehicles/me', { token });
    const routeId = config.routeId || vehicle.assignedRouteId;
    if (!routeId) throw new Error('Assign a route in Admin Vehicles or set SIM_ROUTE_ID');
    const route = await api(config.origin, `/api/routes/${encodeURIComponent(routeId)}`, { token });
    routePoints(route.geometry, config.steps); // validate geometry before starting a trip
    if (abort.signal.aborted) throw new Error('Interrupted before connection');
    socket = await connectVehicle(config.origin, token);
    if (abort.signal.aborted) throw new Error('Interrupted before trip start');
    trip = await api(config.origin, '/api/trips/start', { token, method: 'POST', body: { routeId } });
    console.info(`Trip ${trip.id} started for ${vehicle.name} (${config.vehicleId}) on ${route.name}. Open Public Web and Admin Dashboard.`);
    let count = 0;
    const speedKmh = 18;
    for (let pass = 1; config.loops === 0 || pass <= config.loops; pass++) {
      if (abort.signal.aborted) break;
      if (config.loops !== 1) console.info(`Pass ${pass}${config.loops ? `/${config.loops}` : ''}`);
      for (const point of routePoints(route.geometry, config.steps)) {
        if (abort.signal.aborted) break;
        await publishLocation(socket, { vehicleId: config.vehicleId, tripId: trip.id, ...point, speed: speedKmh, recordedAt: new Date().toISOString() });
        count++;
        console.info(`Accepted ${count}: ${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)} heading ${point.heading}°`);
        await sleep(config.intervalMs, undefined, { signal: abort.signal });
      }
    }
    console.info(`Sent ${count} accepted location updates.`);
  } catch (error) {
    if (abort.signal.aborted && error.name === 'AbortError') console.info('Stop requested; ending simulator trip.');
    else if (/INVALID_TRIP/.test(error.message)) { console.info('Trip is no longer active (ended by an admin?); stopping simulator.'); trip = undefined; }
    else { console.error(error.message); process.exitCode = 1; }
  } finally {
    socket?.disconnect();
    if (trip && config && token) {
      try {
        await api(config.origin, `/api/trips/${encodeURIComponent(trip.id)}/end`, { token, method: 'POST' });
        console.info(`Trip ${trip.id} ended.`);
      } catch (error) {
        if (/TRIP_ALREADY_ENDED/.test(error.message)) console.info(`Trip ${trip.id} was already ended.`);
        else {
          console.error(`Trip cleanup failed: ${error.message}. End trip ${trip.id} from the Admin Dashboard before restarting.`);
          process.exitCode = 1;
        }
      }
    }
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}
