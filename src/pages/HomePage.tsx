import { useEffect, useMemo, useState } from 'react';
import { useRouteStore, useStopStore } from '../store';
import { routeStopApi } from '../api';
import { Bus, MapPin, ChevronDown, ChevronUp, Route as RouteIcon, AlertCircle } from 'lucide-react';
import LeafletMap, { type MapMarker, type MapPath } from '../components/LeafletMap';
import RealtimeStatus from '../components/RealtimeStatus';
import { useVehicleRealtime } from '../realtime/useVehicleRealtime';
import type { Route, Stop } from '../types';

/** Ordered stops for a route (sorted by stopOrder, inactive/missing stops dropped). */
function orderedStops(routeStops: { stopOrder: number; stop?: Stop }[]): Stop[] {
  return [...routeStops]
    .sort((a, b) => a.stopOrder - b.stopOrder)
    .flatMap(rs => (rs.stop ? [rs.stop] : []));
}

/** Route line: stored GeoJSON geometry, or a dashed fallback through the ordered stops. */
function routeLine(route: Route, stops: Stop[]): MapPath | null {
  const coords = route.geometry?.coordinates;
  if (coords && coords.length > 1) {
    return { color: route.color, points: coords.map(([lng, lat]) => ({ lat, lng })) };
  }
  if (stops.length > 1) {
    return { color: route.color, dashed: true, points: stops.map(s => ({ lat: s.latitude, lng: s.longitude })) };
  }
  return null;
}

