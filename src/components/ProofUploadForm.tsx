import { useState, useRef } from 'react';
import type { EmergencyProof, EmergencySession } from '@/types/emergency-validation';

interface ProofUploadFormProps {
  /** The emergency session to submit proof for */
  session: EmergencySession;
  /** Callback when proof is submitted */
  onSubmit: (proof: Omit<EmergencyProof, 'id' | 'submittedAt' | 'status'>) => void;
  /** Callback to close the form */
  onClose: () => void;
  /** Deadline remaining in seconds */
  deadlineRemaining?: number;
}

export default function ProofUploadForm({
  session,
  onSubmit,
  onClose,
  deadlineRemaining,
}: ProofUploadFormProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  
  // Form state - simplified to only documents
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Calculate deadline status
  const getDeadlineStatus = () => {
    if (!deadlineRemaining) return { color: 'text-muted-foreground', text: 'No deadline' };
    if (deadlineRemaining < 3600) return { color: 'text-signal-red', text: 'URGENT - Less than 1 hour!' };
    if (deadlineRemaining < 7200) return { color: 'text-signal-yellow', text: 'Warning - Less than 2 hours' };
    return { color: 'text-signal-green', text: `${Math.floor(deadlineRemaining / 3600)} hours remaining` };
  };

  const deadlineStatus = getDeadlineStatus();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setDocumentFiles(prev => [...prev, ...files]);
  };

  const removeFile = (index: number) => {
    setDocumentFiles(prev => prev.filter((_, i) => i !== index));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (documentFiles.length === 0) {
      newErrors.documents = 'At least one document is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setIsSubmitting(true);

    // Convert files to data URLs for storage and viewing
    const documentDataUrls: string[] = [];
    
    for (const file of documentFiles) {
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        documentDataUrls.push(dataUrl);
      } catch (error) {
        console.error('Error reading file:', file.name, error);
      }
    }

    // Simulate file upload delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    const proof: Omit<EmergencyProof, 'id' | 'submittedAt' | 'status'> = {
      emergencySessionId: session.id,
      ambulanceId: session.ambulanceId,
      driverId: session.driverId,
      driverName: session.driverName,
      vehicleNumber: session.vehicleNumber,
      patientName: '',
      hospitalName: session.hospitalName || '',
      admissionTime: new Date().toISOString(),
      emergencyType: 'OTHER',
      documentUrls: documentDataUrls, // Store actual data URLs for viewing
      proofDeadline: new Date(Date.now() + (deadlineRemaining || 0) * 1000).toISOString(),
      submittedWithinDeadline: (deadlineRemaining || 0) > 0,
    };

    onSubmit(proof);
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-lg border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto m-4">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-mono font-bold text-foreground">
            📋 Submit Emergency Proof
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Deadline Warning */}
        <div className="px-4 py-2 bg-secondary/50 border-b border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-muted-foreground">
              Session: {session.id}
            </span>
            <span className={`text-xs font-mono font-bold ${deadlineStatus.color}`}>
              {deadlineStatus.text}
            </span>
          </div>
        </div>

        {/* Form */}
        <div className="p-4 space-y-4">
          {/* Document Upload */}
          <div className="space-y-3">
            <h3 className="text-xs font-mono font-bold text-foreground uppercase tracking-wider">
              Supporting Documents *
            </h3>

            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,.pdf"
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              onClick={() => fileRef.current?.click()}
              className="w-full px-3 py-3 rounded-md text-xs font-mono bg-secondary text-secondary-foreground hover:bg-muted transition-colors border-2 border-dashed border-border"
            >
              📎 Click to upload documents
              <span className="block text-[10px] text-muted-foreground mt-1">
                (Prescription, Report, Images, PDF)
              </span>
            </button>

            {errors.documents && (
              <p className="text-[10px] font-mono text-signal-red">{errors.documents}</p>
            )}

            {documentFiles.length > 0 && (
              <div className="space-y-1">
                {documentFiles.map((file, index) => (
                  <div key={index} className="flex items-center gap-2 bg-secondary/50 rounded px-2 py-1">
                    <span className="text-[10px] font-mono text-foreground truncate flex-1">
                      📄 {file.name}
                    </span>
                    <button
                      onClick={() => removeFile(index)}
                      className="text-[10px] text-signal-red hover:text-signal-red/80"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Session Summary */}
          <div className="bg-secondary/30 rounded-md px-3 py-2 border border-border/50">
            <h4 className="text-[10px] font-mono font-bold text-foreground mb-2">
              Session Summary
            </h4>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-muted-foreground">
              <div>Start: <span className="text-foreground">{new Date(session.startTime).toLocaleString()}</span></div>
              <div>Duration: <span className="text-foreground">{session.distanceTraveledKm.toFixed(1)} km</span></div>
              <div>Signals: <span className="text-foreground">{session.signalsCrossed.length} crossed</span></div>
              <div>Max Speed: <span className="text-foreground">{session.maxSpeedKmh} km/h</span></div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-3 py-2 rounded-md text-xs font-mono font-semibold bg-secondary text-secondary-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 px-3 py-2 rounded-md text-xs font-mono font-bold bg-signal-green text-white hover:bg-signal-green/90 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Proof'}
            </button>
          </div>

          {/* Warning */}
          <p className="text-[9px] font-mono text-muted-foreground text-center">
            ⚠️ False or misleading information may result in disciplinary action.
          </p>
        </div>
      </div>
    </div>
  );
}
