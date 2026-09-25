import { useEffect, useState } from 'react';
import { useStopStore } from '../../store';
import { Plus, Pencil, Trash2, MapPin, Search } from 'lucide-react';
import Modal from '../../components/Modal';
import type { Stop } from '../../types';

export default function StopsPage() {
  const { stops, loading, fetchAll, create, update, remove } = useStopStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Stop | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ nameTh: '', nameEn: '', latitude: 7.005, longitude: 100.500, imageUrl: '', status: 'active' as Stop['status'] });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const filtered = stops.filter(s =>
    s.nameTh.toLowerCase().includes(search.toLowerCase()) ||
    (s.nameEn || '').toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ nameTh: '', nameEn: '', latitude: 7.005, longitude: 100.500, imageUrl: '', status: 'active' });
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (s: Stop) => {
    setEditing(s);
    setForm({ nameTh: s.nameTh, nameEn: s.nameEn || '', latitude: s.latitude, longitude: s.longitude, imageUrl: s.imageUrl || '', status: s.status });
    setFormError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    const data = {
      nameTh: form.nameTh,
      nameEn: form.nameEn || null,
      latitude: form.latitude,
      longitude: form.longitude,
      imageUrl: form.imageUrl || null,
      status: form.status,
    };
    const res = editing ? await update(editing.id, data) : await create(data);
    setSaving(false);
    if (res.success) { setModalOpen(false); }
    else { setFormError(res.error || 'Error'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this stop?')) return;
    await remove(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Stops</h1>
          <p className="text-sm text-slate-500 mt-1">Manage shuttle bus stops</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors">
          <Plus className="w-4 h-4" /> Add Stop
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" placeholder="Search stops..." />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-5 py-3 font-medium text-slate-500">Name (TH)</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Name (EN)</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Latitude</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Longitude</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Status</th>
                <th className="text-right px-5 py-3 font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">No stops found</td></tr>
              ) : filtered.map(s => (
                <tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center"><MapPin className="w-4 h-4 text-emerald-600" /></div>
                      <span className="font-medium text-slate-900">{s.nameTh}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{s.nameEn || '\u2014'}</td>
                  <td className="px-5 py-3 text-slate-600 font-mono text-xs">{s.latitude.toFixed(4)}</td>
                  <td className="px-5 py-3 text-slate-600 font-mono text-xs">{s.longitude.toFixed(4)}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{s.status}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => openEdit(s)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-blue-600 transition-colors"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(s.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-500 hover:text-red-600 transition-colors ml-1"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Stop' : 'Add Stop'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2">{formError}</div>}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name (Thai) *</label>
            <input value={form.nameTh} onChange={e => setForm({ ...form, nameTh: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" placeholder="e.g. PSU Main Gate" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name (English)</label>
            <input value={form.nameEn} onChange={e => setForm({ ...form, nameEn: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" placeholder="e.g. PSU Main Gate" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Latitude *</label>
              <input type="number" step="0.0001" value={form.latitude} onChange={e => setForm({ ...form, latitude: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Longitude *</label>
              <input type="number" step="0.0001" value={form.longitude} onChange={e => setForm({ ...form, longitude: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Image URL</label>
            <input value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" placeholder="https://..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Stop['status'] })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white">
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