export default function HomePage() {
  const { routes, loading: routesLoading, fetchActive } = useRouteStore();
  const { stops, fetchActive: fetchStops } = useStopStore();
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [routeStops, setRouteStops] = useState<Record<string, Stop[]>>({});
  const [loadError, setLoadError] = useState('');
  const { status: realtimeStatus, locations: vehicleLocations } = useVehicleRealtime();

  useEffect(() => {
    void fetchActive();
    void fetchStops();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const results = await Promise.all(routes.map(r => routeStopApi.getPublicByRoute(r.id)));
      if (cancelled) return;
      const next: Record<string, Stop[]> = {};
      let failed = false;
      routes.forEach((route, index) => {
        const res = results[index]!;
        if (!res.success) failed = true;
        next[route.id] = orderedStops(res.data || []);
      });
      setRouteStops(next);
      setLoadError(failed ? 'Some route stops could not be loaded from the server.' : '');
    };
    if (routes.length > 0) void load();
    return () => { cancelled = true; };
  }, [routes]);

  const selectedRoute = routes.find(route => route.id === selectedRouteId) ?? null;
  const selectedStops = selectedRoute ? routeStops[selectedRoute.id] || [] : [];

  // Vehicles on the selected route (by active trip route, else by assignment). All vehicles when no route selected.
  const visibleVehicles = selectedRoute
    ? vehicleLocations.filter(v => !v.routeId || v.routeId === selectedRoute.id)
    : vehicleLocations;

  const routeColorById = useMemo(() => new Map(routes.map(r => [r.id, r.color])), [routes]);

  const mapMarkers: MapMarker[] = [
    ...(selectedRoute ? selectedStops : stops).map((s, i) => ({
      lat: s.latitude,
      lng: s.longitude,
      title: s.nameTh,
      subtitle: s.nameEn || undefined,
      color: selectedRoute ? selectedRoute.color : '#64748b',
      order: selectedRoute ? i + 1 : undefined,
    })),
    ...visibleVehicles.map(location => ({
      id: location.vehicleId,
      lat: location.latitude,
      lng: location.longitude,
      title: location.vehicleName || `Vehicle ${location.vehicleId}`,
      subtitle: location.recordedAt ? `Updated ${new Date(location.recordedAt).toLocaleTimeString()}` : undefined,
      color: (location.routeId && routeColorById.get(location.routeId)) || '#0f766e',
      kind: 'vehicle' as const,
    })),
  ];

  const routePaths: MapPath[] = selectedRoute
    ? [routeLine(selectedRoute, selectedStops)].filter((p): p is MapPath => p !== null)
    : routes.map(r => routeLine(r, routeStops[r.id] || [])).filter((p): p is MapPath => p !== null);

  const toggleRoute = (routeId: string) => setSelectedRouteId(current => (current === routeId ? null : routeId));

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="sticky top-0 z-[1100] bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <Bus className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 leading-tight">ShuttleTrack</h1>
              <p className="text-[10px] text-slate-400">Campus Shuttle</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RealtimeStatus status={realtimeStatus} />
            <a href="/login" className="text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-blue-50">
              Admin
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="text-center mb-6">
          <h2 className="text-2xl sm:text-4xl font-bold text-slate-900 tracking-tight">
            Campus <span className="text-blue-600">Shuttle Routes</span>
          </h2>
          <p className="text-slate-500 mt-2 text-sm sm:text-base">Rangsit University &mdash; Select a route to see its path, stops and live vehicles</p>
        </div>

        {loadError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4" /> {loadError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map first on mobile so it is visible without scrolling */}
          <section className="order-1 lg:order-2 lg:col-span-2">
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden lg:sticky lg:top-20">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-400" />
                <h3 className="font-semibold text-slate-900 text-sm truncate">
                  {selectedRoute ? selectedRoute.name : 'All Routes'}
                </h3>
                <span className="ml-auto text-xs text-slate-500 whitespace-nowrap">
                  {visibleVehicles.length} live vehicle{visibleVehicles.length === 1 ? '' : 's'}
                </span>
                {selectedRoute && (
                  <button onClick={() => setSelectedRouteId(null)} className="text-xs text-blue-600 hover:underline whitespace-nowrap">Show all</button>
                )}
              </div>
              <LeafletMap markers={mapMarkers} routePaths={routePaths} className="h-[360px] sm:h-[500px] w-full" />
            </div>
          </section>

          <section className="order-2 lg:order-1 lg:col-span-1 space-y-2" aria-label="Routes">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Routes</h3>
            {routesLoading && routes.length === 0 && <p className="text-sm text-slate-400">Loading routes…</p>}
            {!routesLoading && routes.length === 0 && <p className="text-sm text-slate-400">No active routes available.</p>}
            {routes.map(route => {
              const isSelected = selectedRouteId === route.id;
              const list = routeStops[route.id] || [];
              const liveCount = vehicleLocations.filter(v => v.routeId === route.id).length;
              return (
                <div key={route.id} className={`rounded-2xl border bg-white transition-all ${isSelected ? 'border-slate-200 shadow-md' : 'border-slate-100 hover:border-slate-200 hover:shadow-sm'}`}>
                  <button
                    type="button"
                    onClick={() => toggleRoute(route.id)}
                    aria-expanded={isSelected}
                    className="w-full text-left p-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: route.color }} />
                      <div>
                        <p className="font-semibold text-slate-900 text-sm">{route.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {list.length} stops{liveCount > 0 ? ` · ${liveCount} live` : ''}
                        </p>
                      </div>
                    </div>
                    {isSelected ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </button>

                  {isSelected && (
                    <div className="px-4 pb-4 border-t border-slate-100">
                      <dl className="grid grid-cols-3 gap-2 py-3 text-center">
                        <div className="rounded-lg bg-slate-50 p-2">
                          <dt className="text-[10px] uppercase text-slate-400">Stops</dt>
                          <dd className="text-sm font-semibold text-slate-900">{list.length}</dd>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2">
                          <dt className="text-[10px] uppercase text-slate-400">Live</dt>
                          <dd className="text-sm font-semibold text-slate-900">{liveCount}</dd>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2">
                          <dt className="text-[10px] uppercase text-slate-400">Path</dt>
                          <dd className="text-sm font-semibold text-slate-900 flex items-center justify-center gap-1">
                            <RouteIcon className="h-3 w-3" />
                            {route.geometry?.coordinates?.length ? 'Mapped' : 'Stops'}
                          </dd>
                        </div>
                      </dl>
                      {list.length === 0 ? (
                        <p className="text-xs text-slate-400">No stops on this route yet.</p>
                      ) : (
                        <ol className="relative pl-4">
                          <div className="absolute left-[5px] top-1 bottom-1 w-0.5 rounded-full" style={{ background: route.color + '40' }} />
                          {list.map((stop, i) => (
                            <li key={stop.id} className="relative flex items-start gap-3 py-1.5">
                              <div className="w-[11px] h-[11px] rounded-full border-2 border-white flex-shrink-0 relative z-10 mt-1" style={{ background: route.color }} />
                              <div>
                                <p className="text-xs font-medium text-slate-900"><span className="text-slate-400 mr-1">{i + 1}.</span>{stop.nameTh}</p>
                                {stop.nameEn && <p className="text-[10px] text-slate-500">{stop.nameEn}</p>}
                              </div>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </div>
      </main>

      <footer className="border-t border-slate-100 bg-white mt-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-center">
          <p className="text-xs text-slate-400">ShuttleTrack &copy; 2026 &mdash; Rangsit University</p>
        </div>
      </footer>
    </div>
  );
}
