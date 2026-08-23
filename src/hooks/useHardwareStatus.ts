import { useCallback, useEffect, useRef, useState } from 'react';

export type HardwareStatus = 'checking' | 'online' | 'offline';

export interface HardwareState {
  status: HardwareStatus;
  /** Intersections that answered the /status ping */
  onlineIntersections: string[];
  /** Why hardware is unavailable (user friendly) */
  reason: string | null;
  lastChecked: number | null;
  recheck: () => void;
}

const PING_TIMEOUT_MS = 2500;
const RECHECK_INTERVAL_MS = 20000;

function isLocalNetwork() {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h.startsWith('192.168.') ||
    h.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

async function pingIp(ip: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const res = await fetch(`http://${ip}/status`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Detects whether the physical ESP32 traffic-light controllers are reachable.
 * When they are not, the app runs in demo mode with simulated signal states.
 */
export function useHardwareStatus(intersectionIPs: Record<string, string>): HardwareState {
  const [status, setStatus] = useState<HardwareStatus>('checking');
  const [onlineIntersections, setOnlineIntersections] = useState<string[]>([]);
  const [reason, setReason] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const ipsKey = JSON.stringify(intersectionIPs);
  const runningRef = useRef(false);

  const check = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      const entries = Object.entries(JSON.parse(ipsKey) as Record<string, string>).filter(
        ([, ip]) => !!ip,
      );

      if (!isLocalNetwork()) {
        setStatus('offline');
        setOnlineIntersections([]);
        setReason(
          'This preview runs in the cloud and cannot reach controllers on your local WiFi. Run the app locally (npm run dev) on the same network as the hardware.',
        );
        setLastChecked(Date.now());
        return;
      }

      if (entries.length === 0) {
        setStatus('offline');
        setOnlineIntersections([]);
        setReason('No controller IP addresses configured yet. Add them in Settings → Intersections.');
        setLastChecked(Date.now());
        return;
      }

      const results = await Promise.all(
        entries.map(async ([intersection, ip]) => [intersection, await pingIp(ip)] as const),
      );
      const online = results.filter(([, ok]) => ok).map(([id]) => id);
      setOnlineIntersections(online);
      setStatus(online.length > 0 ? 'online' : 'offline');
      setReason(
        online.length > 0
          ? null
          : 'Controllers did not respond. Check that they are powered on and joined to the same WiFi network.',
      );
      setLastChecked(Date.now());
    } finally {
      runningRef.current = false;
    }
  }, [ipsKey]);

  useEffect(() => {
    check();
    const interval = setInterval(check, RECHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [check]);

  return { status, onlineIntersections, reason, lastChecked, recheck: check };
}
