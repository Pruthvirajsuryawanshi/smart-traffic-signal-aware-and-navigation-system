import { useMemo } from 'react';
import { getCountdown, getTimeUntilGreen } from '@/lib/countdown';
import { DEFAULT_SETTINGS, SIGNAL_METADATA, type SignalState, type TrafficSignal, type RouteSignalInfo } from '@/types/signal';

// Speed limits
const MIN_SPEED_KMH = 10;
const MAX_SPEED_KMH = 80;
const SAFETY_BUFFER_SEC = 3;

export interface SpeedRecommendation {
  /** Recommended speed in km/h */
  speedKmh: number;
  /** User-friendly message */
  message: string;
  /** Can cross the signal without stopping */
  canCross: boolean;
  /** Action type */
  action: 'maintain' | 'speed_up' | 'slow_down' | 'stop';
  /** Time to reach the signal at recommended speed */
  timeToReachSec: number;
  /** Signal state when vehicle will arrive */
  arrivalState: SignalState;
  /** Remaining time for the arrival state */
  arrivalRemainingSec: number;
}

export interface SignalPrediction {
  signalId: string;
  distanceMeters: number;
  currentState: SignalState;
  remainingCurrentSec: number;
  recommendation: SpeedRecommendation;
  /** Next signal on route (if any) */
  nextSignal?: {
    signalId: string;
    distanceMeters: number;
  };
}

export interface SpeedPredictionResult {
  /** Predictions for all signals on route */
  predictions: SignalPrediction[];
  /** Primary recommendation (next signal) */
  primaryRecommendation: SpeedRecommendation | null;
  /** Overall route advice */
  routeAdvice: string;
  /** Current speed in km/h */
  currentSpeedKmh: number;
}

/**
 * Calculate time to reach a signal at given speed
 * @param distanceMeters - Distance to signal in meters
 * @param speedKmh - Speed in km/h
 * @returns Time in seconds
 */
function calculateTimeToReach(distanceMeters: number, speedKmh: number): number {
  if (speedKmh <= 0 || distanceMeters < 0) return Infinity;
  const speedMps = (speedKmh * 1000) / 3600; // Convert km/h to m/s
  return distanceMeters / speedMps;
}

/**
 * Calculate required speed to reach signal in given time
 * @param distanceMeters - Distance to signal in meters
 * @param timeSeconds - Available time in seconds
 * @returns Speed in km/h, or null if unrealistic
 */
function calculateRequiredSpeed(distanceMeters: number, timeSeconds: number): number | null {
  if (timeSeconds <= 0 || distanceMeters <= 0) return null;
  
  const safeTime = timeSeconds - SAFETY_BUFFER_SEC;
  if (safeTime <= 0) return null;
  
  const speedMps = distanceMeters / safeTime;
  const speedKmh = speedMps * 3.6;
  
  // Validate realistic range
  if (speedKmh < MIN_SPEED_KMH || speedKmh > MAX_SPEED_KMH) return null;
  
  return Math.round(speedKmh);
}

/**
 * Get state at arrival time
 */
