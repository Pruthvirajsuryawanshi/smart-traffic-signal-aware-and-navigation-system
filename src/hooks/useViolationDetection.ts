import { useState, useCallback, useEffect, useRef } from 'react';
import type { 
  RuleViolation, 
  ViolationType, 
  ViolationStatus,
  SPEED_LIMITS 
} from '@/types/emergency-validation';
import type { TrafficSignal, SignalState } from '@/types/signal';

// Generate unique ID
const generateId = (): string => {
  return `VIO-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Local storage keys
const STORAGE_KEYS = {
  VIOLATIONS: 'rule_violations',
};

// Speed limits by zone type
const SPEED_LIMIT_BY_TYPE: Record<string, number> = {
  highway: 80,
  side: 50,
  residential: 30,
  default: 50,
};

export interface ViolationDetectionConfig {
  /** Speed tolerance percentage above limit before flagging */
  speedTolerancePercent?: number;
  /** Enable signal violation detection */
  detectSignalViolations?: boolean;
  /** Enable overspeed detection */
  detectOverspeed?: boolean;
}

export interface ViolationDetectionState {
  /** All recorded violations */
  violations: RuleViolation[];
  /** Violations for current session */
  sessionViolations: RuleViolation[];
  /** Count of violations by type */
  violationCounts: {
    signalBreak: number;
    overspeed: number;
    unauthorizedPriority: number;
    total: number;
  };
  /** Last detected violation */
  lastViolation: RuleViolation | null;
  /** Any detection error */
  error: string | null;
}

export interface ViolationDetectionActions {
  /** Check for violations based on current state */
  checkForViolations: (
    position: { lat: number; lng: number },
    speed: number,
    signalState: SignalState,
    nearbySignal: TrafficSignal | null,
    emergencyModeActive: boolean,
    driverInfo: { driverId: string; driverName: string; vehicleNumber: string },
    emergencySessionId?: string
  ) => RuleViolation | null;
  /** Get violations for a specific driver */
  getDriverViolations: (driverId: string) => RuleViolation[];
  /** Get violations for a specific emergency session */
  getSessionViolations: (sessionId: string) => RuleViolation[];
  /** Update violation status */
  updateViolationStatus: (violationId: string, status: ViolationStatus, notes?: string) => void;
  /** Clear session violations */
  clearSessionViolations: () => void;
  /** Load violations from storage */
  loadViolations: () => void;
  /** Clear error */
  clearError: () => void;
}

export type UseViolationDetection = ViolationDetectionState & ViolationDetectionActions;

/**
 * Hook for detecting and recording rule violations
 */
export function useViolationDetection(
  config: ViolationDetectionConfig = {}
): UseViolationDetection {
  const {
    speedTolerancePercent = 10,
    detectSignalViolations = true,
    detectOverspeed = true,
  } = config;

  const [violations, setViolations] = useState<RuleViolation[]>([]);
  const [sessionViolations, setSessionViolations] = useState<RuleViolation[]>([]);
  const [lastViolation, setLastViolation] = useState<RuleViolation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recentViolationsRef = useRef<Set<string>>(new Set());

  // Load violations from localStorage
  const loadViolations = useCallback(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.VIOLATIONS);
      if (stored) {
        const parsed = JSON.parse(stored) as RuleViolation[];
        setViolations(parsed);
      }
    } catch (e) {
      console.error('[ViolationDetection] Failed to load violations:', e);
    }
  }, []);

  // Save violations to localStorage
  const saveViolations = useCallback((newViolations: RuleViolation[]) => {
    try {
      localStorage.setItem(STORAGE_KEYS.VIOLATIONS, JSON.stringify(newViolations));
      setViolations(newViolations);
    } catch (e) {
      console.error('[ViolationDetection] Failed to save violations:', e);
      setError('Failed to save violation data');
    }
  }, []);

  // Calculate violation counts
  const violationCounts = {
    signalBreak: violations.filter(v => v.type === 'SIGNAL_BREAK').length,
    overspeed: violations.filter(v => v.type === 'OVERSPEED').length,
    unauthorizedPriority: violations.filter(v => v.type === 'UNAUTHORIZED_PRIORITY').length,
    total: violations.length,
  };

  // Check for violations
  const checkForViolations = useCallback(
    (
      position: { lat: number; lng: number },
      speed: number,
      signalState: SignalState,
      nearbySignal: TrafficSignal | null,
      emergencyModeActive: boolean,
      driverInfo: { driverId: string; driverName: string; vehicleNumber: string },
      emergencySessionId?: string
    ): RuleViolation | null => {
      const now = new Date().toISOString();
      let detectedViolation: RuleViolation | null = null;

      // =====================
      // SIGNAL BREAK DETECTION
      // =====================
      if (detectSignalViolations && nearbySignal && (signalState === 'RED' || signalState === 'YELLOW')) {
        // Create unique key for this violation to prevent duplicates
        const violationKey = `signal-${nearbySignal.id}-${signalState}-${Math.floor(Date.now() / 5000)}`; // 5-second window
        
        if (!recentViolationsRef.current.has(violationKey)) {
          recentViolationsRef.current.add(violationKey);
          
          // Clean up old keys (keep last 20)
          if (recentViolationsRef.current.size > 20) {
            const keys = Array.from(recentViolationsRef.current);
            keys.slice(0, keys.length - 20).forEach(k => recentViolationsRef.current.delete(k));
          }

          detectedViolation = {
            id: generateId(),
            ambulanceId: `AMB-${driverInfo.vehicleNumber}`,
            driverId: driverInfo.driverId,
            driverName: driverInfo.driverName,
            vehicleNumber: driverInfo.vehicleNumber,
            type: 'SIGNAL_BREAK',
            timestamp: now,
            location: position,
            speedAtViolation: speed,
            speedLimit: SPEED_LIMIT_BY_TYPE[nearbySignal.type || 'default'] || 50,
            signalId: nearbySignal.id,
            signalState,
            emergencyModeActive,
            status: emergencyModeActive ? 'CONDITIONAL_PENDING' : 'PENDING',
            emergencySessionId,
          };

          console.log('[ViolationDetection] Signal break detected:', {
            signal: nearbySignal.id,
            state: signalState,
            emergencyMode: emergencyModeActive,
          });
        }
      }

      // =====================
      // OVERSPEED DETECTION
      // =====================
      if (detectOverspeed && nearbySignal) {
        const speedLimit = SPEED_LIMIT_BY_TYPE[nearbySignal.type || 'default'] || 50;
        const threshold = speedLimit * (1 + speedTolerancePercent / 100);
        
        if (speed > threshold) {
          const violationKey = `speed-${nearbySignal.id}-${Math.floor(speed / 10)}-${Math.floor(Date.now() / 10000)}`;
          
          if (!recentViolationsRef.current.has(violationKey)) {
            recentViolationsRef.current.add(violationKey);

            const overspeedViolation: RuleViolation = {
              id: generateId(),
              ambulanceId: `AMB-${driverInfo.vehicleNumber}`,
              driverId: driverInfo.driverId,
              driverName: driverInfo.driverName,
              vehicleNumber: driverInfo.vehicleNumber,
              type: 'OVERSPEED',
              timestamp: now,
              location: position,
              speedAtViolation: speed,
              speedLimit,
              signalId: nearbySignal.id,
              signalState,
              emergencyModeActive,
              status: emergencyModeActive ? 'CONDITIONAL_PENDING' : 'PENDING',
              emergencySessionId,
            };

            // Prioritize signal break over overspeed if both occur
            if (!detectedViolation) {
              detectedViolation = overspeedViolation;
            }

            console.log('[ViolationDetection] Overspeed detected:', {
              speed,
              limit: speedLimit,
              threshold,
              emergencyMode: emergencyModeActive,
            });
          }
        }
      }

      // =====================
      // UNAUTHORIZED PRIORITY
      // =====================
      // This would be triggered when ambulance uses signal override without emergency mode
      // (handled separately in the emergency system)

      // Save violation if detected
      if (detectedViolation) {
        const newViolations = [...violations, detectedViolation];
        saveViolations(newViolations);
        setSessionViolations(prev => [...prev, detectedViolation!]);
        setLastViolation(detectedViolation);
      }

      return detectedViolation;
    },
    [detectSignalViolations, detectOverspeed, speedTolerancePercent, violations, saveViolations]
  );

  // Get violations for a specific driver
  const getDriverViolations = useCallback((driverId: string): RuleViolation[] => {
    return violations.filter(v => v.driverId === driverId);
  }, [violations]);

  // Get violations for a specific session
  const getSessionViolations = useCallback((sessionId: string): RuleViolation[] => {
    return violations.filter(v => v.emergencySessionId === sessionId);
  }, [violations]);

  // Update violation status
  const updateViolationStatus = useCallback((violationId: string, status: ViolationStatus, notes?: string) => {
    const updatedViolations = violations.map(v => 
      v.id === violationId 
        ? { ...v, status, notes: notes || v.notes }
        : v
    );
    saveViolations(updatedViolations);

    // Also update session violations
    setSessionViolations(prev => 
      prev.map(v => v.id === violationId ? { ...v, status, notes: notes || v.notes } : v)
    );

    console.log('[ViolationDetection] Violation status updated:', violationId, status);
  }, [violations, saveViolations]);

  // Clear session violations
  const clearSessionViolations = useCallback(() => {
    setSessionViolations([]);
    recentViolationsRef.current.clear();
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Load violations on mount
  useEffect(() => {
    loadViolations();
  }, [loadViolations]);

  return {
    violations,
    sessionViolations,
    violationCounts,
    lastViolation,
    error,
    checkForViolations,
    getDriverViolations,
    getSessionViolations,
    updateViolationStatus,
    clearSessionViolations,
    loadViolations,
    clearError,
  };
}
