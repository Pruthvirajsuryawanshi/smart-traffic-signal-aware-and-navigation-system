import { useState } from 'react';
import type { 
  EmergencySession, 
  EmergencyProof, 
  ProofStatus, 
  EmergencyType,
  ValidationResult,
  RouteMatchResult 
} from '@/types/emergency-validation';

interface EmergencyValidationPanelProps {
  proofs?: (EmergencyProof & { session: EmergencySession | null })[];
  onApprove?: (proofId: string, adminNotes?: string) => void;
  onReject?: (proofId: string, rejectionReason: string, adminNotes?: string) => void;
  onViewRoute?: (session: EmergencySession) => void;
  /** Callback when proof status is updated */
  onStatusUpdate?: (proofId: string, status: ProofStatus) => void;
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
  let confidence = 30; // Start lower, earn trust

  // 1. Proof submission timeliness (+20 / -25)
  if (proof.submittedWithinDeadline) {
    confidence += 20;
  } else {
    flags.push('⏰ Proof submitted after 8-hour deadline');
    confidence -= 25;
    recommendations.push('Investigate reason for late submission');
  }

  // 2. Hospital destination match (+15 / -10)
  if (proof.hospitalName && session.hospitalName) {
    const proofHosp = proof.hospitalName.toLowerCase().trim();
    const sessHosp = session.hospitalName.toLowerCase().trim();
    if (proofHosp === sessHosp || proofHosp.includes(sessHosp) || sessHosp.includes(proofHosp)) {
      confidence += 15;
    } else {
      flags.push('🏥 Hospital name mismatch between proof and session');
      confidence -= 10;
      recommendations.push('Cross-verify hospital admission records');
    }
  } else if (!proof.hospitalName) {
    flags.push('🏥 No hospital name provided in proof');
    confidence -= 5;
  }

  // 3. Route distance analysis (+15 / -15)
  if (session.distanceTraveledKm >= 0.5 && session.distanceTraveledKm <= 50) {
    confidence += 15;
  } else if (session.distanceTraveledKm < 0.5) {
    flags.push('📍 Suspiciously short distance (<500m)');
    confidence -= 15;
    recommendations.push('Verify emergency was genuine — possible false activation');
  } else if (session.distanceTraveledKm > 50) {
    flags.push('📍 Unusually long distance (>50km)');
    confidence -= 5;
    recommendations.push('Check if route deviation occurred');
  }

  // 4. Speed pattern analysis (+10 / -10)
  if (session.averageSpeedKmh >= 15 && session.averageSpeedKmh <= 80) {
    confidence += 10;
  } else if (session.averageSpeedKmh < 15) {
    flags.push('🐌 Very low average speed — possible non-emergency use');
    confidence -= 10;
    recommendations.push('Review if emergency priority was needed');
  }
  
  if (session.maxSpeedKmh > 120) {
    flags.push('⚡ Dangerously high speed detected (>120 km/h)');
    confidence -= 10;
    recommendations.push('Issue speed violation warning');
  } else if (session.maxSpeedKmh > 80 && session.maxSpeedKmh <= 120) {
    // High but acceptable for emergency
    confidence += 5;
  }

  // 5. Signal crossing analysis (+10 / -5)
  if (session.signalsCrossed.length > 0) {
    confidence += 10;
    // Check for duplicate signal crossings (looping behavior)
    const uniqueSignals = new Set(session.signalsCrossed);
    const duplicateRatio = 1 - (uniqueSignals.size / session.signalsCrossed.length);
    if (duplicateRatio > 0.5 && session.signalsCrossed.length > 4) {
      flags.push('🔁 Repeated signal crossings detected — possible circling');
      confidence -= 10;
      recommendations.push('Investigate route for circular patterns');
    }
  } else if (session.distanceTraveledKm > 1) {
    flags.push('🚦 No signals crossed despite significant distance');
    confidence -= 5;
  }

  // 6. Emergency duration analysis (+5 / -5)
  if (session.startTime && session.endTime) {
    const durationMs = new Date(session.endTime).getTime() - new Date(session.startTime).getTime();
    const durationMin = durationMs / 60000;
    if (durationMin < 1) {
      flags.push('⏱ Emergency lasted less than 1 minute');
      confidence -= 15;
      recommendations.push('Very short session — likely false activation');
    } else if (durationMin >= 2 && durationMin <= 60) {
      confidence += 5;
    } else if (durationMin > 120) {
      flags.push('⏱ Emergency lasted over 2 hours');
      confidence -= 5;
      recommendations.push('Verify extended emergency duration');
    }
  }

  // 7. Document verification (+10)
  if (proof.documentUrls && proof.documentUrls.length > 0) {
    confidence += 10;
    if (proof.documentUrls.length >= 2) {
      confidence += 5; // Multiple documents = stronger proof
    }
  } else {
    flags.push('📄 No supporting documents uploaded');
    confidence -= 5;
    recommendations.push('Request supporting documentation');
  }

