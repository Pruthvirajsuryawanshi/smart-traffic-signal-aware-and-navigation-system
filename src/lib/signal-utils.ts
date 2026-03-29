import type { CycleDurations } from '@/types/signal';

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function totalCycleDuration(cycle: CycleDurations): number {
  return cycle.GREEN + cycle.YELLOW + cycle.RED;
}

export function stateByElapsed(elapsed: number, cycle: CycleDurations) {
  const cycleLength = cycle.GREEN + cycle.YELLOW + cycle.RED;
  const t = ((elapsed % cycleLength) + cycleLength) % cycleLength;

  if (t < cycle.GREEN + cycle.YELLOW) {
    const stateElapsed = t;
    return {
      state: 'GREEN' as const,
      stateElapsed,
      remaining: cycle.GREEN + cycle.YELLOW - t,
    };
  }

  const stateElapsed = t - cycle.GREEN - cycle.YELLOW;
  return {
    state: 'RED' as const,
    stateElapsed,
    remaining: cycle.RED - stateElapsed,
  };
}

export function waitingTimeAtArrival(
  signalElapsed: number,
  cycle: CycleDurations,
  arrivalSec: number
): number {
  const cycleLength = cycle.GREEN + cycle.YELLOW + cycle.RED;
  const arrivalOffset = (signalElapsed + arrivalSec) % cycleLength;
  const info = stateByElapsed(arrivalOffset, cycle);
  return info.state === 'RED' ? info.remaining : 0;
}

export function pointToSegmentInfo(
  pt: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  const dx = pt.lng - a.lng;
  const dy = pt.lat - a.lat;
  const sx = b.lng - a.lng;
  const sy = b.lat - a.lat;
  const segLen2 = sx * sx + sy * sy;
  if (segLen2 === 0) {
    return { dist: haversineMeters(pt, a), t: 0, proj: a };
  }
  let t = (dx * sx + dy * sy) / segLen2;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  const proj = { lat: a.lat + sy * t, lng: a.lng + sx * t };
  return { dist: haversineMeters(pt, proj), t, proj };
}

export function closestDistanceToRoute(
  signal: { lat: number; lng: number },
  routeCoords: { lat: number; lng: number }[]
) {
  let best = Infinity;
  let bestInfo: ReturnType<typeof pointToSegmentInfo> | null = null;

  for (let i = 1; i < routeCoords.length; i++) {
    const info = pointToSegmentInfo(signal, routeCoords[i - 1], routeCoords[i]);
    if (info.dist < best) {
      best = info.dist;
      bestInfo = info;
    }
  }
  return bestInfo;
}

export function cumulativeDistanceToClosestPoint(
  signal: { lat: number; lng: number },
  routeCoords: { lat: number; lng: number }[]
): number {
  let bestDist = Infinity;
  let bestSeg = 0;
  let bestT = 0;

  for (let i = 1; i < routeCoords.length; i++) {
    const info = pointToSegmentInfo(signal, routeCoords[i - 1], routeCoords[i]);
    if (info.dist < bestDist) {
      bestDist = info.dist;
      bestSeg = i - 1;
      bestT = info.t;
    }
  }

  let cumulative = 0;
  for (let i = 1; i <= bestSeg; i++) {
    cumulative += haversineMeters(routeCoords[i - 1], routeCoords[i]);
  }

  if (bestSeg < routeCoords.length - 1) {
    const fullSegLen = haversineMeters(routeCoords[bestSeg], routeCoords[bestSeg + 1]);
    cumulative += fullSegLen * bestT;
  }

  return cumulative;
}
