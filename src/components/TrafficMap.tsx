import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import type { TrafficSignal, RouteSignalInfo, SignalRuntime } from '@/types/signal';
import { DEFAULT_SETTINGS, SIGNAL_METADATA } from '@/types/signal';
import { formatCountdown } from '@/lib/countdown';
import type { AmbulancePoint } from '@/hooks/useAmbulanceSimulation';
import {
  haversineMeters,
  closestDistanceToRoute,
  cumulativeDistanceToClosestPoint,
  waitingTimeAtArrival,
} from '@/lib/signal-utils';

interface TrafficMapProps {
  signals: TrafficSignal[];
  onRouteSignals?: (info: RouteSignalInfo[]) => void;
  onRouteDistance?: (distance: number) => void;
  getRuntime: (id: string) => SignalRuntime | undefined;
  runtimes: React.MutableRefObject<Map<string, SignalRuntime>>;
  speed: number;
  ambulancePosition?: AmbulancePoint | null;
  ambulanceRoute?: AmbulancePoint[];
  signalLocationPickMode?: boolean;
  onSignalLocationPick?: (lat: number, lng: number) => void;
}

const SIGNAL_COLORS: Record<string, string> = {
  RED: '#e53e3e',
  GREEN: '#38a169',
  YELLOW: '#d69e2e',
};

