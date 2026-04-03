import { useEffect, useState } from 'react';
import type { TrafficSignal, SignalState, SignalRuntime } from '@/types/signal';
import { SIGNAL_METADATA } from '@/types/signal';
import { formatCountdown, getCountdown } from '@/lib/countdown';

interface AdminPanelProps {
  signals: TrafficSignal[];
  onUpdate: (id: string, state: SignalState) => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  getRuntime: (id: string) => SignalRuntime | undefined;
}

const STATE_DOT: Record<string, string> = {
  RED: 'bg-signal-red',
  GREEN: 'bg-signal-green',
  YELLOW: 'bg-signal-yellow',
};

const STATE_COLORS: Record<string, string> = {
  RED: 'text-signal-red',
  GREEN: 'text-signal-green',
  YELLOW: 'text-signal-yellow',
};

export default function AdminPanel({
  signals,
  onUpdate,
  speed,
  onSpeedChange,
  getRuntime,
}: AdminPanelProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const grouped = signals.reduce<Record<string, TrafficSignal[]>>((acc, signal) => {
    const intId = signal.intersection ?? (SIGNAL_METADATA[signal.id]?.intersection || 'Unknown');
    if (!acc[intId]) acc[intId] = [];
    acc[intId].push(signal);
    return acc;
  }, {});

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-mono font-bold text-foreground tracking-wider uppercase">
          All Signals
        </h2>
      </div>

      {/* Speed setting */}
      <div className="flex items-center gap-2 mb-3 bg-secondary/50 rounded-md px-3 py-2">
        <span className="text-[10px] font-mono text-muted-foreground">Speed:</span>
        <input
          type="number"
          min={5}
          max={120}
          value={speed}
          onChange={(e) => onSpeedChange(Math.max(5, Number(e.target.value) || 35))}
          className="w-14 px-1.5 py-0.5 rounded text-xs font-mono bg-muted text-foreground border border-border text-center"
        />
        <span className="text-[10px] font-mono text-muted-foreground">km/h</span>
      </div>

      {/* Signals grouped by intersection */}
      <div className="space-y-4">
        {Object.entries(grouped).sort().map(([intId, intSignals]) => (
          <div key={intId}>
            <div className="text-[10px] font-mono font-bold text-primary uppercase tracking-wider mb-1.5 px-1">
              {intId}
            </div>
            <div className="space-y-2">
              {intSignals.map((signal) => {
                const currentState = signal.state;
                const countdown = getCountdown(currentState, signal.updated_at, signal.id, signals);
                const countdownText = formatCountdown(currentState, signal.updated_at, signal.id, signals);

                return (
                  <div
                    key={signal.id}
                    className="bg-secondary/50 rounded-md px-3 py-2"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className={`w-3 h-3 rounded-full ${STATE_DOT[currentState]} animate-pulse-signal`}
                      />
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {signal.id}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground flex-1 truncate">
                        {signal.roadName}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-mono font-bold ${STATE_COLORS[countdown.nextState] || 'text-foreground'}`}>
                        {countdownText}
                      </span>
                      <div className="flex gap-1">
                        {(['RED', 'GREEN'] as SignalState[]).map((state) => (
                          <button
                            key={state}
                            onClick={() => onUpdate(signal.id, state)}
                            disabled={currentState === state}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                              currentState === state
                                ? `${STATE_DOT[state]} text-background`
                                : 'bg-muted text-muted-foreground hover:bg-secondary'
                            }`}
                          >
                            {state}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
