import type { Vehicle, Route, Stop, RouteStop } from '../types';

// ─── Routes ──────────────────────────────────────────
// Local campus shuttle routes between buildings at Rangsit University
export const initialRoutes: Route[] = [
  { id: 'route-1', name: 'Blue Line — Main Gate Loop', color: '#2563EB', status: 'active', createdAt: '2026-01-15T08:00:00Z' },
  { id: 'route-2', name: 'Green Line — Academic Zone', color: '#16A34A', status: 'active', createdAt: '2026-02-01T08:00:00Z' },
  { id: 'route-3', name: 'Red Line — Student Services', color: '#DC2626', status: 'active', createdAt: '2026-03-10T08:00:00Z' },
];

// ─── Stops ───────────────────────────────────────────
// Campus buildings at Rangsit University (tight cluster ~14.033°N, 100.651°E)
export const initialStops: Stop[] = [
  { id: 'stop-1',  nameTh: 'Main Gate', nameEn: 'Main Gate', latitude: 14.0310, longitude: 100.6500, imageUrl: null, status: 'active', createdAt: '2026-01-15T08:00:00Z' },
  { id: 'stop-2',  nameTh: 'Admin Building', nameEn: 'Admin Building', latitude: 14.0318, longitude: 100.6508, imageUrl: null, status: 'active', createdAt: '2026-01-15T08:00:00Z' },
  { id: 'stop-3',  nameTh: 'Faculty of Engineering', nameEn: 'Faculty of Engineering', latitude: 14.0328, longitude: 100.6518, imageUrl: null, status: 'active', createdAt: '2026-01-15T08:00:00Z' },
  { id: 'stop-4',  nameTh: 'Faculty of Science', nameEn: 'Faculty of Science', latitude: 14.0338, longitude: 100.6528, imageUrl: null, status: 'active', createdAt: '2026-01-15T08:00:00Z' },
  { id: 'stop-5',  nameTh: 'Faculty of Business', nameEn: 'Faculty of Business', latitude: 14.0345, longitude: 100.6515, imageUrl: null, status: 'active', createdAt: '2026-01-15T08:00:00Z' },
  { id: 'stop-6',  nameTh: 'Central Library', nameEn: 'Central Library', latitude: 14.0332, longitude: 100.6505, imageUrl: null, status: 'active', createdAt: '2026-01-15T08:00:00Z' },
  { id: 'stop-7',  nameTh: 'Student Union', nameEn: 'Student Union', latitude: 14.0322, longitude: 100.6495, imageUrl: null, status: 'active', createdAt: '2026-01-15T08:00:00Z' },
  { id: 'stop-8',  nameTh: 'Sports Complex', nameEn: 'Sports Complex', latitude: 14.0342, longitude: 100.6535, imageUrl: null, status: 'active', createdAt: '2026-01-15T08:00:00Z' },
  { id: 'stop-9',  nameTh: 'Canteen Area', nameEn: 'Canteen Area', latitude: 14.0325, longitude: 100.6512, imageUrl: null, status: 'active', createdAt: '2026-01-15T08:00:00Z' },
  { id: 'stop-10', nameTh: 'Computer Center', nameEn: 'Computer Center', latitude: 14.0335, longitude: 100.6522, imageUrl: null, status: 'active', createdAt: '2026-01-15T08:00:00Z' },
];

// ─── RouteStops ──────────────────────────────────────
export const initialRouteStops: RouteStop[] = [
  // Blue Line — Main Gate Loop: Gate → Admin → Canteen → Library → Business → Gate
  { id: 'rs-1',  routeId: 'route-1', stopId: 'stop-1', stopOrder: 1, createdAt: '' },
  { id: 'rs-2',  routeId: 'route-1', stopId: 'stop-2', stopOrder: 2, createdAt: '' },
  { id: 'rs-3',  routeId: 'route-1', stopId: 'stop-9', stopOrder: 3, createdAt: '' },
  { id: 'rs-4',  routeId: 'route-1', stopId: 'stop-6', stopOrder: 4, createdAt: '' },
  { id: 'rs-5',  routeId: 'route-1', stopId: 'stop-5', stopOrder: 5, createdAt: '' },
  { id: 'rs-6',  routeId: 'route-1', stopId: 'stop-7', stopOrder: 6, createdAt: '' },
  { id: 'rs-7',  routeId: 'route-1', stopId: 'stop-1', stopOrder: 7, createdAt: '' },

  // Green Line — Academic Zone: Gate → Engineering → Science → Computer → Sports
  { id: 'rs-8',  routeId: 'route-2', stopId: 'stop-1', stopOrder: 1, createdAt: '' },
  { id: 'rs-9',  routeId: 'route-2', stopId: 'stop-3', stopOrder: 2, createdAt: '' },
  { id: 'rs-10', routeId: 'route-2', stopId: 'stop-4', stopOrder: 3, createdAt: '' },
  { id: 'rs-11', routeId: 'route-2', stopId: 'stop-10', stopOrder: 4, createdAt: '' },
  { id: 'rs-12', routeId: 'route-2', stopId: 'stop-8', stopOrder: 5, createdAt: '' },

  // Red Line — Student Services: Gate → Library → Canteen → Student Union → Business
  { id: 'rs-13', routeId: 'route-3', stopId: 'stop-1', stopOrder: 1, createdAt: '' },
  { id: 'rs-14', routeId: 'route-3', stopId: 'stop-6', stopOrder: 2, createdAt: '' },
  { id: 'rs-15', routeId: 'route-3', stopId: 'stop-9', stopOrder: 3, createdAt: '' },
  { id: 'rs-16', routeId: 'route-3', stopId: 'stop-7', stopOrder: 4, createdAt: '' },
  { id: 'rs-17', routeId: 'route-3', stopId: 'stop-5', stopOrder: 5, createdAt: '' },
];

// ─── Vehicles ────────────────────────────────────────
export const initialVehicles: Vehicle[] = [
  { id: 'v-1', name: 'Shuttle Bus 01', type: 'bus', assignedRouteId: 'route-1', status: 'active', createdAt: '2026-01-20T08:00:00Z' },
  { id: 'v-2', name: 'Shuttle Bus 02', type: 'bus', assignedRouteId: 'route-2', status: 'active', createdAt: '2026-01-20T08:00:00Z' },
  { id: 'v-3', name: 'Shuttle Bus 03', type: 'minibus', assignedRouteId: 'route-3', status: 'active', createdAt: '2026-02-10T08:00:00Z' },
  { id: 'v-4', name: 'Shuttle Bus 04', type: 'bus', assignedRouteId: null, status: 'maintenance', createdAt: '2026-03-01T08:00:00Z' },
];
