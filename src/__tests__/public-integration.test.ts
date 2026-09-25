/**
 * Sprint 1 — Public Web ↔ Backend Integration Tests
 * Tests: Public data flow — active routes, route stops, stop details, map data
 */
import { describe, it, expect } from 'vitest';
import { routeApi, stopApi, routeStopApi } from '../api/mockApi';

// ═══════════════════════════════════════════════════════════════
// 1. PUBLIC — Active Route Loading
// ═══════════════════════════════════════════════════════════════
describe('Public ↔ Active Route Loading', () => {
  it('should load only active routes for public viewer', async () => {
    const res = await routeApi.getActive();
    expect(res.success).toBe(true);
    expect(res.data!.length).toBeGreaterThanOrEqual(1);
    // All returned routes must be active
    expect(res.data!.every(r => r.status === 'active')).toBe(true);
  });

  it('should return route details needed for display (name, color, status)', async () => {
    const res = await routeApi.getActive();
    for (const route of res.data!) {
      expect(route.id).toBeTruthy();
      expect(route.name).toBeTruthy();
      expect(route.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(route.status).toBe('active');
    }
  });

  it('should not include inactive routes in active list', async () => {
    // Create an inactive route
    const inactive = await routeApi.create({
      name: 'Inactive Test Route',
      color: '#999999',
      status: 'inactive',
    });
    expect(inactive.success).toBe(true);

    // Verify it does NOT appear in getActive
    const activeRes = await routeApi.getActive();
    const found = activeRes.data!.find(r => r.id === inactive.data!.id);
    expect(found).toBeUndefined();

    // Cleanup
    await routeApi.delete(inactive.data!.id);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. PUBLIC — Route Stop Loading (Ordered)
// ═══════════════════════════════════════════════════════════════
describe('Public ↔ Route Stop Loading', () => {
  it('should load stops for each active route sorted by stopOrder', async () => {
    const activeRoutes = await routeApi.getActive();
    for (const route of activeRoutes.data!) {
      const routeStops = await routeStopApi.getByRoute(route.id);
      expect(routeStops.success).toBe(true);
      expect(routeStops.data!.length).toBeGreaterThanOrEqual(1);

      // Verify sorted by stopOrder ascending
      for (let i = 1; i < routeStops.data!.length; i++) {
        expect(routeStops.data![i].stopOrder).toBeGreaterThanOrEqual(
          routeStops.data![i - 1].stopOrder
        );
      }
    }
  });

  it('should include stop details (nameTh, nameEn, coordinates) in route stops', async () => {
    const routeStops = await routeStopApi.getByRoute('route-1');
    expect(routeStops.success).toBe(true);

    for (const rs of routeStops.data!) {
      // Stop data must be included
      expect(rs.stop).toBeDefined();
      expect(rs.stop!.nameTh).toBeTruthy();
      expect(typeof rs.stop!.latitude).toBe('number');
      expect(typeof rs.stop!.longitude).toBe('number');

      // Route data must be included
      expect(rs.route).toBeDefined();
      expect(rs.route!.name).toBeTruthy();
      expect(rs.route!.color).toBeTruthy();
    }
  });

  it('should display sequential stopOrder without gaps', async () => {
    const routeStops = await routeStopApi.getByRoute('route-1');
    expect(routeStops.success).toBe(true);

    const orders = routeStops.data!.map(rs => rs.stopOrder).sort((a, b) => a - b);
    for (let i = 0; i < orders.length; i++) {
      expect(orders[i]).toBe(i + 1); // Orders start at 1, no gaps
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. PUBLIC — Stop Data for Map Rendering
// ═══════════════════════════════════════════════════════════════
describe('Public ↔ Map Rendering Data', () => {
  it('should provide stops with valid GPS coordinates for map markers', async () => {
    const allStops = await stopApi.getAll();
    expect(allStops.success).toBe(true);
    expect(allStops.data!.length).toBeGreaterThanOrEqual(1);

    for (const stop of allStops.data!) {
      // Latitude: -90 to 90
      expect(stop.latitude).toBeGreaterThanOrEqual(-90);
      expect(stop.latitude).toBeLessThanOrEqual(90);
      // Longitude: -180 to 180
      expect(stop.longitude).toBeGreaterThanOrEqual(-180);
      expect(stop.longitude).toBeLessThanOrEqual(180);
      // Must have a name for tooltip
      expect(stop.nameTh).toBeTruthy();
    }
  });

  it('should provide valid coordinates for route-1 stops for polyline rendering', async () => {
    const routeStops = await routeStopApi.getByRoute('route-1');
    expect(routeStops.success).toBe(true);
    expect(routeStops.data!.length).toBeGreaterThanOrEqual(2);

    // Each stop should have valid coordinates for drawing a polyline
    for (const rs of routeStops.data!) {
      expect(rs.stop!.latitude).toBeGreaterThan(0); // Thailand is in northern hemisphere
      expect(rs.stop!.longitude).toBeGreaterThan(90); // Thailand is east of 90°E
    }
  });

  it('should provide unique stop positions for distinct map markers', async () => {
    const allStops = await stopApi.getAll();
    const positions = allStops.data!.map(s => `${s.latitude},${s.longitude}`);

    // Check at least some stops have unique positions
    const uniquePositions = new Set(positions);
    expect(uniquePositions.size).toBeGreaterThanOrEqual(5);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. PUBLIC — Thai/English Name Display
// ═══════════════════════════════════════════════════════════════
describe('Public ↔ Thai/English Name Display', () => {
  it('should have nameTh for all stops', async () => {
    const allStops = await stopApi.getAll();
    for (const stop of allStops.data!) {
      expect(stop.nameTh).toBeTruthy();
      expect(typeof stop.nameTh).toBe('string');
      expect(stop.nameTh.length).toBeGreaterThan(0);
    }
  });

  it('should have nameEn available for most stops', async () => {
    const allStops = await stopApi.getAll();
    const withEnglish = allStops.data!.filter(s => s.nameEn && s.nameEn.length > 0);
    // At least 80% of stops should have English names
    expect(withEnglish.length).toBeGreaterThanOrEqual(Math.floor(allStops.data!.length * 0.8));
  });

  it('should provide both nameTh and nameEn for display on route stops', async () => {
    const routeStops = await routeStopApi.getByRoute('route-2');
    for (const rs of routeStops.data!) {
      expect(rs.stop!.nameTh).toBeTruthy();
      // nameEn may be null but should be a string type
      if (rs.stop!.nameEn !== null) {
        expect(typeof rs.stop!.nameEn).toBe('string');
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. PUBLIC — Full Data Flow (Simulating Page Load)
// ═══════════════════════════════════════════════════════════════
describe('Public ↔ Full Page Data Flow', () => {
  it('should simulate HomePage load: fetch active routes → fetch route stops → render map data', async () => {
    // Step 1: Fetch active routes (simulates useEffect on mount)
    const routesRes = await routeApi.getActive();
    expect(routesRes.success).toBe(true);
    const activeRoutes = routesRes.data!;
    expect(activeRoutes.length).toBeGreaterThanOrEqual(1);

    // Step 2: For each route, fetch its stops (simulates route click / auto-expand)
    const routeStopData: Record<string, { name: string; color: string; stops: { nameTh: string; lat: number; lng: number }[] }> = {};

    for (const route of activeRoutes) {
      const rsRes = await routeStopApi.getByRoute(route.id);
      expect(rsRes.success).toBe(true);

      routeStopData[route.id] = {
        name: route.name,
        color: route.color,
        stops: rsRes.data!.map(rs => ({
          nameTh: rs.stop!.nameTh,
          lat: rs.stop!.latitude,
          lng: rs.stop!.longitude,
        })),
      };
    }

    // Step 3: Verify data structure is complete for rendering
    for (const [routeId, data] of Object.entries(routeStopData)) {
      expect(data.name).toBeTruthy();
      expect(data.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(data.stops.length).toBeGreaterThanOrEqual(1);

      for (const stop of data.stops) {
        expect(stop.nameTh).toBeTruthy();
        expect(stop.lat).toBeGreaterThan(0);
        expect(stop.lng).toBeGreaterThan(90);
      }
    }
  });

  it('should simulate route selection: get specific route stops with ordering', async () => {
    // Simulate user clicking "Green Line"
    const route = await routeApi.getById('route-2');
    expect(route.success).toBe(true);
    expect(route.data!.name).toContain('Green');

    const stops = await routeStopApi.getByRoute('route-2');
    expect(stops.success).toBe(true);
    expect(stops.data!.length).toBeGreaterThanOrEqual(1);

    // Verify ordered list for sequential display
    const ordered = stops.data!.sort((a, b) => a.stopOrder - b.stopOrder);
    for (let i = 0; i < ordered.length; i++) {
      expect(ordered[i].stopOrder).toBe(i + 1);
      expect(ordered[i].stop!.nameTh).toBeTruthy();
      expect(ordered[i].stop!.latitude).toBeDefined();
      expect(ordered[i].stop!.longitude).toBeDefined();
    }
  });

  it('should simulate map marker generation from route stops', async () => {
    const routeStops = await routeStopApi.getByRoute('route-3');
    expect(routeStops.success).toBe(true);

    // Simulate LeafletMap markers array
    const markers = routeStops.data!.map((rs, idx) => ({
      lat: rs.stop!.latitude,
      lng: rs.stop!.longitude,
      title: `${rs.stop!.nameTh}${rs.stop!.nameEn ? ` (${rs.stop!.nameEn})` : ''}`,
      color: rs.route!.color,
      order: idx + 1,
    }));

    expect(markers.length).toBeGreaterThanOrEqual(1);
    for (const m of markers) {
      expect(typeof m.lat).toBe('number');
      expect(typeof m.lng).toBe('number');
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }

    // Simulate polyline path
    const routePath = routeStops.data!.map(rs => ({
      lat: rs.stop!.latitude,
      lng: rs.stop!.longitude,
      color: rs.route!.color,
    }));
    expect(routePath.length).toBe(markers.length);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. PUBLIC — Data Consistency
// ═══════════════════════════════════════════════════════════════
describe('Public ↔ Data Consistency', () => {
  it('should return consistent data between getAll and getById for routes', async () => {
    const all = await routeApi.getAll();
    for (const route of all.data!) {
      const byId = await routeApi.getById(route.id);
      expect(byId.success).toBe(true);
      expect(byId.data!.name).toBe(route.name);
      expect(byId.data!.color).toBe(route.color);
      expect(byId.data!.status).toBe(route.status);
    }
  });

  it('should return consistent data between getAll and getById for stops', async () => {
    const all = await stopApi.getAll();
    for (const stop of all.data!) {
      const byId = await stopApi.getById(stop.id);
      expect(byId.success).toBe(true);
      expect(byId.data!.nameTh).toBe(stop.nameTh);
      expect(byId.data!.latitude).toBe(stop.latitude);
      expect(byId.data!.longitude).toBe(stop.longitude);
    }
  });

  it('should have matching routeIds between routes and routeStops', async () => {
    const activeRoutes = await routeApi.getActive();
    const activeIds = new Set(activeRoutes.data!.map(r => r.id));

    for (const route of activeRoutes.data!) {
      const routeStops = await routeStopApi.getByRoute(route.id);
      for (const rs of routeStops.data!) {
        expect(rs.routeId).toBe(route.id);
        expect(rs.route!.id).toBe(route.id);
        expect(activeIds.has(rs.routeId)).toBe(true);
      }
    }
  });

  it('should have matching stopIds between stops and routeStops', async () => {
    const allStops = await stopApi.getAll();
    const stopIds = new Set(allStops.data!.map(s => s.id));

    const routeStops = await routeStopApi.getByRoute('route-1');
    for (const rs of routeStops.data!) {
      expect(stopIds.has(rs.stopId)).toBe(true);
      expect(rs.stop!.id).toBe(rs.stopId);
    }
  });
});
