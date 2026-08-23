import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSignals } from '@/hooks/useSignals';
import { useAmbulanceSimulation } from '@/hooks/useAmbulanceSimulation';
import { useEmergencyTracking } from '@/hooks/useEmergencyTracking';
import { useViolationDetection } from '@/hooks/useViolationDetection';
import { getHospitalName } from '@/lib/hospital-finder';
import TrafficMap from '@/components/TrafficMap';
import RouteSignalPanel from '@/components/RouteSignalPanel';
import AmbulanceDashboard from '@/components/AmbulanceDashboard';
import AmbulanceLogin from '@/components/AmbulanceLogin';
import SettingsPanel from '@/components/SettingsPanel';
import SpeedPredictionPanel from '@/components/SpeedPredictionPanel';
import EmergencyModeControl from '@/components/EmergencyModeControl';
import ProofUploadForm from '@/components/ProofUploadForm';
import HardwareStatusBanner from '@/components/HardwareStatusBanner';
import { useHardwareStatus } from '@/hooks/useHardwareStatus';
import { useSpeedPrediction } from '@/hooks/useSpeedPrediction';
import { supabase } from '@/integrations/supabase/client';
import type { SignalConfig } from '@/components/SettingsPanel';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SIGNAL_METADATA } from '@/types/signal';
import type { RouteSignalInfo, TrafficSignal } from '@/types/signal';
import type { EmergencyProof } from '@/types/emergency-validation';

