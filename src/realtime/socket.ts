import { io, type Socket } from 'socket.io-client';
import {
  parseTripVehicleId,
  parseVehicleLocation,
  parseVehicleLocationSnapshot,
  REALTIME_EVENTS,
  type VehicleLocationUpdate,
} from './contracts';

export type RealtimeConnectionStatus = 'disabled' | 'connecting' | 'connected' | 'disconnected' | 'error';

interface RealtimeSubscriber {
  onStatus: (status: RealtimeConnectionStatus) => void;
  onSnapshot: (locations: VehicleLocationUpdate[]) => void;
  onLocation: (location: VehicleLocationUpdate) => void;
  onTripChanged?: () => void;
  /** A vehicle's trip ended: its marker should disappear. */
  onVehicleRemoved?: (vehicleId: string) => void;
}

const socketUrl = (import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL)?.trim().replace(/\/+$/, '');
let socket: Socket | null = null;
const subscribers = new Set<RealtimeSubscriber>();
const latestLocations = new Map<string, VehicleLocationUpdate>();

export const isRealtimeConfigured = (): boolean => Boolean(socketUrl);

function notifyStatus(status: RealtimeConnectionStatus) {
  subscribers.forEach(subscriber => subscriber.onStatus(status));
}

function getSocket(): Socket | null {
  if (!socketUrl) return null;
  if (socket) return socket;

  socket = io(socketUrl, {
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 10000,
  });

  socket.on('connect', () => notifyStatus('connected'));
  socket.on('disconnect', () => notifyStatus('disconnected'));
  socket.on('connect_error', () => notifyStatus('error'));
  socket.io.on('reconnect_attempt', () => notifyStatus('connecting'));

  socket.on(REALTIME_EVENTS.vehicleLocationSnapshot, (payload: unknown) => {
    const snapshot = parseVehicleLocationSnapshot(payload);
    if (!snapshot) return;

    latestLocations.clear();
    snapshot.forEach(location => latestLocations.set(location.vehicleId, location));
    const current = [...latestLocations.values()];
    subscribers.forEach(subscriber => subscriber.onSnapshot(current));
  });

  socket.on(REALTIME_EVENTS.vehicleLocationUpdate, (payload: unknown) => {
    const location = parseVehicleLocation(payload);
    if (!location) return;

    latestLocations.set(location.vehicleId, location);
    subscribers.forEach(subscriber => subscriber.onLocation(location));
  });

  socket.on(REALTIME_EVENTS.tripStarted, () => subscribers.forEach(subscriber => subscriber.onTripChanged?.()));
  socket.on(REALTIME_EVENTS.tripEnded, (payload: unknown) => {
    const vehicleId = parseTripVehicleId(payload);
    if (vehicleId) {
      latestLocations.delete(vehicleId);
      subscribers.forEach(subscriber => subscriber.onVehicleRemoved?.(vehicleId));
    }
    subscribers.forEach(subscriber => subscriber.onTripChanged?.());
  });

  return socket;
}

/**
 * Subscribe to server-broadcast vehicle positions. The client never publishes GPS;
 * mobile devices send locations to the authenticated backend, which broadcasts them.
 */
export function subscribeToVehicleRealtime(subscriber: RealtimeSubscriber): () => void {
  const activeSocket = getSocket();
  if (!activeSocket) {
    subscriber.onStatus('disabled');
    subscriber.onSnapshot([]);
    return () => undefined;
  }

  subscribers.add(subscriber);
  subscriber.onSnapshot([...latestLocations.values()]);
  subscriber.onStatus(activeSocket.connected ? 'connected' : 'connecting');

  if (subscribers.size === 1 && !activeSocket.connected) activeSocket.connect();

  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) {
      activeSocket.disconnect();
      latestLocations.clear();
    }
  };
}
