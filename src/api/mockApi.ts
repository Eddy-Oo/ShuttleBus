import { v4 as uuidv4 } from 'uuid';
import type { Vehicle, Route, Stop, RouteStop, Trip, ApiResponse } from '../types';
import { initialVehicles, initialRoutes, initialStops, initialRouteStops } from '../data/mockData';

let vehicles: Vehicle[] = [...initialVehicles];
let routes: Route[] = [...initialRoutes];
let stops: Stop[] = [...initialStops];
let routeStops: RouteStop[] = [...initialRouteStops];

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Auth ────────────────────────────────────────────
export const authApi = {
  async login(username: string, password: string): Promise<ApiResponse<{ user: { id: string; username: string; role: string } }>> {
    await delay(400);
    if (username === 'admin' && password === 'admin123') {
      return { success: true, data: { user: { id: 'u-1', username: 'admin', role: 'ADMIN' } }, message: 'Login successful' };
    }
    return { success: false, error: 'Invalid username or password' };
  },
};

// ─── Routes ──────────────────────────────────────────
export const routeApi = {
  async getAll(): Promise<ApiResponse<Route[]>> {
    await delay(200);
    return { success: true, data: [...routes] };
  },
  async getActive(): Promise<ApiResponse<Route[]>> {
    await delay(200);
    return { success: true, data: routes.filter(r => r.status === 'active') };
  },
  async getById(id: string): Promise<ApiResponse<Route>> {
    await delay(150);
    const r = routes.find(x => x.id === id);
    return r ? { success: true, data: { ...r } } : { success: false, error: 'Route not found' };
  },
  async create(data: Omit<Route, 'id' | 'createdAt'>): Promise<ApiResponse<Route>> {
    await delay(300);
    if (!data.name?.trim()) return { success: false, error: 'Name is required' };
    if (routes.some(r => r.name === data.name)) return { success: false, error: 'Duplicate route name' };
    const r: Route = { ...data, id: `route-${Date.now()}`, createdAt: new Date().toISOString() };
    routes.push(r);
    return { success: true, data: { ...r }, message: 'Route created' };
  },
  async update(id: string, data: Partial<Route>): Promise<ApiResponse<Route>> {
    await delay(300);
    const idx = routes.findIndex(x => x.id === id);
    if (idx === -1) return { success: false, error: 'Route not found' };
    if (data.name && routes.some(r => r.name === data.name && r.id !== id))
      return { success: false, error: 'Duplicate route name' };
    routes[idx] = { ...routes[idx], ...data };
    return { success: true, data: { ...routes[idx] }, message: 'Route updated' };
  },
  async delete(id: string): Promise<ApiResponse<null>> {
    await delay(300);
    const idx = routes.findIndex(x => x.id === id);
    if (idx === -1) return { success: false, error: 'Route not found' };
    routes.splice(idx, 1);
    routeStops = routeStops.filter(rs => rs.routeId !== id);
    return { success: true, message: 'Route deleted' };
  },
};

// ─── Vehicles ────────────────────────────────────────
export const vehicleApi = {
  async getAll(): Promise<ApiResponse<Vehicle[]>> {
    await delay(200);
    return { success: true, data: [...vehicles] };
  },
  async getById(id: string): Promise<ApiResponse<Vehicle>> {
    await delay(150);
    const v = vehicles.find(x => x.id === id);
    return v ? { success: true, data: { ...v } } : { success: false, error: 'Vehicle not found' };
  },
  async create(data: Omit<Vehicle, 'id' | 'createdAt'>): Promise<ApiResponse<Vehicle>> {
    await delay(300);
    if (!data.name?.trim()) return { success: false, error: 'Name is required' };
    if (!data.type?.trim()) return { success: false, error: 'Type is required' };
    const v: Vehicle = { ...data, id: `v-${Date.now()}`, createdAt: new Date().toISOString() };
    vehicles.push(v);
    return { success: true, data: { ...v }, message: 'Vehicle created' };
  },
  async update(id: string, data: Partial<Vehicle>): Promise<ApiResponse<Vehicle>> {
    await delay(300);
    const idx = vehicles.findIndex(x => x.id === id);
    if (idx === -1) return { success: false, error: 'Vehicle not found' };
    vehicles[idx] = { ...vehicles[idx], ...data };
    return { success: true, data: { ...vehicles[idx] }, message: 'Vehicle updated' };
  },
  async delete(id: string): Promise<ApiResponse<null>> {
    await delay(300);
    const idx = vehicles.findIndex(x => x.id === id);
    if (idx === -1) return { success: false, error: 'Vehicle not found' };
    vehicles.splice(idx, 1);
    return { success: true, message: 'Vehicle deleted' };
  },
  async rotateDeviceToken(_id: string): Promise<ApiResponse<{ vehicleId: string; deviceToken: string; warning: string }>> {
    return { success: false, error: 'Configure VITE_API_URL to provision mobile vehicle credentials' };
  },
};

