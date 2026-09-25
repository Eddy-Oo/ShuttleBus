import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as client } from 'socket.io-client';
import { hash } from 'bcryptjs';
import { api, connectVehicle, publishLocation } from '../../simulator/lib.mjs';

// Explicit opt-in and a test-named database; never run this against production.
test('real PostgreSQL + REST + Socket.IO sprint acceptance', { skip: process.env.ALLOW_DATABASE_TESTS !== '1', timeout: 90000 }, async t => {
  assert.match(new URL(process.env.DATABASE_URL).pathname, /test/i, 'Use a dedicated test database');
  process.env.JWT_SECRET = 'integration-only-secret-at-least-32-characters';
  process.env.NODE_ENV = 'test';
  const { prisma } = await import('../dist/prisma.js');
  const { createApp } = await import('../dist/app.js');
  const { attachRealtimeHandlers } = await import('../dist/realtime/socket.js');
  const io = new Server();
  const server = createServer(createApp(io));
  io.attach(server);
  attachRealtimeHandlers(io);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const suffix = randomUUID();
  const routes = [], stops = [], vehicles = [], sockets = [];
  let user;
  let token;
  let trip;
  const call = (path, method = 'GET', body, auth = token) => api(origin, path, { method, body, token: auth });
  const expectStatus = async (path, status, method = 'GET', body, auth = token) => {
    const response = await fetch(`${origin}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.equal(response.status, status);
    const error = await response.json();
    assert.equal(error.success, false);
    assert.equal(typeof error.code, 'string');
  };
  const event = (socket, name) => new Promise((resolve, reject) => {
    const listener = data => { clearTimeout(timer); resolve(data); };
    const timer = setTimeout(() => { socket.off(name, listener); reject(new Error(`Timed out waiting for ${name}`)); }, 10000);
    socket.once(name, listener);
  });
  try {
    user = await prisma.user.create({ data: { username: `test-${suffix}`, passwordHash: await hash('integration-password-only', 4), role: 'ADMIN' } });
    token = (await call('/api/auth/admin/login', 'POST', { username: user.username, password: 'integration-password-only' }, null)).token;
    await t.test('health, unauthorized writes, invalid input and missing IDs', async () => {
      assert.equal((await call('/health', 'GET', undefined, null)).database, 'ok');
      await expectStatus('/api/routes', 401, 'POST', { name: 'forbidden' }, null);
      await expectStatus('/api/routes', 400, 'POST', { name: ' ' });
      await expectStatus('/api/stops', 400, 'POST', { nameTh: 'test', latitude: 91, longitude: 100 });
      await expectStatus('/api/routes/does-not-exist', 404);
      await expectStatus('/api/routes', 400, 'POST', { name: 'bad geometry', geometry: { type: 'LineString', coordinates: [[100, 91], [100, 14]] } });
    });
    const route = await call('/api/routes', 'POST', { name: `Test route ${suffix}`, status: 'active', geometry: { type: 'LineString', coordinates: [[100.65, 14.03], [100.66, 14.04]] } });
    routes.push(route.id);
    await t.test('route CRUD and unique constraint', async () => {
      await expectStatus('/api/routes', 409, 'POST', { name: route.name });
      assert.equal((await call(`/api/routes/${route.id}`, 'PATCH', { color: '#123456' })).color, '#123456');
      assert.equal((await call(`/api/routes/${route.id}`, 'GET', undefined, null)).geometry.type, 'LineString');
      await call(`/api/routes/${route.id}`, 'PATCH', { status: 'inactive' });
      assert.ok(!(await call('/api/routes', 'GET', undefined, null)).some(r => r.id === route.id));
      await expectStatus(`/api/routes/${route.id}`, 404, 'GET', undefined, null);
      await call(`/api/routes/${route.id}`, 'PATCH', { status: 'active' });
    });
    for (let n = 0; n < 2; n++) {
      const stop = await call('/api/stops', 'POST', { nameTh: `ป้ายทดสอบ ${n}`, nameEn: `Test stop ${n}`, latitude: 14.03 + n * .01, longitude: 100.65 });
      stops.push(stop.id);
    }
    await t.test('deleting a stop closes gaps in route stopOrder', async () => {
      const extra = await call('/api/stops', 'POST', { nameTh: 'ป้ายชั่วคราว', latitude: 14.05, longitude: 100.66 });
      await call(`/api/routes/${route.id}/stops`, 'POST', { stopId: stops[0], stopOrder: 1 });
      await call(`/api/routes/${route.id}/stops`, 'POST', { stopId: extra.id, stopOrder: 2 });
      await call(`/api/routes/${route.id}/stops`, 'POST', { stopId: stops[1], stopOrder: 3 });
      await call(`/api/stops/${extra.id}`, 'DELETE');
      const ordered = await call(`/api/routes/${route.id}/stops`);
      assert.deepEqual(ordered.map(s => s.stopOrder), [1, 2]);
      assert.deepEqual(ordered.map(s => s.stopId), [stops[0], stops[1]]);
      for (const row of ordered) await call(`/api/route-stops/${row.id}`, 'DELETE');
    });
    await t.test('bilingual stops, route membership and ordering', async () => {
      assert.equal((await call(`/api/stops/${stops[0]}`, 'PATCH', { nameEn: 'Updated stop' })).nameEn, 'Updated stop');
      await expectStatus(`/api/routes/${route.id}/stops`, 400, 'POST', { stopId: stops[0], stopOrder: 0 });
      await expectStatus(`/api/routes/${route.id}/stops`, 404, 'POST', { stopId: 'missing', stopOrder: 1 });
      const first = await call(`/api/routes/${route.id}/stops`, 'POST', { stopId: stops[0], stopOrder: 1 });
      await call(`/api/routes/${route.id}/stops`, 'POST', { stopId: stops[1], stopOrder: 2 });
      await expectStatus(`/api/routes/${route.id}/stops`, 409, 'POST', { stopId: stops[0], stopOrder: 1 });
      await call(`/api/route-stops/${first.id}/order`, 'PATCH', { stopOrder: 2 });
      const ordered = await call(`/api/routes/${route.id}/stops`, 'GET', undefined, null);
      assert.deepEqual(ordered.map(s => s.stopId), [stops[1], stops[0]]);
      assert.deepEqual(ordered.map(s => s.stopOrder), [1, 2]);
      assert.equal(ordered[1].stop.nameEn, 'Updated stop');
      await call(`/api/route-stops/${first.id}`, 'DELETE');
      assert.deepEqual((await call(`/api/routes/${route.id}/stops`)).map(s => s.stopOrder), [1]);
    });
    const vehicle = await call('/api/vehicles', 'POST', { name: `Test vehicle ${suffix}`, status: 'active', assignedRouteId: route.id });
    vehicles.push(vehicle.id);
    await t.test('vehicle rejects unknown route with a 400 reference error', async () => {
      await expectStatus('/api/vehicles', 400, 'POST', { name: `Bad ref ${suffix}`, assignedRouteId: 'no-such-route' });
      await expectStatus(`/api/vehicles/${vehicle.id}`, 400, 'PATCH', { assignedRouteId: 'no-such-route' });
      await expectStatus('/api/vehicles/no-such-vehicle', 404, 'PATCH', { name: 'x' });
      await expectStatus('/api/stops', 400, 'POST', { nameTh: 'x', latitude: 14, longitude: 181 });
      await expectStatus('/api/stops', 400, 'POST', { latitude: 14, longitude: 100 });
    });
    await t.test('vehicle assignment and credential provisioning', async () => {
      assert.equal((await call(`/api/vehicles/${vehicle.id}`)).assignedRouteId, route.id);
      assert.equal((await call(`/api/vehicles/${vehicle.id}`, 'PATCH', { type: 'tram' })).type, 'tram');
      await expectStatus('/api/vehicles', 401, 'GET', undefined, null);
    });
    const credential = await call(`/api/vehicles/${vehicle.id}/device-token`, 'POST');
    const vehicleToken = (await call('/api/auth/vehicle/login', 'POST', { vehicleId: vehicle.id, deviceToken: credential.deviceToken }, null)).token;
    const publisher = await connectVehicle(origin, vehicleToken); sockets.push(publisher);
    const browser = client(origin, { autoConnect: false, reconnection: false }); sockets.push(browser);
    const snapshot = event(browser, 'vehicle:location:snapshot'); browser.connect(); await snapshot;
    await t.test('trip lifecycle and persisted location broadcast', async () => {
      const started = event(browser, 'trip:started');
      trip = await call('/api/trips/start', 'POST', { routeId: route.id }, vehicleToken);
      assert.equal((await started).id, trip.id);
      await expectStatus('/api/trips/start', 409, 'POST', { routeId: route.id }, vehicleToken);
      // Concurrent duplicate starts are also rejected by the partial unique index.
      const racing = await Promise.all([1, 2].map(() => fetch(`${origin}/api/trips/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vehicleToken}` }, body: JSON.stringify({ routeId: route.id }),
      }).then(r => r.json())));
      assert.ok(racing.every(r => r.code === 'TRIP_ALREADY_ACTIVE'));
      const payload = { vehicleId: vehicle.id, tripId: trip.id, latitude: 14.032, longitude: 100.652, recordedAt: new Date().toISOString() };
      const broadcast = event(browser, 'vehicle:location:update');
      await publishLocation(publisher, payload);
      const broadcasted = await broadcast;
      assert.equal(broadcasted.vehicleId, vehicle.id);
      assert.equal(broadcasted.routeId, route.id);
      assert.equal(broadcasted.vehicleName, vehicle.name);
      assert.equal((await call(`/api/vehicles/${vehicle.id}`)).currentLatitude, payload.latitude);
      assert.equal(await prisma.vehicleLocation.count({ where: { vehicleId: vehicle.id } }), 1);
      await assert.rejects(publishLocation(browser, payload), /VEHICLE_AUTH_REQUIRED/);
      await assert.rejects(publishLocation(publisher, { ...payload, vehicleId: 'other' }), /VEHICLE_MISMATCH/);
      await assert.rejects(publishLocation(publisher, { ...payload, latitude: 91 }), /VALIDATION_ERROR/);
      await assert.rejects(publishLocation(publisher, { ...payload, recordedAt: '2020-01-01T00:00:00.000Z' }), /STALE_LOCATION/);
      const newcomer = client(origin, { autoConnect: false, reconnection: false }); sockets.push(newcomer);
      const freshSnapshot = event(newcomer, 'vehicle:location:snapshot'); newcomer.connect();
      const snapshotEntry = (await freshSnapshot).find(v => v.vehicleId === vehicle.id);
      assert.equal(snapshotEntry.latitude, payload.latitude);
      assert.equal(snapshotEntry.tripId, trip.id);
      const ended = event(browser, 'trip:ended');
      await call(`/api/trips/${trip.id}/end`, 'POST', undefined, vehicleToken);
      assert.equal((await ended).status, 'completed');
      // After the trip ends the vehicle is no longer part of the live snapshot.
      const late = client(origin, { autoConnect: false, reconnection: false }); sockets.push(late);
      const lateSnapshot = event(late, 'vehicle:location:snapshot'); late.connect();
      assert.ok(!(await lateSnapshot).some(v => v.vehicleId === vehicle.id));
      assert.ok(!(await call('/api/trips/active')).some(row => row.id === trip.id));
      await call(`/api/vehicles/${vehicle.id}/device-token`, 'POST');
      await expectStatus('/api/vehicles/me', 401, 'GET', undefined, vehicleToken);
      await assert.rejects(publishLocation(publisher, payload), /TOKEN_REVOKED/);
      await assert.rejects(connectVehicle(origin, vehicleToken), /revoked/);
    });
    // Trip history intentionally restricts deletion; remove only this test's history before CRUD delete assertions.
    if (trip) await prisma.trip.delete({ where: { id: trip.id } });
    await t.test('delete endpoints and database persistence', async () => {
      await call(`/api/vehicles/${vehicle.id}`, 'DELETE');
      await expectStatus(`/api/vehicles/${vehicle.id}`, 404);
      await call(`/api/routes/${route.id}`, 'DELETE');
      assert.equal(await prisma.routeStop.count({ where: { routeId: route.id } }), 0);
      for (const id of stops) await call(`/api/stops/${id}`, 'DELETE');
      assert.equal(await prisma.stop.count({ where: { id: { in: stops } } }), 0);
    });
  } finally {
    for (const socket of sockets) socket.disconnect();
    await new Promise(resolve => io.close(resolve));
    // IDs are scoped to this test run; never truncate/reset a database.
    try {
      await prisma.trip.deleteMany({ where: { vehicleId: { in: vehicles } } });
      await prisma.vehicle.deleteMany({ where: { id: { in: vehicles } } });
      await prisma.route.deleteMany({ where: { id: { in: routes } } });
      await prisma.stop.deleteMany({ where: { id: { in: stops } } });
      if (user) await prisma.user.delete({ where: { id: user.id } });
    } finally { await prisma.$disconnect(); }
  }
});