  // 8. Route point density check
  if (session.route && session.route.length > 0) {
    const pointsPerKm = session.distanceTraveledKm > 0 
      ? session.route.length / session.distanceTraveledKm 
      : 0;
    if (pointsPerKm < 2 && session.distanceTraveledKm > 1) {
      flags.push('📡 Low GPS tracking density — possible tracking gap');
      recommendations.push('Check for GPS signal issues during emergency');
    }
  }

  const finalConfidence = Math.min(100, Math.max(0, confidence));

  return {
    isValid: finalConfidence >= 55,
    confidence: finalConfidence,
    flags,
    recommendations,
  };
}

export default function EmergencyValidationPanel({
  proofs = [],
  onApprove,
  onReject,
  onViewRoute,
  onStatusUpdate,
}: EmergencyValidationPanelProps) {
  const [filter, setFilter] = useState<'all' | ProofStatus>('all');
  const [selectedProof, setSelectedProof] = useState<(EmergencyProof & { session: EmergencySession }) | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  const filteredProofs = filter === 'all' ? proofs : proofs.filter(p => p.status === filter);

  const handleApprove = () => {
    if (selectedProof) {
      // Update proof status in localStorage
      const submittedProofs = JSON.parse(localStorage.getItem('submitted_proofs') || '[]');
      const proofIndex = submittedProofs.findIndex((p: any) => p.id === selectedProof.id);
      if (proofIndex >= 0) {
        submittedProofs[proofIndex].status = 'APPROVED';
        submittedProofs[proofIndex].reviewedBy = 'admin';
        submittedProofs[proofIndex].reviewedAt = new Date().toISOString();
        submittedProofs[proofIndex].adminNotes = adminNotes;
        localStorage.setItem('submitted_proofs', JSON.stringify(submittedProofs));
      }

      // Notify parent component
      onStatusUpdate?.(selectedProof.id, 'APPROVED');
      onApprove?.(selectedProof.id, adminNotes);
      
      // Clear selection
      setSelectedProof(null);
      setAdminNotes('');
      
      console.log('[EmergencyValidation] Proof approved:', selectedProof.id);
    }
  };

  const handleReject = () => {
    if (selectedProof && rejectionReason.trim()) {
      // Update proof status in localStorage
      const submittedProofs = JSON.parse(localStorage.getItem('submitted_proofs') || '[]');
      const proofIndex = submittedProofs.findIndex((p: any) => p.id === selectedProof.id);
      if (proofIndex >= 0) {
        submittedProofs[proofIndex].status = 'REJECTED';
        submittedProofs[proofIndex].reviewedBy = 'admin';
        submittedProofs[proofIndex].reviewedAt = new Date().toISOString();
        submittedProofs[proofIndex].rejectionReason = rejectionReason;
        submittedProofs[proofIndex].adminNotes = adminNotes;
        localStorage.setItem('submitted_proofs', JSON.stringify(submittedProofs));
      }

      // Notify parent component
      onStatusUpdate?.(selectedProof.id, 'REJECTED');
      onReject?.(selectedProof.id, rejectionReason, adminNotes);
      
      // Clear selection
      setSelectedProof(null);
      setRejectionReason('');
      setAdminNotes('');
      setShowRejectModal(false);
      
      console.log('[EmergencyValidation] Proof rejected:', selectedProof.id);
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
          {/* Session Details */}
          <div className="bg-secondary/30 rounded-lg border border-border p-3">
            <h4 className="text-xs font-mono font-bold text-foreground mb-3 flex items-center gap-2">
              📊 Session Details
            </h4>
            <div className="space-y-3">
              {/* Primary Info */}
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                <div className="bg-background/50 rounded p-2">
                  <span className="text-muted-foreground block text-[9px] mb-1">Session ID</span>
                  <span className="text-foreground font-bold text-[11px]">{selectedProof.session?.id || selectedProof.emergencySessionId}</span>
                </div>
                <div className="bg-background/50 rounded p-2">
                  <span className="text-muted-foreground block text-[9px] mb-1">Status</span>
                  <span className={`font-bold text-[11px] ${
                    selectedProof.status === 'APPROVED' ? 'text-signal-green' : 
                    selectedProof.status === 'REJECTED' ? 'text-signal-red' :
                    selectedProof.status === 'EXPIRED' ? 'text-muted-foreground' : 'text-signal-yellow'
                  }`}>
                    {selectedProof.status}
                  </span>
                </div>
              </div>

              {/* Driver & Vehicle Info */}
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                <div className="bg-background/50 rounded p-2">
                  <span className="text-muted-foreground block text-[9px] mb-1">Driver Name</span>
                  <span className="text-foreground font-semibold">{selectedProof.driverName}</span>
                </div>
                <div className="bg-background/50 rounded p-2">
                  <span className="text-muted-foreground block text-[9px] mb-1">Vehicle Number</span>
                  <span className="text-foreground font-semibold">{selectedProof.vehicleNumber}</span>
                </div>
              </div>

              {/* Session Timing */}
              {selectedProof.session && (
                <div className="bg-background/50 rounded p-2 text-[10px] font-mono">
                  <span className="text-muted-foreground block text-[9px] mb-2">Session Timeline</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-muted-foreground text-[9px]">Start:</span>
                      <div className="text-foreground font-semibold">{new Date(selectedProof.session.startTime).toLocaleString()}</div>
                    </div>
                    {selectedProof.session.endTime && (
                      <div>
                        <span className="text-muted-foreground text-[9px]">End:</span>
                        <div className="text-foreground font-semibold">{new Date(selectedProof.session.endTime).toLocaleString()}</div>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 pt-2 border-t border-border">
                    <span className="text-muted-foreground text-[9px]">Duration:</span>
                    <span className="text-foreground font-bold ml-1">
                      {formatDuration(selectedProof.session.startTime, selectedProof.session.endTime)}
                    </span>
                  </div>
                </div>
              )}

              {/* Route & Performance Data */}
              {selectedProof.session && (
                <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                  <div className="bg-background/50 rounded p-2">
                    <span className="text-muted-foreground block text-[9px] mb-1">Distance</span>
                    <span className="text-foreground font-bold text-sm">{selectedProof.session.distanceTraveledKm.toFixed(2)} km</span>
                  </div>
                  <div className="bg-background/50 rounded p-2">
                    <span className="text-muted-foreground block text-[9px] mb-1">Max Speed</span>
                    <span className={`font-bold text-sm ${
                      selectedProof.session.maxSpeedKmh > 100 ? 'text-signal-red' : 'text-foreground'
                    }`}>
                      {selectedProof.session.maxSpeedKmh} km/h
                    </span>
                  </div>
                  <div className="bg-background/50 rounded p-2">
                    <span className="text-muted-foreground block text-[9px] mb-1">Avg Speed</span>
                    <span className="text-foreground font-bold text-sm">{selectedProof.session.averageSpeedKmh} km/h</span>
                  </div>
                </div>
              )}

              {/* Signals Crossed */}
              {selectedProof.session && selectedProof.session.signalsCrossed.length > 0 && (
                <div className="bg-background/50 rounded p-2 text-[10px] font-mono">
                  <span className="text-muted-foreground block text-[9px] mb-2">Signals Crossed ({selectedProof.session.signalsCrossed.length})</span>
                  <div className="flex flex-wrap gap-1">
                    {selectedProof.session.signalsCrossed.map((signalId, idx) => (
                      <span key={idx} className="bg-primary/10 text-primary px-2 py-0.5 rounded text-[9px] font-bold">
                        {signalId}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Hospital Destination */}
              {selectedProof.session?.hospitalName && (
                <div className="bg-background/50 rounded p-2 text-[10px] font-mono">
                  <span className="text-muted-foreground block text-[9px] mb-1">Destination Hospital</span>
                  <span className="text-foreground font-semibold">{selectedProof.session.hospitalName}</span>
                </div>
              )}

              {/* Proof Submission Time */}
              {selectedProof.submittedAt && (
                <div className="bg-background/50 rounded p-2 text-[10px] font-mono">
                  <span className="text-muted-foreground block text-[9px] mb-1">Proof Submitted At</span>
                  <span className="text-foreground font-semibold">{new Date(selectedProof.submittedAt).toLocaleString()}</span>
                  {selectedProof.submittedWithinDeadline && (
                    <span className="text-signal-green text-[9px] ml-2">✓ Within deadline</span>
                  )}
                  {!selectedProof.submittedWithinDeadline && (
                    <span className="text-signal-red text-[9px] ml-2">✗ Late submission</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Proof Details & Documents */}
          {selectedProof.status !== 'EXPIRED' && selectedProof.documentUrls && selectedProof.documentUrls.length > 0 && (
            <div className="bg-secondary/30 rounded-lg border border-border p-3">
              <h4 className="text-xs font-mono font-bold text-foreground mb-3">
                📄 Uploaded Documents ({selectedProof.documentUrls.length})
              </h4>
              
              <div className="space-y-3">
                {selectedProof.documentUrls.map((docUrl, index) => {
                  // Detect file type from data URL or filename
                  const isImage = docUrl.startsWith('data:image/');
                  const isPDF = docUrl.startsWith('data:application/pdf') || docUrl.includes('.pdf');
                  
                  // Extract filename from data URL if possible
                  let fileName = `Document ${index + 1}`;
                  if (docUrl.includes('name=')) {
                    const match = docUrl.match(/name=([^;]+)/);
                    if (match) fileName = decodeURIComponent(match[1]);
                  } else if (isImage) {
                    const mimeMatch = docUrl.match(/data:image\/(\w+)/);
                    if (mimeMatch) fileName = `image_${index + 1}.${mimeMatch[1]}`;
                  } else if (isPDF) {
                    fileName = `document_${index + 1}.pdf`;
                  }
                  
                  return (
                    <div key={index} className="bg-background/50 rounded-md border border-border overflow-hidden">
                      {/* Document Header */}
                      <div className="flex items-center gap-2 p-2 border-b border-border">
                        <span className="text-lg">
                          {isImage ? '🖼️' : isPDF ? '📕' : '📄'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-mono font-bold text-foreground truncate">
                            {fileName}
                          </div>
                          <div className="text-[9px] font-mono text-muted-foreground">
                            {isImage ? 'Image' : isPDF ? 'PDF Document' : 'File'} • Document {index + 1}
                          </div>
                        </div>
                      </div>
                      
                      {/* Image Preview */}
                      {isImage && (
                        <div className="p-2">
                          <div className="rounded-md overflow-hidden border border-border bg-muted">
                            <img 
                              src={docUrl} 
                              alt={`Document ${index + 1}`}
                              className="w-full h-auto max-h-96 object-contain"
                            />
                          </div>
                        </div>
                      )}
                      
                      {/* PDF Preview */}
                      {isPDF && (
                        <div className="p-2">
                          <div className="rounded-md overflow-hidden border border-border" style={{ height: '500px' }}>
                            <iframe
                              src={docUrl}
                              className="w-full h-full"
                              title={`PDF Document ${index + 1}`}
                              style={{ border: 'none' }}
                            />
                          </div>
                          <div className="mt-2 text-center">
                            <a
                              href={docUrl}
                              download={fileName}
                              className="text-[10px] font-mono text-primary hover:underline"
                            >
                              📥 Download PDF
                            </a>
                          </div>
                        </div>
                      )}
                      
                      {/* Unknown file type */}
                      {!isImage && !isPDF && (
                        <div className="p-4 text-center text-[10px] font-mono text-muted-foreground">
                          <div className="text-2xl mb-2">📄</div>
                          <div>File preview not available</div>
                          <a
                            href={docUrl}
                            download={fileName}
                            className="text-primary hover:underline mt-2 inline-block"
                          >
                            📥 Download File
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              
              <div className="mt-3 bg-primary/5 border border-primary/20 rounded-md p-2">
                <div className="text-[9px] font-mono text-muted-foreground">
                  <span className="text-primary font-bold">ℹ️ Admin Note:</span> Verify these documents match the emergency session details below. Check dates, hospital names, and patient information for consistency.
                </div>
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

          {/* Review Details (if already reviewed) */}
          {selectedProof.status === 'APPROVED' && selectedProof.reviewedAt && (
            <div className="bg-signal-green/10 border border-signal-green/30 rounded-md p-3">
              <h4 className="text-[10px] font-mono font-bold text-signal-green mb-2">
                ✅ APPROVED
              </h4>
              <div className="text-[10px] font-mono text-muted-foreground space-y-1">
                <div>Reviewed at: <span className="text-foreground">{new Date(selectedProof.reviewedAt).toLocaleString()}</span></div>
                {selectedProof.reviewedBy && (
                  <div>Reviewed by: <span className="text-foreground">{selectedProof.reviewedBy}</span></div>
                )}
                {selectedProof.adminNotes && (
                  <div>Notes: <span className="text-foreground">{selectedProof.adminNotes}</span></div>
                )}
              </div>
            </div>
          )}

          {selectedProof.status === 'REJECTED' && selectedProof.reviewedAt && (
            <div className="bg-signal-red/10 border border-signal-red/30 rounded-md p-3">
              <h4 className="text-[10px] font-mono font-bold text-signal-red mb-2">
                ❌ REJECTED
              </h4>
              <div className="text-[10px] font-mono text-muted-foreground space-y-1">
                <div>Reviewed at: <span className="text-foreground">{new Date(selectedProof.reviewedAt).toLocaleString()}</span></div>
                {selectedProof.reviewedBy && (
                  <div>Reviewed by: <span className="text-foreground">{selectedProof.reviewedBy}</span></div>
                )}
                {selectedProof.rejectionReason && (
                  <div>Reason: <span className="text-signal-red font-semibold">{selectedProof.rejectionReason}</span></div>
                )}
                {selectedProof.adminNotes && (
                  <div>Notes: <span className="text-foreground">{selectedProof.adminNotes}</span></div>
                )}
              </div>
            </div>
          )}

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