const Index = () => {
  const { signals: rawSignals, loading, updateSignal, refreshSignals, getRuntime, runtimes } = useSignals();
  const [routeSignals, setRouteSignals] = useState<RouteSignalInfo[]>([]);
  const [routeDistance, setRouteDistance] = useState(0);
  const [speed, setSpeed] = useState(35);
  const [panelOpen, setPanelOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'route' | 'prediction' | 'ambulance'>('route');
  const [ambulanceLoggedIn, setAmbulanceLoggedIn] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [signalConfigs, setSignalConfigs] = useState<SignalConfig[]>([]);
  const [newSignalLat, setNewSignalLat] = useState('');
  const [newSignalLng, setNewSignalLng] = useState('');
  const [isPickingSignalLocation, setIsPickingSignalLocation] = useState(false);
  const [savingSignalConfigs, setSavingSignalConfigs] = useState(false);
  const [intersectionIPs, setIntersectionIPs] = useState<Record<string, string>>({});
  const [savingIntersectionIPs, setSavingIntersectionIPs] = useState(false);
  const [intersectionIPMessage, setIntersectionIPMessage] = useState<string | null>(null);
  const [emergencyActiveSignal, setEmergencyActiveSignal] = useState<string | null>(null);
  const [trackLive, setTrackLive] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') !== 'light';
    }
    return true;
  });

  const ambulance = useAmbulanceSimulation(signals, routeSignals, intersectionIPs);

  // Physical ESP32 controller reachability — drives demo-mode messaging
  const hardware = useHardwareStatus(intersectionIPs);

  // Emergency validation system
  const emergencyTracking = useEmergencyTracking();
  const violationDetection = useViolationDetection();

  // State for proof upload modal
  const [showProofUpload, setShowProofUpload] = useState(false);
  const [lastCompletedSession, setLastCompletedSession] = useState<any>(null);
  const [proofRefreshKey, setProofRefreshKey] = useState(0); // Force refresh on status change
  
  // Get submitted proofs for admin dashboard (with session data)
  const submittedProofs = emergencyTracking.getSubmittedProofs().map(proof => ({
    ...proof,
    session: emergencyTracking.sessions.find(s => s.id === proof.emergencySessionId) || null,
  }));
  
  // Handler for proof status updates (triggers refresh)
  const handleProofStatusUpdate = () => {
    setProofRefreshKey(prev => prev + 1);
  };
  
  // Calculate real dashboard statistics
  const dashboardStats = {
    activeEmergencySessions: emergencyTracking.isActive ? 1 : 0,
    pendingProofs: submittedProofs.filter(p => p.status === 'PENDING').length,
    unverifiedCases: submittedProofs.filter(p => p.status === 'PENDING').length,
    misuseDetected: submittedProofs.filter(p => p.status === 'REJECTED' || p.status === 'EXPIRED').length,
    todayViolations: violationDetection.violations.filter(v => {
      const today = new Date().toDateString();
      return new Date(v.timestamp).toDateString() === today;
    }).length,
    // Count unique active ambulances (completed sessions today + currently active)
    totalAmbulancesActive: (() => {
      const today = new Date().toDateString();
      const todaySessions = emergencyTracking.sessions.filter(s => {
        const sessionDate = new Date(s.startTime).toDateString();
        return sessionDate === today && s.status === 'COMPLETED';
      });
      // Count unique vehicles
      const uniqueVehicles = new Set(todaySessions.map(s => s.vehicleNumber));
      // Add current active emergency if exists
      if (emergencyTracking.isActive && emergencyTracking.activeSession) {
        uniqueVehicles.add(emergencyTracking.activeSession.vehicleNumber);
      }
      return uniqueVehicles.size;
    })(),
  };
  
  // Auto-track route points and detect violations during emergency
  useEffect(() => {
    if (!emergencyTracking.isActive || !ambulance.status.position) return;
    
    // Add route point and check for violations every 2 seconds
    const trackInterval = setInterval(() => {
      if (ambulance.status.position) {
        // Track route point
        emergencyTracking.addRoutePoint({
          lat: ambulance.status.position.lat,
          lng: ambulance.status.position.lon,
          speed: speed,
        });
        
        // Check for violations (overspeed, signal breaks, etc.)
        violationDetection.checkForViolations(
          {
            lat: ambulance.status.position.lat,
            lng: ambulance.status.position.lon,
          },
          speed,
          'GREEN', // Default state (no specific signal check here)
          null, // Will detect overspeed on general roads
          true, // emergency mode active
          {
            driverId: emergencyTracking.activeSession?.driverId || 'unknown',
            driverName: emergencyTracking.activeSession?.driverName || 'Unknown Driver',
            vehicleNumber: emergencyTracking.activeSession?.vehicleNumber || 'UNKNOWN',
          },
          emergencyTracking.activeSession?.id
        );
      }
    }, 2000);
    
    return () => clearInterval(trackInterval);
  }, [emergencyTracking.isActive, ambulance.status.position, speed, emergencyTracking, violationDetection]);

  // Auto-trigger signals when emergency is active and ambulance is moving
  useEffect(() => {
    if (!emergencyTracking.isActive || !ambulance.status.position || !ambulance.status.running) return;
    
    let lastTriggeredSignal: string | null = null;
    
    // Check for nearby signals every 1 second when emergency is active
    const emergencySignalInterval = setInterval(() => {
      if (!ambulance.status.position || !ambulance.status.nearbySignalId) return;
      
      const nearbySignalId = ambulance.status.nearbySignalId;
      const nearbySignal = signals.find(s => s.id === nearbySignalId);
      
      // Only trigger if this is a different signal than the last one
      if (nearbySignal && nearbySignalId !== lastTriggeredSignal) {
        console.log('[Emergency] Auto-triggering signal:', nearbySignalId);
        ambulance.overrideSignalGreen(nearbySignalId);
        
        // Record signal crossing
        emergencyTracking.recordSignalCrossing(nearbySignalId, 'GREEN');
        
        lastTriggeredSignal = nearbySignalId;
      }
    }, 1000);
    
    return () => {
      clearInterval(emergencySignalInterval);
      // Restore the last triggered signal when emergency stops or component unmounts
      if (lastTriggeredSignal) {
        console.log('[Emergency] Restoring last signal:', lastTriggeredSignal);
        ambulance.restoreSignal(lastTriggeredSignal);
      }
    };
  }, [emergencyTracking.isActive, ambulance.status.position, ambulance.status.running, ambulance.status.nearbySignalId, signals, ambulance]);

  // Trigger nearest signal when emergency starts (even if ambulance is not moving)
  useEffect(() => {
    if (!emergencyTracking.isActive || !ambulance.status.position) return;
    
    // Find the nearest signal to current position
    const currentPos = ambulance.status.position;
    let nearestSignal: typeof signals[0] | null = null;
    let nearestDistance = Infinity;
    
    signals.forEach(signal => {
      const dLat = (signal.latitude - currentPos.lat) * 111000;
      const dLng = (signal.longitude - currentPos.lon) * 111000 * Math.cos(currentPos.lat * Math.PI / 180);
      const distance = Math.sqrt(dLat * dLat + dLng * dLng);
      
      if (distance < nearestDistance && distance < 500) { // Within 500m
        nearestDistance = distance;
        nearestSignal = signal;
      }
    });
    
    if (nearestSignal) {
      console.log('[Emergency] Triggering nearest signal on activation:', nearestSignal.id, `(${Math.round(nearestDistance)}m)`);
      ambulance.overrideSignalGreen(nearestSignal.id);
      emergencyTracking.recordSignalCrossing(nearestSignal.id, 'GREEN');
    }
  }, [emergencyTracking.isActive]); // Only trigger once when emergency becomes active

  // Speed prediction for the route
  const speedPrediction = useSpeedPrediction(
    signals,
    routeSignals,
    speed,
    ambulance.status.position ? { lat: ambulance.status.position.lat, lng: ambulance.status.position.lon } : null
  );

  const mapSignals = useMemo(() => signals, [signals]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Sync signal configs from DB signals
  useEffect(() => {
    const initialConfigs: SignalConfig[] = signals.map((signal) => ({
      id: signal.id,
      intersection: signal.intersection ?? (SIGNAL_METADATA[signal.id]?.intersection || 'UNKNOWN'),
      latitude: signal.latitude,
      longitude: signal.longitude,
      roadName: (signal.roadName ?? SIGNAL_METADATA[signal.id]?.roadName) || signal.id,
      type: (signal.type ?? SIGNAL_METADATA[signal.id]?.type) || 'highway',
    }));

    setSignalConfigs((current) => {
      const currentById = new Map(current.map((c) => [c.id, c]));
      const merged = initialConfigs.map((config) => ({
        ...config,
        ...currentById.get(config.id),
      }));
      const additional = current.filter((c) => !merged.some((m) => m.id === c.id));
      return [...merged, ...additional];
    });
  }, [signals]);

  const fetchIntersectionIPs = useCallback(async () => {
    try {
      const stored = localStorage.getItem('intersection_ips');
      if (stored) {
        setIntersectionIPs(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('Could not load intersection IPs', e);
    }
  }, []);

  useEffect(() => {
    fetchIntersectionIPs();
  }, [fetchIntersectionIPs]);

  const handleIntersectionIpChange = useCallback((intersection: string, ip: string) => {
    setIntersectionIPs((current) => ({ ...current, [intersection]: ip }));
  }, []);

  const toggleSignalLocationPick = useCallback(() => {
    setIsPickingSignalLocation((current) => !current);
  }, []);

  const handleSignalLocationPick = useCallback((lat: number, lng: number) => {
    setNewSignalLat(lat.toFixed(6));
    setNewSignalLng(lng.toFixed(6));
    setIsPickingSignalLocation(false);
  }, []);

  const saveIntersectionIPs = useCallback(async () => {
    setIntersectionIPMessage(null);
    setSavingIntersectionIPs(true);

    const payload = Object.entries(intersectionIPs).map(([intersection, ip]) => ({
      intersection,
      ip,
    }));

    if (payload.length === 0) {
      setIntersectionIPMessage('No intersection IPs to save.');
      setSavingIntersectionIPs(false);
      return;
    }

    try {
      localStorage.setItem('intersection_ips', JSON.stringify(intersectionIPs));
    } catch (e) {
      setIntersectionIPMessage('Unable to save intersection IPs.');
      setSavingIntersectionIPs(false);
      return;
    }

    setIntersectionIPMessage('Intersection IPs saved.');
    await fetchIntersectionIPs();
    setSavingIntersectionIPs(false);
  }, [intersectionIPs, fetchIntersectionIPs]);

  const handleRouteSignals = useCallback((info: RouteSignalInfo[]) => {
    setRouteSignals(info);
  }, []);

  const handleRouteDistance = useCallback((d: number) => {
    setRouteDistance(d);
  }, []);

  const handleAmbulanceLogout = useCallback(() => {
    ambulance.stop();
    ambulance.reset();
    setAmbulanceLoggedIn(false);
  }, [ambulance]);

  const handleClearRoute = useCallback(() => {
    ambulance.clearRoute();
    // Clear the route signals from the map
    setRouteSignals([]);
    setRouteDistance(0);
  }, [ambulance]);

  const saveSignalConfigs = useCallback(async (configs: SignalConfig[]) => {
    setSavingSignalConfigs(true);

    try {
      // Group configs by intersection
      const byIntersection = configs.reduce<Record<string, SignalConfig[]>>((acc, config) => {
        const intId = config.intersection;
        if (!acc[intId]) acc[intId] = [];
        acc[intId].push(config);
        return acc;
      }, {});

      const getIntNumber = (intId: string) => {
        const match = intId.match(/INT-(\d+)/i);
        return match ? Number(match[1]) : null;
      };

      // Known existing tables
      const existingIntersections = new Set(signals.map(s => s.intersection).filter(Boolean));

      for (const [intId, intConfigs] of Object.entries(byIntersection)) {
        const num = getIntNumber(intId);
        if (!num) continue;

        const tableName = `traffic_signals_int${num}` as 'traffic_signals_int1' | 'traffic_signals_int2';

        // If this is a NEW intersection (not in existing DB signals), create table via edge function
        if (!existingIntersections.has(intId)) {
          console.log(`[Save] Creating new table for ${intId} via edge function`);
          const { data, error } = await supabase.functions.invoke('create-intersection-table', {
            body: {
              intersectionNumber: num,
              signals: intConfigs.map(c => ({
                id: c.id,
                latitude: c.latitude,
                longitude: c.longitude,
                intersection: c.intersection,
                roadName: c.roadName,
                type: c.type,
              })),
            },
          });

          if (error) {
            console.error(`[Save] Failed to create table for ${intId}:`, error);
            setSavingSignalConfigs(false);
            return false;
          }
          console.log(`[Save] Table created for ${intId}:`, data);
          continue; // Signals were inserted by the edge function
        }

        // Existing intersection - do upsert/delete
        const { data: existing } = await supabase.from(tableName).select('id');
        const existingIds = new Set((existing || []).map((r: any) => r.id));
        const newConfigIds = new Set(intConfigs.map(c => c.id));

        // Delete removed signals
        const toDelete = Array.from(existingIds).filter(id => !newConfigIds.has(id));
        if (toDelete.length > 0) {
          for (const id of toDelete) {
            await supabase.from(tableName).delete().eq('id', id);
          }
        }

        // Upsert signals
        const payload = intConfigs.map((config) => ({
          id: config.id,
          latitude: config.latitude,
          longitude: config.longitude,
          intersection: config.intersection,
          type: config.type,
          road_name: config.roadName,
          state: 'RED',
          updated_at: new Date().toISOString(),
        }));

        const { error } = await supabase.from(tableName).upsert(payload, { onConflict: 'id' });
        if (error) {
          console.error(`Error saving to ${tableName}:`, error);
          setSavingSignalConfigs(false);
          return false;
        }
      }

      // Handle deleted intersections
      const newIntersections = new Set(configs.map(c => c.intersection));
      for (const intId of existingIntersections) {
        if (!intId || newIntersections.has(intId)) continue;
        const num = getIntNumber(intId);
        if (!num) continue;
        const tableName = `traffic_signals_int${num}` as 'traffic_signals_int1' | 'traffic_signals_int2';
        const sigIds = signals.filter(s => s.intersection === intId).map(s => s.id);
        for (const id of sigIds) {
          await supabase.from(tableName).delete().eq('id', id);
        }
      }

      setSignalConfigs(configs);
      await refreshSignals();
      setSavingSignalConfigs(false);
      return true;
    } catch (e) {
      console.error('Save error:', e);
      setSavingSignalConfigs(false);
      return false;
    }
  }, [refreshSignals, signals]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-80 flex-shrink-0 bg-card border-r border-border flex-col overflow-hidden">
        <div className="p-4 border-b border-border flex items-start justify-between gap-3">
          <div>
            <h1 className="text-base font-mono font-bold text-primary tracking-tight">
              Traffic Signal Nav
            </h1>
            <p className="text-[10px] font-mono text-muted-foreground mt-1">
              Smart Signal Navigation System
            </p>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-md border border-border bg-secondary/80 px-2 py-1 text-xs font-mono font-semibold text-foreground hover:bg-secondary transition-colors"
            aria-label="Open admin settings"
          >
            ⚙️ Settings
          </button>
        </div>

        {/* Settings Dialog */}
        <SettingsPanel
          signalConfigs={signalConfigs}
          onSignalConfigsChange={setSignalConfigs}
          onSaveSignalConfigs={saveSignalConfigs}
          savingSignalConfigs={savingSignalConfigs}
          newSignalLat={newSignalLat}
          newSignalLng={newSignalLng}
          onNewSignalLatChange={setNewSignalLat}
          onNewSignalLngChange={setNewSignalLng}
          isPickingSignalLocation={isPickingSignalLocation}
          onToggleSignalPickLocation={toggleSignalLocationPick}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          intersectionIPs={intersectionIPs}
          onIntersectionIpChange={handleIntersectionIpChange}
          onSaveIntersectionIPs={saveIntersectionIPs}
          savingIntersectionIPs={savingIntersectionIPs}
          intersectionIPMessage={intersectionIPMessage}
          signals={signals}
          onUpdateSignal={updateSignal}
          speed={speed}
          onSpeedChange={setSpeed}
          getRuntime={getRuntime}
          onEmergencyTrigger={(signalId) => {
            setEmergencyActiveSignal(signalId);
            updateSignal(signalId, 'GREEN');
          }}
          onEmergencyClear={() => {
            setEmergencyActiveSignal(null);
          }}
          emergencyActiveSignal={emergencyActiveSignal}
          violations={violationDetection.violations}
          onUpdateViolationStatus={violationDetection.updateViolationStatus}
          submittedProofs={submittedProofs}
          onProofStatusUpdate={handleProofStatusUpdate}
          dashboardStats={dashboardStats}
        />

        {/* Status bar */}
        <div className="px-3 pt-3 space-y-2">
          <div className="flex items-center gap-2 bg-secondary/50 rounded-md px-3 py-2">
            <div
              className={`w-2 h-2 rounded-full ${
                loading
                  ? 'bg-signal-yellow animate-pulse-signal'
                  : 'bg-signal-green'
              }`}
            />
            <span className="text-[10px] font-mono text-muted-foreground">
              {loading ? 'Connecting...' : `${signals.length} signals online`}
            </span>
            {hardware.status === 'offline' && (
              <span className="ml-auto rounded bg-signal-yellow/20 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide text-signal-yellow">
                Demo
              </span>
            )}
          </div>
          <HardwareStatusBanner hardware={hardware} />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="route" className="flex-1 flex flex-col overflow-hidden px-3 pt-3">
          <TabsList className="w-full">
            <TabsTrigger value="route" className="flex-1 text-xs font-mono">
              Route
            </TabsTrigger>
            <TabsTrigger value="prediction" className="flex-1 text-xs font-mono">
              🎯
            </TabsTrigger>
            <TabsTrigger value="ambulance" className="flex-1 text-xs font-mono">
              🚑
            </TabsTrigger>
          </TabsList>

          <TabsContent value="route" className="flex-1 overflow-y-auto pb-3">
            <RouteSignalPanel
              routeSignals={routeSignals}
              routeDistance={routeDistance}
              speed={speed}
              allSignals={signals}
              isAmbulance={ambulanceLoggedIn}
            />
          </TabsContent>

          <TabsContent value="prediction" className="flex-1 overflow-y-auto pb-3">
            <SpeedPredictionPanel prediction={speedPrediction} />
          </TabsContent>

          <TabsContent value="ambulance" className="flex-1 overflow-y-auto pb-3">
            {!ambulanceLoggedIn ? (
              <AmbulanceLogin onLogin={() => setAmbulanceLoggedIn(true)} />
            ) : (
              <div className="space-y-3">
                <AmbulanceDashboard
                  status={ambulance.status}
                  speed={ambulance.speed}
                  onSpeedChange={ambulance.setSpeed}
                  onLoadCSV={ambulance.loadCSV}
                  onStart={ambulance.start}
                  onStop={ambulance.stop}
                  onReset={ambulance.reset}
                  onLogout={handleAmbulanceLogout}
                  onClearRoute={handleClearRoute}
                  routeLength={ambulance.route.length}
                  trackLive={trackLive}
                  onTrackLiveChange={setTrackLive}
                />
                <EmergencyModeControl
                  isActive={emergencyTracking.isActive}
                  activeSession={emergencyTracking.activeSession}
                  elapsedSeconds={emergencyTracking.elapsedSeconds}
                  proofDeadlineRemaining={emergencyTracking.proofDeadlineRemaining}
                  lastCompletedSession={lastCompletedSession}
                  proofSubmitted={emergencyTracking.isProofSubmittedForLastSession()}
                  onStartEmergency={async () => {
                    if (ambulance.status.position) {
                      // Use route end location to find nearest hospital
                      const endPoint = ambulance.route.length > 0
                        ? ambulance.route[ambulance.route.length - 1]
                        : ambulance.status.position;
                      const hospitalName = await getHospitalName(endPoint.lat, endPoint.lon ?? (endPoint as any).lng);
                      emergencyTracking.startEmergency(
                        'DRV-' + Date.now(),
                        'Driver',
                        'AMB-001',
                        hospitalName,
                        { lat: ambulance.status.position.lat, lng: ambulance.status.position.lon }
                      );
                    }
                  }}
                  onEndEmergency={() => {
                    emergencyTracking.endEmergency(
                      ambulance.status.position ? { lat: ambulance.status.position.lat, lng: ambulance.status.position.lon } : undefined
                    );
                    setLastCompletedSession(emergencyTracking.activeSession);
                  }}
                  onOpenProofUpload={() => setShowProofUpload(true)}
                  currentPosition={ambulance.status.position ? { lat: ambulance.status.position.lat, lng: ambulance.status.position.lon } : null}
                />
              </div>
            )}
          </TabsContent>

        </Tabs>

        <div className="p-3 border-t border-border flex items-center justify-between">
          <p className="text-[9px] font-mono text-muted-foreground">
            API: GET /signals · POST /signals/update
          </p>
          <button
            onClick={() => setIsDark(!isDark)}
            className="px-2 py-1 rounded-md text-xs font-mono bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
            aria-label="Toggle theme"
          >
            {isDark ? 'Light' : 'Dark'}
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <TrafficMap
          signals={mapSignals}
          onRouteSignals={handleRouteSignals}
          onRouteDistance={handleRouteDistance}
          getRuntime={getRuntime}
          runtimes={runtimes}
          speed={speed}
          ambulancePosition={ambulance.status.position}
          ambulanceRoute={ambulance.route}
          signalLocationPickMode={isPickingSignalLocation}
          onSignalLocationPick={handleSignalLocationPick}
          trackLive={trackLive}
          isAmbulance={ambulanceLoggedIn}
        />

        {/* Mobile: floating status pill + theme toggle */}
        <div className="md:hidden absolute top-3 left-3 z-[1000] flex items-center gap-2 bg-card/90 backdrop-blur-sm rounded-full px-3 py-1.5 border border-border shadow-lg">
          <button
            onClick={() => setIsDark(!isDark)}
            className="text-xs mr-1"
            aria-label="Toggle theme"
          >
            {isDark ? 'Light' : 'Dark'}
          </button>
          <div
            className={`w-2 h-2 rounded-full ${
              loading ? 'bg-signal-yellow animate-pulse-signal' : 'bg-signal-green'
            }`}
          />
          <span className="text-[10px] font-mono text-muted-foreground">
            {loading ? '...' : `${signals.length} signals`}
          </span>
          {ambulance.status.running && (
            <span className="text-[10px] font-mono text-signal-red font-bold">
              · 🚑
            </span>
          )}
        </div>

        {/* Mobile: bottom sheet toggle */}
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className="md:hidden absolute bottom-3 left-3 mb-[env(safe-area-inset-bottom)] z-[1000] bg-primary text-primary-foreground rounded-full w-12 h-12 flex items-center justify-center shadow-lg text-lg active:scale-95 transition-transform"
          aria-label="Toggle control panel"
        >
          {panelOpen ? '✕' : '☰'}
        </button>

        {/* Mobile: bottom sheet */}
        <div
          className={`md:hidden absolute bottom-0 left-0 right-0 z-[999] bg-card/95 backdrop-blur-md border-t border-border rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out ${
            panelOpen ? 'translate-y-0' : 'translate-y-full'
          }`}
          style={{ maxHeight: '70vh' }}
        >
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          <div className="flex gap-1 px-4 pb-2">
            {(['route', 'prediction', 'ambulance'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setMobileTab(tab)}
                className={`flex-1 py-1.5 rounded-md text-xs font-mono font-semibold transition-all ${
                  mobileTab === tab
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                {tab === 'route' ? 'Route' : tab === 'prediction' ? '🎯' : '🚑'}
              </button>
            ))}
          </div>

          <div className="overflow-y-auto px-4 space-y-3" style={{ maxHeight: 'calc(70vh - 80px)', paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}>
            {mobileTab === 'route' ? (
              <RouteSignalPanel
                routeSignals={routeSignals}
                routeDistance={routeDistance}
                speed={speed}
                allSignals={signals}
                isAmbulance={ambulanceLoggedIn}
              />
            ) : mobileTab === 'prediction' ? (
              <SpeedPredictionPanel prediction={speedPrediction} />
            ) : !ambulanceLoggedIn ? (
              <AmbulanceLogin onLogin={() => setAmbulanceLoggedIn(true)} />
            ) : (
              <div className="space-y-3">
                <AmbulanceDashboard
                  status={ambulance.status}
                  speed={ambulance.speed}
                  onSpeedChange={ambulance.setSpeed}
                  onLoadCSV={ambulance.loadCSV}
                  onStart={ambulance.start}
                  onStop={ambulance.stop}
                  onReset={ambulance.reset}
                  onLogout={handleAmbulanceLogout}
                  onClearRoute={handleClearRoute}
                  routeLength={ambulance.route.length}
                  trackLive={trackLive}
                  onTrackLiveChange={setTrackLive}
                />
                <EmergencyModeControl
                  isActive={emergencyTracking.isActive}
                  activeSession={emergencyTracking.activeSession}
                  elapsedSeconds={emergencyTracking.elapsedSeconds}
                  proofDeadlineRemaining={emergencyTracking.proofDeadlineRemaining}
                  lastCompletedSession={lastCompletedSession}
                  proofSubmitted={emergencyTracking.isProofSubmittedForLastSession()}
                  onStartEmergency={async () => {
                    if (ambulance.status.position) {
                      const endPoint = ambulance.route.length > 0
                        ? ambulance.route[ambulance.route.length - 1]
                        : ambulance.status.position;
                      const hospitalName = await getHospitalName(endPoint.lat, endPoint.lon ?? (endPoint as any).lng);
                      emergencyTracking.startEmergency(
                        'DRV-' + Date.now(),
                        'Driver',
                        'AMB-001',
                        hospitalName,
                        { lat: ambulance.status.position.lat, lng: ambulance.status.position.lon }
                      );
                    }
                  }}
                  onEndEmergency={() => {
                    emergencyTracking.endEmergency(
                      ambulance.status.position ? { lat: ambulance.status.position.lat, lng: ambulance.status.position.lon } : undefined
                    );
                    setLastCompletedSession(emergencyTracking.activeSession);
                  }}
                  onOpenProofUpload={() => setShowProofUpload(true)}
                  currentPosition={ambulance.status.position ? { lat: ambulance.status.position.lat, lng: ambulance.status.position.lon } : null}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Proof Upload Modal */}
      {showProofUpload && lastCompletedSession && (
        <ProofUploadForm
          session={lastCompletedSession}
          deadlineRemaining={emergencyTracking.proofDeadlineRemaining || undefined}
          onClose={() => setShowProofUpload(false)}
          onSubmit={(proof) => {
            emergencyTracking.submitProof(proof);
            setShowProofUpload(false);
            alert('Proof submitted successfully! Admin will review it.');
          }}
        />
      )}
    </div>
  );
};

export default Index;
