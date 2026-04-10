import { useState, useEffect } from 'react';
import type { RuleViolation, ViolationStatus, ViolationType, DashboardStats, AdminAlert } from '@/types/emergency-validation';

// Mock data for demonstration
const MOCK_VIOLATIONS: RuleViolation[] = [
  {
    id: 'VIO-001',
    ambulanceId: 'AMB-MH-12-1234',
    driverId: 'DRV-001',
    driverName: 'John Smith',
    vehicleNumber: 'MH-12-1234',
    type: 'SIGNAL_BREAK',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    location: { lat: 19.837, lng: 75.253 },
    speedAtViolation: 45,
    speedLimit: 50,
    signalId: 'SIG-101',
    signalState: 'RED',
    emergencyModeActive: true,
    status: 'CONDITIONAL_PENDING',
    emergencySessionId: 'EMG-001',
  },
  {
    id: 'VIO-002',
    ambulanceId: 'AMB-MH-12-5678',
    driverId: 'DRV-002',
    driverName: 'Jane Doe',
    vehicleNumber: 'MH-12-5678',
    type: 'OVERSPEED',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    location: { lat: 19.838, lng: 75.246 },
    speedAtViolation: 85,
    speedLimit: 50,
    signalId: 'SIG-201',
    signalState: 'GREEN',
    emergencyModeActive: false,
    status: 'PENDING',
  },
];

const MOCK_ALERTS: AdminAlert[] = [
  {
    id: 'ALT-001',
    type: 'NO_PROOF_SUBMITTED',
    message: 'Emergency session EMG-001 has no proof submitted after 8 hours',
    timestamp: new Date().toISOString(),
    relatedEntityId: 'EMG-001',
    entityType: 'EMERGENCY_SESSION',
    isRead: false,
    isResolved: false,
  },
];

const MOCK_STATS: DashboardStats = {
  activeEmergencySessions: 2,
  pendingProofs: 5,
  unverifiedCases: 8,
  misuseDetected: 3,
  todayViolations: 12,
  totalAmbulancesActive: 15,
};

interface ViolationMonitorPanelProps {
  violations?: RuleViolation[];
  alerts?: AdminAlert[];
  stats?: DashboardStats;
  onUpdateStatus?: (violationId: string, status: ViolationStatus, notes?: string) => void;
  onViewDetails?: (violation: RuleViolation) => void;
}

const STATUS_COLORS: Record<ViolationStatus, string> = {
  PENDING: 'bg-signal-yellow/20 text-signal-yellow',
  VALIDATED: 'bg-signal-green/20 text-signal-green',
  MISUSE: 'bg-signal-red/20 text-signal-red',
  CONDITIONAL_PENDING: 'bg-primary/20 text-primary',
};

const TYPE_ICONS: Record<ViolationType, string> = {
  SIGNAL_BREAK: '🚦',
  OVERSPEED: '⚡',
  UNAUTHORIZED_PRIORITY: '⚠️',
};

const TYPE_LABELS: Record<ViolationType, string> = {
  SIGNAL_BREAK: 'Signal Break',
  OVERSPEED: 'Overspeed',
  UNAUTHORIZED_PRIORITY: 'Unauthorized Priority',
};

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

