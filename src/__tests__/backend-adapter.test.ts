import { afterEach, describe, expect, it, vi } from 'vitest';
import { backendApi } from '../api/backendApi';

const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: [] }), { status: 200 }));

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('real-backend frontend adapter', () => {
  function setup() {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', { getItem: () => 'expired-admin-token', setItem: vi.fn(), removeItem: vi.fn() });
  }
  it('public route/stop reads never send an old admin token or request inactive data', async () => {
    setup();
    await backendApi.routeApi.getActive();
    await backendApi.stopApi.getActive();
    await backendApi.routeStopApi.getPublicByRoute('route-1');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [url, options] of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      expect(url).not.toContain('includeInactive');
      expect(options.headers).not.toHaveProperty('Authorization');
    }
  });
  it('admin reads send authorization and can request inactive catalog data', async () => {
    setup();
    await backendApi.routeApi.getAll();
    expect(fetchMock).toHaveBeenCalledWith('/api/routes?includeInactive=true', expect.objectContaining({ headers: { Authorization: 'Bearer expired-admin-token' } }));
  });
  it('CRUD uses the backend HTTP method and JSON body', async () => {
    setup();
    await backendApi.vehicleApi.update('vehicle-1', { assignedRouteId: 'route-2' });
    expect(fetchMock).toHaveBeenCalledWith('/api/vehicles/vehicle-1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ assignedRouteId: 'route-2' }) }));
  });
  it('network errors return a consistent failed response', async () => {
    setup();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await backendApi.routeApi.getActive()).toEqual({ success: false, error: 'offline' });
  });
});