// ─── Stops ───────────────────────────────────────────
export const stopApi = {
  async getActive(): Promise<ApiResponse<Stop[]>> {
    await delay(200);
    return { success: true, data: stops.filter(stop => stop.status === 'active') };
  },
  async getAll(): Promise<ApiResponse<Stop[]>> {
    await delay(200);
    return { success: true, data: [...stops] };
  },
  async getById(id: string): Promise<ApiResponse<Stop>> {
    await delay(150);
    const s = stops.find(x => x.id === id);
    return s ? { success: true, data: { ...s } } : { success: false, error: 'Stop not found' };
  },
  async create(data: Omit<Stop, 'id' | 'createdAt'>): Promise<ApiResponse<Stop>> {
    await delay(300);
    if (!data.nameTh?.trim()) return { success: false, error: 'Name (Thai) is required' };
    if (data.latitude < -90 || data.latitude > 90) return { success: false, error: 'Invalid latitude' };
    if (data.longitude < -180 || data.longitude > 180) return { success: false, error: 'Invalid longitude' };
    const s: Stop = { ...data, id: `stop-${Date.now()}`, createdAt: new Date().toISOString() };
    stops.push(s);
    return { success: true, data: { ...s }, message: 'Stop created' };
  },
  async update(id: string, data: Partial<Stop>): Promise<ApiResponse<Stop>> {
    await delay(300);
    const idx = stops.findIndex(x => x.id === id);
    if (idx === -1) return { success: false, error: 'Stop not found' };
    if (data.latitude !== undefined && (data.latitude < -90 || data.latitude > 90))
      return { success: false, error: 'Invalid latitude' };
    if (data.longitude !== undefined && (data.longitude < -180 || data.longitude > 180))
      return { success: false, error: 'Invalid longitude' };
    stops[idx] = { ...stops[idx], ...data };
    return { success: true, data: { ...stops[idx] }, message: 'Stop updated' };
  },
  async delete(id: string): Promise<ApiResponse<null>> {
    await delay(300);
    const idx = stops.findIndex(x => x.id === id);
    if (idx === -1) return { success: false, error: 'Stop not found' };
    stops.splice(idx, 1);
    routeStops = routeStops.filter(rs => rs.stopId !== id);
    return { success: true, message: 'Stop deleted' };
  },
};

// ─── Active Trips ────────────────────────────────────
export const tripApi = {
  async getActive(): Promise<ApiResponse<Trip[]>> {
    await delay(100);
    return { success: true, data: [] };
  },
  async end(_id: string): Promise<ApiResponse<Trip>> {
    await delay(100);
    return { success: false, error: 'Trips are only available with the real backend' };
  },
};

// ─── RouteStops ──────────────────────────────────────
export const routeStopApi = {
  async getPublicByRoute(routeId: string): Promise<ApiResponse<RouteStop[]>> {
    const result = await routeStopApi.getByRoute(routeId);
    return { ...result, data: result.data?.filter(item => item.stop?.status === 'active') };
  },
  async getByRoute(routeId: string): Promise<ApiResponse<RouteStop[]>> {
    await delay(150);
    const items = routeStops
      .filter(rs => rs.routeId === routeId)
      .sort((a, b) => a.stopOrder - b.stopOrder)
      .map(rs => ({
        ...rs,
        stop: stops.find(s => s.id === rs.stopId),
        route: routes.find(r => r.id === rs.routeId),
      }));
    return { success: true, data: items };
  },
  async addStop(routeId: string, stopId: string, stopOrder: number): Promise<ApiResponse<RouteStop>> {
    await delay(300);
    if (!routes.find(r => r.id === routeId)) return { success: false, error: 'Route not found' };
    if (!stops.find(s => s.id === stopId)) return { success: false, error: 'Stop not found' };
    if (routeStops.some(rs => rs.routeId === routeId && rs.stopId === stopId))
      return { success: false, error: 'Stop already exists in this route' };
    if (routeStops.some(rs => rs.routeId === routeId && rs.stopOrder === stopOrder))
      return { success: false, error: 'Stop order already taken in this route' };
    if (stopOrder < 1) return { success: false, error: 'Stop order must be >= 1' };
    const now = new Date().toISOString();
    const rs: RouteStop = { id: uuidv4(), routeId, stopId, stopOrder, createdAt: now };
    routeStops.push(rs);
    return { success: true, data: { ...rs }, message: 'Stop added to route' };
  },
  async removeStop(id: string): Promise<ApiResponse<null>> {
    await delay(300);
    const idx = routeStops.findIndex(rs => rs.id === id);
    if (idx === -1) return { success: false, error: 'RouteStop not found' };
    const removed = routeStops[idx];
    routeStops.splice(idx, 1);
    routeStops
      .filter(rs => rs.routeId === removed.routeId && rs.stopOrder > removed.stopOrder)
      .forEach(rs => rs.stopOrder--);
    return { success: true, message: 'Stop removed from route' };
  },
  async updateOrder(id: string, newOrder: number): Promise<ApiResponse<RouteStop>> {
    await delay(200);
    const rs = routeStops.find(x => x.id === id);
    if (!rs) return { success: false, error: 'RouteStop not found' };
    if (newOrder < 1) return { success: false, error: 'Stop order must be >= 1' };
    const siblings = routeStops.filter(x => x.routeId === rs.routeId).sort((a, b) => a.stopOrder - b.stopOrder);
    if (newOrder > siblings.length) return { success: false, error: 'Stop order exceeds route length' };
    const oldOrder = rs.stopOrder;
    siblings.forEach(s => {
      if (s.id === id) { s.stopOrder = newOrder; }
      else if (oldOrder < newOrder && s.stopOrder > oldOrder && s.stopOrder <= newOrder) { s.stopOrder--; }
      else if (oldOrder > newOrder && s.stopOrder >= newOrder && s.stopOrder < oldOrder) { s.stopOrder++; }
    });
    return { success: true, data: { ...rs, stopOrder: newOrder }, message: 'Order updated' };
  },
};
