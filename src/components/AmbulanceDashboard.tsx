import { useRef } from 'react';
import type { AmbulanceStatus } from '@/hooks/useAmbulanceSimulation';

interface AmbulanceDashboardProps {
  status: AmbulanceStatus;
  speed: number;
  onSpeedChange: (s: number) => void;
  onLoadCSV: (file: File) => void;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  routeLength: number;
  esp32IPs: Record<string, string>;
  onESP32IPChange: (intId: string, ip: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  'Idle': 'text-muted-foreground',
  'Simulation running': 'text-signal-green',
  'Simulation stopped': 'text-signal-yellow',
  'Simulation complete': 'text-primary',
};

const AmbulanceDashboard = ({
  status,
  speed,
  onSpeedChange,
  onLoadCSV,
  onStart,
  onStop,
  onReset,
  routeLength,
  esp32IPs,
  onESP32IPChange,
}: AmbulanceDashboardProps) => {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onLoadCSV(file);
  };

  const statusColor =
    status.statusText.includes('Approaching')
      ? 'text-signal-yellow'
      : status.statusText.includes('Crossing')
      ? 'text-signal-red'
      : STATUS_COLORS[status.statusText] || 'text-foreground';

  const progress = status.totalPoints > 0
    ? Math.round((status.currentIndex / status.totalPoints) * 100)
    : 0;

  return (
    <div className="bg-card rounded-lg border border-border p-3 md:p-4 space-y-3">
      <h2 className="text-sm font-mono font-bold text-foreground tracking-wider uppercase">
        🚑 Ambulance Simulation
      </h2>

      {/* Status */}
      <div className="bg-secondary/50 rounded-md px-3 py-2">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${status.running ? 'bg-signal-green animate-pulse' : 'bg-muted-foreground'}`} />
          <span className={`text-xs font-mono font-bold ${statusColor}`}>
            {status.statusText}
          </span>
        </div>
        {status.totalPoints > 0 && (
          <div className="mt-2">
            <div className="flex justify-between text-[10px] font-mono text-muted-foreground mb-1">
              <span>Point {status.currentIndex}/{status.totalPoints}</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Current Position */}
      {status.position && (
        <div className="bg-secondary/50 rounded-md px-3 py-2">
          <span className="text-[10px] font-mono text-muted-foreground block mb-1">Current Position</span>
          <span className="text-xs font-mono text-foreground">
            {status.position.lat.toFixed(6)}, {status.position.lon.toFixed(6)}
          </span>
        </div>
      )}

      {/* Nearby Signal */}
      {status.nearbySignalId && (
        <div className="bg-signal-red/10 border border-signal-red/30 rounded-md px-3 py-2">
          <span className="text-[10px] font-mono text-muted-foreground block mb-1">Signal Override</span>
          <span className="text-xs font-mono font-bold text-signal-green">
            {status.nearbySignalId} → GREEN 🟢
          </span>
        </div>
      )}

      {/* ESP32 IP Configuration */}
      <div className="bg-secondary/50 rounded-md px-3 py-2 space-y-1.5">
        <span className="text-[10px] font-mono text-muted-foreground block">ESP32 IPs (optional)</span>
        {(Object.keys(esp32IPs).length > 0 ? Object.keys(esp32IPs) : ['INT-1', 'INT-2']).map((intId) => (
          <div key={intId} className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-foreground w-10">{intId}:</span>
            <input
              type="text"
              placeholder="e.g. 192.168.1.100"
              value={esp32IPs[intId] || ''}
              onChange={(e) => onESP32IPChange(intId, e.target.value)}
              disabled={status.running}
              className="flex-1 px-2 py-1 rounded text-[10px] font-mono bg-muted text-foreground border border-border"
            />
          </div>
        ))}
      </div>

      <div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={handleFile}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={status.running}
          className="w-full px-3 py-2 rounded-md text-xs font-mono font-semibold bg-secondary text-secondary-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          📁 Upload CSV Route
        </button>
      </div>

      {/* Speed Control */}
      <div className="flex items-center gap-2 bg-secondary/50 rounded-md px-3 py-2">
        <span className="text-[10px] font-mono text-muted-foreground">Delay:</span>
        <input
          type="range"
          min={0.3}
          max={5}
          step={0.1}
          value={speed}
          onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
          className="flex-1 accent-primary"
          disabled={status.running}
        />
        <span className="text-[10px] font-mono text-foreground w-10 text-right">{speed.toFixed(1)}s</span>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        {!status.running ? (
          <button
            onClick={onStart}
            disabled={routeLength === 0}
            className="flex-1 px-3 py-2 rounded-md text-xs font-mono font-bold bg-signal-green text-background hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            ▶ Start
          </button>
        ) : (
          <button
            onClick={onStop}
            className="flex-1 px-3 py-2 rounded-md text-xs font-mono font-bold bg-signal-red text-background hover:opacity-90 transition-opacity"
          >
            ■ Stop
          </button>
        )}
        <button
          onClick={onReset}
          disabled={status.running}
          className="px-3 py-2 rounded-md text-xs font-mono font-semibold bg-secondary text-secondary-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          ↺ Reset
        </button>
      </div>

      {/* Overridden signals list */}
      {status.overriddenSignals.size > 0 && (
        <div className="bg-secondary/50 rounded-md px-3 py-2">
          <span className="text-[10px] font-mono text-muted-foreground block mb-1">Active Overrides</span>
          <div className="flex flex-wrap gap-1">
            {Array.from(status.overriddenSignals).map((id) => (
              <span key={id} className="text-[10px] font-mono font-bold text-signal-green bg-signal-green/10 px-2 py-0.5 rounded">
                {id}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AmbulanceDashboard;
