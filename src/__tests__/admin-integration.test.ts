/**
 * Sprint 1 — Admin ↔ Backend Integration Tests
 * Tests: Zustand Store ↔ mockApi full CRUD lifecycle for all admin entities
 */
import { describe, it, expect } from 'vitest';
import { routeApi, vehicleApi, stopApi, routeStopApi } from '../api/mockApi';

// ═══════════════════════════════════════════════════════════════
// 1. ADMIN — Route CRUD Integration
// ═══════════════════════════════════════════════════════════════
describe('Admin ↔ Route API Integration', () => {
  it('should complete full Route lifecycle: create → read → update → delete', async () => {
    // CREATE
    const createRes = await routeApi.create({
      name: 'Integration Test Route',
      color: '#FF5733',
      status: 'active',
    });
    expect(createRes.success).toBe(true);
    const routeId = createRes.data!.id;

    // READ — verify it appears in list
    const allRes = await routeApi.getAll();
    expect(allRes.success).toBe(true);
    const found = allRes.data!.find(r => r.id === routeId);
    expect(found).toBeDefined();
    expect(found!.name).toBe('Integration Test Route');

    // READ — get by id
    const byIdRes = await routeApi.getById(routeId);
    expect(byIdRes.success).toBe(true);
    expect(byIdRes.data!.color).toBe('#FF5733');

    // UPDATE
    const updateRes = await routeApi.update(routeId, { name: 'Updated Route', color: '#00FF00' });
    expect(updateRes.success).toBe(true);
    expect(updateRes.data!.name).toBe('Updated Route');
    expect(updateRes.data!.color).toBe('#00FF00');

    // Verify update persists
    const verifyUpdate = await routeApi.getById(routeId);
    expect(verifyUpdate.data!.name).toBe('Updated Route');

    // DELETE
    const deleteRes = await routeApi.delete(routeId);
    expect(deleteRes.success).toBe(true);

    // Verify deletion
    const verifyDelete = await routeApi.getById(routeId);
    expect(verifyDelete.success).toBe(false);
    expect(verifyDelete.error).toBe('Route not found');
  });

  it('should filter active routes correctly', async () => {
    const res = await routeApi.getActive();
    expect(res.success).toBe(true);
    expect(res.data!.every(r => r.status === 'active')).toBe(true);
    expect(res.data!.length).toBeGreaterThanOrEqual(1);
  });

  it('should reject invalid route operations gracefully', async () => {
    const getRes = await routeApi.getById('route-does-not-exist');
    expect(getRes.success).toBe(false);

    const updateRes = await routeApi.update('route-does-not-exist', { name: 'X' });
    expect(updateRes.success).toBe(false);

    const deleteRes = await routeApi.delete('route-does-not-exist');
    expect(deleteRes.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. ADMIN — Vehicle CRUD Integration
// ═══════════════════════════════════════════════════════════════
describe('Admin ↔ Vehicle API Integration', () => {
  it('should complete full Vehicle lifecycle: create → read → update → delete', async () => {
    const createRes = await vehicleApi.create({
      name: 'Integration Test Bus',
      type: 'bus',
      assignedRouteId: null,
      status: 'inactive',
    });
    expect(createRes.success).toBe(true);
    const vehicleId = createRes.data!.id;

    // READ — list
    const allRes = await vehicleApi.getAll();
    expect(allRes.success).toBe(true);
    const found = allRes.data!.find(v => v.id === vehicleId);
    expect(found).toBeDefined();
    expect(found!.name).toBe('Integration Test Bus');
    expect(found!.status).toBe('inactive');

    // READ — by id
    const byIdRes = await vehicleApi.getById(vehicleId);
    expect(byIdRes.success).toBe(true);
    expect(byIdRes.data!.type).toBe('bus');

    // UPDATE — change status and assign route
    const updateRes = await vehicleApi.update(vehicleId, {
      status: 'active',
      assignedRouteId: 'route-1',
      name: 'Updated Test Bus',
    });
    expect(updateRes.success).toBe(true);
    expect(updateRes.data!.status).toBe('active');
    expect(updateRes.data!.assignedRouteId).toBe('route-1');
    expect(updateRes.data!.name).toBe('Updated Test Bus');

    // DELETE
    const deleteRes = await vehicleApi.delete(vehicleId);
    expect(deleteRes.success).toBe(true);

    const verifyDelete = await vehicleApi.getById(vehicleId);
    expect(verifyDelete.success).toBe(false);
  });

  it('should reject vehicle with empty name', async () => {
    const res = await vehicleApi.create({
      name: '',
      type: 'bus',
      assignedRouteId: null,
      status: 'inactive',
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Name is required');
  });

  it('should reject vehicle with empty type', async () => {
    const res = await vehicleApi.create({
      name: 'Test',
      type: '',
      assignedRouteId: null,
      status: 'inactive',
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Type is required');
  });

  it('should handle vehicle-route assignment flow', async () => {
    const createRes = await vehicleApi.create({
      name: 'Unassigned Bus',
      type: 'minibus',
      assignedRouteId: null,
      status: 'inactive',
    });
    const vehicleId = createRes.data!.id;

    // Assign to a route
    const assignRes = await vehicleApi.update(vehicleId, { assignedRouteId: 'route-2' });
    expect(assignRes.success).toBe(true);
    expect(assignRes.data!.assignedRouteId).toBe('route-2');

    // Unassign from route
    const unassignRes = await vehicleApi.update(vehicleId, { assignedRouteId: null });
    expect(unassignRes.success).toBe(true);
    expect(unassignRes.data!.assignedRouteId).toBeNull();

    // Cleanup
    await vehicleApi.delete(vehicleId);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. ADMIN — Stop CRUD Integration
// ═══════════════════════════════════════════════════════════════
describe('Admin ↔ Stop API Integration', () => {
  it('should complete full Stop lifecycle with Thai/English names', async () => {
    const createRes = await stopApi.create({
      nameTh: 'ทดสอบ ป้ายรถ',
      nameEn: 'Test Bus Stop',
      latitude: 14.035,
      longitude: 100.655,
      imageUrl: null,
      status: 'active',
    });
    expect(createRes.success).toBe(true);
    const stopId = createRes.data!.id;

    // READ — list
    const allRes = await stopApi.getAll();
    expect(allRes.success).toBe(true);
    const found = allRes.data!.find(s => s.id === stopId);
    expect(found).toBeDefined();
    expect(found!.nameTh).toBe('ทดสอบ ป้ายรถ');
    expect(found!.nameEn).toBe('Test Bus Stop');

    // READ — by id
    const byIdRes = await stopApi.getById(stopId);
    expect(byIdRes.success).toBe(true);
    expect(byIdRes.data!.latitude).toBe(14.035);

    // UPDATE
    const updateRes = await stopApi.update(stopId, {
      nameTh: 'ทดสอบ อัปเดต',
      latitude: 14.040,
    });
    expect(updateRes.success).toBe(true);
    expect(updateRes.data!.nameTh).toBe('ทดสอบ อัปเดต');
    expect(updateRes.data!.latitude).toBe(14.040);
    // Unchanged fields preserved
    expect(updateRes.data!.longitude).toBe(100.655);

    // DELETE
    const deleteRes = await stopApi.delete(stopId);
    expect(deleteRes.success).toBe(true);

    const verifyDelete = await stopApi.getById(stopId);
    expect(verifyDelete.success).toBe(false);
  });

  it('should validate stop coordinates on create', async () => {
    // Invalid latitude
    const invalidLat = await stopApi.create({
      nameTh: 'Bad Lat',
      nameEn: null,
      latitude: 999,
      longitude: 100,
      imageUrl: null,
      status: 'active',
    });
    expect(invalidLat.success).toBe(false);
    expect(invalidLat.error).toBe('Invalid latitude');

    // Invalid longitude
    const invalidLng = await stopApi.create({
      nameTh: 'Bad Lng',
      nameEn: null,
      latitude: 14,
      longitude: 999,
      imageUrl: null,
      status: 'active',
    });
    expect(invalidLng.success).toBe(false);
    expect(invalidLng.error).toBe('Invalid longitude');
  });

  it('should handle Thai/English name display fields', async () => {
    const createRes = await stopApi.create({
      nameTh: 'อาคารวิศวกรรม',
      nameEn: 'Engineering Building',
      latitude: 14.0328,
      longitude: 100.6518,
      imageUrl: null,
      status: 'active',
    });
    expect(createRes.success).toBe(true);
    expect(createRes.data!.nameTh).toBe('อาคารวิศวกรรม');
    expect(createRes.data!.nameEn).toBe('Engineering Building');

    const byId = await stopApi.getById(createRes.data!.id);
    expect(byId.data!.nameTh).toBeTruthy();
    expect(byId.data!.nameEn).toBeTruthy();

    await stopApi.delete(createRes.data!.id);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. ADMIN — RouteStop Management Integration
// ═══════════════════════════════════════════════════════════════
describe('Admin ↔ RouteStop API Integration', () => {
  it('should add a stop to a route and verify it appears', async () => {
    const existing = await routeStopApi.getByRoute('route-1');
    const usedIds = existing.data!.map(rs => rs.stopId);
    const allStops = await stopApi.getAll();
    const available = allStops.data!.find(s => !usedIds.includes(s.id));

    if (available) {
      const maxOrder = Math.max(...existing.data!.map(rs => rs.stopOrder));
      const addRes = await routeStopApi.addStop('route-1', available.id, maxOrder + 1);
      expect(addRes.success).toBe(true);

      const after = await routeStopApi.getByRoute('route-1');
      const added = after.data!.find(rs => rs.stopId === available.id);
      expect(added).toBeDefined();
      expect(added!.stop!.nameTh).toBe(available.nameTh);

      // Cleanup
      await routeStopApi.removeStop(addRes.data!.id);
    }
  });

  it('should reorder stops and verify new order', async () => {
    const stops = await routeStopApi.getByRoute('route-2');
    expect(stops.data!.length).toBeGreaterThanOrEqual(2);

    const first = stops.data![0];
    const originalOrder = first.stopOrder;

    // Move first to second position
    const swapRes = await routeStopApi.updateOrder(first.id, originalOrder + 1);
    expect(swapRes.success).toBe(true);

    const after = await routeStopApi.getByRoute('route-2');
    const moved = after.data!.find(rs => rs.id === first.id);
    expect(moved!.stopOrder).toBe(originalOrder + 1);

    // Restore original order
    await routeStopApi.updateOrder(first.id, originalOrder);
  });

  it('should remove a stop and verify remaining orders are contiguous', async () => {
    // Create temp route with stops to safely test
    const routeRes = await routeApi.create({ name: 'Temp Route', color: '#AAA', status: 'active' });
    const routeId = routeRes.data!.id;
    const allStops = await stopApi.getAll();

    // Add 3 stops
    const ids: string[] = [];
    for (let i = 0; i < Math.min(3, allStops.data!.length); i++) {
      const res = await routeStopApi.addStop(routeId, allStops.data![i].id, i + 1);
      ids.push(res.data!.id);
    }

    // Remove the middle one
    await routeStopApi.removeStop(ids[1]);

    // Verify remaining orders are contiguous
    const after = await routeStopApi.getByRoute(routeId);
    const orders = after.data!.map(rs => rs.stopOrder).sort((a, b) => a - b);
    for (let i = 0; i < orders.length; i++) {
      expect(orders[i]).toBe(i + 1);
    }

    // Cleanup
    for (const id of ids) {
      try { await routeStopApi.removeStop(id); } catch {}
    }
    await routeApi.delete(routeId);
  });

  it('should cascade delete routeStops when route is deleted', async () => {
    const routeRes = await routeApi.create({ name: 'Cascade Route', color: '#F00', status: 'active' });
    const routeId = routeRes.data!.id;
    const allStops = await stopApi.getAll();
    const addRes = await routeStopApi.addStop(routeId, allStops.data![0].id, 1);
    expect(addRes.success).toBe(true);

    const before = await routeStopApi.getByRoute(routeId);
    expect(before.data!.length).toBe(1);

    await routeApi.delete(routeId);

    const after = await routeStopApi.getByRoute(routeId);
    expect(after.data!.length).toBe(0);
  });

  it('should cascade delete routeStops when stop is deleted', async () => {
    const stopRes = await stopApi.create({
      nameTh: 'Cascade Stop',
      nameEn: null,
      latitude: 14.03,
      longitude: 100.65,
      imageUrl: null,
      status: 'active',
    });
    const stopId = stopRes.data!.id;
    const existing = await routeStopApi.getByRoute('route-2');
    const maxOrder = Math.max(...existing.data!.map(rs => rs.stopOrder));
    const addRes = await routeStopApi.addStop('route-2', stopId, maxOrder + 1);
    expect(addRes.success).toBe(true);

    await stopApi.delete(stopId);

    const after = await routeStopApi.getByRoute('route-2');
    expect(after.data!.find(rs => rs.stopId === stopId)).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. ADMIN — Cross-entity Integration
// ═══════════════════════════════════════════════════════════════
describe('Admin ↔ Cross-entity Integration', () => {
  it('should handle full admin workflow: create route → add stops → assign vehicle', async () => {
    // 1. Create a new route
    const routeRes = await routeApi.create({
      name: 'Full Workflow Route',
      color: '#9333EA',
      status: 'active',
    });
    expect(routeRes.success).toBe(true);
    const routeId = routeRes.data!.id;

    // 2. Add 2 stops to the route
    const allStops = await stopApi.getAll();
    const rs1 = await routeStopApi.addStop(routeId, allStops.data![0].id, 1);
    const rs2 = await routeStopApi.addStop(routeId, allStops.data![1].id, 2);
    expect(rs1.success).toBe(true);
    expect(rs2.success).toBe(true);

    // 3. Verify route has 2 stops
    const routeStops = await routeStopApi.getByRoute(routeId);
    expect(routeStops.data!.length).toBe(2);

    // 4. Create a vehicle and assign it to the route
    const vehicleRes = await vehicleApi.create({
      name: 'Workflow Bus',
      type: 'bus',
      assignedRouteId: routeId,
      status: 'active',
    });
    expect(vehicleRes.success).toBe(true);
    expect(vehicleRes.data!.assignedRouteId).toBe(routeId);

    // 5. Verify vehicle appears in vehicle list with correct assignment
    const allVehicles = await vehicleApi.getAll();
    const assigned = allVehicles.data!.find(v => v.id === vehicleRes.data!.id);
    expect(assigned!.assignedRouteId).toBe(routeId);

    // Cleanup
    await vehicleApi.delete(vehicleRes.data!.id);
    await routeStopApi.removeStop(rs1.data!.id);
    await routeStopApi.removeStop(rs2.data!.id);
    await routeApi.delete(routeId);
  });
});
