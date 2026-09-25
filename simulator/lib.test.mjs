import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { configFromEnv, routePoints, api, connectVehicle, publishLocation } from './lib.mjs';

const env = { SIM_VEHICLE_ID: 'v-1', SIM_DEVICE_TOKEN: 'test-device-token' };
test('configuration defaults and secure remote origin', () => {
  assert.equal(configFromEnv(env).origin, 'http://localhost:3000');
  assert.equal(configFromEnv({ ...env, SIM_API_URL: 'https://example.onrender.com' }).intervalMs, 1000);
  for (const url of ['http://example.com', 'ftp://localhost', 'https://user:pass@example.com', 'https://example.com/api']) {
    assert.throws(() => configFromEnv({ ...env, SIM_API_URL: url }));
  }
});
test('configuration rejects missing credentials and invalid timing', () => {
  assert.throws(() => configFromEnv({}));
  assert.throws(() => configFromEnv({ SIM_VEHICLE_ID: 'v-1' }), /SIM_DEVICE_TOKEN/);
  assert.equal(configFromEnv({ SIM_VEHICLE_ID: 'v-1', SIM_ADMIN_USERNAME: 'admin', SIM_ADMIN_PASSWORD: 'secret' }).deviceToken, '');
  for (const loops of ['-1', '1.5', 'x']) assert.throws(() => configFromEnv({ ...env, SIM_LOOPS: loops }));
  assert.equal(configFromEnv({ ...env, SIM_LOOPS: '0' }).loops, 0);
  for (const interval of ['0', '-5', 'NaN', '100', '60001']) assert.throws(() => configFromEnv({ ...env, SIM_INTERVAL_MS: interval }));
  for (const steps of ['0', '1.2', '1001']) assert.throws(() => configFromEnv({ ...env, SIM_STEPS_PER_SEGMENT: steps }));
});
test('interpolation respects GeoJSON axis order and includes endpoints once', () => {
  const points = [...routePoints({ type: 'LineString', coordinates: [[100, 14], [102, 16], [104, 14]] }, 2)];
  assert.deepEqual(points.map(({ longitude, latitude }) => ({ longitude, latitude })), [
    { longitude: 100, latitude: 14 }, { longitude: 101, latitude: 15 },
    { longitude: 102, latitude: 16 }, { longitude: 103, latitude: 15 }, { longitude: 104, latitude: 14 },
  ]);
  // Heading is north-east on the first segment and south-east on the second.
  assert.ok(points[0].heading > 0 && points[0].heading < 90);
  assert.ok(points[4].heading > 90 && points[4].heading < 180);
  for (const p of points) assert.ok(p.heading >= 0 && p.heading <= 360);
});
test('geometry rejects malformed and out-of-range coordinates', () => {
  for (const geometry of [null, { type: 'Point', coordinates: [100, 14] }, { type: 'LineString', coordinates: [[100, 91], [100, 14]] }, { type: 'LineString', coordinates: [[100, 14]] }]) {
    assert.throws(() => routePoints(geometry, 2));
  }
});
test('REST client sends bearer credentials and handles API failure', async () => {
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization !== 'Bearer good') { res.writeHead(401); res.end(JSON.stringify({ success: false, code: 'INVALID_TOKEN', error: 'Unauthorized' })); }
    else res.end(JSON.stringify({ success: true, data: { id: 'v-1' } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.deepEqual(await api(origin, '/api/vehicles/me', { token: 'good' }), { id: 'v-1' });
    await assert.rejects(api(origin, '/api/vehicles/me'), /INVALID_TOKEN/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('simulator connects over real Socket.IO transport and checks acknowledgements', async () => {
  const http = createServer();
  const io = new Server(http);
  io.use((socket, next) => next(socket.handshake.auth.token === 'good' ? undefined : new Error('Invalid token')));
  io.on('connection', socket => socket.on('vehicle:location:update', (payload, ack) => {
    ack(payload.vehicleId === 'v-1' ? { success: true, data: payload } : { success: false, code: 'VEHICLE_MISMATCH' });
  }));
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${http.address().port}`;
  let socket;
  try {
    await assert.rejects(connectVehicle(origin, 'bad'), /Invalid token/);
    socket = await connectVehicle(origin, 'good');
    const payload = { vehicleId: 'v-1', latitude: 14, longitude: 100 };
    assert.deepEqual(await publishLocation(socket, payload), payload);
    await assert.rejects(publishLocation(socket, { ...payload, vehicleId: 'other' }), /VEHICLE_MISMATCH/);
    socket.disconnect();
    await assert.rejects(publishLocation(socket, payload), /disconnected/);
  } finally { socket?.disconnect(); await new Promise(resolve => io.close(resolve)); }
});
