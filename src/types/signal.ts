export type SignalState = 'RED' | 'GREEN' | 'YELLOW';

export interface TrafficSignal {
  id: string;
  latitude: number;
  longitude: number;
  state: SignalState;
  updated_at: string;
  roadName?: string;
  type?: 'highway' | 'side';
  intersection?: string;
}

export interface SignalRuntime {
  elapsed: number;
  cycle: CycleDurations;
  state: SignalState;
}

export interface CycleDurations {
  GREEN: number;
  YELLOW: number;
  RED: number;
}

export interface RouteSignalInfo {
  signal: TrafficSignal;
  distanceToRoute: number;
  distanceFromStart: number;
  state: SignalState;
  arrivalSec: number;
  waitSec: number;
  roadName: string;
}

export const SIGNAL_METADATA: Record<string, { roadName: string; type: 'highway' | 'side'; intersection: string; lat: number; lng: number }> = {
  // INT-1
  'SIG-101': { roadName: 'Bajajnagar out', type: 'highway', intersection: 'INT-1', lat: 19.83719678322558, lng: 75.25331406885289 },
  'SIG-102': { roadName: 'Pune - Sambhajinagar Highway', type: 'highway', intersection: 'INT-1', lat: 19.83754364531852, lng: 75.25320362395004 },
  'SIG-103': { roadName: 'Bajaj Road', type: 'side', intersection: 'INT-1', lat: 19.837493375497445, lng: 75.25365609177743 },
  // INT-2
  'SIG-201': { roadName: 'INT-2 North', type: 'highway', intersection: 'INT-2', lat: 19.839053407439323, lng: 75.24613515665715 },
  'SIG-202': { roadName: 'INT-2 East', type: 'highway', intersection: 'INT-2', lat: 19.838879140312784, lng: 75.24701515314092 },
  'SIG-203': { roadName: 'INT-2 South', type: 'side', intersection: 'INT-2', lat: 19.83861554441333, lng: 75.24659588152446 },
  'SIG-204': { roadName: 'INT-2 West', type: 'side', intersection: 'INT-2', lat: 19.839314168031137, lng: 75.24672549449588 },
};

export const DEFAULT_SETTINGS = {
  averageSpeedKmh: 35,
  signalProximityMeters: 10,
  cycle: {
    GREEN: 15,
    YELLOW: 5,
    RED: 15, // computed dynamically per intersection
  },
};
