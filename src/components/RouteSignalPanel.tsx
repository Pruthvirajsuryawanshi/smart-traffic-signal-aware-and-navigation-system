import { useEffect, useState } from 'react';
import type { RouteSignalInfo } from '@/types/signal';
import type { TrafficSignal } from '@/types/signal';
import { formatCountdown, getCountdown, getSpeedPrediction } from '@/lib/countdown';

interface RouteSignalPanelProps {
  routeSignals: RouteSignalInfo[];
  routeDistance: number;
  speed?: number;
  allSignals: TrafficSignal[];
  isAmbulance?: boolean;
}

const STATE_COLORS: Record<string, string> = {
  RED: 'text-signal-red',
  GREEN: 'text-signal-green',
  YELLOW: 'text-signal-yellow',
};

const STATE_BG: Record<string, string> = {
  RED: 'bg-signal-red/10 border-signal-red/30',
  GREEN: 'bg-signal-green/10 border-signal-green/30',
  YELLOW: 'bg-signal-yellow/10 border-signal-yellow/30',
};

function formatTime(seconds: number): string {
  const rounded = Math.round(seconds);
  if (rounded > 59) return `${Math.round(rounded / 60)} min`;
  return `${rounded}s`;
}

function formatDistance(meters: number): string {
  if (meters > 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${meters.toFixed(0)} m`;
}

export default function RouteSignalPanel({ routeSignals, routeDistance, speed, allSignals, isAmbulance = false }: RouteSignalPanelProps) {
  const [, setTick] = useState(0);

  // Re-render every second for live countdowns
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-card rounded-lg border border-border p-3 md:p-4">
      <h2 className="text-sm font-mono font-bold text-foreground tracking-wider uppercase mb-3">
        Route Info
      </h2>

      {routeDistance > 0 && (
        <div className="flex items-center gap-2 bg-secondary/50 rounded-md px-3 py-2 mb-3">
          <span className="text-[10px] font-mono text-muted-foreground">Distance:</span>
          <span className="text-xs font-mono font-bold text-foreground">
            {formatDistance(routeDistance)}
          </span>
          {speed && (
            <>
              <span className="text-[10px] font-mono text-muted-foreground ml-auto">Speed:</span>
              <span className="text-xs font-mono font-bold text-foreground">{speed} km/h</span>
            </>
          )}
        </div>
      )}

      {routeSignals.length === 0 ? (
        <p className="text-[10px] font-mono text-muted-foreground">
          {routeDistance > 0 ? 'No signals detected on route' : 'Set a route to detect signals'}
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] font-mono text-muted-foreground mb-2">
            {routeSignals.length} signal{routeSignals.length > 1 ? 's' : ''} on route
          </p>
          {routeSignals.map((info, idx) => {
            const countdown = getCountdown(info.signal.state, info.signal.updated_at, info.signal.id, allSignals);
            const countdownText = formatCountdown(info.signal.state, info.signal.updated_at, info.signal.id, allSignals);
            const prediction = speed
              ? getSpeedPrediction(info.distanceFromStart, info.signal.state, info.signal.updated_at, info.signal.id, allSignals, speed)
              : null;

            return (
              <div
                key={info.signal.id}
                className={`rounded-lg px-3 py-2.5 border ${STATE_BG[countdown.currentState]}`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-mono font-bold text-foreground">
                    {idx + 1}.
                  </span>
                  <span className={`text-sm font-mono font-bold ${STATE_COLORS[countdown.currentState]}`}>
                    ●
                  </span>
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {info.signal.id}
                  </span>
                  <span className={`text-xs font-mono font-bold ml-auto ${STATE_COLORS[countdown.currentState]}`}>
                    {countdown.currentState}
                  </span>
                </div>

                <div className="text-[10px] font-mono text-muted-foreground mb-1.5">
                  {info.roadName}
                </div>

                {/* Countdown */}
                <div className="flex items-center gap-1.5 mb-2 px-2 py-1.5 rounded-md bg-background/50 border border-border/50">
                  <span className={`text-xs font-mono font-bold ${STATE_COLORS[countdown.nextState] || 'text-foreground'}`}>
                    {countdownText}
                  </span>
                </div>

                {/* Speed Prediction */}
                {prediction && (
                  <div className={`flex items-center gap-1.5 mb-2 px-2 py-1.5 rounded-md border ${
                    prediction.canCross
                      ? 'bg-signal-green/5 border-signal-green/20'
                      : 'bg-signal-yellow/5 border-signal-yellow/20'
                  }`}>
                    <span className={`text-[10px] font-mono font-semibold ${
                      prediction.canCross ? 'text-signal-green' : 'text-signal-yellow'
                    }`}>
                      {prediction.text}
                    </span>
                  </div>
                )}

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                  <div>
                    <span className="block text-foreground/50">Distance</span>
                    <span className="text-foreground">{formatDistance(info.distanceFromStart)}</span>
                  </div>
                  <div>
                    <span className="block text-foreground/50">ETA</span>
                    <span className="text-foreground">{formatTime(info.arrivalSec)}</span>
                  </div>
                  <div>
                    <span className="block text-foreground/50">Wait</span>
                    <span className={`font-bold ${info.waitSec > 0 ? 'text-signal-red' : 'text-signal-green'}`}>
                      {info.waitSec > 0 ? formatTime(info.waitSec) : 'None'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
