import { io } from 'socket.io-client';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

export function configFromEnv(env = process.env) {
  const url = new URL(env.SIM_API_URL || 'http://localhost:3000');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('SIM_API_URL must be an HTTP(S) origin without credentials, path, query or fragment');
  }
  const intervalMs = Number(env.SIM_INTERVAL_MS || 1000);
  const steps = Number(env.SIM_STEPS_PER_SEGMENT || 20);
  const loops = Number(env.SIM_LOOPS ?? 1);
  if (!Number.isInteger(intervalMs) || intervalMs < 250 || intervalMs > 60000) throw new Error('SIM_INTERVAL_MS must be 250–60000');
  if (!Number.isInteger(steps) || steps < 1 || steps > 1000) throw new Error('SIM_STEPS_PER_SEGMENT must be 1–1000');
  if (!Number.isInteger(loops) || loops < 0 || loops > 10000) throw new Error('SIM_LOOPS must be an integer 0–10000 (0 = run until stopped)');
  const vehicleId = env.SIM_VEHICLE_ID?.trim();
  const deviceToken = env.SIM_DEVICE_TOKEN?.trim() || '';
  const adminUsername = env.SIM_ADMIN_USERNAME?.trim() || '';
  const adminPassword = env.SIM_ADMIN_PASSWORD || '';
  if (!vehicleId) throw new Error('Set SIM_VEHICLE_ID in simulator/.env');
  if (!deviceToken && !(adminUsername && adminPassword)) {
    throw new Error('Set SIM_DEVICE_TOKEN, or SIM_ADMIN_USERNAME + SIM_ADMIN_PASSWORD to provision one automatically');
  }
  if (url.protocol !== 'https:' && !LOCAL_HOSTS.includes(url.hostname)) throw new Error('Use HTTPS for remote APIs to protect the device credential');
  return {
    origin: url.origin,
    vehicleId,
    deviceToken,
    adminUsername,
    adminPassword,
    routeId: env.SIM_ROUTE_ID?.trim(),
    intervalMs,
    steps,
    loops,
  };
}

/**
 * Rotate the vehicle's device credential with admin credentials (dev/demo convenience).
 * This revokes any previous token for that vehicle.
 */
export async function provisionDeviceToken(config) {
  const login = await api(config.origin, '/api/auth/admin/login', {
    method: 'POST',
    body: { username: config.adminUsername, password: config.adminPassword },
  });
  const credential = await api(config.origin, `/api/vehicles/${encodeURIComponent(config.vehicleId)}/device-token`, {
    method: 'POST',
    token: login.token,
  });
  return credential.deviceToken;
}

/** Heading in degrees (0 = north, clockwise) between two [lng, lat] points. */
export function bearing(from, to) {
  const toRad = d => (d * Math.PI) / 180;
  const [lng1, lat1] = from.map(toRad);
  const [lng2, lat2] = to.map(toRad);
  const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

export async function api(origin, path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(`${method} ${path}: ${result.code || response.status} — ${result.error || 'Request failed'}`);
  return result.data;
}

export function routePoints(geometry, steps) {
  if (!Number.isInteger(steps) || steps < 1 || steps > 1000) throw new Error('Invalid interpolation steps');
  if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2 || geometry.coordinates.length > 10000) throw new Error('Route needs a GeoJSON LineString with 2–10000 coordinates');
  for (const pair of geometry.coordinates) {
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(Number.isFinite) || Math.abs(pair[0]) > 180 || Math.abs(pair[1]) > 90) throw new Error('Invalid route coordinates (expected [longitude, latitude])');
  }
  // A generator avoids allocating every interpolated point for long routes.
  return (function* () {
    for (let i = 1; i < geometry.coordinates.length; i++) {
      const a = geometry.coordinates[i - 1];
      const b = geometry.coordinates[i];
      for (let n = 0; n < steps; n++) {
        const t = n / steps;
        yield { longitude: a[0] + (b[0] - a[0]) * t, latitude: a[1] + (b[1] - a[1]) * t, heading: Math.round(bearing(a, b)) };
      }
    }
    const last = geometry.coordinates.at(-1);
    const prev = geometry.coordinates.at(-2);
    yield { longitude: last[0], latitude: last[1], heading: Math.round(bearing(prev, last)) };
  })();
}

export function connectVehicle(origin, token) {
  return new Promise((resolve, reject) => {
    const socket = io(origin, { auth: { token }, autoConnect: false, reconnection: false, timeout: 20000 });
    const onError = error => { socket.disconnect(); reject(error); };
    socket.once('connect_error', onError);
    socket.once('connect', () => { socket.off('connect_error', onError); resolve(socket); });
    socket.connect();
  });
}

export async function publishLocation(socket, payload) {
  if (!socket.connected) throw new Error('Socket disconnected; no location was queued');
  const result = await socket.timeout(10000).emitWithAck('vehicle:location:update', payload);
  if (!result?.success) throw new Error(`Location rejected: ${result?.code || 'UNKNOWN'} — ${result?.error || 'No acknowledgement'}`);
  return result.data;
}
