import { useState } from 'react';
import type { 
  EmergencySession, 
  EmergencyProof, 
  ProofStatus, 
  EmergencyType,
  ValidationResult,
  RouteMatchResult 
} from '@/types/emergency-validation';

// Mock data for demonstration
const MOCK_PROOFS: (EmergencyProof & { session: EmergencySession })[] = [
  {
    id: 'PRF-001',
    emergencySessionId: 'EMG-001',
    ambulanceId: 'AMB-MH-12-1234',
    driverId: 'DRV-001',
    driverName: 'John Smith',
    vehicleNumber: 'MH-12-1234',
    status: 'PENDING',
    patientName: 'Patient A',
    patientAge: 45,
    patientGender: 'MALE',
    hospitalName: 'City Hospital',
    admissionTime: new Date(Date.now() - 3600000).toISOString(),
    emergencyType: 'CARDIAC',
    emergencyDescription: 'Severe chest pain, suspected heart attack',
    proofDeadline: new Date(Date.now() + 3600000).toISOString(),
    submittedWithinDeadline: true,
    session: {
      id: 'EMG-001',
      ambulanceId: 'AMB-MH-12-1234',
      driverId: 'DRV-001',
      driverName: 'John Smith',
      vehicleNumber: 'MH-12-1234',
      hospitalName: 'City Hospital',
      startTime: new Date(Date.now() - 7200000).toISOString(),
      endTime: new Date(Date.now() - 3600000).toISOString(),
      status: 'COMPLETED',
      startLocation: { lat: 19.837, lng: 75.253 },
      endLocation: { lat: 19.845, lng: 75.260 },
      route: [],
      signalsCrossed: ['SIG-101', 'SIG-201'],
      distanceTraveledKm: 5.2,
      maxSpeedKmh: 78,
      averageSpeedKmh: 45,
    },
  },
  {
    id: 'PRF-002',
    emergencySessionId: 'EMG-002',
    ambulanceId: 'AMB-MH-12-5678',
    driverId: 'DRV-002',
    driverName: 'Jane Doe',
    vehicleNumber: 'MH-12-5678',
    status: 'EXPIRED',
    patientName: '',
    hospitalName: '',
    admissionTime: '',
    emergencyType: 'OTHER',
    proofDeadline: new Date(Date.now() - 3600000).toISOString(),
    submittedWithinDeadline: false,
    session: {
      id: 'EMG-002',
      ambulanceId: 'AMB-MH-12-5678',
      driverId: 'DRV-002',
      driverName: 'Jane Doe',
      vehicleNumber: 'MH-12-5678',
      hospitalName: 'General Hospital',
      startTime: new Date(Date.now() - 86400000).toISOString(),
      endTime: new Date(Date.now() - 82800000).toISOString(),
      status: 'COMPLETED',
      startLocation: { lat: 19.840, lng: 75.248 },
      endLocation: { lat: 19.850, lng: 75.255 },
      route: [],
      signalsCrossed: ['SIG-102'],
      distanceTraveledKm: 3.1,
      maxSpeedKmh: 65,
      averageSpeedKmh: 40,
    },
  },
];

interface EmergencyValidationPanelProps {
  proofs?: (EmergencyProof & { session: EmergencySession })[];
  onApprove?: (proofId: string, adminNotes?: string) => void;
  onReject?: (proofId: string, rejectionReason: string, adminNotes?: string) => void;
  onViewRoute?: (session: EmergencySession) => void;
}

const STATUS_COLORS: Record<ProofStatus, string> = {
  PENDING: 'bg-signal-yellow/20 text-signal-yellow border-signal-yellow/30',
  APPROVED: 'bg-signal-green/20 text-signal-green border-signal-green/30',
  REJECTED: 'bg-signal-red/20 text-signal-red border-signal-red/30',
  EXPIRED: 'bg-muted/20 text-muted-foreground border-border',
};