export default function ViolationMonitorPanel({
  violations = MOCK_VIOLATIONS,
  alerts = MOCK_ALERTS,
  stats = MOCK_STATS,
  onUpdateStatus,
  onViewDetails,
}: ViolationMonitorPanelProps) {
  const [filter, setFilter] = useState<'all' | ViolationStatus>('all');
  const [selectedViolation, setSelectedViolation] = useState<RuleViolation | null>(null);
  const [, setTick] = useState(0);

  // Re-render every minute for relative times
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const filteredViolations = filter === 'all' 
    ? violations 
    : violations.filter(v => v.status === filter);

  const unreadAlerts = alerts.filter(a => !a.isRead);

  return (
    <div className="bg-card rounded-lg border border-border p-3 md:p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-mono font-bold text-foreground tracking-wider uppercase">
          📊 Admin Dashboard
        </h2>
        {unreadAlerts.length > 0 && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-signal-red/20 text-signal-red text-[10px] font-mono font-bold">
            <span className="animate-pulse">●</span>
            {unreadAlerts.length} Alert{unreadAlerts.length > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
        <div className="bg-signal-red/10 border border-signal-red/30 rounded-lg p-2.5">
          <div className="text-2xl font-bold text-signal-red font-mono">
            {stats.activeEmergencySessions}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">Active Emergencies</div>
        </div>
        <div className="bg-signal-yellow/10 border border-signal-yellow/30 rounded-lg p-2.5">
          <div className="text-2xl font-bold text-signal-yellow font-mono">
            {stats.pendingProofs}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">Pending Proofs</div>
        </div>
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-2.5">
          <div className="text-2xl font-bold text-primary font-mono">
            {stats.unverifiedCases}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">Unverified Cases</div>
        </div>
        <div className="bg-signal-green/10 border border-signal-green/30 rounded-lg p-2.5">
          <div className="text-2xl font-bold text-signal-green font-mono">
            {stats.totalAmbulancesActive}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">Active Ambulances</div>
        </div>
        <div className="bg-secondary/50 border border-border rounded-lg p-2.5">
          <div className="text-2xl font-bold text-foreground font-mono">
            {stats.todayViolations}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">Today's Violations</div>
        </div>
        <div className="bg-signal-red/10 border border-signal-red/30 rounded-lg p-2.5">
          <div className="text-2xl font-bold text-signal-red font-mono">
            {stats.misuseDetected}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">Misuse Detected</div>
        </div>
      </div>

      {/* Alerts Section */}
      {unreadAlerts.length > 0 && (
        <div className="mb-4 space-y-2">
          <h3 className="text-xs font-mono font-bold text-foreground uppercase tracking-wider">
            ⚠️ Active Alerts
          </h3>
          {unreadAlerts.map(alert => (
            <div 
              key={alert.id}
              className="bg-signal-yellow/10 border border-signal-yellow/30 rounded-md px-3 py-2 flex items-center gap-2"
            >
              <span className="text-sm">⚠️</span>
              <div className="flex-1">
                <div className="text-[10px] font-mono text-foreground">{alert.message}</div>
                <div className="text-[9px] font-mono text-muted-foreground">{formatTimeAgo(alert.timestamp)}</div>
              </div>
              <button className="text-[10px] font-mono text-primary hover:text-primary/80">
                View
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Violations Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-mono font-bold text-foreground uppercase tracking-wider">
            📋 Violations
          </h3>
          <div className="flex gap-1">
            {(['all', 'PENDING', 'CONDITIONAL_PENDING', 'VALIDATED', 'MISUSE'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-2 py-1 rounded text-[10px] font-mono transition-colors ${
                  filter === s 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-secondary text-muted-foreground hover:bg-muted'
                }`}
              >
                {s === 'all' ? 'All' : s.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Violations List */}
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {filteredViolations.length === 0 ? (
            <p className="text-[10px] font-mono text-muted-foreground text-center py-4">
              No violations found
            </p>
          ) : (
            filteredViolations.map(violation => (
              <div
                key={violation.id}
                onClick={() => setSelectedViolation(violation)}
                className={`rounded-lg px-3 py-2.5 border cursor-pointer transition-colors ${
                  selectedViolation?.id === violation.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-background/50 hover:bg-secondary/50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-base">{TYPE_ICONS[violation.type]}</span>
                  <span className="text-xs font-mono font-bold text-foreground">
                    {violation.driverName}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    ({violation.vehicleNumber})
                  </span>
                  <span className={`ml-auto px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${STATUS_COLORS[violation.status]}`}>
                    {violation.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
                  <span>{TYPE_LABELS[violation.type]}</span>
                  {violation.signalId && (
                    <span>Signal: {violation.signalId} ({violation.signalState})</span>
                  )}
                  <span className="ml-auto">{formatTimeAgo(violation.timestamp)}</span>
                </div>

                <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground mt-1">
                  <span>Speed: <span className={violation.speedAtViolation > violation.speedLimit ? 'text-signal-red' : 'text-foreground'}>{violation.speedAtViolation} km/h</span></span>
                  <span>Limit: {violation.speedLimit} km/h</span>
                  {violation.emergencyModeActive && (
                    <span className="px-1 py-0.5 rounded bg-signal-red/20 text-signal-red text-[9px]">
                      EMERGENCY MODE
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Selected Violation Details */}
        {selectedViolation && (
          <div className="mt-3 p-3 bg-secondary/30 rounded-lg border border-border">
            <h4 className="text-xs font-mono font-bold text-foreground mb-2">
              Violation Details
            </h4>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono mb-3">
              <div>
                <span className="text-muted-foreground">ID:</span>
                <span className="text-foreground ml-1">{selectedViolation.id}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Driver:</span>
                <span className="text-foreground ml-1">{selectedViolation.driverName}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Location:</span>
                <span className="text-foreground ml-1">
                  {selectedViolation.location.lat.toFixed(4)}, {selectedViolation.location.lng.toFixed(4)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Time:</span>
                <span className="text-foreground ml-1">{formatTime(selectedViolation.timestamp)}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => onUpdateStatus?.(selectedViolation.id, 'VALIDATED')}
                className="flex-1 px-3 py-1.5 rounded-md text-[10px] font-mono font-semibold bg-signal-green text-white hover:bg-signal-green/90 transition-colors"
              >
                ✅ Validate
              </button>
              <button
                onClick={() => onUpdateStatus?.(selectedViolation.id, 'MISUSE')}
                className="flex-1 px-3 py-1.5 rounded-md text-[10px] font-mono font-semibold bg-signal-red text-white hover:bg-signal-red/90 transition-colors"
              >
                ❌ Mark Misuse
              </button>
              <button
                onClick={() => onViewDetails?.(selectedViolation)}
                className="px-3 py-1.5 rounded-md text-[10px] font-mono font-semibold bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
              >
                View Map
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[9px] font-mono text-muted-foreground">
        <span>Last updated: {new Date().toLocaleTimeString()}</span>
        <button className="text-primary hover:text-primary/80">
          Download Report
        </button>
      </div>
    </div>
  );
}
