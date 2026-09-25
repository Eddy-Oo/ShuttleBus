import { useEffect, useState } from 'react';
import {
  isRealtimeConfigured,
  subscribeToVehicleRealtime,
  type RealtimeConnectionStatus,
} from './socket';
import type { VehicleLocationUpdate } from './contracts';

export function useVehicleRealtime() {
  const [status, setStatus] = useState<RealtimeConnectionStatus>(
    isRealtimeConfigured() ? 'connecting' : 'disabled',
  );
  const [locations, setLocations] = useState<VehicleLocationUpdate[]>([]);
  const [tripRevision, setTripRevision] = useState(0);

  useEffect(() => subscribeToVehicleRealtime({
    onStatus: setStatus,
    onSnapshot: setLocations,
    onLocation: location => {
      setLocations(current => {
        const next = current.filter(item => item.vehicleId !== location.vehicleId);
        return [...next, location];
      });
    },
    onTripChanged: () => setTripRevision(current => current + 1),
    onVehicleRemoved: vehicleId => setLocations(current => current.filter(item => item.vehicleId !== vehicleId)),
  }), []);

  return { status, locations, tripRevision };
}
