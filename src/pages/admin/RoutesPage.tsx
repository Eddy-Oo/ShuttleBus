import { useEffect, useState } from 'react';
import { useRouteStore, useStopStore, useRouteStopStore } from '../../store';
import { routeStopApi } from '../../api';
import { Plus, Pencil, Trash2, Route, MapPin, ArrowUp, ArrowDown, Link2, ChevronDown, ChevronUp } from 'lucide-react';
import Modal from '../../components/Modal';
import type { Route as RouteType, RouteGeometry } from '../../types';

/** Parse and validate a GeoJSON LineString typed by an admin. Empty text clears the geometry. */
function parseGeometry(text: string): { geometry: RouteGeometry | null; error?: string } {
  if (!text.trim()) return { geometry: null };
  try {
    const value = JSON.parse(text);
    if (value?.type !== 'LineString' || !Array.isArray(value.coordinates) || value.coordinates.length < 2) {
      return { geometry: null, error: 'Geometry must be a GeoJSON LineString with at least 2 coordinates' };
    }
    for (const pair of value.coordinates) {
      if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((n: unknown) => typeof n === 'number' && Number.isFinite(n))
        || Math.abs(pair[0]) > 180 || Math.abs(pair[1]) > 90) {
        return { geometry: null, error: 'Each coordinate must be [longitude, latitude] within valid ranges' };
      }
    }
    return { geometry: { type: 'LineString', coordinates: value.coordinates } };
  } catch {
    return { geometry: null, error: 'Geometry is not valid JSON' };
  }
}

const COLORS = ['#2563EB', '#16A34A', '#DC2626', '#9333EA', '#EA580C', '#0891B2', '#DB2777', '#65A30D'];

