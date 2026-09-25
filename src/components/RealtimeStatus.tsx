import { LoaderCircle, Wifi, WifiOff } from 'lucide-react';
import type { RealtimeConnectionStatus } from '../realtime/socket';

const appearance: Record<RealtimeConnectionStatus, { label: string; title: string; className: string; icon: typeof Wifi }> = {
  disabled: { label: 'Not configured', title: 'Realtime is not configured', className: 'bg-slate-100 text-slate-600', icon: WifiOff },
  connecting: { label: 'Connecting', title: 'Connecting to live updates', className: 'bg-amber-50 text-amber-700', icon: LoaderCircle },
  connected: { label: 'Live', title: 'Live updates connected', className: 'bg-emerald-50 text-emerald-700', icon: Wifi },
  disconnected: { label: 'Offline', title: 'Live updates disconnected', className: 'bg-slate-100 text-slate-600', icon: WifiOff },
  error: { label: 'Connection issue', title: 'Live connection error', className: 'bg-rose-50 text-rose-700', icon: WifiOff },
};

export default function RealtimeStatus({ status }: { status: RealtimeConnectionStatus }) {
  const current = appearance[status];
  const Icon = current.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${current.className}`}
      title={current.title}
      aria-label={current.title}
      role="status"
      aria-live="polite"
    >
      <Icon className={`h-3.5 w-3.5 ${status === 'connecting' ? 'animate-spin' : ''}`} aria-hidden="true" />
      {current.label}
    </span>
  );
}
