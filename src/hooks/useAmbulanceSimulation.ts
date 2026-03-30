import { useState, useRef, useCallback, useEffect } from 'react';
import Papa from 'papaparse';
import { haversineMeters, closestDistanceToRoute, cumulativeDistanceToClosestPoint } from '@/lib/signal-utils';
import { TrafficSignal, RouteSignalInfo, SIGNAL_METADATA } from '@/types/signal';

export interface AmbulancePoint {
  lat: number;
  lon: number;
}

export interface AmbulanceStatus {
  position: AmbulancePoint | null;
  running: boolean;
  currentIndex: number;
  totalPoints: number;
  nearbySignalId: string | null;
  statusText: string;
  overriddenSignals: Set<string>;
}

// Detection: 300m approach, 300m passed to restore
const APPROACH_THRESHOLD_M = 300;
const PASSED_RESTORE_M = 300;
const ROUTE_BEHIND_MARGIN_M = 20;
const ACTIVE_SIGNAL_HOLD_MARGIN_M = 80;
const NEXT_SIGNAL_MIN_AHEAD_M = 50;

export function useAmbulanceSimulation(signals: TrafficSignal[], routeSignals: RouteSignalInfo[] = []) {
  const [route, setRoute] = useState<AmbulancePoint[]>([]);
  const [status, setStatus] = useState<AmbulanceStatus>({
    position: null,
    running: false,
    currentIndex: 0,
    totalPoints: 0,
    nearbySignalId: null,
    statusText: 'Idle',
    overriddenSignals: new Set(),
  });
  const [speed, setSpeed] = useState(1.5);
  const [esp32IPs, setEsp32IPs] = useState<Record<string, string>>({
    'INT-1': '10.149.4.20',
    'INT-2': '10.179.91.20',
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const indexRef = useRef(0);
  const activeOverrideRef = useRef<string | null>(null);
  const lastESP32CommandRef = useRef<Record<string, string>>({});

  const parseCSV = useCallback((file: File): Promise<AmbulancePoint[]> => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const points: AmbulancePoint[] = [];
          for (const row of results.data as Record<string, string>[]) {
            const lat = parseFloat(row.lat || row.latitude || '');
            const lon = parseFloat(row.lon || row.lng || row.longitude || '');
            if (!isNaN(lat) && !isNaN(lon)) {
              points.push({ lat, lon });
            }
          }
          if (points.length === 0) reject(new Error('No valid GPS points found'));
          else resolve(points);
        },
        error: (err) => reject(err),
      });
    });
  }, []);

  const loadCSV = useCallback(async (file: File) => {
    const points = await parseCSV(file);
    setRoute(points);
    indexRef.current = 0;
    activeOverrideRef.current = null;
    lastESP32CommandRef.current = {};
    setStatus((s) => ({
      ...s,
      position: points[0],
      currentIndex: 0,
      totalPoints: points.length,
      statusText: `Loaded ${points.length} points`,
      overriddenSignals: new Set(),
    }));
  }, [parseCSV]);

  /** Check if running on local network (localhost) */
  const isLocalNetwork = useCallback(() => {
    const hostname = window.location.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.');
  }, []);

  /**
   * Send command to ESP32 via POST
   * Only works when running on local network (same WiFi as ESP32).
   * Sends both query param and JSON body for safety.
   */
  const sendToESP32 = useCallback(async (signalId: string, action: 'emergency' | 'normal'): Promise<boolean> => {
    // Validate signalId format
    if (!/^SIG-\d{3}$/.test(signalId)) {
      console.error('[ESP32] Invalid signalId format:', signalId, '— expected SIG-XXX');
      return false;
    }

    // Check if running on local network
    if (!isLocalNetwork()) {
      console.warn('[ESP32] ⚠️ ESP32 only works on same WiFi network. Run locally with: npm run dev');
      return false;
    }

    const currentSignal = signals.find((signal) => signal.id === signalId);
    const intId = currentSignal?.intersection ?? (SIGNAL_METADATA[signalId]?.intersection || (signalId.startsWith('SIG-1') ? 'INT-1' : 'INT-2'));
    const ip = esp32IPs[intId];
    if (!ip) {
      console.warn('[ESP32] No IP configured for', intId);
      return false;
    }

    // Prevent duplicate commands
    const commandKey = action === 'emergency' ? `emergency:${signalId}` : 'normal';
    if (lastESP32CommandRef.current[intId] === commandKey) {
      console.log('[ESP32] Skipping duplicate command:', commandKey);
      return true;
    }

    const url = action === 'emergency'
      ? `http://${ip}/emergency?signal=${signalId}`
      : `http://${ip}/normal`;

    console.log(`[ESP32] Sending ${action} request to ESP32:`, signalId, '→', url);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal: signalId, action }),
      });

      console.log('[ESP32] Response status:', res.status);
      const data = await res.json();
      console.log('[ESP32] Response body:', data);
      lastESP32CommandRef.current[intId] = commandKey;
      return data?.ok === true;
    } catch (e: any) {
      console.error(`[ESP32] Network error for ${intId} (${ip}):`, e.message);
      console.warn('[ESP32] ⚠️ Make sure ESP32 is powered on and connected to same WiFi');
      return false;
    }
  }, [esp32IPs, isLocalNetwork, signals]);

  /**
   * Override signal to GREEN via ESP32.
   * ESP32 handles: yellow transition → green → cloud publish.
   * Map updates automatically via useSignals polling DB.
   */
  const overrideSignalGreen = useCallback(async (signalId: string) => {
    if (activeOverrideRef.current === signalId) return;

    // If another signal was active, restore it first
    if (activeOverrideRef.current && activeOverrideRef.current !== signalId) {
      await restoreSignal(activeOverrideRef.current);
    }

    activeOverrideRef.current = signalId;
    console.log('[Ambulance] Triggering emergency for:', signalId);

    const ok = await sendToESP32(signalId, 'emergency');
    if (!ok) {
      console.warn('[Ambulance] ESP32 did not confirm emergency for', signalId);
    }
    // No cloud sync here — ESP32 publishes to cloud itself
  }, [sendToESP32]);

  /**
   * Restore signal to normal cycle via ESP32.
   * ESP32 handles: yellow transition → resume timer → cloud publish.
   * This resets ALL signals at the intersection back to normal cycling.
   */
  const restoreSignal = useCallback(async (signalId: string) => {
    if (activeOverrideRef.current === signalId) {
      activeOverrideRef.current = null;
    }
    // Clear the command cache so future emergencies can re-trigger
    const intId = signals.find((signal) => signal.id === signalId)?.intersection ?? (SIGNAL_METADATA[signalId]?.intersection || (signalId.startsWith('SIG-1') ? 'INT-1' : 'INT-2'));
    delete lastESP32CommandRef.current[intId];

    console.log('[Ambulance] Restoring normal for:', signalId, '(resets timer)');

    const ok = await sendToESP32(signalId, 'normal');
    if (!ok) {
      console.warn('[Ambulance] ESP32 did not confirm normal restore for', signalId);
    }
    // No cloud sync here — ESP32 publishes to cloud itself
  }, [sendToESP32]);

  /**
   * Proximity check using haversine distance (meters).
   * - Only route-matched signals are considered
   * - Approach threshold: 300m
   * - Restore threshold: 300m behind (ambulance passed the signal)
   * - Only ONE signal can be active at a time
   */
  const getRouteDistanceAtCurrentIndex = useCallback(() => {
    let total = 0;
    for (let i = 1; i < indexRef.current && i < route.length; i++) {
      total += haversineMeters(
        { lat: route[i - 1].lat, lng: route[i - 1].lon },
        { lat: route[i].lat, lng: route[i].lon },
      );
    }
    return total;
  }, [route]);

  const getRouteSignalsFromRoute = useCallback(() => {
    if (route.length < 2) return [];

    const routeLatLng = route.map((point) => ({ lat: point.lat, lng: point.lon }));

    return signals
      .map((signal) => {
        const distanceInfo = closestDistanceToRoute(
          { lat: signal.latitude, lng: signal.longitude },
          routeLatLng,
        );

        if (!distanceInfo || distanceInfo.dist > 10) {
          return null;
        }

        const distanceFromStart = cumulativeDistanceToClosestPoint(
          { lat: signal.latitude, lng: signal.longitude },
          routeLatLng,
        );

        return {
          signal,
          distanceFromStart: Math.round(distanceFromStart),
          distanceToRoute: Math.round(distanceInfo.dist),
          state: signal.state,
          arrivalSec: 0,
          waitSec: 0,
          roadName: signal.roadName ?? SIGNAL_METADATA[signal.id]?.roadName ?? signal.id,
        };
      })
      .filter((info): info is RouteSignalInfo => info !== null)
      .sort((a, b) => a.distanceFromStart - b.distanceFromStart);
  }, [route, signals]);

  const checkProximity = useCallback(
    (pos: AmbulancePoint) => {
      const routeSignalCandidates = routeSignals.length > 0 ? routeSignals : getRouteSignalsFromRoute();
      if (routeSignalCandidates.length === 0) {
        console.log('[Ambulance] No route signals detected for current route, skipping ESP32 trigger');
        return null;
      }

      const currentRouteDistance = getRouteDistanceAtCurrentIndex();
      const candidates = routeSignalCandidates
        .map((rs) => ({ signal: rs.signal, distanceFromStart: rs.distanceFromStart }))
        .sort((a, b) => a.distanceFromStart - b.distanceFromStart);

      const activeRouteSignal = activeOverrideRef.current
        ? routeSignalCandidates.find((rs) => rs.signal.id === activeOverrideRef.current)
        : undefined;

      if (activeRouteSignal) {
        if (currentRouteDistance <= activeRouteSignal.distanceFromStart + ACTIVE_SIGNAL_HOLD_MARGIN_M) {
          console.log('[Ambulance] Holding active route signal', activeOverrideRef.current, 'until ambulance passes it');
          return activeOverrideRef.current;
        }

        if (currentRouteDistance >= activeRouteSignal.distanceFromStart + PASSED_RESTORE_M) {
          console.log('[Ambulance] Passed active route signal by route distance, restoring', activeOverrideRef.current);
          restoreSignal(activeOverrideRef.current);
          return null;
        }
      }

      let bestSignal: { id: string; dist: number } | null = null;

      for (const candidate of candidates) {
        const sig = candidate.signal;
        const dist = haversineMeters(
          { lat: pos.lat, lng: pos.lon },
          { lat: sig.latitude, lng: sig.longitude }
        );

        const behindRoute = routeSignals.length > 0 && candidate.distanceFromStart < currentRouteDistance - ROUTE_BEHIND_MARGIN_M;
        if (behindRoute) {
          console.log(
            '[Ambulance] Skipping behind-route signal',
            sig.id,
            'distFromStart=',
            Math.round(candidate.distanceFromStart),
            'currentRouteDist=',
            Math.round(currentRouteDistance)
          );
          continue;
        }

        const tooCloseToActive = activeRouteSignal &&
          candidate.signal.id !== activeOverrideRef.current &&
          candidate.distanceFromStart <= activeRouteSignal.distanceFromStart + ACTIVE_SIGNAL_HOLD_MARGIN_M;
        if (tooCloseToActive) {
          console.log(
            '[Ambulance] Skipping signal too close to active signal',
            sig.id,
            'distanceFromStart=',
            Math.round(candidate.distanceFromStart),
            'activeSignalDistance=',
            Math.round(activeRouteSignal.distanceFromStart)
          );
          continue;
        }

        if (routeSignals.length > 0 && candidate.distanceFromStart <= currentRouteDistance + NEXT_SIGNAL_MIN_AHEAD_M) {
          console.log('[Ambulance] Skipping signal too close to current route position', sig.id, 'routeDist=', Math.round(candidate.distanceFromStart));
          continue;
        }

        console.log('[Ambulance] Proximity check', sig.id, 'dist=', Math.round(dist), 'routeDist=', Math.round(candidate.distanceFromStart));

        if (dist <= APPROACH_THRESHOLD_M) {
          bestSignal = { id: sig.id, dist };
          break;
        }
      }

      if (!bestSignal) {
        console.log('[Ambulance] No nearby signal found within', APPROACH_THRESHOLD_M, 'meters');
      } else {
        console.log('[Ambulance] Best nearby signal', bestSignal.id, 'at', Math.round(bestSignal.dist), 'm');
      }

      if (bestSignal) {
        if (activeOverrideRef.current !== bestSignal.id) {
          overrideSignalGreen(bestSignal.id);
        }
      }

      if (bestSignal) {
        console.log(`[Proximity] ${bestSignal.id} at ${Math.round(bestSignal.dist)}m`);
      }
      return bestSignal?.id || null;
    },
    [signals, overrideSignalGreen, restoreSignal, getRouteDistanceAtCurrentIndex, routeSignals]
  );

  const start = useCallback(() => {
    if (route.length === 0) return;
    if (intervalRef.current) clearInterval(intervalRef.current);

    setStatus((s) => ({ ...s, running: true, statusText: 'Simulation running' }));

    intervalRef.current = setInterval(() => {
      const idx = indexRef.current;
      if (idx >= route.length) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        // Restore any active override on completion
        if (activeOverrideRef.current) {
          restoreSignal(activeOverrideRef.current);
        }
        setStatus((s) => ({
          ...s,
          running: false,
          statusText: 'Simulation complete',
          nearbySignalId: null,
        }));
        return;
      }

      const pos = route[idx];
      const nearId = checkProximity(pos);

      let statusText = 'En route';
      if (nearId) {
        const sig = signals.find((s) => s.id === nearId);
        if (sig) {
          const dist = haversineMeters(
            { lat: pos.lat, lng: pos.lon },
            { lat: sig.latitude, lng: sig.longitude }
          );
          if (dist < 20) statusText = `Crossing ${nearId}`;
          else statusText = `Approaching ${nearId} (${Math.round(dist)}m)`;
        }
      }

      indexRef.current = idx + 1;
      setStatus((s) => ({
        ...s,
        position: pos,
        currentIndex: idx + 1,
        nearbySignalId: nearId,
        statusText,
        overriddenSignals: activeOverrideRef.current ? new Set([activeOverrideRef.current]) : new Set(),
      }));
    }, speed * 1000);
  }, [route, speed, checkProximity, restoreSignal, signals, routeSignals]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (activeOverrideRef.current) {
      restoreSignal(activeOverrideRef.current);
    }
    activeOverrideRef.current = null;
    lastESP32CommandRef.current = {};
    setStatus((s) => ({
      ...s,
      running: false,
      statusText: 'Simulation stopped',
      nearbySignalId: null,
      overriddenSignals: new Set(),
    }));
  }, [restoreSignal]);

  const reset = useCallback(() => {
    stop();
    indexRef.current = 0;
    setStatus((s) => ({
      ...s,
      position: route.length > 0 ? route[0] : null,
      currentIndex: 0,
      statusText: route.length > 0 ? 'Ready' : 'Idle',
    }));
  }, [stop, route]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return {
    status,
    route,
    speed,
    setSpeed,
    loadCSV,
    start,
    stop,
    reset,
    esp32IPs,
    setEsp32IPs,
  };
}