function getStateAtArrival(
  currentCountdown: { currentState: SignalState; remainingSec: number; nextState: SignalState },
  arrivalSec: number,
  signalId: string,
  signals: TrafficSignal[]
): { state: SignalState; remainingSec: number } {
  const green = DEFAULT_SETTINGS.cycle.GREEN;
  const yellow = DEFAULT_SETTINGS.cycle.YELLOW;
  
  // If arrival is before current state ends
  if (arrivalSec < currentCountdown.remainingSec) {
    return {
      state: currentCountdown.currentState,
      remainingSec: currentCountdown.remainingSec - arrivalSec,
    };
  }
  
  // Calculate what state it will be after arrival
  let remainingTime = arrivalSec - currentCountdown.remainingSec;
  let nextState = currentCountdown.nextState;
  
  // Cycle through states
  const intersection = signals.find(s => s.id === signalId)?.intersection ?? 
                       SIGNAL_METADATA[signalId]?.intersection;
  const intSignalCount = signals.filter(s => 
    (s.intersection ?? SIGNAL_METADATA[s.id]?.intersection) === intersection
  ).length || 3;
  
  const cycleDuration = (green + yellow) * intSignalCount;
  const greenDuration = green;
  const yellowDuration = yellow;
  
  // Determine state based on remaining time
  const cyclePos = remainingTime % cycleDuration;
  
  // Find which signal's turn it is
  const slotDuration = greenDuration + yellowDuration;
  const slotIndex = Math.floor(cyclePos / slotDuration);
  const slotOffset = cyclePos % slotDuration;
  
  // Check if it's the target signal's turn
  const targetIndex = intSignalCount > 0 ? 
    parseInt(signalId.replace(/\D/g, '')) % intSignalCount : 0;
  
  if (slotIndex === targetIndex % intSignalCount) {
    // It's this signal's turn
    if (slotOffset < greenDuration) {
      return { state: 'GREEN', remainingSec: greenDuration - slotOffset };
    }
    return { state: 'YELLOW', remainingSec: yellowDuration - (slotOffset - greenDuration) };
  }
  
  return { state: 'RED', remainingSec: slotDuration - slotOffset };
}

/**
 * Generate speed recommendation for a signal
 */
