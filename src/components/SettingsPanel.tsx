import { useState } from 'react';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export type SignalConfig = {
  id: string;
  intersection: string;
  latitude: number;
  longitude: number;
  ip: string;
  roadName: string;
  type: 'highway' | 'side';
};

interface SettingsPanelProps {
  signalConfigs: SignalConfig[];
  onSignalConfigsChange: (configs: SignalConfig[]) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SettingsPanel({ signalConfigs, onSignalConfigsChange, open, onOpenChange }: SettingsPanelProps) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  // New intersection form
  const [newIntId, setNewIntId] = useState('');
  const [newIntIp, setNewIntIp] = useState('');

  // New signal form
  const [newSigId, setNewSigId] = useState('');
  const [newSigInt, setNewSigInt] = useState('');
  const [newSigLat, setNewSigLat] = useState('');
  const [newSigLng, setNewSigLng] = useState('');
  const [newSigRoad, setNewSigRoad] = useState('');
  const [newSigType, setNewSigType] = useState<'highway' | 'side'>('highway');

  const handleLogin = () => {
    if (username.trim() === 'admin' && password === 'admin') {
      setLoggedIn(true);
      setError(null);
      setUsername('');
      setPassword('');
    } else {
      setError('Invalid admin credentials');
    }
  };

  const intersections = [...new Set(signalConfigs.map((c) => c.intersection))].sort();

  const handleAddIntersection = () => {
    if (!newIntId.trim()) { setError('Intersection ID required'); return; }
    if (intersections.includes(newIntId.trim())) { setError('Intersection already exists'); return; }
    // Just validates — signals will be added separately
    setError(null);
    setNewSigInt(newIntId.trim());
    setNewIntId('');
    setNewIntIp('');
  };

  const handleAddSignal = () => {
    const id = newSigId.trim();
    const intId = newSigInt.trim();
    if (!id || !intId) { setError('Signal ID and Intersection are required'); return; }
    if (signalConfigs.some((c) => c.id === id)) { setError('Signal ID already exists'); return; }
    const lat = Number(newSigLat);
    const lng = Number(newSigLng);
    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) { setError('Valid latitude and longitude required'); return; }

