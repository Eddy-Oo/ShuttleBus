import type { ApiResponse, Route, RouteStop, Stop, Trip, Vehicle } from '../types';

const API_BASE = `${(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')}/api`;
const AUTH_TOKEN_KEY = 'shuttletrack.authToken';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

function getToken(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function saveToken(token: string | null) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // Storage may be disabled; API requests can still be used for public routes.
  }
}

async function request<T>(path: string, method: Method = 'GET', body?: unknown, includeAuth = true): Promise<ApiResponse<T>> {
  try {
    const token = includeAuth ? getToken() : null;
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
    });
    const result = await response.json() as ApiResponse<T>;
    if (!response.ok || !result.success) {
      return { success: false, error: result.error || `Request failed (${response.status})` };
    }
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unable to reach the backend',
    };
  }
}

const inactiveQuery = () => getToken() ? '?includeInactive=true' : '';

export const backendApi = {
  authApi: {
    async login(username: string, password: string): Promise<ApiResponse<{ user: { id: string; username: string; role: string } }>> {
      const result = await request<{ token: string; user: { id: string; username: string; role: string } }>(
        '/auth/admin/login',
        'POST',
        { username, password },
        false,
      );
      if (!result.success || !result.data) return { success: false, error: result.error || 'Login failed' };
      saveToken(result.data.token);
      return {
        success: true,
        data: { user: result.data.user },
        message: result.message || 'Login successful',
      };
    },
    logout() {
      saveToken(null);
    },
    /** Restore an admin session from a stored token (e.g. after a page reload). */
    async me(): Promise<ApiResponse<{ id: string; username: string; role: string }>> {
      if (!getToken()) return { success: false, error: 'Not signed in' };
      const result = await request<{ id: string; username: string; role: string }>('/auth/me');
      if (!result.success) saveToken(null);
      return result;
    },
  },

  routeApi: {
    getAll: () => request<Route[]>(`/routes${inactiveQuery()}`),
    getActive: () => request<Route[]>('/routes', 'GET', undefined, false),
    getById: (id: string) => request<Route>(`/routes/${encodeURIComponent(id)}`),
    create: (data: Omit<Route, 'id' | 'createdAt'>) => request<Route>('/routes', 'POST', data),
    update: (id: string, data: Partial<Route>) => request<Route>(`/routes/${encodeURIComponent(id)}`, 'PATCH', data),
    delete: (id: string) => request<null>(`/routes/${encodeURIComponent(id)}`, 'DELETE'),
  },

  vehicleApi: {
    getAll: () => request<Vehicle[]>('/vehicles'),
    getById: (id: string) => request<Vehicle>(`/vehicles/${encodeURIComponent(id)}`),
    create: (data: Omit<Vehicle, 'id' | 'createdAt'>) => request<Vehicle>('/vehicles', 'POST', data),
    update: (id: string, data: Partial<Vehicle>) => request<Vehicle>(`/vehicles/${encodeURIComponent(id)}`, 'PATCH', data),
    delete: (id: string) => request<null>(`/vehicles/${encodeURIComponent(id)}`, 'DELETE'),
    rotateDeviceToken: (id: string) => request<{ vehicleId: string; deviceToken: string; warning: string }>(
      `/vehicles/${encodeURIComponent(id)}/device-token`,
      'POST',
    ),
  },

  stopApi: {
    getActive: () => request<Stop[]>('/stops', 'GET', undefined, false),
    getAll: () => request<Stop[]>(`/stops${inactiveQuery()}`),
    getById: (id: string) => request<Stop>(`/stops/${encodeURIComponent(id)}`),
    create: (data: Omit<Stop, 'id' | 'createdAt'>) => request<Stop>('/stops', 'POST', data),
    update: (id: string, data: Partial<Stop>) => request<Stop>(`/stops/${encodeURIComponent(id)}`, 'PATCH', data),
    delete: (id: string) => request<null>(`/stops/${encodeURIComponent(id)}`, 'DELETE'),
  },

  routeStopApi: {
    getPublicByRoute: (routeId: string) => request<RouteStop[]>(`/routes/${encodeURIComponent(routeId)}/stops`, 'GET', undefined, false),
    getByRoute: (routeId: string) => request<RouteStop[]>(`/routes/${encodeURIComponent(routeId)}/stops`),
    addStop: (routeId: string, stopId: string, stopOrder: number) => request<RouteStop>(
      `/routes/${encodeURIComponent(routeId)}/stops`,
      'POST',
      { stopId, stopOrder },
    ),
    removeStop: (id: string) => request<null>(`/route-stops/${encodeURIComponent(id)}`, 'DELETE'),
    updateOrder: (id: string, stopOrder: number) => request<RouteStop>(
      `/route-stops/${encodeURIComponent(id)}/order`,
      'PATCH',
      { stopOrder },
    ),
  },

  tripApi: {
    getActive: () => request<Trip[]>('/trips/active'),
    end: (id: string) => request<Trip>(`/trips/${encodeURIComponent(id)}/end`, 'POST'),
  },
};

export const AUTH_TOKEN_STORAGE_KEY = AUTH_TOKEN_KEY;
