import { useState, useEffect } from 'react';
import type { SpeedPredictionResult, SignalPrediction } from '@/hooks/useSpeedPrediction';

interface SpeedPredictionPanelProps {
  prediction: SpeedPredictionResult | null;
  compact?: boolean;
}

const ACTION_ICONS: Record<string, string> = {
  maintain: '➡️',
  speed_up: '⏫',
  slow_down: '⏬',
  stop: '🛑',
};

const ACTION_COLORS: Record<string, string> = {
  maintain: 'text-signal-green',
  speed_up: 'text-signal-yellow',
  slow_down: 'text-signal-yellow',
  stop: 'text-signal-red',
};

const ACTION_BG: Record<string, string> = {
  maintain: 'bg-signal-green/10 border-signal-green/30',
  speed_up: 'bg-signal-yellow/10 border-signal-yellow/30',
  slow_down: 'bg-signal-yellow/10 border-signal-yellow/30',
  stop: 'bg-signal-red/10 border-signal-red/30',
};

const STATE_COLORS: Record<string, string> = {
  RED: 'text-signal-red',
  GREEN: 'text-signal-green',
  YELLOW: 'text-signal-yellow',
};

function formatDistance(meters: number): string {
  if (meters > 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function formatTime(seconds: number): string {
  if (seconds > 60) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds)}s`;
}

function SignalPredictionCard({ 
  prediction, 
  isPrimary 
}: { 
  prediction: SignalPrediction; 
  isPrimary: boolean;
}) {
  const { signalId, distanceMeters, currentState, remainingCurrentSec, recommendation } = prediction;
  
  return (
    <div 
      className={`rounded-lg px-3 py-2.5 border ${
        recommendation.canCross 
          ? 'bg-signal-green/5 border-signal-green/20' 
          : 'bg-signal-red/5 border-signal-red/20'
      }`}
    >
      {/* Signal Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-sm ${STATE_COLORS[currentState]}`}>●</span>
        <span className="text-xs font-mono font-bold text-foreground">{signalId}</span>
        <span className="text-[10px] font-mono text-muted-foreground ml-auto">
          {formatDistance(distanceMeters)} away
        </span>
      </div>

      {/* Current State Countdown */}
      <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded bg-background/50 border border-border/50">
        <span className={`text-xs font-mono font-bold ${STATE_COLORS[currentState]}`}>
          {currentState}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground">
          → {remainingCurrentSec}s remaining
        </span>
      </div>

      {/* Speed Recommendation */}
      <div className={`rounded-md px-3 py-2 border ${ACTION_BG[recommendation.action]}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">{ACTION_ICONS[recommendation.action]}</span>
          <span className={`text-lg font-bold ${ACTION_COLORS[recommendation.action]}`}>
            {recommendation.speedKmh} km/h
          </span>
        </div>
        <p className="text-[11px] font-mono text-foreground/80 leading-relaxed">
          {recommendation.message}
        </p>
      </div>

      {/* Arrival Info */}
      <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-muted-foreground">
        <span>ETA: {formatTime(recommendation.timeToReachSec)}</span>
        <span className={STATE_COLORS[recommendation.arrivalState]}>
          Arrives: {recommendation.arrivalState}
        </span>
      </div>

      {/* Next Signal Link */}
      {prediction.nextSignal && (
        <div className="mt-2 pt-2 border-t border-border/30 text-[10px] font-mono text-muted-foreground">
          ↓ Next: {prediction.nextSignal.signalId} ({formatDistance(prediction.nextSignal.distanceMeters)})
        </div>
      )}
    </div>
  );
}

export default function SpeedPredictionPanel({ 
  prediction, 
  compact = false 
}: SpeedPredictionPanelProps) {
  const [, setTick] = useState(0);

  // Re-render every second for live updates
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!prediction) {
    return (
      <div className="bg-card rounded-lg border border-border p-3">
        <p className="text-[10px] font-mono text-muted-foreground">
          Set a route to see speed predictions
        </p>
      </div>
    );
  }

  const { predictions, primaryRecommendation, routeAdvice, currentSpeedKmh } = prediction;

  if (compact && primaryRecommendation) {
    // Compact view for sidebar/dashboard
    return (
      <div className={`rounded-md px-3 py-2 border ${
        primaryRecommendation.canCross 
          ? 'bg-signal-green/10 border-signal-green/30' 
          : 'bg-signal-yellow/10 border-signal-yellow/30'
      }`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm">{ACTION_ICONS[primaryRecommendation.action]}</span>
          <span className={`text-sm font-bold ${
            primaryRecommendation.canCross ? 'text-signal-green' : 'text-signal-yellow'
          }`}>
            {primaryRecommendation.speedKmh} km/h
          </span>
        </div>
        <p className="text-[10px] font-mono text-foreground/80">
          {primaryRecommendation.message}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border p-3 md:p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-mono font-bold text-foreground tracking-wider uppercase">
          🎯 Speed Prediction
        </h2>
        <div className="flex items-center gap-1.5 bg-secondary/50 rounded-md px-2 py-1">
          <span className="text-[10px] font-mono text-muted-foreground">Current:</span>
          <span className="text-xs font-mono font-bold text-foreground">{currentSpeedKmh} km/h</span>
        </div>
      </div>

      {/* Route Overview */}
      <div className="bg-secondary/50 rounded-md px-3 py-2 mb-3">
        <p className="text-[11px] font-mono text-foreground">{routeAdvice}</p>
      </div>

      {/* Primary Recommendation */}
      {primaryRecommendation && (
        <div className={`rounded-lg px-4 py-3 mb-3 border ${
          primaryRecommendation.canCross 
            ? 'bg-signal-green/10 border-signal-green/30' 
            : 'bg-signal-yellow/10 border-signal-yellow/30'
        }`}>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">{ACTION_ICONS[primaryRecommendation.action]}</span>
            <div>
              <div className={`text-2xl font-bold ${
                primaryRecommendation.canCross ? 'text-signal-green' : 'text-signal-yellow'
              }`}>
                {primaryRecommendation.speedKmh} km/h
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">
                Recommended for next signal
              </div>
            </div>
          </div>
          <p className="text-xs font-mono text-foreground/90 leading-relaxed">
            {primaryRecommendation.message}
          </p>
        </div>
      )}

      {/* All Signal Predictions */}
      {predictions.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            All Signals ({predictions.length})
          </p>
          {predictions.map((pred, idx) => (
            <SignalPredictionCard 
              key={pred.signalId} 
              prediction={pred} 
              isPrimary={idx === 0}
            />
          ))}
        </div>
      )}

      {/* No signals */}
      {predictions.length === 0 && (
        <p className="text-[10px] font-mono text-muted-foreground">
          No signals on route
        </p>
      )}
    </div>
  );
}
