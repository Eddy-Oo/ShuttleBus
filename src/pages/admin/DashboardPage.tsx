import { useEffect, useMemo, useState } from 'react';
import { useVehicleStore, useRouteStore, useStopStore } from '../../store';
import { routeStopApi, tripApi, usingBackendApi } from '../../api';
import { Bus, Route as RouteIcon, MapPin, Activity, Square } from 'lucide-react';
import LeafletMap, { type MapMarker, type MapPath } from '../../components/LeafletMap';
import RealtimeStatus from '../../components/RealtimeStatus';
import { useVehicleRealtime } from '../../realtime/useVehicleRealtime';
import type { Stop, Trip } from '../../types';

/** A location older than this is considered stale in the status table. */
const STALE_AFTER_MS = 60_000;

function timeAgo(iso: string | undefined, now: number): string {
  if (!iso) return '—';
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function DashboardPage() {
  const { vehicles, fetchAll: fetchVehicles } = useVehicleStore();
  const { routes, fetchAll: fetchRoutes } = useRouteStore();
  const { stops, fetchAll: fetchStops } = useStopStore();
  const { status: realtimeStatus, locations: vehicleLocations, tripRevision } = useVehicleRealtime();
  const [activeTrips, setActiveTrips] = useState<Trip[]>([]);
  const [routeStops, setRouteStops] = useState<Record<string, Stop[]>>({});
  const [routeFilter, setRouteFilter] = useState<string>('all');
  const [endingTripId, setEndingTripId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void fetchVehicles();
    void fetchRoutes();
    void fetchStops();
  }, []);

  // Tick so "last seen" labels stay current.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void tripApi.getActive().then(response => { if (!cancelled) setActiveTrips(response.data || []); });
    return () => { cancelled = true; };
  }, [tripRevision]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const results = await Promise.all(routes.map(route => routeStopApi.getByRoute(route.id)));
      if (cancelled) return;
      const next: Record<string, Stop[]> = {};
      routes.forEach((route, index) => {
        next[route.id] = [...(results[index]?.data || [])]
          .sort((a, b) => a.stopOrder - b.stopOrder)
          .flatMap(rs => (rs.stop ? [rs.stop] : []));
      });
      setRouteStops(next);
    };
    if (routes.length > 0) void load();
    else setRouteStops({});
    return () => { cancelled = true; };
  }, [routes]);

  const routeById = useMemo(() => new Map(routes.map(r => [r.id, r])), [routes]);
  const vehicleById = useMemo(() => new Map(vehicles.map(v => [v.id, v])), [vehicles]);
  const tripByVehicle = useMemo(() => new Map(activeTrips.map(t => [t.vehicleId, t])), [activeTrips]);
  const locationByVehicle = useMemo(() => new Map(vehicleLocations.map(l => [l.vehicleId, l])), [vehicleLocations]);

  const shownRoutes = routeFilter === 'all' ? routes : routes.filter(r => r.id === routeFilter);

  const routePaths: MapPath[] = shownRoutes.flatMap(route => {
    const coords = route.geometry?.coordinates;
    if (coords && coords.length > 1) return [{ color: route.color, points: coords.map(([lng, lat]) => ({ lat, lng })) }];
    const list = routeStops[route.id] || [];
    return list.length > 1 ? [{ color: route.color, dashed: true, points: list.map(s => ({ lat: s.latitude, lng: s.longitude })) }] : [];
  });

  const stopsOnMap = routeFilter === 'all' ? stops : routeStops[routeFilter] || [];
  const liveOnMap = vehicleLocations.filter(l => routeFilter === 'all' || l.routeId === routeFilter);

  const mapMarkers: MapMarker[] = [
    ...stopsOnMap.map((stop, index) => ({
      lat: stop.latitude,
      lng: stop.longitude,
      title: stop.nameTh,
      subtitle: stop.nameEn || undefined,
      color: routeFilter === 'all' ? '#64748b' : routeById.get(routeFilter)?.color,
      order: routeFilter === 'all' ? undefined : index + 1,
    })),
    ...liveOnMap.map(location => {
      const vehicle = vehicleById.get(location.vehicleId);
      const route = location.routeId ? routeById.get(location.routeId) : undefined;
      return {
        id: location.vehicleId,
        lat: location.latitude,
        lng: location.longitude,
        title: vehicle?.name || location.vehicleName || `Vehicle ${location.vehicleId}`,
        subtitle: [route?.name, location.speed != null ? `${location.speed.toFixed(1)} km/h` : null].filter(Boolean).join(' · ') || undefined,
        color: route?.color || '#0f766e',
        kind: 'vehicle' as const,
      };
    }),
  ];

  const activeVehicles = vehicles.filter(v => v.status === 'active').length;
  const activeRoutes = routes.filter(r => r.status === 'active').length;

  const stats = [
    { label: 'Total Vehicles', value: vehicles.length, sub: `${activeVehicles} active`, icon: Bus, iconBg: 'bg-blue-100', iconColor: 'text-blue-600' },
    { label: 'Total Routes', value: routes.length, sub: `${activeRoutes} active`, icon: RouteIcon, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600' },
    { label: 'Total Stops', value: stops.length, sub: 'in system', icon: MapPin, iconBg: 'bg-amber-100', iconColor: 'text-amber-600' },
    {
      label: 'Active Trips',
      value: usingBackendApi ? activeTrips.length : '—',
      sub: realtimeStatus === 'disabled' ? 'realtime off' : `${vehicleLocations.length} live on map`,
      icon: Activity,
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
    },
  ];

  const handleEndTrip = async (trip: Trip) => {
    const name = trip.vehicle?.name || trip.vehicleId;
    if (!confirm(`End the active trip for ${name}?`)) return;
    setEndingTripId(trip.id);
    const res = await tripApi.end(trip.id);
    setEndingTripId(null);
    if (res.success) {
      setActiveTrips(current => current.filter(t => t.id !== trip.id));
      setMessage(`Trip for ${name} ended`);
    } else {
      setMessage(res.error || 'Could not end trip');
    }
    setTimeout(() => setMessage(''), 3000);
  };

  // One row per vehicle: combines admin status, active trip and last realtime position.
  const statusRows = vehicles
    .filter(v => routeFilter === 'all' || v.assignedRouteId === routeFilter || tripByVehicle.get(v.id)?.routeId === routeFilter)
    .map(vehicle => {
      const trip = tripByVehicle.get(vehicle.id);
      const location = locationByVehicle.get(vehicle.id);
      const lastSeen = location?.recordedAt;
      const stale = lastSeen ? now - new Date(lastSeen).getTime() > STALE_AFTER_MS : true;
      const tracking = trip ? (location && !stale ? 'live' : 'waiting') : 'idle';
      return { vehicle, trip, location, lastSeen, tracking };
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Routes, live vehicles and active trips</p>
        </div>
        <RealtimeStatus status={realtimeStatus} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-5 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 rounded-xl ${s.iconBg} flex items-center justify-center`}>
                <s.icon className={`w-5 h-5 ${s.iconColor}`} />
              </div>
              <span className="text-xs font-medium text-slate-500 bg-slate-50 px-2.5 py-1 rounded-full">{s.sub}</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{s.value}</p>
            <p className="text-xs text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h2 className="font-semibold text-slate-900">Live Map</h2>
            <p className="text-xs text-slate-500 mt-0.5">Route paths, stops and vehicle markers updated via Socket.IO</p>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Route
            <select
              value={routeFilter}
              onChange={e => setRouteFilter(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="all">All routes</option>
              {routes.map(r => <option key={r.id} value={r.id}>{r.name}{r.status === 'inactive' ? ' (inactive)' : ''}</option>)}
            </select>
          </label>
        </div>
        <LeafletMap markers={mapMarkers} routePaths={routePaths} className="h-[420px] w-full" />
        <div className="flex flex-wrap gap-3 px-5 py-3 border-t border-slate-100">
          {shownRoutes.map(r => (
            <span key={r.id} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <span className="w-3 h-1.5 rounded-full" style={{ background: r.color }} /> {r.name}
            </span>
          ))}
        </div>
      </div>

      {message && <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">{message}</div>}

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Vehicle &amp; Active Trip Status</h2>
          <p className="text-xs text-slate-500 mt-0.5">Refreshes automatically when trips start/end and when locations arrive</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-50 bg-slate-50/50">
                <th className="text-left px-5 py-3 font-medium text-slate-500">Vehicle</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Status</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Route</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Trip</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Tracking</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Last update</th>
                <th className="text-right px-5 py-3 font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {statusRows.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400">No vehicles</td></tr>
              ) : statusRows.map(({ vehicle, trip, location, lastSeen, tracking }) => {
                const route = routeById.get(trip?.routeId || vehicle.assignedRouteId || '');
                return (
                  <tr key={vehicle.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-3 font-medium text-slate-900">{vehicle.name}<span className="block text-[10px] font-normal text-slate-400">{vehicle.type}</span></td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        vehicle.status === 'active' ? 'bg-green-50 text-green-700' :
                        vehicle.status === 'maintenance' ? 'bg-amber-50 text-amber-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>{vehicle.status}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {route ? (
                        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: route.color }} />{route.name}</span>
                      ) : <span className="text-slate-400">&mdash;</span>}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {trip ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                          On trip · since {new Date(trip.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : <span className="text-xs text-slate-400">No active trip</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                        tracking === 'live' ? 'text-emerald-700' : tracking === 'waiting' ? 'text-amber-700' : 'text-slate-400'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${tracking === 'live' ? 'bg-emerald-500 animate-pulse' : tracking === 'waiting' ? 'bg-amber-400' : 'bg-slate-300'}`} />
                        {tracking === 'live' ? 'Live' : tracking === 'waiting' ? 'Waiting for GPS' : 'Idle'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {timeAgo(lastSeen, now)}
                      {location && <span className="block text-[10px] text-slate-400 font-mono">{location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}</span>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {trip && (
                        <button
                          onClick={() => handleEndTrip(trip)}
                          disabled={endingTripId === trip.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                          title="End this trip"
                        >
                          <Square className="w-3 h-3" /> End trip
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