    onSignalConfigsChange([
      ...signalConfigs,
      { id, intersection: intId, latitude: lat, longitude: lng, ip: '', roadName: newSigRoad.trim() || id, type: newSigType },
    ]);
    setError(null);
    setNewSigId('');
    setNewSigLat('');
    setNewSigLng('');
    setNewSigRoad('');
  };

  const handleRemoveSignal = (id: string) => {
    onSignalConfigsChange(signalConfigs.filter((c) => c.id !== id));
  };

  const handleConfigChange = (id: string, field: keyof SignalConfig, value: string) => {
    onSignalConfigsChange(
      signalConfigs.map((c) =>
        c.id === id
          ? { ...c, [field]: field === 'latitude' || field === 'longitude' ? Number(value) : value }
          : c,
      ),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-mono">⚙️ Admin Settings</DialogTitle>
          <DialogDescription>Manage intersections, signals, and ESP32 configuration.</DialogDescription>
        </DialogHeader>

        {!loggedIn ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase text-muted-foreground">Admin ID</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground"
                placeholder="admin"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase text-muted-foreground">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground"
                placeholder="••••"
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button onClick={handleLogin} className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              Login
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono text-muted-foreground">Admin mode</span>
              <button onClick={() => { setLoggedIn(false); setError(null); }} className="rounded-md border border-border px-2 py-1 text-[10px] font-mono hover:bg-secondary">
                Logout
              </button>
            </div>

            <Tabs defaultValue="intersections" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="w-full">
                <TabsTrigger value="intersections" className="flex-1 text-xs font-mono">Intersections</TabsTrigger>
                <TabsTrigger value="add" className="flex-1 text-xs font-mono">+ Add New</TabsTrigger>
              </TabsList>

              <TabsContent value="intersections" className="flex-1 overflow-y-auto pr-1">
                <div className="space-y-4">
                  {intersections.map((intId) => {
                    const intSignals = signalConfigs.filter((c) => c.intersection === intId);
                    return (
                      <div key={intId} className="rounded-lg border border-border bg-secondary/30 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-mono font-bold text-primary uppercase tracking-wider">{intId}</span>
                          <span className="text-[10px] font-mono text-muted-foreground">{intSignals.length} signals</span>
                        </div>
                        <div className="space-y-2">
                          {intSignals.map((config) => (
                            <div key={config.id} className="rounded-md border border-border bg-background p-2.5">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold font-mono text-foreground">{config.id}</span>
                                <div className="flex items-center gap-1">
                                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${config.type === 'highway' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                    {config.type}
                                  </span>
                                  <button onClick={() => handleRemoveSignal(config.id)} className="text-[10px] font-mono text-destructive hover:underline ml-1">
                                    ✕
                                  </button>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-1.5">
                                <label className="text-[9px] font-mono text-muted-foreground">
                                  Road
                                  <input
                                    value={config.roadName}
                                    onChange={(e) => handleConfigChange(config.id, 'roadName', e.target.value)}
                                    className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground"
                                  />
                                </label>
                                <label className="text-[9px] font-mono text-muted-foreground">
                                  ESP32 IP
                                  <input
                                    value={config.ip}
                                    onChange={(e) => handleConfigChange(config.id, 'ip', e.target.value)}
                                    className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground"
                                    placeholder="10.x.x.x"
                                  />
                                </label>
                                <label className="text-[9px] font-mono text-muted-foreground">
                                  Lat
                                  <input
                                    value={config.latitude}
                                    onChange={(e) => handleConfigChange(config.id, 'latitude', e.target.value)}
                                    className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground"
                                    type="number"
                                    step="0.000001"
                                  />
                                </label>
                                <label className="text-[9px] font-mono text-muted-foreground">
                                  Lng
                                  <input
                                    value={config.longitude}
                                    onChange={(e) => handleConfigChange(config.id, 'longitude', e.target.value)}
                                    className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground"
                                    type="number"
                                    step="0.000001"
                                  />
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {intersections.length === 0 && (
                    <p className="text-xs font-mono text-muted-foreground text-center py-4">No intersections configured</p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="add" className="flex-1 overflow-y-auto pr-1">
                <div className="space-y-4">
                  {/* Add Intersection */}
                  <div className="rounded-lg border border-border bg-secondary/30 p-3">
                    <h3 className="text-xs font-mono font-bold text-foreground uppercase tracking-wider mb-2">
                      New Intersection
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[9px] font-mono text-muted-foreground">
                        Intersection ID
                        <input
                          value={newIntId}
                          onChange={(e) => setNewIntId(e.target.value)}
                          className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground"
                          placeholder="INT-3"
                        />
                      </label>
                      <label className="text-[9px] font-mono text-muted-foreground">
                        ESP32 IP
                        <input
                          value={newIntIp}
                          onChange={(e) => setNewIntIp(e.target.value)}
                          className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground"
                          placeholder="10.x.x.x"
                        />
                      </label>
                    </div>
                    <p className="text-[9px] font-mono text-muted-foreground mt-1.5">
                      Create intersection first, then add signals to it below.
                    </p>
                  </div>

                  {/* Add Signal */}
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <h3 className="text-xs font-mono font-bold text-foreground uppercase tracking-wider mb-2">
                      Add Signal
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[9px] font-mono text-muted-foreground">
                        Signal ID
                        <input
                          value={newSigId}
                          onChange={(e) => setNewSigId(e.target.value)}
                          className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground"
                          placeholder="SIG-301"
                        />
                      </label>
                      <label className="text-[9px] font-mono text-muted-foreground">
                        Intersection
                        <select
                          value={newSigInt}
                          onChange={(e) => setNewSigInt(e.target.value)}
                          className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground"
                        >
                          <option value="">Select...</option>
                          {intersections.map((i) => (
                            <option key={i} value={i}>{i}</option>
                          ))}
                          {newIntId.trim() && !intersections.includes(newIntId.trim()) && (
                            <option value={newIntId.trim()}>{newIntId.trim()} (new)</option>
                          )}
                        </select>
                      </label>
                      <label className="text-[9px] font-mono text-muted-foreground">
                        Latitude
                        <input
                          value={newSigLat}
                          onChange={(e) => setNewSigLat(e.target.value)}
                          className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground"
                          type="number"
                          step="0.000001"
                          placeholder="19.838"
                        />
                      </label>
                      <label className="text-[9px] font-mono text-muted-foreground">
                        Longitude
                        <input
                          value={newSigLng}
                          onChange={(e) => setNewSigLng(e.target.value)}
                          className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground"
                          type="number"
                          step="0.000001"
                          placeholder="75.246"
                        />
                      </label>
                      <label className="text-[9px] font-mono text-muted-foreground">
                        Road Name
                        <input
                          value={newSigRoad}
                          onChange={(e) => setNewSigRoad(e.target.value)}
                          className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground"
                          placeholder="Main Road"
                        />
                      </label>
                      <label className="text-[9px] font-mono text-muted-foreground">
                        Type
                        <select
                          value={newSigType}
                          onChange={(e) => setNewSigType(e.target.value as 'highway' | 'side')}
                          className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground"
                        >
                          <option value="highway">Highway</option>
                          <option value="side">Side Road</option>
                        </select>
                      </label>
                    </div>
                    {error && <p className="text-[10px] text-destructive mt-2">{error}</p>}
                    <button
                      onClick={handleAddSignal}
                      className="mt-3 w-full rounded-md bg-primary px-3 py-2 text-xs font-mono font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      + Add Signal
                    </button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
