import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSignals } from '@/hooks/useSignals';
import { useAmbulanceSimulation } from '@/hooks/useAmbulanceSimulation';
import TrafficMap from '@/components/TrafficMap';
import RouteSignalPanel from '@/components/RouteSignalPanel';
import AmbulanceDashboard from '@/components/AmbulanceDashboard';
import AmbulanceLogin from '@/components/AmbulanceLogin';
import SettingsPanel from '@/components/SettingsPanel';
import { supabase } from '@/integrations/supabase/client';
import type { SignalConfig } from '@/components/SettingsPanel';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SIGNAL_METADATA } from '@/types/signal';
import type { RouteSignalInfo, TrafficSignal } from '@/types/signal';

const Index = () => {
  const { signals, loading, updateSignal, refreshSignals, getRuntime, runtimes } = useSignals();
  const [routeSignals, setRouteSignals] = useState<RouteSignalInfo[]>([]);
  const [routeDistance, setRouteDistance] = useState(0);
  const [speed, setSpeed] = useState(35);
  const [panelOpen, setPanelOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'route' | 'signals' | 'ambulance'>('route');
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
        />

        {/* Status bar */}
        <div className="px-3 pt-3">
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
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="route" className="flex-1 flex flex-col overflow-hidden px-3 pt-3">
          <TabsList className="w-full">
            <TabsTrigger value="route" className="flex-1 text-xs font-mono">
              Route
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

          <TabsContent value="ambulance" className="flex-1 overflow-y-auto pb-3">
            {!ambulanceLoggedIn ? (
              <AmbulanceLogin onLogin={() => setAmbulanceLoggedIn(true)} />
            ) : (
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
            {(['route', 'ambulance'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setMobileTab(tab as any)}
                className={`flex-1 py-1.5 rounded-md text-xs font-mono font-semibold transition-all ${
                  mobileTab === tab
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                {tab === 'route' ? 'Route' : '🚑'}
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
            ) : !ambulanceLoggedIn ? (
              <AmbulanceLogin onLogin={() => setAmbulanceLoggedIn(true)} />
            ) : (
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
