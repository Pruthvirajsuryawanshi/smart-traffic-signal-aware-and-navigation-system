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
  const intersection = signals.find((signal) => signal.id === signalId)?.intersection ?? SIGNAL_METADATA[signalId]?.intersection;
  if (!intersection) return null;

  // Get all signals in this intersection, sorted by numeric ID
  const intersectionSignals = signals
    .filter((signal) => (signal.intersection ?? SIGNAL_METADATA[signal.id]?.intersection) === intersection)
    .sort((a, b) => signalNumericId(a.id) - signalNumericId(b.id));

  if (intersectionSignals.length === 0) return null;

  const signalIndex = intersectionSignals.findIndex((signal) => signal.id === signalId);
  if (signalIndex === -1) return null;

  const green = DEFAULT_SETTINGS.cycle.GREEN;
  const yellow = DEFAULT_SETTINGS.cycle.YELLOW;
  const slotDuration = green + yellow;
  const totalCycle = slotDuration * intersectionSignals.length;

  // Find the anchor: the most recently updated signal tells us where in the cycle we are
  const activeSignal =
    intersectionSignals.find((signal) => signal.state === 'GREEN') ??
    intersectionSignals.find((signal) => signal.state === 'YELLOW') ??
    intersectionSignals
      .slice()
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];

  if (!activeSignal) return null;

  const activeIndex = intersectionSignals.findIndex((signal) => signal.id === activeSignal.id);
  const anchorMs = Date.parse(activeSignal.updated_at);
  const safeAnchorMs = Number.isFinite(anchorMs) ? anchorMs : Date.now();

  // Calculate elapsed time since anchor and position in cycle
  const elapsedMs = Date.now() - safeAnchorMs;
  const elapsedSec = Math.max(0, elapsedMs / 1000);
  const phasePos = elapsedSec % totalCycle;
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
 * Uses global intersection timer synced with ESP32.
 */
export function getCountdown(
  state: string,
  updatedAt: string,
  signalId?: string,
  signals?: TrafficSignal[]
): CountdownResult {
  if (signalId && signals?.length) {
    const globalCountdown = getGlobalIntersectionCountdown(signalId, signals);
    if (globalCountdown) return globalCountdown;
  }

  return getLegacyCountdown(state, updatedAt);
}

/** Format countdown as "YELLOW in: 15s" */
export function formatCountdown(
  state: string,
  updatedAt: string,
  signalId?: string,
  signals?: TrafficSignal[]
): string {
  const { nextState, remainingSec } = getCountdown(state, updatedAt, signalId, signals);
  if (remainingSec === 0) return `${nextState} now`;
  return `${nextState} in: ${remainingSec}s`;
}
