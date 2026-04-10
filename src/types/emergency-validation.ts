// ============================================
// Emergency Validation & Rule Violation Types
// ============================================

// Ambulance & Driver Information
export interface AmbulanceDriver {
  id: string;
  name: string;
  vehicleNumber: string;
  hospitalId: string;
  hospitalName: string;
  phone?: string;
  licenseNumber?: string;
  createdAt: string;
  lastLogin?: string;
}

export interface AmbulanceSession {
  id: string;
  driverId: string;
  driverName: string;
  vehicleNumber: string;
  hospitalName: string;
  loginTime: string;
  logoutTime?: string;
  isActive: boolean;
}

// Emergency Mode Tracking
export type EmergencyStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface EmergencySession {
  id: string;
  ambulanceId: string;
  driverId: string;
  driverName: string;
  vehicleNumber: string;
  hospitalName: string;
  startTime: string;
  endTime?: string;
  status: EmergencyStatus;
  startLocation: {
    lat: number;
    lng: number;
  };
  endLocation?: {
    lat: number;
    lng: number;
  };
  route: EmergencyRoutePoint[];
  signalsCrossed: string[];
  distanceTraveledKm: number;
  maxSpeedKmh: number;
  averageSpeedKmh: number;
}

export interface EmergencyRoutePoint {
  timestamp: string;
  lat: number;
  lng: number;
  speed: number;
  signalId?: string;
  signalState?: 'GREEN' | 'YELLOW' | 'RED';
}

// Rule Violation Detection
export type ViolationType = 'SIGNAL_BREAK' | 'OVERSPEED' | 'UNAUTHORIZED_PRIORITY';
export type ViolationStatus = 'PENDING' | 'VALIDATED' | 'MISUSE' | 'CONDITIONAL_PENDING';

export interface RuleViolation {
  id: string;
  ambulanceId: string;
  driverId: string;
  driverName: string;
  vehicleNumber: string;
  type: ViolationType;
  timestamp: string;
  location: {
    lat: number;
    lng: number;
  };
  speedAtViolation: number;
  speedLimit: number;
  signalId?: string;
  signalState?: 'GREEN' | 'YELLOW' | 'RED';
  emergencyModeActive: boolean;
  status: ViolationStatus;
  emergencySessionId?: string;
  notes?: string;
}

// Proof Submission
export type EmergencyType = 'CARDIAC' | 'ACCIDENT' | 'STROKE' | 'CHILD_BIRTH' | 'RESPIRATORY' | 'TRAUMA' | 'OTHER';
export type ProofStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface EmergencyProof {
  id: string;
  emergencySessionId: string;
  ambulanceId: string;
  driverId: string;
  driverName: string;
  vehicleNumber: string;
  submittedAt?: string;
  status: ProofStatus;
  
  // Patient Information
  patientName: string;
  patientAge?: number;
  patientGender?: 'MALE' | 'FEMALE' | 'OTHER';
  
  // Hospital Information
  hospitalName: string;
  hospitalLocation?: {
    lat: number;
    lng: number;
  };
  admissionTime: string;
  
  // Emergency Details
  emergencyType: EmergencyType;
  emergencyDescription?: string;
  
  // Documents
  documentUrls?: string[];
  
  // Timer & Verification
  proofDeadline: string;
  submittedWithinDeadline: boolean;
  
  // Admin Review
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  adminNotes?: string;
}

// Admin Dashboard Types
export interface AdminAlert {
  id: string;
  type: 'NO_PROOF_SUBMITTED' | 'PROOF_EXPIRED' | 'SUSPICIOUS_ACTIVITY' | 'MULTIPLE_VIOLATIONS';
  message: string;
  timestamp: string;
  relatedEntityId: string;
  entityType: 'EMERGENCY_SESSION' | 'VIOLATION' | 'PROOF';
  isRead: boolean;
  isResolved: boolean;
}

export interface DashboardStats {
  activeEmergencySessions: number;
  pendingProofs: number;
  unverifiedCases: number;
  misuseDetected: number;
  todayViolations: number;
  totalAmbulancesActive: number;
}

// Timer Configuration
export const PROOF_SUBMISSION_DEADLINE_HOURS = 8;
export const PROOF_WARNING_BEFORE_HOURS = 2; // Warn 2 hours before deadline

// Speed Limits (can be configured)
export const SPEED_LIMITS = {
  HIGHWAY: 80,
  CITY: 50,
  RESIDENTIAL: 30,
  HOSPITAL_ZONE: 20,
};

// Validation Result
export interface ValidationResult {
  isValid: boolean;
  confidence: number; // 0-100
  flags: string[];
  recommendations: string[];
}

// Route Matching for Smart Validation
export interface RouteMatchResult {
  reachedHospital: boolean;
  hospitalDistanceMeters: number;
  routeDeviationMeters: number;
  timeToReachMinutes: number;
}
