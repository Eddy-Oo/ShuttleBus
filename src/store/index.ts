import { create } from 'zustand';
import type { Vehicle, Route, Stop, RouteStop, User } from '../types';
import { vehicleApi, routeApi, stopApi, routeStopApi, authApi } from '../api';

// ─── Auth ────────────────────────────────────────────
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  /** True until the stored token has been checked on startup. */
  restoring: boolean;
  restore: () => Promise<void>;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  restoring: true,
  restore: async () => {
    if (get().isAuthenticated) { set({ restoring: false }); return; }
    const res = await authApi.me();
    if (res.success && res.data) {
      set({ user: res.data as User, isAuthenticated: true, restoring: false });
    } else {
      set({ restoring: false });
    }
  },
  login: async (username, password) => {
    const res = await authApi.login(username, password);
    if (res.success && res.data) {
      set({ user: res.data.user as User, isAuthenticated: true, restoring: false });
      return { success: true };
    }
    return { success: false, error: res.error || 'Login failed' };
  },
  logout: () => { authApi.logout(); set({ user: null, isAuthenticated: false }); },
}));

// ─── Routes ──────────────────────────────────────────
interface RouteState {
  routes: Route[];
  loading: boolean;
  fetchAll: () => Promise<void>;
  fetchActive: () => Promise<void>;
  create: (data: Omit<Route, 'id' | 'createdAt'>) => Promise<{ success: boolean; error?: string }>;
  update: (id: string, data: Partial<Route>) => Promise<{ success: boolean; error?: string }>;
  remove: (id: string) => Promise<{ success: boolean; error?: string }>;
}

export const useRouteStore = create<RouteState>((set) => ({
  routes: [],
  loading: false,
  fetchAll: async () => {
    set({ loading: true });
    const res = await routeApi.getAll();
    set({ routes: res.data || [], loading: false });
  },
  fetchActive: async () => {
    set({ loading: true });
    const res = await routeApi.getActive();
    set({ routes: res.data || [], loading: false });
  },
  create: async (data) => {
    const res = await routeApi.create(data);
    if (res.success) { const r = await routeApi.getAll(); set({ routes: r.data || [] }); }
    return { success: res.success, error: res.error };
  },
  update: async (id, data) => {
    const res = await routeApi.update(id, data);
    if (res.success) { const r = await routeApi.getAll(); set({ routes: r.data || [] }); }
    return { success: res.success, error: res.error };
  },
  remove: async (id) => {
    const res = await routeApi.delete(id);
    if (res.success) { const r = await routeApi.getAll(); set({ routes: r.data || [] }); }
    return { success: res.success, error: res.error };
  },
}));

// ─── Vehicles ────────────────────────────────────────
interface VehicleState {
  vehicles: Vehicle[];
  loading: boolean;
  fetchAll: () => Promise<void>;
  create: (data: Omit<Vehicle, 'id' | 'createdAt'>) => Promise<{ success: boolean; error?: string }>;
  update: (id: string, data: Partial<Vehicle>) => Promise<{ success: boolean; error?: string }>;
  remove: (id: string) => Promise<{ success: boolean; error?: string }>;
}

export const useVehicleStore = create<VehicleState>((set) => ({
  vehicles: [],
  loading: false,
  fetchAll: async () => {
    set({ loading: true });
    const res = await vehicleApi.getAll();
    set({ vehicles: res.data || [], loading: false });
  },
  create: async (data) => {
    const res = await vehicleApi.create(data);
    if (res.success) { const r = await vehicleApi.getAll(); set({ vehicles: r.data || [] }); }
    return { success: res.success, error: res.error };
  },
  update: async (id, data) => {
    const res = await vehicleApi.update(id, data);
    if (res.success) { const r = await vehicleApi.getAll(); set({ vehicles: r.data || [] }); }
    return { success: res.success, error: res.error };
  },
  remove: async (id) => {
    const res = await vehicleApi.delete(id);
    if (res.success) { const r = await vehicleApi.getAll(); set({ vehicles: r.data || [] }); }
    return { success: res.success, error: res.error };
  },
}));

// ─── Stops ───────────────────────────────────────────
interface StopState {
  stops: Stop[];
  loading: boolean;
  fetchActive: () => Promise<void>;
  fetchAll: () => Promise<void>;
  create: (data: Omit<Stop, 'id' | 'createdAt'>) => Promise<{ success: boolean; error?: string }>;
  update: (id: string, data: Partial<Stop>) => Promise<{ success: boolean; error?: string }>;
  remove: (id: string) => Promise<{ success: boolean; error?: string }>;
}

export const useStopStore = create<StopState>((set) => ({
  stops: [],
  loading: false,
  fetchActive: async () => {
    set({ loading: true });
    const res = await stopApi.getActive();
    set({ stops: res.data || [], loading: false });
  },
  fetchAll: async () => {
    set({ loading: true });
    const res = await stopApi.getAll();
    set({ stops: res.data || [], loading: false });
  },
  create: async (data) => {
    const res = await stopApi.create(data);
    if (res.success) { const r = await stopApi.getAll(); set({ stops: r.data || [] }); }
    return { success: res.success, error: res.error };
  },
  update: async (id, data) => {
    const res = await stopApi.update(id, data);
    if (res.success) { const r = await stopApi.getAll(); set({ stops: r.data || [] }); }
    return { success: res.success, error: res.error };
  },
  remove: async (id) => {
    const res = await stopApi.delete(id);
    if (res.success) { const r = await stopApi.getAll(); set({ stops: r.data || [] }); }
    return { success: res.success, error: res.error };
  },
}));

// ─── RouteStops ──────────────────────────────────────
interface RouteStopState {
  routeStops: RouteStop[];
  loading: boolean;
  fetchByRoute: (routeId: string) => Promise<void>;
  addStop: (routeId: string, stopId: string, order: number) => Promise<{ success: boolean; error?: string }>;
  removeStop: (id: string) => Promise<{ success: boolean; error?: string }>;
  updateOrder: (id: string, order: number) => Promise<{ success: boolean; error?: string }>;
}

export const useRouteStopStore = create<RouteStopState>((set) => ({
  routeStops: [],
  loading: false,
  fetchByRoute: async (routeId) => {
    set({ loading: true });
    const res = await routeStopApi.getByRoute(routeId);
    set({ routeStops: res.data || [], loading: false });
  },
  addStop: async (routeId, stopId, order) => {
    const res = await routeStopApi.addStop(routeId, stopId, order);
    if (res.success) {
      const r = await routeStopApi.getByRoute(routeId);
      set({ routeStops: r.data || [] });
    }
    return { success: res.success, error: res.error };
  },
  removeStop: async (id) => {
    const rs = useRouteStopStore.getState().routeStops.find(r => r.id === id);
    const res = await routeStopApi.removeStop(id);
    if (res.success && rs) {
      const r = await routeStopApi.getByRoute(rs.routeId);
      set({ routeStops: r.data || [] });
    }
    return { success: res.success, error: res.error };
  },
  updateOrder: async (id, order) => {
    const res = await routeStopApi.updateOrder(id, order);
    if (res.success && res.data) {
      const r = await routeStopApi.getByRoute(res.data.routeId);
      set({ routeStops: r.data || [] });
    }
    return { success: res.success, error: res.error };
  },
}));