function createSignalIcon(state: string, onRoute = false) {
  const color = SIGNAL_COLORS[state] || '#999';
  const size = onRoute ? 24 : 18;
  const ring = onRoute ? `box-shadow: 0 0 12px ${color}, 0 0 24px ${color}80, 0 0 0 4px rgba(66,153,225,0.5);` : `box-shadow: 0 0 10px ${color}, 0 0 20px ${color}40;`;
  return L.divIcon({
    className: '',
    html: `<div style="
      width: ${size}px; height: ${size}px; border-radius: 50%;
      background: ${color}; border: 3px solid rgba(255,255,255,0.4);
      ${ring}
      transition: all 0.3s;
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function TrafficMap({
  signals,
  onRouteSignals,
  onRouteDistance,
  getRuntime,
  runtimes,
  speed,
  ambulancePosition,
  ambulanceRoute,
  signalLocationPickMode,
  onSignalLocationPick,
}: TrafficMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const routingControlRef = useRef<any>(null);
  const activeRouteRef = useRef<{ lat: number; lng: number }[] | null>(null);
  const streetLayerRef = useRef<L.TileLayer | null>(null);
  const satelliteLayerRef = useRef<L.TileLayer | null>(null);
  const locationMarkerRef = useRef<L.CircleMarker | null>(null);
  const ambulanceMarkerRef = useRef<L.Marker | null>(null);
  const ambulancePolylineRef = useRef<L.Polyline | null>(null);
  const [mapLayer, setMapLayer] = useState<'street' | 'satellite'>('street');
  const [settingPoint, setSettingPoint] = useState<'start' | 'end' | 'signal' | null>(null);
  const startMarkerRef = useRef<L.Marker | null>(null);
  const endMarkerRef = useRef<L.Marker | null>(null);
  const signalPickMarkerRef = useRef<L.Marker | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasRoute, setHasRoute] = useState(false);

  // Initialize map
  useEffect(() => {
    if (mapRef.current) return;

    const map = L.map('traffic-map', {
      center: [19.8385, 75.2497],
      zoom: 16,
      zoomControl: true,
    });

    const streetLayer = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { maxZoom: 19, attribution: '© OpenStreetMap contributors' }
    ).addTo(map);

    const satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: 'Tiles © Esri' }
    );

    streetLayerRef.current = streetLayer;
    satelliteLayerRef.current = satelliteLayer;

    // Initialize routing control
    const routingControl = (L as any).Routing.control({
      waypoints: [],
      routeWhileDragging: true,
      addWaypoints: true,
      draggableWaypoints: true,
      showAlternatives: false,
      fitSelectedRoutes: true,
      lineOptions: {
        styles: [{ color: '#38bdf8', opacity: 0.9, weight: 6 }],
      },
      createMarker(i: number, waypoint: any, n: number) {
        const isStart = i === 0;
        const isEnd = i === n - 1;
        const label = isStart ? 'Start' : isEnd ? 'Destination' : `Waypoint ${i + 1}`;
        const color = '#3b82f6';
        const icon = L.divIcon({
          className: '',
          html: `<div style="
            width: 20px; height: 20px; border-radius: 50%;
            background: ${color}; border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4), 0 0 0 2px ${color}40;
          "></div>
          <div style="
            position: absolute; top: 22px; left: 50%; transform: translateX(-50%);
            white-space: nowrap; font-family: 'JetBrains Mono', monospace;
            font-size: 10px; font-weight: 700; color: white;
            background: ${color}; padding: 1px 6px; border-radius: 4px;
            box-shadow: 0 1px 4px rgba(0,0,0,0.3);
          ">${label}</div>`,
          iconSize: [20, 34],
          iconAnchor: [10, 10],
        });
        return L.marker(waypoint.latLng, {
          draggable: true,
          title: label,
          icon,
        });
      },
    }).addTo(map);

    // Hide routing container initially & add collapse button + minimized dot
    const rcContainer = routingControl.getContainer?.() || routingControl._container;
    if (rcContainer) {
      rcContainer.style.display = 'none';
      rcContainer.style.position = 'relative';
      
      // Create minimized dot (hidden initially)
      const minimizedDot = document.createElement('div');
      minimizedDot.className = 'leaflet-routing-minimized-dot';
      minimizedDot.title = 'Expand route directions';
      minimizedDot.style.display = 'none';
      map.getContainer().appendChild(minimizedDot);

      // Add collapse button inside container
      const collapseBtn = document.createElement('button');
      collapseBtn.className = 'leaflet-routing-collapse-btn';
      collapseBtn.textContent = '−';
      collapseBtn.title = 'Minimize';

      const minimize = () => {
        rcContainer.classList.add('leaflet-routing-container-hide');
        rcContainer.style.display = 'none';
        minimizedDot.style.display = 'flex';
      };

      const expand = () => {
        rcContainer.style.display = '';
        rcContainer.classList.remove('leaflet-routing-container-hide');
        minimizedDot.style.display = 'none';
      };

      collapseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        minimize();
      });

      minimizedDot.addEventListener('click', (e) => {
        e.stopPropagation();
        expand();
      });

      rcContainer.appendChild(collapseBtn);
    }

    routingControl.on('routesfound', (event: any) => {
      if (rcContainer) rcContainer.style.display = '';
      const route = event.routes[0];
      activeRouteRef.current = route.coordinates.map((c: any) => ({
        lat: c.lat,
        lng: c.lng,
      }));
      setHasRoute(true);

      if (route.summary && typeof route.summary.totalDistance === 'number') {
        onRouteDistance?.(route.summary.totalDistance);
      }
    });

    routingControlRef.current = routingControl;
    mapRef.current = map;

    // Geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          if (!locationMarkerRef.current) {
            locationMarkerRef.current = L.circleMarker([latitude, longitude], {
              radius: 8,
              color: '#3b82f6',
              fillColor: '#3b82f6',
              fillOpacity: 0.6,
            })
              .addTo(map)
              .bindTooltip('You', { permanent: true, direction: 'top' });
          }
        },
        () => {}
      );

      navigator.geolocation.watchPosition(
        (pos) => {
          if (locationMarkerRef.current) {
            locationMarkerRef.current.setLatLng([pos.coords.latitude, pos.coords.longitude]);
          }
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 1000 }
      );
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Handle map clicks for start/end/signal point
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handler = (e: L.LeafletMouseEvent) => {
      if (!settingPoint) return;

      if (settingPoint === 'signal') {
        if (signalPickMarkerRef.current) map.removeLayer(signalPickMarkerRef.current);
        signalPickMarkerRef.current = L.marker(e.latlng, { title: 'Selected signal location' })
          .addTo(map)
          .bindTooltip('Selected signal location', { permanent: true, direction: 'top', className: 'marker-label' });

        onSignalLocationPick?.(e.latlng.lat, e.latlng.lng);
        setSettingPoint(null);
        return;
      }

      if (settingPoint === 'start') {
        if (startMarkerRef.current) map.removeLayer(startMarkerRef.current);
        startMarkerRef.current = L.marker(e.latlng, { title: 'Start' })
          .addTo(map)
          .bindTooltip('Start', { permanent: true, direction: 'top', className: 'marker-label' });
      } else {
        if (endMarkerRef.current) map.removeLayer(endMarkerRef.current);
        endMarkerRef.current = L.marker(e.latlng, { title: 'End' })
          .addTo(map)
          .bindTooltip('End', { permanent: true, direction: 'top', className: 'marker-label' });
      }

      setSettingPoint(null);

      // Update route if both markers exist
      if (startMarkerRef.current && endMarkerRef.current) {
        routingControlRef.current?.setWaypoints([
          startMarkerRef.current.getLatLng(),
          endMarkerRef.current.getLatLng(),
        ]);
      }
    };

    map.on('click', handler);
    return () => {
      map.off('click', handler);
    };
  }, [settingPoint, onSignalLocationPick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (signalLocationPickMode) {
      setSettingPoint('signal');
    } else if (settingPoint === 'signal') {
      setSettingPoint(null);
    }

    if (!signalLocationPickMode && signalPickMarkerRef.current) {
      map.removeLayer(signalPickMarkerRef.current);
      signalPickMarkerRef.current = null;
    }
  }, [signalLocationPickMode, settingPoint]);

  // Layer switching
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (mapLayer === 'street') {
      if (satelliteLayerRef.current) map.removeLayer(satelliteLayerRef.current);
      if (streetLayerRef.current) streetLayerRef.current.addTo(map);
    } else {
      if (streetLayerRef.current) map.removeLayer(streetLayerRef.current);
      if (satelliteLayerRef.current) satelliteLayerRef.current.addTo(map);
    }
  }, [mapLayer]);

  // Update signal markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || signals.length === 0) return;

    const routeSignalIds = new Set<string>();
    const routeCoords: { lat: number; lng: number }[] | null = ambulanceRoute && ambulanceRoute.length > 1
      ? ambulanceRoute.map((p) => ({ lat: p.lat, lng: p.lon }))
      : activeRouteRef.current;

    // Analyze route if active
    if (routeCoords && routeCoords.length > 1) {
      const nearbySignals: RouteSignalInfo[] = [];
      const speedMps = (speed * 1000) / 3600;

      signals.forEach((signal) => {
        const info = closestDistanceToRoute(
          { lat: signal.latitude, lng: signal.longitude },
          routeCoords
        );
        if (!info) return;

        if (info.dist <= DEFAULT_SETTINGS.signalProximityMeters) {
          const distFromStart = cumulativeDistanceToClosestPoint(
            { lat: signal.latitude, lng: signal.longitude },
            routeCoords
          );
          if (distFromStart < 2) return;

          const runtime = getRuntime(signal.id);
          const arrivalSec = distFromStart / speedMps;
          const waitSec = runtime
            ? waitingTimeAtArrival(runtime.elapsed, runtime.cycle, arrivalSec)
            : 0;
          const currentState = signal.state;

          routeSignalIds.add(signal.id);
          nearbySignals.push({
            signal,
            distanceToRoute: Math.round(info.dist),
            distanceFromStart: Math.round(distFromStart),
            state: currentState,
            arrivalSec,
            waitSec,
            roadName: SIGNAL_METADATA[signal.id]?.roadName || signal.id,
          });
        }
      });

      nearbySignals.sort((a, b) => a.distanceFromStart - b.distanceFromStart);
      onRouteSignals?.(nearbySignals);

      if (ambulanceRoute && ambulanceRoute.length > 1) {
        const totalDistance = routeCoords.reduce((sum, _, idx) => {
          if (idx === 0) return 0;
          return sum + haversineMeters(routeCoords[idx - 1], routeCoords[idx]);
        }, 0);
        onRouteDistance?.(Math.round(totalDistance));
      }
    } else {
      onRouteSignals?.([]);
    }

    // Update markers
    signals.forEach((signal) => {
      const currentState = signal.state;
      const onRoute = routeSignalIds.has(signal.id);
      const meta = SIGNAL_METADATA[signal.id];

      const existing = markersRef.current.get(signal.id);
      const countdownText = formatCountdown(currentState, signal.updated_at, signal.id, signals);
      const popupContent = `
        <div style="font-family: 'JetBrains Mono', monospace; background: #1a1f2e; color: #e2e8f0; padding: 8px; border-radius: 6px; min-width: 160px;">
          <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px;">${signal.id}</div>
          <div style="font-size: 12px; color: #a0aec0; margin-bottom: 4px;">${signal.roadName || meta?.roadName || ''}</div>
          <div style="color: ${SIGNAL_COLORS[currentState]}; font-weight: 600;">● ${currentState}</div>
          <div style="font-size: 12px; font-weight: 700; color: #e2e8f0; margin-top: 4px;">${countdownText}</div>
        </div>
      `;

      if (existing) {
        existing.setIcon(createSignalIcon(currentState, onRoute));
        existing.setPopupContent(popupContent);
      } else {
        const marker = L.marker([signal.latitude, signal.longitude], {
          icon: createSignalIcon(currentState, onRoute),
        }).addTo(map);
        marker.bindPopup(popupContent);
        markersRef.current.set(signal.id, marker);
      }
    });
  }, [signals, getRuntime, speed, onRouteSignals, onRouteDistance, ambulanceRoute]);

  // Ambulance marker + route polyline
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Draw ambulance route polyline
    if (ambulanceRoute && ambulanceRoute.length > 1) {
      if (ambulancePolylineRef.current) map.removeLayer(ambulancePolylineRef.current);
      ambulancePolylineRef.current = L.polyline(
        ambulanceRoute.map((p) => [p.lat, p.lon] as [number, number]),
        { color: '#e53e3e', weight: 3, opacity: 0.5, dashArray: '8 4' }
      ).addTo(map);
    } else if (!ambulanceRoute || ambulanceRoute.length === 0) {
      if (ambulancePolylineRef.current) {
        map.removeLayer(ambulancePolylineRef.current);
        ambulancePolylineRef.current = null;
      }
    }

    // Ambulance marker
    if (ambulancePosition) {
      const icon = L.divIcon({
        className: '',
        html: `<div style="font-size:28px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">🚑</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      if (ambulanceMarkerRef.current) {
        ambulanceMarkerRef.current.setLatLng([ambulancePosition.lat, ambulancePosition.lon]);
      } else {
        ambulanceMarkerRef.current = L.marker(
          [ambulancePosition.lat, ambulancePosition.lon],
          { icon, zIndexOffset: 1000 }
        ).addTo(map);
        ambulanceMarkerRef.current.bindTooltip('Ambulance', {
          permanent: true,
          direction: 'top',
          className: 'marker-label',
          offset: [0, -14],
        });
      }
    } else {
      if (ambulanceMarkerRef.current) {
        map.removeLayer(ambulanceMarkerRef.current);
        ambulanceMarkerRef.current = null;
      }
    }
  }, [ambulancePosition, ambulanceRoute]);

  // Search handler
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !mapRef.current) return;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(searchQuery)}&countrycodes=in`;
      const res = await fetch(url);
      const results = await res.json();
      if (results?.length) {
        const first = results[0];
        mapRef.current.setView([parseFloat(first.lat), parseFloat(first.lon)], 15);
      }
    } catch (e) {
      console.error('Search error', e);
    }
  }, [searchQuery]);

  const clearRoute = useCallback(() => {
    if (startMarkerRef.current && mapRef.current) {
      mapRef.current.removeLayer(startMarkerRef.current);
      startMarkerRef.current = null;
    }
    if (endMarkerRef.current && mapRef.current) {
      mapRef.current.removeLayer(endMarkerRef.current);
      endMarkerRef.current = null;
    }
    routingControlRef.current?.setWaypoints([]);
    activeRouteRef.current = null;
    setHasRoute(false);
    onRouteSignals?.([]);
    onRouteDistance?.(0);

    const rcContainer = routingControlRef.current?.getContainer?.() || routingControlRef.current?._container;
    if (rcContainer) rcContainer.style.display = 'none';
  }, [onRouteSignals, onRouteDistance]);

  return (
    <div className="relative h-full w-full">
      <div id="traffic-map" className="h-full w-full" />

      {/* Search - top center, shifts right on mobile to avoid status pill */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 md:left-1/2 md:-translate-x-1/2 z-[1000]">
        <div className="flex gap-1">
          <input
            type="text"
            placeholder="Search location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="px-3 py-1.5 rounded-md text-xs font-mono bg-card text-card-foreground border border-border w-40 md:w-48 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={handleSearch}
            className="px-2 py-1.5 rounded-md text-xs font-mono font-semibold bg-primary text-primary-foreground"
          >
            Search
          </button>
        </div>
      </div>

      {/* Bottom-right controls — safe area for mobile gesture nav */}
      <div className="absolute bottom-3 right-3 pb-[env(safe-area-inset-bottom)] z-[1000] flex flex-col gap-2 items-end">
        <div className="flex gap-1">
          <button
            onClick={() => setMapLayer('street')}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-semibold transition-all ${
              mapLayer === 'street'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-card-foreground border border-border hover:bg-secondary'
            }`}
          >
            Street
          </button>
          <button
            onClick={() => setMapLayer('satellite')}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-semibold transition-all ${
              mapLayer === 'satellite'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-card-foreground border border-border hover:bg-secondary'
            }`}
          >
            Satellite
          </button>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setSettingPoint('start')}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-semibold transition-all ${
            settingPoint === 'start'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-card-foreground border border-border hover:bg-secondary'
            }`}
          >
            Start
          </button>
          <button
            onClick={() => setSettingPoint('end')}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-semibold transition-all ${
              settingPoint === 'end'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-card-foreground border border-border hover:bg-secondary'
            }`}
          >
            End
          </button>
          {hasRoute && (
            <button
              onClick={clearRoute}
              className="px-3 py-1.5 rounded-md text-xs font-mono font-semibold bg-card text-card-foreground border border-border hover:bg-secondary"
            >
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      {/* Setting point hint */}
      {settingPoint && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-[1000] bg-card/90 backdrop-blur px-4 py-2 rounded-lg border border-border">
          <p className="text-xs font-mono text-muted-foreground">
            Click on map to set <span className="text-foreground font-semibold">{settingPoint}</span> point
          </p>
        </div>
      )}
    </div>
  );
}
