import { useState, useEffect } from 'react';
import type { EmergencySession } from '@/types/emergency-validation';

interface EmergencyModeControlProps {
  /** Is emergency mode currently active */
  isActive: boolean;
  /** Active emergency session */
  activeSession: EmergencySession | null;
  /** Elapsed time in seconds */
  elapsedSeconds: number;
  /** Proof deadline remaining in seconds */
  proofDeadlineRemaining: number | null;
  /** Last recorded session (for proof submission) */
  lastCompletedSession: EmergencySession | null;
  /** Callback to start emergency */
  onStartEmergency: () => void;
  /** Callback to end emergency */
  onEndEmergency: () => void;
  /** Callback to open proof upload */
  onOpenProofUpload: () => void;
  /** Current position */
  currentPosition?: { lat: number; lng: number } | null;
}

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hrs > 0) {
    return `${hrs}h ${mins}m ${secs}s`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

function formatDeadline(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hrs}h ${mins}m remaining`;
}

export default function EmergencyModeControl({
  isActive,
  activeSession,
  elapsedSeconds,
  proofDeadlineRemaining,
  lastCompletedSession,
  onStartEmergency,
  onEndEmergency,
  onOpenProofUpload,
  currentPosition,
}: EmergencyModeControlProps) {
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);
  const [pulseAnimation, setPulseAnimation] = useState(false);

  // Pulse animation when active
  useEffect(() => {
    if (isActive) {
      const interval = setInterval(() => {
        setPulseAnimation(p => !p);
      }, 500);
      return () => clearInterval(interval);
    }
  }, [isActive]);

  const handleStartEmergency = () => {
    if (!currentPosition) {
      alert('GPS position not available. Please wait for location.');
      return;
    }
    onStartEmergency();
  };

  const handleEndEmergency = () => {
    setShowConfirmEnd(true);
  };

  const confirmEndEmergency = () => {
    onEndEmergency();
    setShowConfirmEnd(false);
  };

  // Calculate urgency level for proof deadline
  const getDeadlineUrgency = () => {
    if (proofDeadlineRemaining === null) return 'none';
    if (proofDeadlineRemaining < 3600) return 'critical'; // < 1 hour
    if (proofDeadlineRemaining < 7200) return 'warning'; // < 2 hours
    return 'normal';
  };

  return (
    <div className="bg-card rounded-lg border border-border p-3 md:p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-mono font-bold text-foreground tracking-wider uppercase">
          🚨 Emergency Mode
        </h2>
        <div className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
          isActive 
            ? 'bg-signal-red/20 text-signal-red animate-pulse' 
            : 'bg-muted text-muted-foreground'
        }`}>
          {isActive ? 'ACTIVE' : 'STANDBY'}
        </div>
      </div>

      {/* Status Indicator */}
      {isActive && activeSession && (
        <div className="bg-signal-red/10 border border-signal-red/30 rounded-lg p-3">
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-4 h-4 rounded-full bg-signal-red ${pulseAnimation ? 'opacity-100' : 'opacity-50'}`} />
            <div>
              <div className="text-xs font-mono font-bold text-signal-red">
                EMERGENCY IN PROGRESS
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">
                Session: {activeSession.id}
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
            <div className="bg-background/50 rounded px-2 py-1">
              <span className="text-muted-foreground">Duration:</span>
              <span className="text-foreground ml-1 font-bold">{formatTime(elapsedSeconds)}</span>
            </div>
            <div className="bg-background/50 rounded px-2 py-1">
              <span className="text-muted-foreground">Signals:</span>
              <span className="text-foreground ml-1 font-bold">{activeSession.signalsCrossed.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* Proof Deadline Warning */}
      {!isActive && proofDeadlineRemaining !== null && lastCompletedSession && (
        <div className={`rounded-lg p-3 border ${
          getDeadlineUrgency() === 'critical' 
            ? 'bg-signal-red/10 border-signal-red/30' 
            : getDeadlineUrgency() === 'warning'
            ? 'bg-signal-yellow/10 border-signal-yellow/30'
            : 'bg-secondary/50 border-border'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-sm ${getDeadlineUrgency() === 'critical' ? 'text-signal-red' : 'text-foreground'}`}>
              {getDeadlineUrgency() === 'critical' ? '⚠️' : '📋'}
            </span>
            <span className="text-xs font-mono font-bold text-foreground">
              Proof Submission Required
            </span>
          </div>
          <div className="text-[10px] font-mono text-muted-foreground mb-2">
            Session: {lastCompletedSession.id}
          </div>
          <div className={`text-xs font-mono ${
            getDeadlineUrgency() === 'critical' ? 'text-signal-red font-bold' : 'text-foreground'
          }`}>
            {formatDeadline(proofDeadlineRemaining)}
          </div>
          <button
            onClick={onOpenProofUpload}
            className="mt-2 w-full px-3 py-2 rounded-md text-xs font-mono font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Submit Proof Now
          </button>
        </div>
      )}

      {/* Main Control Button */}
      {!showConfirmEnd ? (
        <button
          onClick={isActive ? handleEndEmergency : handleStartEmergency}
          disabled={!isActive && !currentPosition}
          className={`w-full py-4 rounded-lg text-sm font-mono font-bold transition-all ${
            isActive
              ? 'bg-signal-red text-white hover:bg-signal-red/90 animate-pulse'
              : 'bg-signal-green text-white hover:bg-signal-green/90'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isActive ? '🛑 END EMERGENCY' : '🚨 START EMERGENCY'}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="bg-signal-yellow/10 border border-signal-yellow/30 rounded-lg p-3">
            <p className="text-xs font-mono text-foreground text-center">
              Are you sure you want to end the emergency?
            </p>
            <p className="text-[10px] font-mono text-muted-foreground text-center mt-1">
              You will need to submit proof within 8 hours.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowConfirmEnd(false)}
              className="flex-1 px-3 py-2 rounded-md text-xs font-mono font-semibold bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmEndEmergency}
              className="flex-1 px-3 py-2 rounded-md text-xs font-mono font-bold bg-signal-red text-white hover:bg-signal-red/90 transition-colors"
            >
              Confirm End
            </button>
          </div>
        </div>
      )}

      {/* Session Info */}
      {activeSession && (
        <div className="text-[10px] font-mono text-muted-foreground space-y-1">
          <div className="flex justify-between">
            <span>Vehicle:</span>
            <span className="text-foreground">{activeSession.vehicleNumber}</span>
          </div>
          <div className="flex justify-between">
            <span>Hospital:</span>
            <span className="text-foreground">{activeSession.hospitalName}</span>
          </div>
          <div className="flex justify-between">
            <span>Distance:</span>
            <span className="text-foreground">{activeSession.distanceTraveledKm.toFixed(2)} km</span>
          </div>
        </div>
      )}

      {/* Warning */}
      <div className="bg-secondary/30 rounded-md px-3 py-2 border border-border/50">
        <p className="text-[9px] font-mono text-muted-foreground leading-relaxed">
          ⚠️ Emergency mode grants traffic signal priority. Misuse will result in penalties. 
          Proof of emergency must be submitted within 8 hours.
        </p>
      </div>
    </div>
  );
}
