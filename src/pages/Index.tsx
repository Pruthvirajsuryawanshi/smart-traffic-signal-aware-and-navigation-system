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
  const [adminSettingsLoggedIn, setAdminSettingsLoggedIn] = useState(false);
  const [settingsUsername, setSettingsUsername] = useState('');
  const [settingsPassword, setSettingsPassword] = useState('');
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [signalConfigs, setSignalConfigs] = useState<SignalConfig[]>([]);
  const [newSignalId, setNewSignalId] = useState('');
  const [newSignalIntersection, setNewSignalIntersection] = useState('');
  const [newSignalLatitude, setNewSignalLatitude] = useState('');
  const [newSignalLongitude, setNewSignalLongitude] = useState('');
  const [newSignalIp, setNewSignalIp] = useState('');
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

  useEffect(() => {
    const initialConfigs = signals.map((signal) => ({
      id: signal.id,
      intersection: SIGNAL_METADATA[signal.id]?.intersection || 'UNKNOWN',
      latitude: signal.latitude,
      longitude: signal.longitude,
      ip: '',
    }));

    setSignalConfigs((current) => {
      const currentById = new Map(current.map((config) => [config.id, config]));
      const merged = initialConfigs.map((config) => ({
        ...config,
        ...(currentById.get(config.id) ?? {}),
      }));
      const additional = current.filter((config) => !merged.some((item) => item.id === config.id));
      return [...merged, ...additional];
    });
  }, [signals]);

  const handleRouteSignals = useCallback((info: RouteSignalInfo[]) => {
    setRouteSignals(info);
  }, []);

  const handleRouteDistance = useCallback((d: number) => {
    setRouteDistance(d);
  }, []);

  const handleSettingsLogin = () => {
    if (settingsUsername.trim() === 'admin' && settingsPassword === 'admin') {
      setAdminSettingsLoggedIn(true);
      setSettingsError(null);
      setSettingsUsername('');
      setSettingsPassword('');
      return;
    }
    setSettingsError('Invalid admin credentials');
  };

  const handleAddNewSignal = () => {
    if (!newSignalId.trim() || !newSignalIntersection.trim()) {
      setSettingsError('ID and intersection are required');
      return;
    }
    if (signalConfigs.some((config) => config.id === newSignalId.trim())) {
      setSettingsError('Signal ID already exists');
      return;
    }
    setSignalConfigs((prev) => [
      ...prev,
      {
        id: newSignalId.trim(),
        intersection: newSignalIntersection.trim(),
        latitude: Number(newSignalLatitude) || 0,
        longitude: Number(newSignalLongitude) || 0,
        ip: newSignalIp.trim(),
      },
    ]);
    setSettingsError(null);
    setNewSignalId('');
    setNewSignalIntersection('');
    setNewSignalLatitude('');
    setNewSignalLongitude('');
    setNewSignalIp('');
  };

  const handleSignalConfigChange = (id: string, field: keyof SignalConfig, value: string) => {
    setSignalConfigs((prev) =>
      prev.map((config) =>
        config.id === id
          ? {
              ...config,
              [field]: field === 'latitude' || field === 'longitude'
                ? Number(value)
                : value,
            }
          : config,
      ),
    );
  };

  const handleRemoveSignalConfig = (id: string) => {
    setSignalConfigs((prev) => prev.filter((config) => config.id !== id));
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-80 flex-shrink-0 bg-card border-r border-border flex-col overflow-hidden">
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <div className="p-4 border-b border-border flex items-start justify-between gap-3">
            <div>
              <h1 className="text-base font-mono font-bold text-primary tracking-tight">
                Traffic Signal Nav
              </h1>
              <p className="text-[10px] font-mono text-muted-foreground mt-1">
                Smart Signal Navigation System
              </p>
            </div>

            <DialogTrigger asChild>
              <button
                className="rounded-md border border-border bg-secondary/80 px-2 py-1 text-xs font-mono font-semibold text-foreground hover:bg-secondary transition-colors"
                aria-label="Open admin settings"
              >
                ⚙️ Settings
              </button>
            </DialogTrigger>
          </div>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>Admin Settings</DialogTitle>
              <DialogDescription>
                Login as admin to add or edit signal information and ESP32 IP configuration.
              </DialogDescription>
            </DialogHeader>

            {!adminSettingsLoggedIn ? (
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-muted-foreground">
                    Admin ID
                  </label>
                  <input
                    value={settingsUsername}
                    onChange={(e) => setSettingsUsername(e.target.value)}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground"
                    placeholder="admin"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-muted-foreground">
                    Password
                  </label>
                  <input
                    type="password"
                    value={settingsPassword}
                    onChange={(e) => setSettingsPassword(e.target.value)}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground"
                    placeholder="admin"
                  />
                </div>
                {settingsError && (
                  <div className="rounded border border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {settingsError}
                  </div>
                )}
                <DialogFooter>
                  <button
                    onClick={handleSettingsLogin}
                    className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Login
                  </button>
                </DialogFooter>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-md border border-border bg-secondary/60 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Admin mode</p>
                      <p className="text-[10px] text-muted-foreground">Edit signals and ESP32 IP settings.</p>
                    </div>
                    <button
                      onClick={() => {
                        setAdminSettingsLoggedIn(false);
                        setSettingsError(null);
                      }}
                      className="rounded-md border border-border px-2 py-1 text-[10px] font-mono"
                    >
                      Logout
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Existing signal information
                  </div>
                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {signalConfigs.map((config) => (
                      <div key={config.id} className="rounded-md border border-border bg-background p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-foreground">{config.id}</span>
                          <button
                            onClick={() => handleRemoveSignalConfig(config.id)}
                            className="rounded-md border border-border px-2 py-1 text-[10px] font-mono"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="text-[10px] font-mono uppercase text-muted-foreground">
                            Intersection
                            <input
                              value={config.intersection}
                              onChange={(e) => handleSignalConfigChange(config.id, 'intersection', e.target.value)}
                              className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                            />
                          </label>
                          <label className="text-[10px] font-mono uppercase text-muted-foreground">
                            ESP32 IP
                            <input
                              value={config.ip}
                              onChange={(e) => handleSignalConfigChange(config.id, 'ip', e.target.value)}
                              className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                              placeholder="192.168.x.x"
                            />
                          </label>
                          <label className="text-[10px] font-mono uppercase text-muted-foreground">
                            Latitude
                            <input
                              value={config.latitude}
                              onChange={(e) => handleSignalConfigChange(config.id, 'latitude', e.target.value)}
                              className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                              type="number"
                            />
                          </label>
                          <label className="text-[10px] font-mono uppercase text-muted-foreground">
                            Longitude
                            <input
                              value={config.longitude}
                              onChange={(e) => handleSignalConfigChange(config.id, 'longitude', e.target.value)}
                              className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                              type="number"
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border border-border bg-secondary/50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Add another signal
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-[10px] font-mono uppercase text-muted-foreground">
                      Signal ID
                      <input
                        value={newSignalId}
                        onChange={(e) => setNewSignalId(e.target.value)}
                        className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                        placeholder="SIG-301"
                      />
                    </label>
                    <label className="text-[10px] font-mono uppercase text-muted-foreground">
                      Intersection
                      <input
                        value={newSignalIntersection}
                        onChange={(e) => setNewSignalIntersection(e.target.value)}
                        className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                        placeholder="INT-3"
                      />
                    </label>
                    <label className="text-[10px] font-mono uppercase text-muted-foreground">
                      Latitude
                      <input
                        value={newSignalLatitude}
                        onChange={(e) => setNewSignalLatitude(e.target.value)}
                        className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                        type="number"
                        placeholder="19.84"
                      />
                    </label>
                    <label className="text-[10px] font-mono uppercase text-muted-foreground">
                      Longitude
                      <input
                        value={newSignalLongitude}
                        onChange={(e) => setNewSignalLongitude(e.target.value)}
                        className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                        type="number"
                        placeholder="75.25"
                      />
                    </label>
                    <label className="text-[10px] font-mono uppercase text-muted-foreground sm:col-span-2">
                      ESP32 IP
                      <input
                        value={newSignalIp}
                        onChange={(e) => setNewSignalIp(e.target.value)}
                        className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                        placeholder="192.168.x.x"
                      />
                    </label>
                  </div>
                  {settingsError && (
                    <div className="mt-2 rounded border border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {settingsError}
                    </div>
                  )}
                  <DialogFooter>
                    <button
                      onClick={handleAddNewSignal}
                      className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      Add signal
                    </button>
                  </DialogFooter>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

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
