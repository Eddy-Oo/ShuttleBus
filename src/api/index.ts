import * as mockApi from './mockApi';
import { backendApi } from './backendApi';

export const usingBackendApi = Boolean(import.meta.env.VITE_API_URL?.trim());
const activeApi = usingBackendApi ? backendApi : mockApi;

export const authApi = {
  login: activeApi.authApi.login,
  logout: () => {
    if (usingBackendApi) backendApi.authApi.logout();
  },
  me: () => usingBackendApi
    ? backendApi.authApi.me()
    : Promise.resolve({ success: false as const, error: 'Not signed in' }),
};
export const routeApi = activeApi.routeApi;
export const vehicleApi = activeApi.vehicleApi;
export const stopApi = activeApi.stopApi;
export const routeStopApi = activeApi.routeStopApi;
export const tripApi = activeApi.tripApi;