export default function RoutesPage() {
  const { routes, loading, fetchAll, create, update, remove } = useRouteStore();
  const { stops, fetchAll: fetchStops } = useStopStore();
  const { routeStops, loading: rsLoading, fetchByRoute, addStop, removeStop, updateOrder } = useRouteStopStore();

  // Route CRUD modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RouteType | null>(null);
  const [form, setForm] = useState({ name: '', color: '#2563EB', status: 'active' as RouteType['status'] });
  const [geometryText, setGeometryText] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // RouteStop management
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [addingStopId, setAddingStopId] = useState('');
  const [addingOrder, setAddingOrder] = useState(1);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [routeStopCounts, setRouteStopCounts] = useState<Record<string, number>>({});

  useEffect(() => { fetchAll(); fetchStops(); }, []);

  // Load stop counts for all routes
  useEffect(() => {
    const loadCounts = async () => {
      const counts: Record<string, number> = {};
      for (const r of routes) {
        const res = await routeStopApi.getByRoute(r.id);
        counts[r.id] = res.data?.length || 0;
      }
      setRouteStopCounts(counts);
    };
    if (routes.length > 0) loadCounts();
  }, [routes]);

  useEffect(() => {
    if (selectedRouteId) fetchByRoute(selectedRouteId);
  }, [selectedRouteId]);

  // Default the "Stop Order" input to append at the end of the selected route.
  useEffect(() => {
    if (selectedRouteId && !rsLoading) setAddingOrder(routeStops.length + 1);
  }, [selectedRouteId, rsLoading, routeStops.length]);

  const selectedRoute = routes.find(r => r.id === selectedRouteId);
  const assignedStopIds = routeStops.map(rs => rs.stopId);
  const availableStops = stops.filter(s => !assignedStopIds.includes(s.id));

  // Route CRUD handlers
  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', color: '#2563EB', status: 'active' });
    setGeometryText('');
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (r: RouteType) => {
    setEditing(r);
    setForm({ name: r.name, color: r.color, status: r.status });
    setGeometryText(r.geometry ? JSON.stringify(r.geometry, null, 2) : '');
    setFormError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseGeometry(geometryText);
    if (parsed.error) { setFormError(parsed.error); return; }
    setSaving(true);
    setFormError('');
    const data = { ...form, geometry: parsed.geometry };
    const res = editing ? await update(editing.id, data) : await create(data);
    setSaving(false);
    if (res.success) { setModalOpen(false); }
    else { setFormError(res.error || 'Error'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this route? Stops on this route will also be removed.')) return;
    if (selectedRouteId === id) setSelectedRouteId(null);
    await remove(id);
  };

  /** Build a LineString from the route's ordered stops (a straight-line path, not road routing). */
  const generateGeometryFromStops = async () => {
    if (!editing) return;
    const res = await routeStopApi.getByRoute(editing.id);
    const coords = [...(res.data || [])]
      .sort((a, b) => a.stopOrder - b.stopOrder)
      .flatMap(rs => (rs.stop ? [[rs.stop.longitude, rs.stop.latitude] as [number, number]] : []));
    if (coords.length < 2) { setFormError('Add at least 2 stops to this route before generating a path'); return; }
    setFormError('');
    setGeometryText(JSON.stringify({ type: 'LineString', coordinates: coords }, null, 2));
  };

  const flash = (text: string, error = false) => {
    setMsg({ text, error });
    setTimeout(() => setMsg(null), error ? 4000 : 2000);
  };

  // RouteStop handlers
  const handleAddStop = async () => {
    if (!selectedRouteId || !addingStopId) return;
    const res = await addStop(selectedRouteId, addingStopId, addingOrder);
    if (res.success) {
      setAddingStopId('');
      setAddingOrder(routeStops.length + 2);
      flash('Stop added to route');
      const countsRes = await routeStopApi.getByRoute(selectedRouteId);
      setRouteStopCounts(prev => ({ ...prev, [selectedRouteId]: countsRes.data?.length || 0 }));
    } else {
      flash(res.error || 'Could not add stop', true);
    }
  };

  const handleRemoveStop = async (id: string) => {
    if (!confirm('Remove this stop from the route?')) return;
    const res = await removeStop(id);
    if (!res.success) { flash(res.error || 'Could not remove stop', true); return; }
    if (selectedRouteId) {
      const countsRes = await routeStopApi.getByRoute(selectedRouteId);
      setRouteStopCounts(prev => ({ ...prev, [selectedRouteId]: countsRes.data?.length || 0 }));
    }
    flash('Stop removed');
  };

  const handleMoveUp = async (rs: { id: string; stopOrder: number }) => {
    if (rs.stopOrder <= 1) return;
    const res = await updateOrder(rs.id, rs.stopOrder - 1);
    if (!res.success) flash(res.error || 'Could not reorder', true);
  };

  const handleMoveDown = async (rs: { id: string; stopOrder: number }) => {
    if (rs.stopOrder >= routeStops.length) return;
    const res = await updateOrder(rs.id, rs.stopOrder + 1);
    if (!res.success) flash(res.error || 'Could not reorder', true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Routes</h1>
          <p className="text-sm text-slate-500 mt-1">Manage shuttle routes and their stops</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors">
          <Plus className="w-4 h-4" /> Add Route
        </button>
      </div>

      {/* Route table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-5 py-3 font-medium text-slate-500">Color</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Route Name</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Status</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Stops</th>
                <th className="text-right px-5 py-3 font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">Loading...</td></tr>
              ) : routes.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">No routes found</td></tr>
              ) : routes.map(r => {
                const isSelected = selectedRouteId === r.id;
                return (
                  <tr key={r.id} className={`border-b border-slate-50 last:border-0 transition-colors cursor-pointer ${isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50/50'}`} onClick={() => setSelectedRouteId(isSelected ? null : r.id)}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full" style={{ background: r.color }} />
                        <span className="text-xs text-slate-400 font-mono">{r.color}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center"><Route className="w-4 h-4 text-blue-600" /></div>
                        <span className="font-medium text-slate-900">{r.name}</span>
                        {isSelected ? <ChevronUp className="w-4 h-4 text-slate-400 ml-1" /> : <ChevronDown className="w-4 h-4 text-slate-400 ml-1" />}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${r.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-slate-500">{routeStopCounts[r.id] || 0} stops</span>
                    </td>
                    <td className="px-5 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-blue-600 transition-colors"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(r.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-500 hover:text-red-600 transition-colors ml-1"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* RouteStop Management — shown when a route is selected */}
      {selectedRouteId && selectedRoute && (
        <div className="space-y-4">
          {msg && (
            <div role="status" className={`text-sm rounded-xl px-4 py-2 ${msg.error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
              {msg.text}
            </div>
          )}

          {/* Add stop form */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-600" />
              Add Stop to {selectedRoute.name}
            </h3>
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-1">Select Stop</label>
                <select
                  value={addingStopId}
                  onChange={e => setAddingStopId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                >
                  <option value="">-- Select a stop --</option>
                  {availableStops.map(s => (
                    <option key={s.id} value={s.id}>{s.nameTh}{s.nameEn ? ` (${s.nameEn})` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="w-full sm:w-32">
                <label className="block text-xs text-slate-500 mb-1">Stop Order</label>
                <input
                  type="number"
                  value={addingOrder}
                  onChange={e => setAddingOrder(Math.min(routeStops.length + 1, Math.max(1, parseInt(e.target.value) || 1)))}
                  min={1}
                  max={routeStops.length + 1}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <button
                onClick={handleAddStop}
                disabled={!addingStopId}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-medium rounded-xl transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
          </div>

          {/* Stops list */}
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: selectedRoute.color + '20' }}>
                <Link2 className="w-4 h-4" style={{ color: selectedRoute.color }} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Stops on {selectedRoute.name}</h3>
                <p className="text-xs text-slate-500">{routeStops.length} stops &mdash; use arrows to reorder, trash to remove</p>
              </div>
            </div>

            {rsLoading ? (
              <div className="px-5 py-10 text-center text-slate-400 text-sm">Loading...</div>
            ) : routeStops.length === 0 ? (
              <div className="px-5 py-10 text-center text-slate-400">
                <MapPin className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-sm">No stops on this route yet</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {routeStops.map((rs, idx) => {
                  const stop = stops.find(s => s.id === rs.stopId);
                  return (
                    <div key={rs.id} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50/50 transition-colors">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: selectedRoute.color }}>
                        {rs.stopOrder}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 truncate">{stop?.nameTh || 'Unknown Stop'}</p>
                        {stop?.nameEn && <p className="text-xs text-slate-500">{stop.nameEn}</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleMoveUp(rs)} disabled={idx === 0} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 disabled:opacity-30 transition-colors" title="Move up">
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleMoveDown(rs)} disabled={idx === routeStops.length - 1} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 disabled:opacity-30 transition-colors" title="Move down">
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleRemoveStop(rs.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600 transition-colors ml-1" title="Remove">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {!selectedRouteId && (
        <div className="bg-white rounded-2xl border border-slate-100 px-5 py-8 text-center">
          <Link2 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <p className="text-slate-500 text-sm">Click a route row above to view and manage its stops</p>
        </div>
      )}

      {/* Create/Edit Route Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Route' : 'Add Route'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2">{formError}</div>}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Route Name *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" placeholder="e.g. Blue Line — Main Gate Loop" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Route Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => setForm({ ...form, color: c })} className={`w-8 h-8 rounded-full transition-transform ${form.color === c ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : 'hover:scale-105'}`} style={{ background: c }} />
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="route-geometry" className="block text-sm font-medium text-slate-700">Route Geometry (GeoJSON LineString)</label>
              {editing && (
                <button type="button" onClick={generateGeometryFromStops} className="text-xs text-blue-600 hover:underline">Generate from stops</button>
              )}
            </div>
            <textarea
              id="route-geometry"
              value={geometryText}
              onChange={e => setGeometryText(e.target.value)}
              rows={5}
              spellCheck={false}
              placeholder='{"type":"LineString","coordinates":[[100.65,14.031],[100.6508,14.0318]]}'
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">Coordinates are [longitude, latitude]. Leave empty to draw a dashed line through the ordered stops.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as RouteType['status'] })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white">
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-xl transition-colors flex items-center gap-2">
              {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {editing ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