const EMERGENCY_TYPE_ICONS: Record<EmergencyType, string> = {
  CARDIAC: '🫀',
  ACCIDENT: '🚗',
  STROKE: '🧠',
  CHILD_BIRTH: '👶',
  RESPIRATORY: '🫁',
  TRAUMA: '🩹',
  OTHER: '📋',
};

function formatDateTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(startTime: string, endTime?: string): string {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  const diffMs = end - start;
  const mins = Math.floor(diffMs / 60000);
  const secs = Math.floor((diffMs % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

// Smart validation simulation
function performSmartValidation(proof: EmergencyProof, session: EmergencySession): ValidationResult {
  const flags: string[] = [];
  const recommendations: string[] = [];
  let confidence = 50;

  // Check if proof was submitted on time
  if (proof.submittedWithinDeadline) {
    confidence += 20;
  } else {
    flags.push('Proof submitted after deadline');
    confidence -= 20;
  }

  // Check if hospital matches
  if (proof.hospitalName.toLowerCase().includes(session.hospitalName.toLowerCase())) {
    confidence += 15;
  } else {
    flags.push('Hospital name mismatch');
    recommendations.push('Verify hospital destination');
  }

  // Check if route makes sense
  if (session.distanceTraveledKm > 0.5 && session.distanceTraveledKm < 50) {
    confidence += 10;
  } else if (session.distanceTraveledKm < 0.5) {
    flags.push('Very short emergency distance');
    recommendations.push('Verify emergency was genuine');
  }

  // Check speed patterns
  if (session.maxSpeedKmh < 120 && session.averageSpeedKmh > 20) {
    confidence += 10;
  } else if (session.maxSpeedKmh > 100) {
    flags.push('High speed detected');
    recommendations.push('Review speed data');
  }

  // Check signals crossed
  if (session.signalsCrossed.length > 0) {
    confidence += 5;
  }

  return {
    isValid: confidence >= 60,
    confidence: Math.min(100, Math.max(0, confidence)),
    flags,
    recommendations,
  };
}

export default function EmergencyValidationPanel({
  proofs = MOCK_PROOFS,
  onApprove,
  onReject,
  onViewRoute,
}: EmergencyValidationPanelProps) {
  const [filter, setFilter] = useState<'all' | ProofStatus>('all');
  const [selectedProof, setSelectedProof] = useState<(EmergencyProof & { session: EmergencySession }) | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  const filteredProofs = filter === 'all' ? proofs : proofs.filter(p => p.status === filter);

  const handleApprove = () => {
    if (selectedProof) {
      onApprove?.(selectedProof.id, adminNotes);
      setSelectedProof(null);
      setAdminNotes('');
    }
  };

  const handleReject = () => {
    if (selectedProof && rejectionReason.trim()) {
      onReject?.(selectedProof.id, rejectionReason, adminNotes);
      setSelectedProof(null);
      setRejectionReason('');
      setAdminNotes('');
      setShowRejectModal(false);
    }
  };

  const validation = selectedProof ? performSmartValidation(selectedProof, selectedProof.session) : null;

  return (
    <div className="bg-card rounded-lg border border-border p-3 md:p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-mono font-bold text-foreground tracking-wider uppercase">
          ✅ Emergency Validation
        </h2>
        <div className="flex gap-1">
          {(['all', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-2 py-1 rounded text-[10px] font-mono transition-colors ${
                filter === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:bg-muted'
              }`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="bg-signal-yellow/10 border border-signal-yellow/30 rounded-md p-2 text-center">
          <div className="text-lg font-bold text-signal-yellow font-mono">
            {proofs.filter(p => p.status === 'PENDING').length}
          </div>
          <div className="text-[9px] font-mono text-muted-foreground">Pending</div>
        </div>
        <div className="bg-signal-green/10 border border-signal-green/30 rounded-md p-2 text-center">
          <div className="text-lg font-bold text-signal-green font-mono">
            {proofs.filter(p => p.status === 'APPROVED').length}
          </div>
          <div className="text-[9px] font-mono text-muted-foreground">Approved</div>
        </div>
        <div className="bg-signal-red/10 border border-signal-red/30 rounded-md p-2 text-center">
          <div className="text-lg font-bold text-signal-red font-mono">
            {proofs.filter(p => p.status === 'REJECTED').length}
          </div>
          <div className="text-[9px] font-mono text-muted-foreground">Rejected</div>
        </div>
        <div className="bg-muted/20 border border-border rounded-md p-2 text-center">
          <div className="text-lg font-bold text-muted-foreground font-mono">
            {proofs.filter(p => p.status === 'EXPIRED').length}
          </div>
          <div className="text-[9px] font-mono text-muted-foreground">Expired</div>
        </div>
      </div>

      {/* Proof List */}
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {filteredProofs.length === 0 ? (
          <p className="text-[10px] font-mono text-muted-foreground text-center py-4">
            No proofs found
          </p>
        ) : (
          filteredProofs.map(proof => (
            <div
              key={proof.id}
              onClick={() => setSelectedProof(proof)}
              className={`rounded-lg px-3 py-2.5 border cursor-pointer transition-colors ${
                selectedProof?.id === proof.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-background/50 hover:bg-secondary/50'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">{EMERGENCY_TYPE_ICONS[proof.emergencyType]}</span>
                <span className="text-xs font-mono font-bold text-foreground">
                  {proof.driverName}
                </span>
                <span className={`ml-auto px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${STATUS_COLORS[proof.status]}`}>
                  {proof.status}
                </span>
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">
                Session: {proof.emergencySessionId} • {proof.submittedWithinDeadline ? '✓ On time' : '⚠ Late submission'}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Selected Proof Details */}
      {selectedProof && (
        <div className="mt-4 space-y-3">
          <div className="bg-secondary/30 rounded-lg border border-border p-3">
            <h4 className="text-xs font-mono font-bold text-foreground mb-3">
              Session Details
            </h4>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
              <div>
                <span className="text-muted-foreground">Session ID:</span>
                <span className="text-foreground ml-1">{selectedProof.session.id}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Driver:</span>
                <span className="text-foreground ml-1">{selectedProof.driverName}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Vehicle:</span>
                <span className="text-foreground ml-1">{selectedProof.vehicleNumber}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Duration:</span>
                <span className="text-foreground ml-1">
                  {formatDuration(selectedProof.session.startTime, selectedProof.session.endTime)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Distance:</span>
                <span className="text-foreground ml-1">{selectedProof.session.distanceTraveledKm.toFixed(1)} km</span>
              </div>
              <div>
                <span className="text-muted-foreground">Max Speed:</span>
                <span className="text-foreground ml-1">{selectedProof.session.maxSpeedKmh} km/h</span>
              </div>
              <div>
                <span className="text-muted-foreground">Signals:</span>
                <span className="text-foreground ml-1">{selectedProof.session.signalsCrossed.length} crossed</span>
              </div>
              <div>
                <span className="text-muted-foreground">Hospital:</span>
                <span className="text-foreground ml-1">{selectedProof.session.hospitalName}</span>
              </div>
            </div>
          </div>

          {/* Proof Details (if submitted) */}
          {selectedProof.status !== 'EXPIRED' && selectedProof.patientName && (
            <div className="bg-secondary/30 rounded-lg border border-border p-3">
              <h4 className="text-xs font-mono font-bold text-foreground mb-3">
                Proof Details
              </h4>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                <div>
                  <span className="text-muted-foreground">Patient:</span>
                  <span className="text-foreground ml-1">{selectedProof.patientName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Age/Gender:</span>
                  <span className="text-foreground ml-1">
                    {selectedProof.patientAge || '-'} / {selectedProof.patientGender || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Hospital:</span>
                  <span className="text-foreground ml-1">{selectedProof.hospitalName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Admission:</span>
                  <span className="text-foreground ml-1">{formatDateTime(selectedProof.admissionTime)}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Type:</span>
                  <span className="text-foreground ml-1">
                    {EMERGENCY_TYPE_ICONS[selectedProof.emergencyType]} {selectedProof.emergencyType}
                  </span>
                </div>
                {selectedProof.emergencyDescription && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Description:</span>
                    <p className="text-foreground mt-1">{selectedProof.emergencyDescription}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Smart Validation */}
          {validation && (
            <div className={`rounded-lg border p-3 ${
              validation.isValid 
                ? 'bg-signal-green/10 border-signal-green/30' 
                : 'bg-signal-yellow/10 border-signal-yellow/30'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-mono font-bold text-foreground">
                  🧠 Smart Validation
                </h4>
                <span className={`text-sm font-bold font-mono ${
                  validation.confidence >= 70 ? 'text-signal-green' : 
                  validation.confidence >= 50 ? 'text-signal-yellow' : 'text-signal-red'
                }`}>
                  {validation.confidence}% confidence
                </span>
              </div>
              
              {validation.flags.length > 0 && (
                <div className="mb-2">
                  <span className="text-[10px] font-mono text-muted-foreground">Flags:</span>
                  <ul className="text-[10px] font-mono text-signal-yellow ml-2">
                    {validation.flags.map((flag, i) => (
                      <li key={i}>• {flag}</li>
                    ))}
                  </ul>
                </div>
              )}

              {validation.recommendations.length > 0 && (
                <div>
                  <span className="text-[10px] font-mono text-muted-foreground">Recommendations:</span>
                  <ul className="text-[10px] font-mono text-primary ml-2">
                    {validation.recommendations.map((rec, i) => (
                      <li key={i}>• {rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Admin Notes */}
          <div>
            <label className="block text-[10px] font-mono text-muted-foreground mb-1">
              Admin Notes
            </label>
            <textarea
              value={adminNotes}
              onChange={e => setAdminNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-md text-xs font-mono bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              rows={2}
              placeholder="Add notes for this case..."
            />
          </div>

          {/* Action Buttons */}
          {selectedProof.status === 'PENDING' && (
            <div className="flex gap-2">
              <button
                onClick={handleApprove}
                className="flex-1 px-3 py-2 rounded-md text-xs font-mono font-bold bg-signal-green text-white hover:bg-signal-green/90 transition-colors"
              >
                ✅ Approve as Valid Emergency
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                className="flex-1 px-3 py-2 rounded-md text-xs font-mono font-bold bg-signal-red text-white hover:bg-signal-red/90 transition-colors"
              >
                ❌ Reject as Misuse
              </button>
            </div>
          )}

          {selectedProof.status === 'EXPIRED' && (
            <div className="bg-signal-red/10 border border-signal-red/30 rounded-md p-3">
              <p className="text-xs font-mono text-signal-red">
                ⚠️ No proof submitted within 8-hour deadline. This case is automatically marked as potential misuse.
              </p>
            </div>
          )}

          {/* View Route Button */}
          <button
            onClick={() => onViewRoute?.(selectedProof.session)}
            className="w-full px-3 py-2 rounded-md text-xs font-mono font-semibold bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
          >
            🗺️ View Route Timeline
          </button>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-lg border border-border w-full max-w-sm m-4 p-4">
            <h3 className="text-sm font-mono font-bold text-foreground mb-3">
              Reject Proof
            </h3>
            <div className="mb-3">
              <label className="block text-[10px] font-mono text-muted-foreground mb-1">
                Rejection Reason *
              </label>
              <textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                className="w-full px-3 py-2 rounded-md text-xs font-mono bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                rows={3}
                placeholder="Explain why this is being rejected..."
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowRejectModal(false)}
                className="flex-1 px-3 py-2 rounded-md text-xs font-mono font-semibold bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectionReason.trim()}
                className="flex-1 px-3 py-2 rounded-md text-xs font-mono font-bold bg-signal-red text-white hover:bg-signal-red/90 transition-colors disabled:opacity-50"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
