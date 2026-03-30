import { useState, useCallback, useEffect } from 'react';
import { useSignals } from '@/hooks/useSignals';
import { useAmbulanceSimulation } from '@/hooks/useAmbulanceSimulation';
import TrafficMap from '@/components/TrafficMap';
import AdminPanel from '@/components/AdminPanel';
import RouteSignalPanel from '@/components/RouteSignalPanel';
import AmbulanceDashboard from '@/components/AmbulanceDashboard';
import AmbulanceLogin from '@/components/AmbulanceLogin';
import SettingsPanel from '@/components/SettingsPanel';
import type { SignalConfig } from '@/components/SettingsPanel';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SIGNAL_METADATA } from '@/types/signal';
import type { RouteSignalInfo } from '@/types/signal';

const Index = () => {
  const { signals, loading, updateSignal, getRuntime, runtimes } = useSignals();
  const [routeSignals, setRouteSignals] = useState<RouteSignalInfo[]>([]);
  const [routeDistance, setRouteDistance] = useState(0);
  const [speed, setSpeed] = useState(35);
  const [panelOpen, setPanelOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'route' | 'signals' | 'ambulance'>('route');
  const [ambulanceLoggedIn, setAmbulanceLoggedIn] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [signalConfigs, setSignalConfigs] = useState<SignalConfig[]>([]);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') !== 'light';
    }
    return true;
  });

  const ambulance = useAmbulanceSimulation(signals, routeSignals);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Sync signal configs from DB signals
  useEffect(() => {
    const initialConfigs: SignalConfig[] = signals.map((signal) => ({
      id: signal.id,
      intersection: SIGNAL_METADATA[signal.id]?.intersection || 'UNKNOWN',
      latitude: signal.latitude,
      longitude: signal.longitude,
      ip: '',
      roadName: SIGNAL_METADATA[signal.id]?.roadName || signal.id,
      type: SIGNAL_METADATA[signal.id]?.type || 'highway',
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

  const handleRouteSignals = useCallback((info: RouteSignalInfo[]) => {
    setRouteSignals(info);
  }, []);

  const handleRouteDistance = useCallback((d: number) => {
    setRouteDistance(d);
  }, []);

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
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
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
            <TabsTrigger value="signals" className="flex-1 text-xs font-mono">
              Signals
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
            />
          </TabsContent>

          <TabsContent value="signals" className="flex-1 overflow-y-auto pb-3">
            <AdminPanel
              signals={signals}
              onUpdate={updateSignal}
              speed={speed}
              onSpeedChange={setSpeed}
              getRuntime={getRuntime}
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
                routeLength={ambulance.route.length}
                esp32IPs={ambulance.esp32IPs}
                onESP32IPChange={(intId, ip) => ambulance.setEsp32IPs((prev) => ({ ...prev, [intId]: ip }))}
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
          signals={signals}
          onRouteSignals={handleRouteSignals}
          onRouteDistance={handleRouteDistance}
          getRuntime={getRuntime}
          runtimes={runtimes}
          speed={speed}
          ambulancePosition={ambulance.status.position}
          ambulanceRoute={ambulance.route}
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
            {(['route', 'signals', 'ambulance'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setMobileTab(tab)}
                className={`flex-1 py-1.5 rounded-md text-xs font-mono font-semibold transition-all ${
                  mobileTab === tab
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                {tab === 'route' ? 'Route' : tab === 'signals' ? 'Signals' : '🚑'}
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
              />
            ) : mobileTab === 'signals' ? (
              <AdminPanel
                signals={signals}
                onUpdate={updateSignal}
                speed={speed}
                onSpeedChange={setSpeed}
                getRuntime={getRuntime}
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
                routeLength={ambulance.route.length}
                esp32IPs={ambulance.esp32IPs}
                onESP32IPChange={(intId, ip) => ambulance.setEsp32IPs((prev) => ({ ...prev, [intId]: ip }))}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
