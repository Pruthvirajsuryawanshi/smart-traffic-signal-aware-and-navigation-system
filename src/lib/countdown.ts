import { DEFAULT_SETTINGS, SIGNAL_METADATA, type SignalState, type TrafficSignal } from '@/types/signal';

interface CountdownResult {
  nextState: SignalState;
  remainingSec: number;
  currentState: SignalState;
}

function signalNumericId(signalId: string): number {
  const parsed = Number(signalId.replace(/\D/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Global intersection countdown using synchronized timer.
 * ESP32 cycle: each signal gets GREEN_TIME + YELLOW_TIME slot.
 * Total cycle = SIGNAL_COUNT * SLOT_TIME.
 * All timers derived from the active signal's updated_at anchor.
 */
function getGlobalIntersectionCountdown(signalId: string, signals: TrafficSignal[]): CountdownResult | null {
  const intersection = signals.find((s) => s.id === signalId)?.intersection ?? SIGNAL_METADATA[signalId]?.intersection;
  if (!intersection) return null;

  const intersectionSignals = signals
    .filter((s) => (s.intersection ?? SIGNAL_METADATA[s.id]?.intersection) === intersection)
    .sort((a, b) => signalNumericId(a.id) - signalNumericId(b.id));

  if (intersectionSignals.length === 0) return null;

  const signalIndex = intersectionSignals.findIndex((s) => s.id === signalId);
  if (signalIndex === -1) return null;

  const green = DEFAULT_SETTINGS.cycle.GREEN;
  const yellow = DEFAULT_SETTINGS.cycle.YELLOW;
  const slotDuration = green + yellow;
  const totalCycle = slotDuration * intersectionSignals.length;

  // Find anchor: the most recently updated signal tells us where in the cycle we are
  const activeSignal =
    intersectionSignals.find((s) => s.state === 'GREEN') ??
    intersectionSignals.find((s) => s.state === 'YELLOW') ??
    intersectionSignals.slice().sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];

  if (!activeSignal) return null;

  const activeIndex = intersectionSignals.findIndex((s) => s.id === activeSignal.id);
  const anchorMs = Date.parse(activeSignal.updated_at);
  const safeAnchorMs = Number.isFinite(anchorMs) ? anchorMs : Date.now();

  const elapsedMs = Date.now() - safeAnchorMs;
  const elapsedSec = Math.max(0, elapsedMs / 1000);

  // Determine where in the active signal's slot we are
  let activeSlotOffset: number;
  if (activeSignal.state === 'GREEN') {
    activeSlotOffset = elapsedSec; // elapsed since GREEN started
  } else if (activeSignal.state === 'YELLOW') {
    activeSlotOffset = green + elapsedSec; // elapsed since YELLOW started, add GREEN duration
  } else {
    // RED - this signal was the last to update but is now RED
    // Use elapsed since it went RED, offset from end of its slot
    activeSlotOffset = slotDuration + elapsedSec;
  }

  const phasePos = activeSlotOffset % totalCycle;
  const slotShift = Math.floor(phasePos / slotDuration);
  const slotOffset = phasePos % slotDuration;
  const activeNowIndex = (activeIndex + slotShift) % intersectionSignals.length;

  // This signal is currently active (GREEN or YELLOW)
  if (signalIndex === activeNowIndex) {
    if (slotOffset < green) {
      return {
        currentState: 'GREEN',
        nextState: 'YELLOW',
        remainingSec: Math.max(0, Math.round(green - slotOffset)),
      };
    }
    return {
      currentState: 'YELLOW',
      nextState: 'RED',
      remainingSec: Math.max(0, Math.round(slotDuration - slotOffset)),
    };
  }

  // This signal is RED — calculate time until it turns GREEN
  let slotsUntilGreen = (signalIndex - activeNowIndex + intersectionSignals.length) % intersectionSignals.length;
  if (slotsUntilGreen === 0) slotsUntilGreen = intersectionSignals.length;

  const timeUntilGreen = slotsUntilGreen * slotDuration - slotOffset;

  return {
    currentState: 'RED',
    nextState: 'GREEN',
    remainingSec: Math.max(0, Math.round(timeUntilGreen)),
  };
}

function getLegacyCountdown(state: string, updatedAt: string): CountdownResult {
  const cycle = DEFAULT_SETTINGS.cycle;
  const totalCycle = cycle.GREEN + cycle.YELLOW + cycle.RED;
  const elapsed = Math.max(0, (Date.now() - Date.parse(updatedAt)) / 1000);

  let phaseStart: number;
  if (state === 'GREEN') {
    phaseStart = 0;
  } else if (state === 'YELLOW') {
    phaseStart = cycle.GREEN;
  } else {
    phaseStart = cycle.GREEN + cycle.YELLOW;
  }

  const cyclePos = (phaseStart + elapsed) % totalCycle;

  let currentState: SignalState;
  let remainingSec: number;
  let nextState: SignalState;

  if (cyclePos < cycle.GREEN) {
    currentState = 'GREEN';
    remainingSec = cycle.GREEN - cyclePos;
    nextState = cycle.YELLOW > 0 ? 'YELLOW' : 'RED';
  } else if (cyclePos < cycle.GREEN + cycle.YELLOW) {
    currentState = 'YELLOW';
    remainingSec = cycle.GREEN + cycle.YELLOW - cyclePos;
    nextState = 'RED';
  } else {
    currentState = 'RED';
    remainingSec = totalCycle - cyclePos;
    nextState = 'GREEN';
  }

  return { nextState, remainingSec: Math.max(0, Math.round(remainingSec)), currentState };
}

/**
 * Calculate countdown to next state change.
 * Uses intersection-aware global timer when signals context is available.
 */
export function getCountdown(
  state: string,
  updatedAt: string,
  signalId?: string,
  signals?: TrafficSignal[]
): CountdownResult {
  // Try intersection-based countdown first
  if (signalId && signals && signals.length > 0) {
    const result = getGlobalIntersectionCountdown(signalId, signals);
    if (result) return result;
  }

  // Fallback to legacy per-signal countdown
  return getLegacyCountdown(state, updatedAt);
}

/** Format countdown as "GREEN in: 15s" or "GREEN now" */
export function formatCountdown(
  state: string,
  updatedAt: string,
  signalId?: string,
  signals?: TrafficSignal[]
): string {
  const { nextState, remainingSec } = getCountdown(state, updatedAt, signalId, signals);
  if (remainingSec <= 0) return `${nextState} now`;
  return `${nextState} in: ${remainingSec}s`;
}

/**
 * Get time until a signal will be GREEN.
 * Returns 0 if already GREEN.
 */
export function getTimeUntilGreen(
  state: string,
  updatedAt: string,
  signalId?: string,
  signals?: TrafficSignal[]
): number {
  const countdown = getCountdown(state, updatedAt, signalId, signals);
  if (countdown.currentState === 'GREEN') return 0;
  if (countdown.nextState === 'GREEN') return countdown.remainingSec;
  // Currently YELLOW → RED next, then GREEN after RED duration
  // Need to calculate full time to GREEN
  if (countdown.currentState === 'YELLOW' && countdown.nextState === 'RED') {
    // After yellow ends, goes RED, then eventually GREEN
    const intersection = signalId ? (signals?.find(s => s.id === signalId)?.intersection ?? SIGNAL_METADATA[signalId]?.intersection) : null;
    if (intersection && signals) {
      const intSignals = signals.filter(s => (s.intersection ?? SIGNAL_METADATA[s.id]?.intersection) === intersection);
      const green = DEFAULT_SETTINGS.cycle.GREEN;
      const yellow = DEFAULT_SETTINGS.cycle.YELLOW;
      const slotDuration = green + yellow;
      // After this signal's yellow, other signals take turns, then back to this one
      return countdown.remainingSec + (intSignals.length - 1) * slotDuration;
    }
    return countdown.remainingSec + DEFAULT_SETTINGS.cycle.RED;
  }
  return countdown.remainingSec;
}

/**
 * Calculate recommended speed for crossing a signal smoothly.
 * Uses safe, bounded calculations to prevent unrealistic speeds.
 * 
 * Formula: speed_kmh = (distance_meters / time_seconds) * 3.6
 * 
 * Safety limits:
 * - Minimum: 10 km/h
 * - Maximum: 80 km/h
 * - Buffer: 3 seconds subtracted from available time
 */
function getRecommendedSpeed(
  distanceMeters: number,
  remainingTimeSeconds: number
): { speed: number | null; isValid: boolean } {
  // Validate inputs
  if (!isFinite(distanceMeters) || distanceMeters <= 0) {
    console.log('[SpeedCalc] Invalid distance:', distanceMeters);
    return { speed: null, isValid: false };
  }
  if (!isFinite(remainingTimeSeconds) || remainingTimeSeconds <= 0) {
    console.log('[SpeedCalc] Invalid time:', remainingTimeSeconds);
    return { speed: null, isValid: false };
  }

  // Add buffer time (3 seconds safety margin)
  const safeTime = remainingTimeSeconds - 3;
  if (safeTime <= 0) {
    console.log('[SpeedCalc] Insufficient time after buffer:', { remainingTimeSeconds, safeTime });
    return { speed: null, isValid: false };
  }

  // Calculate speed: (distance / time) * 3.6 = km/h
  const speedKmh = (distanceMeters / safeTime) * 3.6;

  console.log('[SpeedCalc]', {
    distance: distanceMeters,
    remainingTime: remainingTimeSeconds,
    safeTime,
    calculatedSpeed: Math.round(speedKmh)
  });

  // Discard unrealistic speeds
  if (speedKmh > 120 || speedKmh < 5) {
    console.log('[SpeedCalc] Speed out of realistic range:', Math.round(speedKmh));
    return { speed: null, isValid: false };
  }

  // Clamp to safe driving limits
  const clampedSpeed = Math.max(10, Math.min(80, speedKmh));

  return { speed: Math.round(clampedSpeed), isValid: true };
}

/**
 * Format speed as a user-friendly range.
 * Returns "X–Y km/h" range or descriptive text.
 */
function formatSpeedRange(baseSpeed: number): string {
  if (baseSpeed <= 10) return 'Maintain 10–15 km/h';
  if (baseSpeed >= 80) return 'Maintain 70–80 km/h';
  
  // Create a ±5 km/h range around the base speed
  const min = Math.max(10, baseSpeed - 5);
  const max = Math.min(80, baseSpeed + 5);
  return `Maintain ${min}–${max} km/h`;
}

/**
 * Calculate speed prediction for crossing a signal smoothly.
 * Returns advisory text and recommended speed.
 * 
 * Uses synchronized signal timing and bounded calculations
 * to ensure realistic, safe speed recommendations.
 */
export function getSpeedPrediction(
  distanceMeters: number,
  signalState: string,
  updatedAt: string,
  signalId: string,
  signals: TrafficSignal[],
  currentSpeedKmh: number
): { text: string; recommendedSpeedKmh: number | null; canCross: boolean } {
  const timeUntilGreen = getTimeUntilGreen(signalState, updatedAt, signalId, signals);
  const countdown = getCountdown(signalState, updatedAt, signalId, signals);
  
  const currentSpeedMps = (currentSpeedKmh * 1000) / 3600;
  const arrivalSec = currentSpeedMps > 0 ? distanceMeters / currentSpeedMps : Infinity;

  const green = DEFAULT_SETTINGS.cycle.GREEN;
  const yellow = DEFAULT_SETTINGS.cycle.YELLOW;

  // Signal is currently GREEN
  if (countdown.currentState === 'GREEN') {
    const greenRemaining = countdown.remainingSec;
    
    // Can comfortably cross at current speed
    if (arrivalSec < greenRemaining - 3) {
      return {
        text: `${formatSpeedRange(currentSpeedKmh)} to pass smoothly`,
        recommendedSpeedKmh: currentSpeedKmh,
        canCross: true,
      };
    }
    
    // Need to adjust speed to catch green
    const timeToCatch = greenRemaining - 3;
    const speedResult = getRecommendedSpeed(distanceMeters, timeToCatch);
    
    if (speedResult.isValid && speedResult.speed && speedResult.speed > currentSpeedKmh) {
      return {
        text: `Speed up to ${speedResult.speed} km/h to catch GREEN`,
        recommendedSpeedKmh: speedResult.speed,
        canCross: true,
      };
    }
    
    // Can't catch this green, plan for next cycle
    const nextGreenIn = greenRemaining + yellow + timeUntilGreen;
    const nextSpeed = getRecommendedSpeed(distanceMeters, nextGreenIn);
    
    if (nextSpeed.isValid && nextSpeed.speed) {
      return {
        text: `${formatSpeedRange(nextSpeed.speed)} for next GREEN`,
        recommendedSpeedKmh: nextSpeed.speed,
        canCross: false,
      };
    }
    
    return {
      text: 'Slow down, signal will turn red soon',
      recommendedSpeedKmh: Math.max(10, Math.min(30, currentSpeedKmh - 10)),
      canCross: false,
    };
  }

  // Signal is YELLOW
  if (countdown.currentState === 'YELLOW') {
    const waitForGreen = timeUntilGreen;
    if (waitForGreen <= 3) {
      return { 
        text: 'Signal turning GREEN soon — maintain current speed', 
        recommendedSpeedKmh: currentSpeedKmh, 
        canCross: true 
      };
    }
    
    // Calculate speed to arrive when green
    const speedResult = getRecommendedSpeed(distanceMeters, waitForGreen);
    if (speedResult.isValid && speedResult.speed) {
      return {
        text: `${formatSpeedRange(speedResult.speed)} for smooth crossing`,
        recommendedSpeedKmh: speedResult.speed,
        canCross: false,
      };
    }
    
    return {
      text: 'Slow down and wait for GREEN',
      recommendedSpeedKmh: Math.max(10, Math.min(20, currentSpeedKmh - 15)),
      canCross: false,
    };
  }

  // Signal is RED
  if (timeUntilGreen <= 3) {
    return { 
      text: 'Signal turning GREEN soon — maintain current speed', 
      recommendedSpeedKmh: currentSpeedKmh, 
      canCross: true 
    };
  }

  // Calculate ideal speed to arrive at green
  const speedResult = getRecommendedSpeed(distanceMeters, timeUntilGreen);
  
  if (!speedResult.isValid || !speedResult.speed) {
    // Fallback: suggest moderate speed
    return {
      text: 'Slow down, signal is RED',
      recommendedSpeedKmh: Math.max(10, Math.min(30, currentSpeedKmh - 10)),
      canCross: false,
    };
  }

  // Check if arriving during green window
  const arrivalTime = distanceMeters / (speedResult.speed / 3.6);
  const arrivalOffset = Math.abs(arrivalTime - timeUntilGreen);
  const canCross = arrivalOffset < green - 3; // 3 second safety margin

  if (canCross) {
    return {
      text: `${formatSpeedRange(speedResult.speed)} to pass on GREEN`,
      recommendedSpeedKmh: speedResult.speed,
      canCross: true,
    };
  }

  return {
    text: `${formatSpeedRange(speedResult.speed)} — GREEN in ${Math.round(timeUntilGreen)}s`,
    recommendedSpeedKmh: speedResult.speed,
    canCross: false,
  };
}
