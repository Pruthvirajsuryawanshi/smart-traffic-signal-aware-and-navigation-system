import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export type SignalConfig = {
  id: string;
  intersection: string;
  latitude: number;
  longitude: number;
  roadName: string;
  type: 'highway' | 'side';
};

interface SettingsPanelProps {
  signalConfigs: SignalConfig[];
  onSignalConfigsChange: (configs: SignalConfig[]) => void;
  onSaveSignalConfigs: (configs: SignalConfig[]) => Promise<boolean>;
  savingSignalConfigs: boolean;
  newSignalLat: string;
  newSignalLng: string;
  onNewSignalLatChange: (value: string) => void;
  onNewSignalLngChange: (value: string) => void;
  isPickingSignalLocation: boolean;
  onToggleSignalPickLocation: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intersectionIPs: Record<string, string>;
  onIntersectionIpChange: (intersection: string, ip: string) => void;
  onSaveIntersectionIPs: () => Promise<void>;
  savingIntersectionIPs: boolean;
  intersectionIPMessage?: string | null;
}

export default function SettingsPanel({
  signalConfigs,
  onSignalConfigsChange,
  onSaveSignalConfigs,
  savingSignalConfigs,
  newSignalLat,
  newSignalLng,
  onNewSignalLatChange,
  onNewSignalLngChange,
  isPickingSignalLocation,
  onToggleSignalPickLocation,
  open,
  onOpenChange,
  intersectionIPs,
  onIntersectionIpChange,
  onSaveIntersectionIPs,
  savingIntersectionIPs,
  intersectionIPMessage,
}: SettingsPanelProps) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [editedConfigs, setEditedConfigs] = useState<SignalConfig[]>(signalConfigs);
  const [expandedIntersections, setExpandedIntersections] = useState<Set<string>>(new Set());
  const [activeIntersection, setActiveIntersection] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // New intersection form
  const [newIntId, setNewIntId] = useState('');
  const [newIntIp, setNewIntIp] = useState('');
  const [pendingIntersection, setPendingIntersection] = useState<string | null>(null);

  // New signal form
  const [newSigId, setNewSigId] = useState('');
  const [newSigInt, setNewSigInt] = useState('');
  const [newSigRoad, setNewSigRoad] = useState('');
  const [newSigType, setNewSigType] = useState<'highway' | 'side'>('highway');

  useEffect(() => {
    if (!open) return;
    setEditedConfigs(signalConfigs);
    const initialIds = new Set(signalConfigs.map((config) => config.intersection));
    setExpandedIntersections(initialIds);
    setActiveIntersection(signalConfigs[0]?.intersection ?? null);
    setSaveMessage(null);
    // Keep local edits intact while the panel remains open.
    // Only reset when the panel is opened fresh.
  }, [open]);

  const intersections = useMemo(
    () => [...new Set(editedConfigs.map((c) => c.intersection))].sort(),
    [editedConfigs],
  );

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(editedConfigs) !== JSON.stringify(signalConfigs),
    [editedConfigs, signalConfigs],
  );

  const draftSignals = useMemo(
    () => editedConfigs.filter((config) => !signalConfigs.some((original) => original.id === config.id)),
    [editedConfigs, signalConfigs],
  );

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

  const handleAddIntersection = () => {
    const newIntersection = newIntId.trim();
    if (!newIntersection) { setError('Intersection ID required'); return; }
    if (!newIntIp.trim()) { setError('ESP32 IP required'); return; }
    if (intersections.includes(newIntersection)) { setError('Intersection already exists'); return; }
    setError(null);
    onIntersectionIpChange(newIntersection, newIntIp.trim());
    setPendingIntersection(newIntersection);
    setNewSigInt(newIntersection);
    setNewIntId('');
    setNewIntIp('');
  };

  const handleAddSignal = () => {
    const id = newSigId.trim();
    const intId = newSigInt.trim();
    if (!id || !intId) { setError('Signal ID and Intersection are required'); return; }
    if (editedConfigs.some((c) => c.id === id)) { setError('Signal ID already exists'); return; }
    const lat = Number(newSignalLat);
    const lng = Number(newSignalLng);
    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) { setError('Valid latitude and longitude required'); return; }

    setEditedConfigs((current) => [
      ...current,
      { id, intersection: intId, latitude: lat, longitude: lng, roadName: newSigRoad.trim() || id, type: newSigType },
    ]);
    setError(null);
    setNewSigId('');
    onNewSignalLatChange('');
    onNewSignalLngChange('');
    setNewSigRoad('');
  };

  const buildDraftSignal = () => {
    const id = newSigId.trim();
    const intId = newSigInt.trim() || newIntId.trim();
    if (!id || !intId) { return null; }
    const lat = Number(newSignalLat);
    const lng = Number(newSignalLng);
    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) { return null; }

    return {
      id,
      intersection: intId,
      latitude: lat,
      longitude: lng,
      roadName: newSigRoad.trim() || id,
      type: newSigType,
    } as SignalConfig;
  };

  const handleSaveNew = async () => {
    const draftSignal = buildDraftSignal();

    if (!draftSignal && !hasUnsavedChanges && !pendingIntersection) {
      setError('Complete the signal details before saving.');
      return;
    }

    if (draftSignal && editedConfigs.some((c) => c.id === draftSignal.id)) {
      setError('Signal ID already exists');
      return;
    }

    setError(null);

    const configsToSave = draftSignal ? [...editedConfigs, draftSignal] : editedConfigs;
    setEditedConfigs(configsToSave);
    setSaveMessage('Saving new signal and intersection...');

    if (pendingIntersection) {
      await onSaveIntersectionIPs();
    }

    const success = await onSaveSignalConfigs(configsToSave);
    if (success) {
      onSignalConfigsChange(configsToSave);
      setSaveMessage('New signal saved and map updated.');
      setNewSigId('');
      onNewSignalLatChange('');
      onNewSignalLngChange('');
      setNewSigRoad('');
      setNewSigType('highway');
      setNewIntId('');
      setNewIntIp('');
      setPendingIntersection(null);
    } else {
      setSaveMessage('Unable to save changes. Please try again.');
    }
  };

  const handleRemoveSignal = (id: string) => {
    setEditedConfigs((current) => current.filter((c) => c.id !== id));
  };

  const handleConfigChange = (id: string, field: keyof SignalConfig, value: string) => {
    setEditedConfigs((current) =>
      current.map((c) =>
        c.id === id
          ? { ...c, [field]: field === 'latitude' || field === 'longitude' ? Number(value) : value }
          : c,
      ),
    );
  };

  const handleSaveAll = async () => {
    setSaveMessage('Saving changes...');
    const success = await onSaveSignalConfigs(editedConfigs);
    if (success) {
      onSignalConfigsChange(editedConfigs);
      setSaveMessage('All changes saved globally.');
    } else {
      setSaveMessage('Unable to save changes. Please try again.');
    }
  };

  const handleUndoAll = () => {
    setEditedConfigs(signalConfigs);
    const ids = new Set(signalConfigs.map((config) => config.intersection));
    setExpandedIntersections(ids);
    setSaveMessage('Unsaved changes reverted.');
  };

  const toggleIntersection = (intersection: string) => {
    setExpandedIntersections((current) => {
      const next = new Set(current);
      if (next.has(intersection)) {
        next.delete(intersection);
      } else {
        next.add(intersection);
      }
      return next;
    });
    setActiveIntersection(intersection);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
<DialogContent className="left-0 top-0 translate-x-0 translate-y-0 max-w-none w-screen h-screen max-h-none overflow-hidden flex flex-col rounded-none">
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

            <Tabs defaultValue="esp32ips" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="w-full">
                <TabsTrigger value="esp32ips" className="flex-1 text-xs font-mono">Intersection ESP32 IPs</TabsTrigger>
                <TabsTrigger value="intersections" className="flex-1 text-xs font-mono">Intersections</TabsTrigger>
                <TabsTrigger value="add" className="flex-1 text-xs font-mono">+ Add New</TabsTrigger>
              </TabsList>

              <TabsContent value="esp32ips" className="flex-1 overflow-y-auto pr-1">
                <div className="rounded-lg border border-border bg-secondary/30 p-3 mb-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 className="text-xs font-mono font-bold text-foreground uppercase tracking-wider">
                        Intersection ESP32 IPs
                      </h3>
                      <p className="text-[10px] font-mono text-muted-foreground mt-1">
                        One IP per intersection. Save to make changes persistent across devices.
                      </p>
                    </div>
                    <button
                      onClick={onSaveIntersectionIPs}
                      disabled={savingIntersectionIPs}
                      className="rounded-md bg-primary px-3 py-2 text-xs font-mono font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {savingIntersectionIPs ? 'Saving…' : 'Save IPs'}
                    </button>
                  </div>
                  <div className="grid gap-3 mt-4">
                    {intersections.map((intId) => (
                      <label key={intId} className="text-[9px] font-mono text-muted-foreground">
                        {intId} IP
                        <input
                          value={intersectionIPs[intId] || ''}
                          onChange={(e) => onIntersectionIpChange(intId, e.target.value)}
                          placeholder="e.g. 192.168.1.100"
                          className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground"
                        />
                      </label>
                    ))}
                    {intersections.length === 0 && (
                      <p className="text-[10px] text-muted-foreground">No intersections configured yet.</p>
                    )}
                  </div>
                  {intersectionIPMessage && (
                    <p className="text-[10px] mt-3 font-mono text-muted-foreground">{intersectionIPMessage}</p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="intersections" className="flex-1 overflow-hidden pr-1">
                <div className="sticky top-0 z-20 border-b border-border bg-card/95 pb-4 pt-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-xs font-mono font-bold text-foreground uppercase tracking-wider">Intersections</h3>
                      <p className="text-[10px] font-mono text-muted-foreground mt-1">
                        Edit intersection signals and save changes when ready.
                      </p>
                      <p className={`mt-2 text-[10px] font-mono ${hasUnsavedChanges ? 'text-signal-yellow' : 'text-muted-foreground'}`}>
                        {hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <button
                        onClick={handleUndoAll}
                        disabled={!hasUnsavedChanges}
                        className="rounded-md border border-border bg-background px-3 py-2 text-xs font-mono text-foreground hover:bg-secondary disabled:opacity-50"
                      >
                        Undo
                      </button>
                      <button
                        onClick={handleSaveAll}
                        disabled={!hasUnsavedChanges || savingSignalConfigs}
                        className="rounded-md bg-primary px-3 py-2 text-xs font-mono font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {savingSignalConfigs ? 'Saving…' : 'Save All Changes'}
                      </button>
                    </div>
                  </div>
                  {saveMessage && <p className="mt-2 text-[10px] font-mono text-muted-foreground">{saveMessage}</p>}
                </div>

                <div className="mt-4 space-y-4 overflow-y-auto pr-1 pb-4" style={{ maxHeight: '70vh' }}>
                  {intersections.map((intId) => {
                    const intSignals = editedConfigs.filter((c) => c.intersection === intId);
                    const isExpanded = expandedIntersections.has(intId);
                    const isActive = activeIntersection === intId;

                    return (
                      <div
                        key={intId}
                        className={`overflow-hidden rounded-2xl border ${isActive ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-secondary/30'} transition-all duration-200`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleIntersection(intId)}
                          className="w-full px-4 py-3 text-left"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="text-xs font-mono font-bold text-foreground uppercase tracking-wider">{intId}</p>
                              <p className="text-[10px] font-mono text-muted-foreground mt-1">{intSignals.length} signals</p>
                            </div>
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {isExpanded ? 'Collapse' : 'Expand'}
                            </span>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-border bg-card/80 px-4 py-4">
                            <div className="grid gap-4">
                              {intSignals.length > 0 ? (
                                intSignals.map((config) => (
                                  <div key={config.id} className="rounded-xl border border-border bg-background p-4 shadow-sm">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                      <div>
                                        <p className="text-xs font-bold font-mono text-foreground">{config.id}</p>
                                        <p className="text-[10px] font-mono text-muted-foreground">{config.type === 'highway' ? 'Highway signal' : 'Side road signal'}</p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveSignal(config.id)}
                                        className="rounded-md border border-destructive px-2 py-1 text-[10px] font-mono text-destructive hover:bg-destructive/10"
                                      >
                                        Remove
                                      </button>
                                    </div>

                                    <div className="grid gap-3 md:grid-cols-3">
                                      <label className="text-[10px] font-mono text-muted-foreground">
                                        Road
                                        <input
                                          value={config.roadName}
                                          onChange={(e) => handleConfigChange(config.id, 'roadName', e.target.value)}
                                          className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground"
                                        />
                                      </label>
                                      <label className="text-[10px] font-mono text-muted-foreground">
                                        Lat
                                        <input
                                          value={config.latitude}
                                          onChange={(e) => handleConfigChange(config.id, 'latitude', e.target.value)}
                                          className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground"
                                          type="number"
                                          step="0.000001"
                                        />
                                      </label>
                                      <label className="text-[10px] font-mono text-muted-foreground">
                                        Lng
                                        <input
                                          value={config.longitude}
                                          onChange={(e) => handleConfigChange(config.id, 'longitude', e.target.value)}
                                          className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground"
                                          type="number"
                                          step="0.000001"
                                        />
                                      </label>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <p className="text-[10px] font-mono text-muted-foreground">No signals configured for this intersection.</p>
                              )}
                            </div>
                          </div>
                        )}
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
                    <button
                      type="button"
                      onClick={handleAddIntersection}
                      className="mt-3 rounded-md bg-primary px-3 py-2 text-xs font-mono font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      Add Intersection
                    </button>
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
                          value={newSignalLat}
                          onChange={(e) => onNewSignalLatChange(e.target.value)}
                          className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground"
                          type="number"
                          step="0.000001"
                          placeholder="19.838"
                        />
                      </label>
                      <label className="text-[9px] font-mono text-muted-foreground">
                        Longitude
                        <input
                          value={newSignalLng}
                          onChange={(e) => onNewSignalLngChange(e.target.value)}
                          className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground"
                          type="number"
                          step="0.000001"
                          placeholder="75.246"
                        />
                      </label>
                      <div className="col-span-2 flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={onToggleSignalPickLocation}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-[10px] font-mono text-foreground hover:bg-secondary"
                        >
                          {isPickingSignalLocation ? 'Cancel map pick' : 'Pick location on map'}
                        </button>
                        <p className="text-[9px] font-mono text-muted-foreground">
                          {isPickingSignalLocation
                            ? 'Click anywhere on the map to choose the new signal location.'
                            : 'Use the map picker to automatically fill latitude and longitude for this signal.'}
                        </p>
                      </div>
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
                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                      <button
                        onClick={handleAddSignal}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono font-semibold text-foreground hover:bg-secondary"
                        type="button"
                      >
                        + Add Signal to draft
                      </button>
                      <button
                        onClick={handleSaveNew}
                        disabled={savingSignalConfigs || savingIntersectionIPs}
                        className="w-full rounded-md bg-primary px-3 py-2 text-xs font-mono font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        type="button"
                      >
                        {savingSignalConfigs || savingIntersectionIPs ? 'Saving…' : 'Save New Signal'}
                      </button>
                    </div>
                    {pendingIntersection && (
                      <p className="text-[9px] font-mono text-muted-foreground mt-2">
                        Added intersection <span className="font-semibold text-foreground">{pendingIntersection}</span>. Add more signals to this intersection before saving.
                      </p>
                    )}
                    {draftSignals.length > 0 && (
                      <div className="mt-3 rounded-lg border border-border bg-background p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-mono font-semibold text-foreground">Draft signals</p>
                          <span className="text-[9px] font-mono text-muted-foreground">{draftSignals.length}</span>
                        </div>
                        <div className="space-y-2 text-[9px] font-mono text-muted-foreground">
                          {draftSignals.map((draft) => (
                            <div key={draft.id} className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2">
                              <div>
                                <p className="font-semibold text-foreground">{draft.id}</p>
                                <p>{draft.intersection} · {draft.latitude.toFixed(6)}, {draft.longitude.toFixed(6)}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveSignal(draft.id)}
                                className="rounded-md border border-destructive px-2 py-1 text-[10px] font-mono text-destructive hover:bg-destructive/10"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-[9px] font-mono text-muted-foreground mt-2">
                      Use Save to persist the new intersection and signals, then refresh the map.
                    </p>
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
