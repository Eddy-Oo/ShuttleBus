// Phase 1 Types — aligned with Prisma schema

export interface RouteGeometry {
  type: 'LineString';
  /** GeoJSON positions use [longitude, latitude]. */
  coordinates: [number, number][];
}

export interface Route {
  id: string;           // varchar(50)
  name: string;         // varchar(255)
  color: string;        // varchar(7) hex
  status: 'active' | 'inactive'; // varchar(50)
  geometry?: RouteGeometry | null;
  createdAt: string;
}

export interface Vehicle {
  id: string;           // varchar(50)
  name: string;         // varchar(255)
  type: string;         // varchar(50) e.g. 'bus', 'minibus'
  assignedRouteId: string | null; // varchar(50) FK → Route
  status: 'active' | 'inactive' | 'maintenance'; // varchar(50)
  createdAt: string;
}

export interface Stop {
  id: string;           // varchar(50)
  nameTh: string;       // varchar(255)
  nameEn: string | null;// varchar(255)
  latitude: number;     // WGS84 latitude
  longitude: number;    // WGS84 longitude
  imageUrl: string | null; // varchar(500)
  status: 'active' | 'inactive'; // varchar(50)
  createdAt: string;
}

export interface RouteStop {
  id: string;           // varchar(50)
  routeId: string;      // varchar(50) FK → Route
  stopId: string;       // varchar(50) FK → Stop
  stopOrder: number;    // int, unique per routeId
  createdAt?: string;
  route?: Route;
  stop?: Stop;
}

export interface Trip {
  id: string;
  vehicleId: string;
  routeId: string;
  status: 'active' | 'completed';
  startedAt: string;
  endedAt: string | null;
  vehicle?: Pick<Vehicle, 'id' | 'name' | 'type' | 'status'>;
  route?: Pick<Route, 'id' | 'name' | 'color'>;
}

export interface User {
  id: string;
  username: string;
  role: 'ADMIN' | 'VIEWER';
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
