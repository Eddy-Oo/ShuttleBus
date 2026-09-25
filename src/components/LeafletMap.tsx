import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapMarker {
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  color?: string;
  order?: number;
  kind?: 'stop' | 'vehicle';
  /** Stable key for vehicle markers so they move instead of being recreated. */
  id?: string;
}

export interface MapPath {
  points: { lat: number; lng: number }[];
  color: string;
  /** Dashed lines indicate a fallback path drawn through stops (no stored geometry). */
  dashed?: boolean;
}

interface LeafletMapProps {
  markers: MapMarker[];
  center?: [number, number];
  zoom?: number;
  className?: string;
  /** @deprecated use routePaths */
  routePath?: { lat: number; lng: number; color?: string }[];
  routePaths?: MapPath[];
}

const DEFAULT_CENTER: [number, number] = [14.032, 100.651];

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);
}

function safeColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function markerIcon(m: MapMarker): L.DivIcon {
  const isVehicle = m.kind === 'vehicle';
  const size = isVehicle ? 34 : m.order !== undefined ? 28 : 24;
  const iconText = isVehicle ? '🚌' : m.order !== undefined ? String(m.order) : '📍';
  const background = safeColor(m.color, isVehicle ? '#0f766e' : '#2563EB');
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${background};color:white;
      display:flex;align-items:center;justify-content:center;
      font-size:${isVehicle ? '18px' : m.order !== undefined ? '12px' : '11px'};
      font-weight:700;border:2px solid white;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
      ${isVehicle ? 'transition:transform .3s;' : ''}
    ">${iconText}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function popupHtml(m: MapMarker): string {
  const title = `<strong style="font-size:13px">${escapeHtml(m.title)}</strong>`;
  const subtitle = m.subtitle ? `<br><span style="color:#666;font-size:12px">${escapeHtml(m.subtitle)}</span>` : '';
  const order = m.order !== undefined ? `<br><span style="color:#666;font-size:12px">Stop #${m.order}</span>` : '';
  return `<div style="min-width:150px">${title}${subtitle}${order}</div>`;
}

/**
 * Leaflet map with two independent layers:
 *  - static layer (route lines + stop markers): rebuilt and re-framed only when those inputs change;
 *  - vehicle layer: markers are moved in place on each realtime update, so the user's pan/zoom is kept.
 */
export default function LeafletMap({ markers, center, zoom = 15, className = '', routePath, routePaths }: LeafletMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const staticLayer = useRef<L.LayerGroup | null>(null);
  const vehicleLayer = useRef<L.LayerGroup | null>(null);
  const vehicleMarkers = useRef(new Map<string, { marker: L.Marker; iconKey: string }>());
  const lastFrameKey = useRef('');

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current).setView(center || DEFAULT_CENTER, zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    staticLayer.current = L.layerGroup().addTo(map);
    vehicleLayer.current = L.layerGroup().addTo(map);
    mapInstance.current = map;
    const markersById = vehicleMarkers.current;
    return () => {
      map.remove();
      mapInstance.current = null;
      staticLayer.current = null;
      vehicleLayer.current = null;
      markersById.clear();
      lastFrameKey.current = '';
    };
  }, []);

  const stopMarkers = markers.filter(m => m.kind !== 'vehicle');
  const vehicles = markers.filter(m => m.kind === 'vehicle');
  const paths: MapPath[] = routePaths ?? (routePath ? [{ points: routePath, color: routePath[0]?.color || '#2563EB' }] : []);

  // Serialise the static inputs so we only redraw when they actually change.
  const staticKey = JSON.stringify([
    stopMarkers.map(m => [m.lat, m.lng, m.title, m.subtitle, m.color, m.order]),
    paths.map(p => [p.color, p.dashed, p.points.map(pt => [pt.lat, pt.lng])]),
  ]);

  useEffect(() => {
    const map = mapInstance.current;
    const layer = staticLayer.current;
    if (!map || !layer) return;
    layer.clearLayers();

    paths.forEach(path => {
      if (path.points.length < 2) return;
      const latLngs = path.points.map(point => [point.lat, point.lng] as [number, number]);
      L.polyline(latLngs, {
        color: safeColor(path.color, '#2563EB'),
        weight: 5,
        opacity: 0.8,
        ...(path.dashed ? { dashArray: '8 6' } : {}),
      }).addTo(layer);
    });

    stopMarkers.forEach(m => {
      L.marker([m.lat, m.lng], { icon: markerIcon(m) }).bindPopup(popupHtml(m)).addTo(layer);
    });

    // Frame the map around stops/paths only when the static content changes.
    const framePoints: [number, number][] = [
      ...stopMarkers.map(m => [m.lat, m.lng] as [number, number]),
      ...paths.flatMap(p => p.points.map(pt => [pt.lat, pt.lng] as [number, number])),
    ];
    if (framePoints.length > 0 && lastFrameKey.current !== staticKey) {
      map.fitBounds(L.latLngBounds(framePoints), { padding: [30, 30], maxZoom: 17 });
    }
    lastFrameKey.current = staticKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staticKey]);

  const vehicleKey = JSON.stringify(vehicles.map(v => [v.id ?? v.title, v.lat, v.lng, v.title, v.subtitle, v.color]));

  useEffect(() => {
    const layer = vehicleLayer.current;
    if (!layer) return;
    const seen = new Set<string>();
    vehicles.forEach(v => {
      const id = v.id ?? v.title;
      seen.add(id);
      const iconKey = `${v.color}`;
      const existing = vehicleMarkers.current.get(id);
      if (existing) {
        existing.marker.setLatLng([v.lat, v.lng]);
        existing.marker.setPopupContent(popupHtml(v));
        if (existing.iconKey !== iconKey) {
          existing.marker.setIcon(markerIcon(v));
          existing.iconKey = iconKey;
        }
      } else {
        const marker = L.marker([v.lat, v.lng], { icon: markerIcon(v), zIndexOffset: 1000 })
          .bindPopup(popupHtml(v))
          .addTo(layer);
        vehicleMarkers.current.set(id, { marker, iconKey });
      }
    });
    for (const [id, entry] of vehicleMarkers.current) {
      if (!seen.has(id)) {
        layer.removeLayer(entry.marker);
        vehicleMarkers.current.delete(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleKey]);

  return <div ref={mapRef} className={`rounded-xl overflow-hidden ${className}`} />;
}
