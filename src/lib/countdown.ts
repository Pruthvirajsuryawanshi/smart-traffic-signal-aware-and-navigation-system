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
 * Calculate speed prediction for crossing a signal smoothly.
 * Returns advisory text and recommended speed.
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
    if (arrivalSec < greenRemaining - 2) {
      return {
        text: `Go at ${currentSpeedKmh} km/h — signal is GREEN`,
        recommendedSpeedKmh: currentSpeedKmh,
        canCross: true,
      };
    }
    // Need to speed up to catch green
    const neededSpeed = (distanceMeters / Math.max(1, greenRemaining - 2)) * 3.6;
    if (neededSpeed <= 80 && neededSpeed > currentSpeedKmh) {
      return {
        text: `Speed up to ${Math.round(neededSpeed)} km/h to catch GREEN`,
        recommendedSpeedKmh: Math.round(neededSpeed),
        canCross: true,
      };
    }
    // Can't catch this green, wait for next
    const nextGreenIn = greenRemaining + yellow + timeUntilGreen;
    const slowSpeed = (distanceMeters / Math.max(1, nextGreenIn)) * 3.6;
    return {
      text: `Slow to ${Math.max(10, Math.round(slowSpeed))} km/h for next GREEN`,
      recommendedSpeedKmh: Math.max(10, Math.round(slowSpeed)),
      canCross: false,
    };
  }

  // Signal is YELLOW
  if (countdown.currentState === 'YELLOW') {
    // Wait for next GREEN cycle
    const waitForGreen = timeUntilGreen;
    if (waitForGreen <= 0) {
      return { text: `Signal turning GREEN soon`, recommendedSpeedKmh: currentSpeedKmh, canCross: true };
    }
    // Arrive when it turns GREEN
    const idealSpeed = (distanceMeters / Math.max(1, waitForGreen)) * 3.6;
    const clamped = Math.max(10, Math.min(80, Math.round(idealSpeed)));
    return {
      text: `Go at ${clamped} km/h for smooth crossing`,
      recommendedSpeedKmh: clamped,
      canCross: false,
    };
  }

  // Signal is RED
  if (timeUntilGreen <= 0) {
    return { text: `Signal turning GREEN soon`, recommendedSpeedKmh: currentSpeedKmh, canCross: true };
  }

  // Can we arrive exactly when it turns green?
  const idealSpeed = (distanceMeters / Math.max(1, timeUntilGreen)) * 3.6;
  const clamped = Math.max(10, Math.min(80, Math.round(idealSpeed)));

  // Check if arriving during green window
  const arrivalAtIdeal = distanceMeters / (clamped / 3.6);
  if (Math.abs(arrivalAtIdeal - timeUntilGreen) < green) {
    return {
      text: `Go at ${clamped} km/h — GREEN in ${timeUntilGreen}s`,
      recommendedSpeedKmh: clamped,
      canCross: true,
    };
  }

  return {
    text: `Slow to ${clamped} km/h — GREEN in ${timeUntilGreen}s`,
    recommendedSpeedKmh: clamped,
    canCross: false,
  };
}