function generateRecommendation(
  signalId: string,
  distanceMeters: number,
  signals: TrafficSignal[],
  currentSpeedKmh: number
): SpeedRecommendation {
  const signal = signals.find(s => s.id === signalId);
  if (!signal) {
    return {
      speedKmh: currentSpeedKmh,
      message: 'Signal not found',
      canCross: false,
      action: 'maintain',
      timeToReachSec: 0,
      arrivalState: 'RED',
      arrivalRemainingSec: 0,
    };
  }

  const countdown = getCountdown(signal.state, signal.updated_at, signalId, signals);
  const timeToReach = calculateTimeToReach(distanceMeters, currentSpeedKmh);
  const greenDuration = DEFAULT_SETTINGS.cycle.GREEN;
  const yellowDuration = DEFAULT_SETTINGS.cycle.YELLOW;

  // =====================
  // CASE 1: Signal is GREEN
  // =====================
  if (countdown.currentState === 'GREEN') {
    const greenRemaining = countdown.remainingSec;
    
    // Can cross at current speed
    if (timeToReach < greenRemaining - SAFETY_BUFFER_SEC) {
      const arrivalState = getStateAtArrival(countdown, timeToReach, signalId, signals);
      return {
        speedKmh: currentSpeedKmh,
        message: `If you go ${currentSpeedKmh} km/h, you can cross easily.`,
        canCross: true,
        action: 'maintain',
        timeToReachSec: timeToReach,
        arrivalState: arrivalState.state,
        arrivalRemainingSec: arrivalState.remainingSec,
      };
    }
    
    // Need to speed up to catch green
    const timeAvailable = greenRemaining - SAFETY_BUFFER_SEC;
    const requiredSpeed = calculateRequiredSpeed(distanceMeters, timeAvailable);
    
    if (requiredSpeed && requiredSpeed <= MAX_SPEED_KMH && requiredSpeed > currentSpeedKmh) {
      return {
        speedKmh: requiredSpeed,
        message: `Increase speed to ${requiredSpeed} km/h to pass before red.`,
        canCross: true,
        action: 'speed_up',
        timeToReachSec: calculateTimeToReach(distanceMeters, requiredSpeed),
        arrivalState: 'GREEN',
        arrivalRemainingSec: greenRemaining - calculateTimeToReach(distanceMeters, requiredSpeed),
      };
    }
    
    // Can't make it, suggest slow down for next green
    const timeUntilNextGreen = greenRemaining + yellowDuration + 
      (signals.filter(s => 
        (s.intersection ?? SIGNAL_METADATA[s.id]?.intersection) === 
        (signal.intersection ?? SIGNAL_METADATA[signalId]?.intersection)
      ).length - 1) * (greenDuration + yellowDuration);
    
    const slowSpeed = calculateRequiredSpeed(distanceMeters, timeUntilNextGreen);
    
    if (slowSpeed && slowSpeed >= MIN_SPEED_KMH) {
      return {
        speedKmh: slowSpeed,
        message: `Slow to ${slowSpeed} km/h — signal will turn green in ${Math.round(timeUntilNextGreen)}s.`,
        canCross: false,
        action: 'slow_down',
        timeToReachSec: calculateTimeToReach(distanceMeters, slowSpeed),
        arrivalState: 'GREEN',
        arrivalRemainingSec: greenDuration - SAFETY_BUFFER_SEC,
      };
    }
    
    return {
      speedKmh: Math.max(MIN_SPEED_KMH, currentSpeedKmh - 15),
      message: 'Prepare to stop — signal turning red.',
      canCross: false,
      action: 'slow_down',
      timeToReachSec: timeToReach,
      arrivalState: 'RED',
      arrivalRemainingSec: 0,
    };
  }

  // =====================
  // CASE 2: Signal is YELLOW
  // =====================
  if (countdown.currentState === 'YELLOW') {
    const yellowRemaining = countdown.remainingSec;
    
    // Very close, can pass quickly
    if (distanceMeters < 30 && timeToReach < yellowRemaining - 1) {
      return {
        speedKmh: currentSpeedKmh,
        message: 'Cross quickly — signal is YELLOW!',
        canCross: true,
        action: 'maintain',
        timeToReachSec: timeToReach,
        arrivalState: 'YELLOW',
        arrivalRemainingSec: yellowRemaining - timeToReach,
      };
    }
    
    // Calculate time until green
    const timeUntilGreen = getTimeUntilGreen(signal.state, signal.updated_at, signalId, signals);
    const idealSpeed = calculateRequiredSpeed(distanceMeters, timeUntilGreen);
    
    if (idealSpeed && idealSpeed >= MIN_SPEED_KMH) {
      return {
        speedKmh: idealSpeed,
        message: `Go at ${idealSpeed} km/h — signal will turn green in ${Math.round(timeUntilGreen)}s.`,
        canCross: true,
        action: idealSpeed < currentSpeedKmh ? 'slow_down' : 'maintain',
        timeToReachSec: calculateTimeToReach(distanceMeters, idealSpeed),
        arrivalState: 'GREEN',
        arrivalRemainingSec: greenDuration - SAFETY_BUFFER_SEC,
      };
    }
    
    return {
      speedKmh: Math.max(MIN_SPEED_KMH, Math.min(25, currentSpeedKmh - 10)),
      message: 'Prepare to stop — signal is YELLOW.',
      canCross: false,
      action: 'slow_down',
      timeToReachSec: timeToReach,
      arrivalState: 'RED',
      arrivalRemainingSec: 0,
    };
  }

  // =====================
  // CASE 3: Signal is RED
  // =====================
  const timeUntilGreen = getTimeUntilGreen(signal.state, signal.updated_at, signalId, signals);
  
  // Will be green by arrival
  if (timeToReach > timeUntilGreen + SAFETY_BUFFER_SEC) {
    const bufferTime = timeUntilGreen + SAFETY_BUFFER_SEC;
    const idealSpeed = calculateRequiredSpeed(distanceMeters, bufferTime + (greenDuration / 2));
    
    return {
      speedKmh: idealSpeed || currentSpeedKmh,
      message: `Maintain speed — signal will be GREEN when you arrive.`,
      canCross: true,
      action: 'maintain',
      timeToReachSec: timeToReach,
      arrivalState: 'GREEN',
      arrivalRemainingSec: greenDuration - (timeToReach - timeUntilGreen),
    };
  }
  
  // Will arrive while RED - calculate ideal speed
  if (timeUntilGreen > SAFETY_BUFFER_SEC) {
    const idealSpeed = calculateRequiredSpeed(distanceMeters, timeUntilGreen);
    
    if (idealSpeed && idealSpeed >= MIN_SPEED_KMH) {
      return {
        speedKmh: idealSpeed,
        message: `Go slow at ${idealSpeed} km/h for smooth passing — signal will turn green in ${Math.round(timeUntilGreen)}s.`,
        canCross: true,
        action: 'slow_down',
        timeToReachSec: calculateTimeToReach(distanceMeters, idealSpeed),
        arrivalState: 'GREEN',
        arrivalRemainingSec: greenDuration - SAFETY_BUFFER_SEC,
      };
    }
    
    // Very short wait, just slow down slightly
    return {
      speedKmh: Math.max(MIN_SPEED_KMH, currentSpeedKmh - 10),
      message: `Slow down slightly — GREEN in ${Math.round(timeUntilGreen)}s.`,
      canCross: true,
      action: 'slow_down',
      timeToReachSec: timeToReach,
      arrivalState: 'GREEN',
      arrivalRemainingSec: greenDuration,
    };
  }
  
  // Green very soon
  return {
    speedKmh: currentSpeedKmh,
    message: 'Maintain speed — signal turning GREEN now!',
    canCross: true,
    action: 'maintain',
    timeToReachSec: timeToReach,
    arrivalState: 'GREEN',
    arrivalRemainingSec: greenDuration,
  };
}

