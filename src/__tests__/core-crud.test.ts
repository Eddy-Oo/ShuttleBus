/**
 * Sprint Test Suite — ShuttleTrack
 * Tests: Core CRUD, Validation, Error Cases, Route/Stop Ordering, Auth, Public Data Flow
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { routeApi, vehicleApi, stopApi, routeStopApi, authApi } from '../api/mockApi';

// Helper to wait for async mock delays
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════════
// 1. CORE CRUD — Routes
// ═══════════════════════════════════════════════════════════════
describe('Route CRUD', () => {
  it('should fetch all routes', async () => {
    const res = await routeApi.getAll();
    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data!.length).toBeGreaterThanOrEqual(3);
  });

  it('should fetch active routes only', async () => {
    const res = await routeApi.getActive();
    expect(res.success).toBe(true);
    expect(res.data!.every(r => r.status === 'active')).toBe(true);
  });

  it('should get a route by id', async () => {
    const all = await routeApi.getAll();
    const first = all.data![0];
    const res = await routeApi.getById(first.id);
    expect(res.success).toBe(true);
    expect(res.data!.id).toBe(first.id);
    expect(res.data!.name).toBe(first.name);
  });

  it('should return error for non-existent route', async () => {
    const res = await routeApi.getById('route-nonexistent');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Route not found');
  });

  it('should create a new route', async () => {
    const before = await routeApi.getAll();
    const count = before.data!.length;

    const res = await routeApi.create({ name: 'Test Route', color: '#FF0000', status: 'active' });
    expect(res.success).toBe(true);
    expect(res.data!.name).toBe('Test Route');
    expect(res.data!.color).toBe('#FF0000');
    expect(res.data!.id).toBeDefined();

    const after = await routeApi.getAll();
    expect(after.data!.length).toBe(count + 1);
  });

  it('should update a route', async () => {
    const all = await routeApi.getAll();
    const route = all.data![all.data!.length - 1]; // get the last created

    const res = await routeApi.update(route.id, { name: 'Updated Route' });
    expect(res.success).toBe(true);
    expect(res.data!.name).toBe('Updated Route');
    expect(res.data!.color).toBe(route.color); // unchanged
  });

  it('should delete a route', async () => {
    const all = await routeApi.getAll();
    const route = all.data![all.data!.length - 1];

    const res = await routeApi.delete(route.id);
    expect(res.success).toBe(true);

    const after = await routeApi.getAll();
    expect(after.data!.find(r => r.id === route.id)).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. CORE CRUD — Vehicles
// ═══════════════════════════════════════════════════════════════
describe('Vehicle CRUD', () => {
  it('should fetch all vehicles', async () => {
    const res = await vehicleApi.getAll();
    expect(res.success).toBe(true);
    expect(res.data!.length).toBeGreaterThanOrEqual(4);
  });

  it('should get a vehicle by id', async () => {
    const all = await vehicleApi.getAll();
    const v = all.data![0];
    const res = await vehicleApi.getById(v.id);
    expect(res.success).toBe(true);
    expect(res.data!.id).toBe(v.id);
  });

  it('should return error for non-existent vehicle', async () => {
    const res = await vehicleApi.getById('v-nonexistent');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Vehicle not found');
  });

  it('should create a vehicle', async () => {
    const res = await vehicleApi.create({
      name: 'Test Bus',
      type: 'bus',
      assignedRouteId: null,
      status: 'inactive',
    });
    expect(res.success).toBe(true);
    expect(res.data!.name).toBe('Test Bus');
    expect(res.data!.id).toMatch(/^v-/);
  });

  it('should update a vehicle', async () => {
    const all = await vehicleApi.getAll();
    const v = all.data![all.data!.length - 1];
    const res = await vehicleApi.update(v.id, { status: 'active', name: 'Updated Bus' });
    expect(res.success).toBe(true);
    expect(res.data!.status).toBe('active');
    expect(res.data!.name).toBe('Updated Bus');
  });

  it('should delete a vehicle', async () => {
    const all = await vehicleApi.getAll();
    const v = all.data![all.data!.length - 1];
    const res = await vehicleApi.delete(v.id);
    expect(res.success).toBe(true);
    const after = await vehicleApi.getAll();
    expect(after.data!.find(x => x.id === v.id)).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. CORE CRUD — Stops
// ═══════════════════════════════════════════════════════════════
describe('Stop CRUD', () => {
  it('should fetch all stops', async () => {
    const res = await stopApi.getAll();
    expect(res.success).toBe(true);
    expect(res.data!.length).toBeGreaterThanOrEqual(10);
  });

  it('should get a stop by id', async () => {
    const all = await stopApi.getAll();
    const s = all.data![0];
    const res = await stopApi.getById(s.id);
    expect(res.success).toBe(true);
    expect(res.data!.nameTh).toBe(s.nameTh);
  });

  it('should return error for non-existent stop', async () => {
    const res = await stopApi.getById('stop-nonexistent');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Stop not found');
  });

  it('should create a stop', async () => {
    const res = await stopApi.create({
      nameTh: 'Test Stop',
      nameEn: 'Test Stop EN',
      latitude: 14.03,
      longitude: 100.65,
      imageUrl: null,
      status: 'active',
    });
    expect(res.success).toBe(true);
    expect(res.data!.nameTh).toBe('Test Stop');
    expect(res.data!.latitude).toBe(14.03);
  });

  it('should update a stop', async () => {
    const all = await stopApi.getAll();
    const s = all.data![all.data!.length - 1];
    const res = await stopApi.update(s.id, { nameTh: 'Updated Stop' });
    expect(res.success).toBe(true);
    expect(res.data!.nameTh).toBe('Updated Stop');
  });

  it('should delete a stop', async () => {
    const all = await stopApi.getAll();
    const s = all.data![all.data!.length - 1];
    const res = await stopApi.delete(s.id);
    expect(res.success).toBe(true);
    const after = await stopApi.getAll();
    expect(after.data!.find(x => x.id === s.id)).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. VALIDATION & ERROR CASES
// ═══════════════════════════════════════════════════════════════
describe('Validation', () => {
  // ── Route Validation ──
  it('should reject empty route name', async () => {
    const res = await routeApi.create({ name: '', color: '#000', status: 'active' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Name is required');
  });

  it('should reject whitespace-only route name', async () => {
    const res = await routeApi.create({ name: '   ', color: '#000', status: 'active' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Name is required');
  });

  it('should reject duplicate route name', async () => {
    // First, get an existing route name
    const all = await routeApi.getAll();
    const existingName = all.data![0].name;
    const res = await routeApi.create({ name: existingName, color: '#000', status: 'active' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Duplicate route name');
  });

  it('should reject duplicate route name on update', async () => {
    const all = await routeApi.getAll();
    if (all.data!.length >= 2) {
      const route1 = all.data![0];
      const route2 = all.data![1];
      const res = await routeApi.update(route1.id, { name: route2.name });
      expect(res.success).toBe(false);
      expect(res.error).toBe('Duplicate route name');
    }
  });

  // ── Vehicle Validation ──
  it('should reject empty vehicle name', async () => {
    const res = await vehicleApi.create({ name: '', type: 'bus', assignedRouteId: null, status: 'inactive' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Name is required');
  });

  it('should reject empty vehicle type', async () => {
    const res = await vehicleApi.create({ name: 'Test', type: '', assignedRouteId: null, status: 'inactive' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Type is required');
  });

  // ── Stop Validation ──
  it('should reject empty stop nameTh', async () => {
    const res = await stopApi.create({ nameTh: '', nameEn: null, latitude: 14, longitude: 100, imageUrl: null, status: 'active' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Name (Thai) is required');
  });

  it('should reject invalid latitude (> 90)', async () => {
    const res = await stopApi.create({ nameTh: 'Test', nameEn: null, latitude: 95, longitude: 100, imageUrl: null, status: 'active' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Invalid latitude');
  });

  it('should reject invalid latitude (< -90)', async () => {
    const res = await stopApi.create({ nameTh: 'Test', nameEn: null, latitude: -95, longitude: 100, imageUrl: null, status: 'active' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Invalid latitude');
  });

  it('should reject invalid longitude (> 180)', async () => {
    const res = await stopApi.create({ nameTh: 'Test', nameEn: null, latitude: 14, longitude: 185, imageUrl: null, status: 'active' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Invalid longitude');
  });

  it('should reject invalid longitude (< -180)', async () => {
    const res = await stopApi.create({ nameTh: 'Test', nameEn: null, latitude: 14, longitude: -185, imageUrl: null, status: 'active' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Invalid longitude');
  });

  it('should accept valid boundary coordinates', async () => {
    const res = await stopApi.create({ nameTh: 'Boundary', nameEn: null, latitude: 90, longitude: 180, imageUrl: null, status: 'active' });
    expect(res.success).toBe(true);
  });

  it('should accept negative boundary coordinates', async () => {
    const res = await stopApi.create({ nameTh: 'Boundary2', nameEn: null, latitude: -90, longitude: -180, imageUrl: null, status: 'active' });
    expect(res.success).toBe(true);
  });

  // ── Update Validation ──
  it('should reject invalid latitude on update', async () => {
    const all = await stopApi.getAll();
    const s = all.data![0];
    const res = await stopApi.update(s.id, { latitude: 100 });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Invalid latitude');
  });

  it('should reject invalid longitude on update', async () => {
    const all = await stopApi.getAll();
    const s = all.data![0];
    const res = await stopApi.update(s.id, { longitude: 200 });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Invalid longitude');
  });

  // ── Delete Non-existent ──
  it('should return error when deleting non-existent route', async () => {
    const res = await routeApi.delete('route-fake');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Route not found');
  });

  it('should return error when deleting non-existent vehicle', async () => {
    const res = await vehicleApi.delete('v-fake');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Vehicle not found');
  });

  it('should return error when deleting non-existent stop', async () => {
    const res = await stopApi.delete('stop-fake');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Stop not found');
  });

  // ── Update Non-existent ──
  it('should return error when updating non-existent route', async () => {
    const res = await routeApi.update('route-fake', { name: 'X' });
    expect(res.success).toBe(false);
  });

  it('should return error when updating non-existent vehicle', async () => {
    const res = await vehicleApi.update('v-fake', { name: 'X' });
    expect(res.success).toBe(false);
  });

  it('should return error when updating non-existent stop', async () => {
    const res = await stopApi.update('stop-fake', { nameTh: 'X' });
    expect(res.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. ROUTE / STOP ORDERING (RouteStop API)
// ═══════════════════════════════════════════════════════════════
describe('RouteStop Ordering', () => {
  it('should fetch route stops by route (sorted by stopOrder)', async () => {
    const res = await routeStopApi.getByRoute('route-1');
    expect(res.success).toBe(true);
    expect(res.data!.length).toBeGreaterThan(0);

    // Verify sorted by stopOrder
    for (let i = 1; i < res.data!.length; i++) {
      expect(res.data![i].stopOrder).toBeGreaterThanOrEqual(res.data![i - 1].stopOrder);
    }
  });

  it('should include stop and route data in response', async () => {
    const res = await routeStopApi.getByRoute('route-1');
    const rs = res.data![0];
    expect(rs.stop).toBeDefined();
    expect(rs.route).toBeDefined();
    expect(rs.stop!.nameTh).toBeDefined();
  });

  it('should add a stop to a route', async () => {
    // Get current route-1 stops count
    const before = await routeStopApi.getByRoute('route-1');
    const count = before.data!.length;
    const maxOrder = Math.max(...before.data!.map(rs => rs.stopOrder));

    // Find a stop not yet on route-1
    const allStops = await stopApi.getAll();
    const usedStopIds = before.data!.map(rs => rs.stopId);
    const availableStop = allStops.data!.find(s => !usedStopIds.includes(s.id));

    if (availableStop) {
      const newOrder = maxOrder + 1;
      const res = await routeStopApi.addStop('route-1', availableStop.id, newOrder);
      expect(res.success).toBe(true);
      expect(res.data!.stopOrder).toBe(newOrder);

      const after = await routeStopApi.getByRoute('route-1');
      expect(after.data!.length).toBe(count + 1);
    }
  });

  it('should reject duplicate stop on same route', async () => {
    const routeStops = await routeStopApi.getByRoute('route-1');
    const existingStopId = routeStops.data![0].stopId;
    const maxOrder = Math.max(...routeStops.data!.map(rs => rs.stopOrder));

    const res = await routeStopApi.addStop('route-1', existingStopId, maxOrder + 1);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Stop already exists in this route');
  });

  it('should reject duplicate order on same route', async () => {
    const routeStops = await routeStopApi.getByRoute('route-1');
    const usedStopIds = routeStops.data!.map(rs => rs.stopId);
    const allStops = await stopApi.getAll();
    const availableStop = allStops.data!.find(s => !usedStopIds.includes(s.id));

    if (availableStop) {
      const existingOrder = routeStops.data![0].stopOrder;
      const res = await routeStopApi.addStop('route-1', availableStop.id, existingOrder);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Stop order already taken in this route');
    }
  });

  it('should reject adding stop with order < 1', async () => {
    const routeStops = await routeStopApi.getByRoute('route-1');
    const usedStopIds = routeStops.data!.map(rs => rs.stopId);
    const allStops = await stopApi.getAll();
    const availableStop = allStops.data!.find(s => !usedStopIds.includes(s.id));

    if (availableStop) {
      const res = await routeStopApi.addStop('route-1', availableStop.id, 0);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Stop order must be >= 1');
    }
  });

  it('should reject adding stop to non-existent route', async () => {
    const res = await routeStopApi.addStop('route-fake', 'stop-1', 1);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Route not found');
  });

  it('should reject adding non-existent stop', async () => {
    const res = await routeStopApi.addStop('route-1', 'stop-fake', 99);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Stop not found');
  });

  it('should remove a stop from a route and reorder remaining', async () => {
    const before = await routeStopApi.getByRoute('route-1');
    if (before.data!.length >= 3) {
      const toRemove = before.data![1]; // remove 2nd stop
      const res = await routeStopApi.removeStop(toRemove.id);
      expect(res.success).toBe(true);

      const after = await routeStopApi.getByRoute('route-1');
      expect(after.data!.length).toBe(before.data!.length - 1);

      // Verify orders are contiguous (no gaps)
      const orders = after.data!.map(rs => rs.stopOrder).sort((a, b) => a - b);
      for (let i = 0; i < orders.length; i++) {
        expect(orders[i]).toBe(i + 1);
      }
    }
  });

  it('should update stop order (move down)', async () => {
    const before = await routeStopApi.getByRoute('route-1');
    if (before.data!.length >= 2) {
      const first = before.data![0];
      const originalOrder = first.stopOrder;
      const res = await routeStopApi.updateOrder(first.id, originalOrder + 1);
      expect(res.success).toBe(true);

      const after = await routeStopApi.getByRoute('route-1');
      const moved = after.data!.find(rs => rs.id === first.id);
      expect(moved!.stopOrder).toBe(originalOrder + 1);

      // Verify no duplicate orders
      const orders = after.data!.map(rs => rs.stopOrder);
      expect(new Set(orders).size).toBe(orders.length);
    }
  });

  it('should update stop order (move up)', async () => {
    const before = await routeStopApi.getByRoute('route-1');
    if (before.data!.length >= 2) {
      const second = before.data![1];
      const originalOrder = second.stopOrder;
      const res = await routeStopApi.updateOrder(second.id, originalOrder - 1);
      expect(res.success).toBe(true);

      const after = await routeStopApi.getByRoute('route-1');
      const moved = after.data!.find(rs => rs.id === second.id);
      expect(moved!.stopOrder).toBe(originalOrder - 1);
    }
  });

  it('should reject order < 1', async () => {
    const routeStops = await routeStopApi.getByRoute('route-1');
    if (routeStops.data!.length > 0) {
      const res = await routeStopApi.updateOrder(routeStops.data![0].id, 0);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Stop order must be >= 1');
    }
  });

  it('should reject order exceeding route length', async () => {
    const routeStops = await routeStopApi.getByRoute('route-1');
    if (routeStops.data!.length > 0) {
      const res = await routeStopApi.updateOrder(routeStops.data![0].id, 999);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Stop order exceeds route length');
    }
  });

  it('should return error for non-existent routeStop', async () => {
    const res = await routeStopApi.removeStop('rs-fake');
    expect(res.success).toBe(false);
    expect(res.error).toBe('RouteStop not found');
  });

  it('should return error updating non-existent routeStop order', async () => {
    const res = await routeStopApi.updateOrder('rs-fake', 1);
    expect(res.success).toBe(false);
    expect(res.error).toBe('RouteStop not found');
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. AUTH / ADMIN LOGIN
// ═══════════════════════════════════════════════════════════════
describe('Auth', () => {
  it('should login with correct credentials', async () => {
    const res = await authApi.login('admin', 'admin123');
    expect(res.success).toBe(true);
    expect(res.data!.user.username).toBe('admin');
    expect(res.data!.user.role).toBe('ADMIN');
  });

  it('should reject wrong password', async () => {
    const res = await authApi.login('admin', 'wrongpassword');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Invalid username or password');
  });

  it('should reject wrong username', async () => {
    const res = await authApi.login('nonexistent', 'admin123');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Invalid username or password');
  });

  it('should reject empty credentials', async () => {
    const res = await authApi.login('', '');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Invalid username or password');
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. PUBLIC WEB — Route/Stop Data Flow
// ═══════════════════════════════════════════════════════════════
describe('Public Web Data Flow', () => {
  it('should provide active routes for public viewer', async () => {
    const res = await routeApi.getActive();
    expect(res.success).toBe(true);
    expect(res.data!.length).toBeGreaterThanOrEqual(1);
    expect(res.data!.every(r => r.status === 'active')).toBe(true);
  });

  it('should provide stops with valid coordinates', async () => {
    const res = await stopApi.getAll();
    expect(res.success).toBe(true);
    for (const stop of res.data!) {
      expect(stop.latitude).toBeGreaterThanOrEqual(-90);
      expect(stop.latitude).toBeLessThanOrEqual(90);
      expect(stop.longitude).toBeGreaterThanOrEqual(-180);
      expect(stop.longitude).toBeLessThanOrEqual(180);
      expect(stop.nameTh).toBeTruthy();
    }
  });

  it('should provide route stops with stop details for map rendering', async () => {
    const routes = await routeApi.getActive();
    for (const route of routes.data!) {
      const routeStops = await routeStopApi.getByRoute(route.id);
      expect(routeStops.success).toBe(true);
      for (const rs of routeStops.data!) {
        expect(rs.stop).toBeDefined();
        expect(rs.stop!.latitude).toBeDefined();
        expect(rs.stop!.longitude).toBeDefined();
        expect(rs.route).toBeDefined();
      }
    }
  });

  it('should provide consistent data between getAll and getById', async () => {
    const all = await routeApi.getAll();
    for (const route of all.data!) {
      const byId = await routeApi.getById(route.id);
      expect(byId.success).toBe(true);
      expect(byId.data!.name).toBe(route.name);
      expect(byId.data!.color).toBe(route.color);
      expect(byId.data!.status).toBe(route.status);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. CASCADE / INTEGRITY
// ═══════════════════════════════════════════════════════════════
describe('Data Integrity', () => {
  it('should clean up routeStops when a stop is deleted', async () => {
    // Create a temporary stop, add it to a route, then delete the stop
    const stopRes = await stopApi.create({
      nameTh: 'Temp Stop',
      nameEn: null,
      latitude: 14.03,
      longitude: 100.65,
      imageUrl: null,
      status: 'active',
    });
    expect(stopRes.success).toBe(true);
    const stopId = stopRes.data!.id;

    // Add to route-1
    const before = await routeStopApi.getByRoute('route-1');
    const maxOrder = Math.max(...before.data!.map(rs => rs.stopOrder));
    const addRes = await routeStopApi.addStop('route-1', stopId, maxOrder + 1);
    expect(addRes.success).toBe(true);

    // Delete the stop
    const delRes = await stopApi.delete(stopId);
    expect(delRes.success).toBe(true);

    // Verify routeStop was also cleaned up
    const after = await routeStopApi.getByRoute('route-1');
    expect(after.data!.find(rs => rs.stopId === stopId)).toBeUndefined();
  });

  it('should clean up routeStops when a route is deleted', async () => {
    // Create a temporary route with a stop
    const routeRes = await routeApi.create({ name: 'Temp Route', color: '#FFF', status: 'active' });
    const routeId = routeRes.data!.id;

    const allStops = await stopApi.getAll();
    const stopId = allStops.data![0].id;
    await routeStopApi.addStop(routeId, stopId, 1);

    // Verify it's there
    const before = await routeStopApi.getByRoute(routeId);
    expect(before.data!.length).toBe(1);

    // Delete the route
    const delRes = await routeApi.delete(routeId);
    expect(delRes.success).toBe(true);

    // RouteStops should be cleaned up
    const after = await routeStopApi.getByRoute(routeId);
    expect(after.data!.length).toBe(0);
  });
});
