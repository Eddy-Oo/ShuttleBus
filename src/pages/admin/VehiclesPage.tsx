import { useEffect, useState } from 'react';
import { useVehicleStore, useRouteStore } from '../../store';
import { Plus, Pencil, Trash2, Bus, Search, KeyRound, Copy, Check } from 'lucide-react';
import { usingBackendApi, vehicleApi } from '../../api';
import Modal from '../../components/Modal';
import type { Vehicle } from '../../types';

const VEHICLE_TYPES = ['bus', 'minibus', 'van'];

export default function VehiclesPage() {
  const { vehicles, loading, fetchAll, create, update, remove } = useVehicleStore();
  const { routes, fetchAll: fetchRoutes } = useRouteStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', type: 'bus', assignedRouteId: '', status: 'inactive' as Vehicle['status'] });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deviceCredential, setDeviceCredential] = useState<{ vehicleId: string; deviceToken: string; warning: string } | null>(null);
  const [credentialError, setCredentialError] = useState('');
  const [credentialCopied, setCredentialCopied] = useState(false);

  useEffect(() => { fetchAll(); fetchRoutes(); }, []);

  const filtered = vehicles.filter(v =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    v.type.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', type: 'bus', assignedRouteId: '', status: 'inactive' });
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (v: Vehicle) => {
    setEditing(v);
    setForm({ name: v.name, type: v.type, assignedRouteId: v.assignedRouteId || '', status: v.status });
    setFormError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    const data = { ...form, assignedRouteId: form.assignedRouteId || null };
    const res = editing ? await update(editing.id, data) : await create(data);
    setSaving(false);
    if (res.success) { setModalOpen(false); }
    else { setFormError(res.error || 'Error'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this vehicle?')) return;
    await remove(id);
  };

  const handleRotateDeviceToken = async (vehicle: Vehicle) => {
    if (!confirm(`Rotate the mobile credential for ${vehicle.name}? Existing vehicle tokens will be revoked.`)) return;
    setCredentialError('');
    const response = await vehicleApi.rotateDeviceToken(vehicle.id);
    if (response.success && response.data) {
      setCredentialCopied(false);
      setDeviceCredential(response.data);
    } else {
      setCredentialError(response.error || 'Unable to rotate vehicle token');
    }
  };

  const copyDeviceToken = async () => {
    if (!deviceCredential) return;
    try {
      await navigator.clipboard.writeText(deviceCredential.deviceToken);
      setCredentialCopied(true);
    } catch {
      setCredentialError('Copy is unavailable; select and copy the token manually.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Vehicles</h1>
          <p className="text-sm text-slate-500 mt-1">Manage all shuttle vehicles</p>
        </div>
        <button onClick={() => openCreate()} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors">
          <Plus className="w-4 h-4" /> Add Vehicle
        </button>
      </div>

      {credentialError && !deviceCredential && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{credentialError}</div>}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" placeholder="Search by name or type..." />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-5 py-3 font-medium text-slate-500">Name</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Type</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Route</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Status</th>
                <th className="text-right px-5 py-3 font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">No vehicles found</td></tr>
              ) : filtered.map(v => {
                const route = routes.find(r => r.id === v.assignedRouteId);
                return (
                  <tr key={v.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center"><Bus className="w-4 h-4 text-blue-600" /></div>
                        <span className="font-medium text-slate-900">{v.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{v.type}</span>
                    </td>
                    <td className="px-5 py-3">
                      {route ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: route.color }} />
                          <span className="text-slate-600 text-xs">{route.name}</span>
                        </span>
                      ) : <span className="text-slate-400 text-xs">&mdash;</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        v.status === 'active' ? 'bg-green-50 text-green-700' :
                        v.status === 'maintenance' ? 'bg-amber-50 text-amber-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>{v.status}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {usingBackendApi && <button onClick={() => handleRotateDeviceToken(v)} title="Rotate mobile device credential" className="p-1.5 hover:bg-amber-50 rounded-lg text-slate-500 hover:text-amber-700 transition-colors"><KeyRound className="w-4 h-4" /></button>}
                      <button onClick={() => openEdit(v)} title="Edit vehicle" className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-blue-600 transition-colors"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(v.id)} title="Delete vehicle" className="p-1.5 hover:bg-red-50 rounded-lg text-slate-500 hover:text-red-600 transition-colors ml-1"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={Boolean(deviceCredential)} onClose={() => { setDeviceCredential(null); setCredentialError(''); }} title="Vehicle device credential">
        {deviceCredential && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">This credential is shown only once. Copy it into the vehicle client now. Rotating it revokes the previous device token.</p>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-500 mb-1">Vehicle ID</p>
              <p className="font-mono text-sm text-slate-900">{deviceCredential.vehicleId}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-500 mb-1">Device token</p>
              <code className="block break-all font-mono text-sm text-slate-900">{deviceCredential.deviceToken}</code>
            </div>
            {credentialError && <p className="text-sm text-red-700">{credentialError}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={copyDeviceToken} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                {credentialCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {credentialCopied ? 'Copied' : 'Copy token'}
              </button>
              <button onClick={() => { setDeviceCredential(null); setCredentialError(''); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Done</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Vehicle' : 'Add Vehicle'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2">{formError}</div>}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Vehicle Name *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" placeholder="e.g. Shuttle Bus 01" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Type *</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white">
              {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Assigned Route</label>
            <select value={form.assignedRouteId} onChange={e => setForm({ ...form, assignedRouteId: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white">
              <option value="">-- Unassigned --</option>
              {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Vehicle['status'] })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white">
              <option value="active">active</option>
              <option value="maintenance">maintenance</option>
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
