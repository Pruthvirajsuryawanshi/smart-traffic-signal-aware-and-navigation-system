import { useState, useCallback, useRef, useEffect } from 'react';
import type { 
  EmergencySession, 
  EmergencyRoutePoint, 
  EmergencyStatus,
  PROOF_SUBMISSION_DEADLINE_HOURS 
} from '@/types/emergency-validation';

// Generate unique ID
const generateId = (): string => {
  return `EMG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Local storage keys
const STORAGE_KEYS = {
  ACTIVE_SESSION: 'emergency_active_session',
  SESSIONS: 'emergency_sessions',
  PENDING_PROOFS: 'pending_proofs',
  SUBMITTED_PROOFS: 'submitted_proofs',
};

export interface EmergencyTrackingState {
  /** Current active emergency session */
  activeSession: EmergencySession | null;
  /** Is emergency mode currently active */
  isActive: boolean;
  /** Time elapsed since emergency started (seconds) */
  elapsedSeconds: number;
  /** Time remaining for proof submission (seconds), null if no deadline */
  proofDeadlineRemaining: number | null;
  /** All sessions for current driver */
  sessions: EmergencySession[];
  /** Any error message */
  error: string | null;
}

export interface EmergencyTrackingActions {
  /** Start a new emergency session */
  startEmergency: (driverId: string, driverName: string, vehicleNumber: string, hospitalName: string, startLocation: { lat: number; lng: number }) => void;
  /** End current emergency session */
  endEmergency: (endLocation?: { lat: number; lng: number }) => void;
  /** Add a route point to current session */
  addRoutePoint: (point: Omit<EmergencyRoutePoint, 'timestamp'>) => void;
  /** Record a signal crossing */
  recordSignalCrossing: (signalId: string, signalState: 'GREEN' | 'YELLOW' | 'RED') => void;
  /** Submit proof for completed session */
  submitProof: (proof: Omit<import('@/types/emergency-validation').EmergencyProof, 'id' | 'submittedAt' | 'status'>) => void;
  /** Get all submitted proofs (for admin dashboard) */
  getSubmittedProofs: () => import('@/types/emergency-validation').EmergencyProof[];
  /** Check if proof was submitted for the last completed session */
  isProofSubmittedForLastSession: () => boolean;
  /** Load sessions from storage */
  loadSessions: () => void;
  /** Clear error */
  clearError: () => void;
}

export type UseEmergencyTracking = EmergencyTrackingState & EmergencyTrackingActions;

/**
 * Hook for tracking emergency sessions with proof submission timer
 */
export function useEmergencyTracking(): UseEmergencyTracking {
  const [activeSession, setActiveSession] = useState<EmergencySession | null>(null);
  const [sessions, setSessions] = useState<EmergencySession[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [proofDeadlineRemaining, setProofDeadlineRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const routePointsRef = useRef<EmergencyRoutePoint[]>([]);

  // Load sessions from localStorage on mount
  const loadSessions = useCallback(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.SESSIONS);
      if (stored) {
        const parsed = JSON.parse(stored) as EmergencySession[];
        setSessions(parsed);
      }

      const activeStored = localStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION);
      if (activeStored) {
        const parsed = JSON.parse(activeStored) as EmergencySession;
        if (parsed.status === 'ACTIVE') {
          setActiveSession(parsed);
          routePointsRef.current = parsed.route || [];
        }
      }
    } catch (e) {
      console.error('[EmergencyTracking] Failed to load sessions:', e);
    }
  }, []);

  // Save sessions to localStorage
  const saveSessions = useCallback((newSessions: EmergencySession[]) => {
    try {
      localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(newSessions));
      setSessions(newSessions);
    } catch (e) {
      console.error('[EmergencyTracking] Failed to save sessions:', e);
      setError('Failed to save session data');
    }
  }, []);

  // Save active session
  const saveActiveSession = useCallback((session: EmergencySession | null) => {
    try {
      if (session) {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION, JSON.stringify(session));
      } else {
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
      }
    } catch (e) {
      console.error('[EmergencyTracking] Failed to save active session:', e);
    }
  }, []);

  // Start elapsed time counter
  const startElapsedCounter = useCallback((startTime: string) => {
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
    }

    const updateElapsed = () => {
      const start = new Date(startTime).getTime();
      const now = Date.now();
      const elapsed = Math.floor((now - start) / 1000);
      setElapsedSeconds(elapsed);
    };

    updateElapsed();
    elapsedIntervalRef.current = setInterval(updateElapsed, 1000);
  }, []);

  // Start proof deadline counter (8 hours from session end)
  const startDeadlineCounter = useCallback((sessionId: string, endTime: string) => {
    if (deadlineIntervalRef.current) {
      clearInterval(deadlineIntervalRef.current);
    }

    const PROOF_DEADLINE_HOURS = 8;
    const PROOF_DEADLINE_MS = PROOF_DEADLINE_HOURS * 60 * 60 * 1000;

    const updateDeadline = () => {
      const end = new Date(endTime).getTime();
      const deadline = end + PROOF_DEADLINE_MS;
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((deadline - now) / 1000));
      
      setProofDeadlineRemaining(remaining);

      // Check if deadline passed
      if (remaining <= 0) {
        // Mark as expired in pending proofs
        const pendingProofs = JSON.parse(localStorage.getItem(STORAGE_KEYS.PENDING_PROOFS) || '[]');
        const proofIndex = pendingProofs.findIndex((p: { sessionId: string }) => p.sessionId === sessionId);
        if (proofIndex >= 0) {
          pendingProofs[proofIndex].status = 'EXPIRED';
          localStorage.setItem(STORAGE_KEYS.PENDING_PROOFS, JSON.stringify(pendingProofs));
        }
      }
    };

    updateDeadline();
    deadlineIntervalRef.current = setInterval(updateDeadline, 1000);
  }, []);

  // Start emergency session
  const startEmergency = useCallback((
    driverId: string,
    driverName: string,
    vehicleNumber: string,
    hospitalName: string,
    startLocation: { lat: number; lng: number }
  ) => {
    if (activeSession) {
      setError('Emergency session already active. End current session first.');
      return;
    }

    const now = new Date().toISOString();
    const newSession: EmergencySession = {
      id: generateId(),
      ambulanceId: `AMB-${vehicleNumber}`,
      driverId,
      driverName,
      vehicleNumber,
      hospitalName,
      startTime: now,
      status: 'ACTIVE',
      startLocation,
      route: [],
      signalsCrossed: [],
      distanceTraveledKm: 0,
      maxSpeedKmh: 0,
      averageSpeedKmh: 0,
    };

    routePointsRef.current = [];
    setActiveSession(newSession);
    saveActiveSession(newSession);
    startElapsedCounter(now);

    // Add to sessions list
    const newSessions = [...sessions, newSession];
    saveSessions(newSessions);

    // Add to pending proofs (for tracking)
    const pendingProofs = JSON.parse(localStorage.getItem(STORAGE_KEYS.PENDING_PROOFS) || '[]');
    pendingProofs.push({
      sessionId: newSession.id,
      driverId,
      driverName,
      vehicleNumber,
      startTime: now,
      status: 'PENDING',
      proofSubmitted: false,
    });
    localStorage.setItem(STORAGE_KEYS.PENDING_PROOFS, JSON.stringify(pendingProofs));

    console.log('[EmergencyTracking] Emergency started:', newSession.id);
    setError(null);
  }, [activeSession, sessions, saveActiveSession, saveSessions, startElapsedCounter]);

  // End emergency session
  const endEmergency = useCallback((endLocation?: { lat: number; lng: number }) => {
    if (!activeSession) {
      setError('No active emergency session to end.');
      return;
    }

    const now = new Date().toISOString();
    const route = routePointsRef.current;
    
    // Calculate statistics with enhanced analysis
    let totalDistance = 0;
    let maxSpeed = 0;
    let totalSpeed = 0;
    let speedSamples = 0;
    
    for (let i = 1; i < route.length; i++) {
      const prev = route[i - 1];
      const curr = route[i];
      const dLat = (curr.lat - prev.lat) * 111000;
      const dLng = (curr.lng - prev.lng) * 111000 * Math.cos(prev.lat * Math.PI / 180);
      totalDistance += Math.sqrt(dLat * dLat + dLng * dLng);
      if (curr.speed > 0) {
        maxSpeed = Math.max(maxSpeed, curr.speed);
        totalSpeed += curr.speed;
        speedSamples++;
      }
    }

    const endedSession: EmergencySession = {
      ...activeSession,
      endTime: now,
      status: 'COMPLETED',
      endLocation: endLocation || (route.length > 0 ? { lat: route[route.length - 1].lat, lng: route[route.length - 1].lng } : activeSession.startLocation),
      route,
      distanceTraveledKm: totalDistance / 1000,
      maxSpeedKmh: Math.round(maxSpeed),
      averageSpeedKmh: speedSamples > 0 ? Math.round(totalSpeed / speedSamples) : 0,
    };

    // Update in sessions list
    const updatedSessions = sessions.map(s => s.id === endedSession.id ? endedSession : s);
    saveSessions(updatedSessions);

    // Clear active session
    setActiveSession(null);
    saveActiveSession(null);
    routePointsRef.current = [];

    // Stop elapsed counter
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
    setElapsedSeconds(0);

    // Start proof deadline counter
    startDeadlineCounter(endedSession.id, now);

    // Update pending proofs
    const pendingProofs = JSON.parse(localStorage.getItem(STORAGE_KEYS.PENDING_PROOFS) || '[]');
    const proofIndex = pendingProofs.findIndex((p: { sessionId: string }) => p.sessionId === endedSession.id);
    if (proofIndex >= 0) {
      pendingProofs[proofIndex].endTime = now;
      pendingProofs[proofIndex].deadline = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
      localStorage.setItem(STORAGE_KEYS.PENDING_PROOFS, JSON.stringify(pendingProofs));
    }

    console.log('[EmergencyTracking] Emergency ended:', endedSession.id);
    setError(null);
  }, [activeSession, sessions, saveActiveSession, saveSessions, startDeadlineCounter]);

  // Add route point
  const addRoutePoint = useCallback((point: Omit<EmergencyRoutePoint, 'timestamp'>) => {
    if (!activeSession) return;

    const routePoint: EmergencyRoutePoint = {
      ...point,
      timestamp: new Date().toISOString(),
    };

    routePointsRef.current.push(routePoint);

    // Update active session with new route data
    const updatedSession: EmergencySession = {
      ...activeSession,
      route: [...routePointsRef.current],
    };

    setActiveSession(updatedSession);
    saveActiveSession(updatedSession);
  }, [activeSession, saveActiveSession]);

  // Record signal crossing
  const recordSignalCrossing = useCallback((signalId: string, signalState: 'GREEN' | 'YELLOW' | 'RED') => {
    if (!activeSession) return;

    const updatedSession: EmergencySession = {
      ...activeSession,
      signalsCrossed: [...activeSession.signalsCrossed, signalId],
    };

    setActiveSession(updatedSession);
    saveActiveSession(updatedSession);

    // Also add as route point
    const lastPoint = routePointsRef.current[routePointsRef.current.length - 1];
    if (lastPoint) {
      addRoutePoint({
        lat: lastPoint.lat,
        lng: lastPoint.lng,
        speed: lastPoint.speed,
        signalId,
        signalState,
      });
    }

    console.log('[EmergencyTracking] Signal crossed:', signalId, signalState);
  }, [activeSession, saveActiveSession, addRoutePoint]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Submit proof for a completed session
  const submitProof = useCallback((proof: Omit<import('@/types/emergency-validation').EmergencyProof, 'id' | 'submittedAt' | 'status'>) => {
    const submittedProofs = JSON.parse(localStorage.getItem(STORAGE_KEYS.SUBMITTED_PROOFS) || '[]');
    
    // Add proof with status and timestamp
    const proofWithMetadata: import('@/types/emergency-validation').EmergencyProof = {
      ...proof,
      id: `PRF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      submittedAt: new Date().toISOString(),
      status: 'PENDING',
    };
    
    submittedProofs.push(proofWithMetadata);
    localStorage.setItem(STORAGE_KEYS.SUBMITTED_PROOFS, JSON.stringify(submittedProofs));
    
    // Update pending proofs status
    const pendingProofs = JSON.parse(localStorage.getItem(STORAGE_KEYS.PENDING_PROOFS) || '[]');
    const proofIndex = pendingProofs.findIndex((p: { sessionId: string }) => p.sessionId === proof.emergencySessionId);
    if (proofIndex >= 0) {
      pendingProofs[proofIndex].proofSubmitted = true;
      pendingProofs[proofIndex].status = 'PENDING';
      localStorage.setItem(STORAGE_KEYS.PENDING_PROOFS, JSON.stringify(pendingProofs));
    }
    
    console.log('[EmergencyTracking] Proof submitted:', proofWithMetadata.id);
  }, []);

  // Get all submitted proofs
  const getSubmittedProofs = useCallback((): import('@/types/emergency-validation').EmergencyProof[] => {
    const submittedProofs = JSON.parse(localStorage.getItem(STORAGE_KEYS.SUBMITTED_PROOFS) || '[]');
    
    // Match proofs with their sessions
    return submittedProofs.map((proof: any) => {
      const session = sessions.find(s => s.id === proof.emergencySessionId);
      return {
        ...proof,
        session: session || null,
      };
    });
  }, [sessions]);

  // Check if proof was submitted for the last completed session
  const isProofSubmittedForLastSession = useCallback((): boolean => {
    if (sessions.length === 0) return false;
    
    const lastSession = sessions[sessions.length - 1];
    if (!lastSession || lastSession.status !== 'COMPLETED') return false;
    
    const submittedProofs = JSON.parse(localStorage.getItem(STORAGE_KEYS.SUBMITTED_PROOFS) || '[]');
    return submittedProofs.some((proof: any) => proof.emergencySessionId === lastSession.id);
  }, [sessions]);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
      if (deadlineIntervalRef.current) clearInterval(deadlineIntervalRef.current);
    };
  }, []);

  return {
    activeSession,
    isActive: activeSession !== null,
    elapsedSeconds,
    proofDeadlineRemaining,
    sessions,
    error,
    startEmergency,
    endEmergency,
    addRoutePoint,
    recordSignalCrossing,
    submitProof,
    getSubmittedProofs,
    isProofSubmittedForLastSession,
    loadSessions,
    clearError,
  };
}