/**
 * Hook for intelligent speed prediction system
 */
export function useSpeedPrediction(
  signals: TrafficSignal[],
  routeSignals: RouteSignalInfo[],
  currentSpeedKmh: number,
  currentPosition?: { lat: number; lng: number } | null
): SpeedPredictionResult {
  return useMemo(() => {
    if (routeSignals.length === 0 || signals.length === 0) {
      return {
        predictions: [],
        primaryRecommendation: null,
        routeAdvice: 'No route signals detected',
        currentSpeedKmh,
      };
    }

    // Sort signals by distance
    const sortedSignals = [...routeSignals].sort((a, b) => a.distanceFromStart - b.distanceFromStart);

    // Generate predictions for each signal
    const predictions: SignalPrediction[] = sortedSignals.map((routeSignal, index) => {
      const signal = routeSignal.signal;
      const distance = routeSignal.distanceFromStart;
      const countdown = getCountdown(signal.state, signal.updated_at, signal.id, signals);
      
      const recommendation = generateRecommendation(
        signal.id,
        distance,
        signals,
        currentSpeedKmh
      );

      const nextSignal = index < sortedSignals.length - 1 ? {
        signalId: sortedSignals[index + 1].signal.id,
        distanceMeters: sortedSignals[index + 1].distanceFromStart,
      } : undefined;

      return {
        signalId: signal.id,
        distanceMeters: distance,
        currentState: countdown.currentState,
        remainingCurrentSec: countdown.remainingSec,
        recommendation,
        nextSignal,
      };
    });

    // Primary recommendation is for the next signal
    const primaryRecommendation = predictions.length > 0 ? predictions[0].recommendation : null;

    // Generate overall route advice
    const signalsToStop = predictions.filter(p => !p.recommendation.canCross).length;
    let routeAdvice: string;
    
    if (signalsToStop === 0) {
      routeAdvice = `All clear! You can pass all ${predictions.length} signals smoothly.`;
    } else if (signalsToStop === predictions.length) {
      routeAdvice = 'Expect stops at all signals. Plan accordingly.';
    } else {
      routeAdvice = `${predictions.length - signalsToStop} of ${predictions.length} signals clear. ${signalsToStop} may require stopping.`;
    }

    return {
      predictions,
      primaryRecommendation,
      routeAdvice,
      currentSpeedKmh,
    };
  }, [signals, routeSignals, currentSpeedKmh]);
}
