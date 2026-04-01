import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import AdminAuthCard from './AdminAuthCard';

export type SignalConfig = {
  id: string;
  intersection: string;
  latitude: number;
  longitude: number;
  roadName: string;
  type: 'highway' | 'side';
};

type EditableSignalConfig = Omit<SignalConfig, 'latitude' | 'longitude'> & {
  latitude: string;
  longitude: string;
};

type PendingSignalDraft = {
  draftKey: string;
  id: string;
  intersection: string;
  latitude: string;
  longitude: string;
  roadName: string;
  type: 'highway' | 'side';
  editedId?: boolean;
  editedRoad?: boolean;
};

const parseIntersectionNumber = (intersectionId: string) => {
  const match = intersectionId.match(/INT-(\d+)$/i);
  return match ? Number(match[1]) : NaN;
};

const getNextIntersectionId = (intersectionIds: string[]) => {
  const numbers = intersectionIds
    .map((id) => parseIntersectionNumber(id))
    .filter((value) => !Number.isNaN(value));
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  return `INT-${next}`;
};

const getSignalBase = (intersectionId: string) => {
  const num = parseIntersectionNumber(intersectionId);
  return Number.isNaN(num) ? 100 : num * 100;
};

const getNextSignalIdForIntersection = (intersectionId: string, existingIds: Set<string>) => {
  const base = getSignalBase(intersectionId);
  let maxValue = base;

  existingIds.forEach((id) => {
    const match = id.match(/SIG-(\d+)$/i);
    if (!match) return;
    const value = Number(match[1]);
    if (Number.isNaN(value)) return;
    if (Math.floor(value / 100) === Math.floor(base / 100) && value > maxValue) {
      maxValue = value;
    }
  });

  return `SIG-${maxValue + 1}`;
};

const toEditableConfig = (config: SignalConfig): EditableSignalConfig => ({
  ...config,
  latitude: String(config.latitude),
  longitude: String(config.longitude),
});

const toSignalConfig = (config: EditableSignalConfig): SignalConfig => ({
  ...config,
  latitude: Number(config.latitude),
  longitude: Number(config.longitude),
});

const signalsDirections = ['North', 'South', 'East', 'West'];

const makeSuggestedSignalDrafts = (
  intersectionId: string,
  existingIds: Set<string>,
): PendingSignalDraft[] => {
  const base = getSignalBase(intersectionId);
  const drafts: PendingSignalDraft[] = [];

  for (let index = 1; index <= 4; index += 1) {
    const idValue = `SIG-${base + index}`;
    if (existingIds.has(idValue)) {
      continue;
    }
    drafts.push({
      draftKey: `${intersectionId}-${idValue}-${index}-${Date.now()}`,
      id: idValue,
      intersection: intersectionId,
      latitude: '',
      longitude: '',
      roadName: `${intersectionId} ${signalsDirections[index - 1] ?? 'Lane'}`,
      type: 'highway',
      editedId: false,
      editedRoad: false,
    });
  }

  if (drafts.length === 0) {
    const nextId = getNextSignalIdForIntersection(intersectionId, existingIds);
    drafts.push({
      draftKey: `${intersectionId}-${nextId}-${Date.now()}`,
      id: nextId,
      intersection: intersectionId,
      latitude: '',
      longitude: '',
      roadName: `${intersectionId} ${signalsDirections[0]}`,
      type: 'highway',
      editedId: false,
      editedRoad: false,
    });
  }

  return drafts;
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
  const [error, setError] = useState<string | null>(null);

  const [editedConfigs, setEditedConfigs] = useState<EditableSignalConfig[]>(signalConfigs.map(toEditableConfig));
  const [expandedIntersections, setExpandedIntersections] = useState<Set<string>>(new Set());
  const [activeIntersection, setActiveIntersection] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [pendingSignalsByIntersection, setPendingSignalsByIntersection] = useState<Record<string, SignalConfig[]>>({});

  // New intersection form
  const [newIntId, setNewIntId] = useState('');
  const [newIntIp, setNewIntIp] = useState('');
  const [pendingIntersection, setPendingIntersection] = useState<string | null>(null);
  const [currentNewSignals, setCurrentNewSignals] = useState<PendingSignalDraft[]>([]);

  // New signal form
  const [newSigId, setNewSigId] = useState('');
  const [newSigInt, setNewSigInt] = useState('');
  const [newSigRoad, setNewSigRoad] = useState('');
  const [newSigType, setNewSigType] = useState<'highway' | 'side'>('highway');

  useEffect(() => {
    if (!open) return;

    const existingIntersectionIds = [...new Set(signalConfigs.map((config) => config.intersection))];
    const nextIntersectionId = getNextIntersectionId(existingIntersectionIds);

    setEditedConfigs(signalConfigs.map(toEditableConfig));
    const initialIds = new Set(existingIntersectionIds);
    setExpandedIntersections(initialIds);
    setActiveIntersection(signalConfigs[0]?.intersection ?? null);
    setSaveMessage(null);
    setPendingSignalsByIntersection({});
    setNewIntId(nextIntersectionId);
    setNewIntIp('');
    setPendingIntersection(null);
    setCurrentNewSignals(makeSuggestedSignalDrafts(nextIntersectionId, new Set(signalConfigs.map((config) => config.id))));
    setNewSigInt(nextIntersectionId);
    setError(null);
    // Keep local edits intact while the panel remains open.
    // Only reset when the panel is opened fresh.
  }, [open, signalConfigs]);

  useEffect(() => {
    if (!open) return;
    setEditedConfigs((current) => {
      const currentById = new Map(current.map((c) => [c.id, c]));
      const merged = signalConfigs.map((config) => ({
        ...toEditableConfig(config),
        ...currentById.get(config.id),
      }));
      const additional = current.filter((c) => !merged.some((m) => m.id === c.id));
      return [...merged, ...additional];
    });
  }, [signalConfigs, open]);

  useEffect(() => {
    if (!newIntId) return;
    setCurrentNewSignals((current) =>
      current.map((signal, index) => {
        const base = getSignalBase(newIntId);
        const suggestionId = `SIG-${base + index + 1}`;
        const suggestedRoad = `${newIntId} ${signalsDirections[index] ?? 'Lane'}`;

        return {
          ...signal,
          intersection: newIntId,
          id: signal.editedId ? signal.id : suggestionId,
          roadName: signal.editedRoad ? signal.roadName : suggestedRoad,
        };
      }),
    );
  }, [newIntId]);

  const intersections = useMemo(
    () => [...new Set(editedConfigs.map((c) => c.intersection))].sort(),
    [editedConfigs],
  );

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(editedConfigs.map(toSignalConfig)) !== JSON.stringify(signalConfigs),
    [editedConfigs, signalConfigs],
  );

  const draftSignals = useMemo(
    () => editedConfigs.filter((config) => !signalConfigs.some((original) => original.id === config.id)),
    [editedConfigs, signalConfigs],
  );

  const getExistingSignalIdsForIntersection = (intersectionId: string) => {
    return new Set(
      editedConfigs
        .filter((config) => config.intersection === intersectionId)
        .map((config) => config.id),
    );
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
    setCurrentNewSignals((current) =>
      current.map((signal) => ({
        ...signal,
        intersection: newIntersection,
      })),
    );
  };

  const handleAddSignal = () => {
    const intId = newSigInt.trim() || newIntId.trim();
    if (!intId) { setError('Intersection is required to add a signal.'); return; }

    const existingIds = new Set([
      ...getExistingSignalIdsForIntersection(intId),
      ...currentNewSignals.filter((signal) => signal.intersection === intId).map((signal) => signal.id),
    ]);

    const nextSignalId = getNextSignalIdForIntersection(intId, existingIds);
    const index = currentNewSignals.filter((signal) => signal.intersection === intId).length;
    const roadDirection = signalsDirections[index] ?? `Lane ${index + 1}`;

    setCurrentNewSignals((current) => [
      ...current,
      {
        draftKey: `${intId}-${nextSignalId}-${Date.now()}`,
        id: nextSignalId,
        intersection: intId,
        latitude: '',
        longitude: '',
        roadName: `${intId} ${roadDirection}`,
        type: 'highway',
        editedId: false,
        editedRoad: false,
      },
    ]);

    if (!newSigInt) {
      setNewSigInt(intId);
    }
    setError(null);
  };

  const handleDraftSignalChange = (
    draftKey: string,
    field: keyof PendingSignalDraft,
    value: string,
  ) => {
    setCurrentNewSignals((current) =>
      current.map((signal) =>
        signal.draftKey === draftKey
          ? {
              ...signal,
              [field]: value,
              editedId: field === 'id' ? true : signal.editedId,
              editedRoad: field === 'roadName' ? true : signal.editedRoad,
            }
          : signal,
      ),
    );
  };

  const handleRemoveDraftSignal = (draftKey: string) => {
    setCurrentNewSignals((current) => current.filter((signal) => signal.draftKey !== draftKey));
  };

  const handleSaveNew = async () => {
    const trimmedIntersection = newIntId.trim();
    if (!trimmedIntersection) {
      setError('Intersection ID is required.');
      return;
    }
    if (!newIntIp.trim()) {
      setError('ESP32 IP is required.');
      return;
    }
    if (currentNewSignals.length === 0) {
      setError('Add at least one signal before saving.');
      return;
    }

    const invalidSignal = currentNewSignals.find((signal) => {
      return (
        !signal.id.trim() ||
        !signal.roadName.trim() ||
        !signal.latitude.trim() ||
        !signal.longitude.trim() ||
        Number.isNaN(Number(signal.latitude)) ||
        Number.isNaN(Number(signal.longitude))
      );
    });

    if (invalidSignal) {
      setError('Fill all signal fields with valid values before saving.');
      return;
    }

    const duplicateId = currentNewSignals.some((signal) =>
      editedConfigs.some((config) => config.id === signal.id),
    );
    if (duplicateId) {
      setError('One or more signal IDs already exist. Please use unique IDs.');
      return;
    }

    setError(null);
    const signalsToSave: SignalConfig[] = currentNewSignals.map((signal) => ({
      id: signal.id,
      intersection: trimmedIntersection,
      latitude: Number(signal.latitude),
      longitude: Number(signal.longitude),
      roadName: signal.roadName,
      type: signal.type,
    }));

    const nextEditedConfigs = [...editedConfigs, ...signalsToSave.map(toEditableConfig)];
    const configsToSave = [...editedConfigs.map(toSignalConfig), ...signalsToSave];
    setEditedConfigs(nextEditedConfigs);
    setSaveMessage('Saving new intersection and signals...');

    await onSaveIntersectionIPs();
    const success = await onSaveSignalConfigs(configsToSave);
    if (success) {
      onSignalConfigsChange(configsToSave);
      setSaveMessage('New intersection and signals saved.');
      const nextIntersectionId = getNextIntersectionId([
        ...intersections,
        trimmedIntersection,
      ]);
      setNewIntId(nextIntersectionId);
      setNewIntIp('');
      setNewSigInt(nextIntersectionId);
      setCurrentNewSignals(makeSuggestedSignalDrafts(nextIntersectionId, new Set(configsToSave.map((config) => config.id))));
      setPendingIntersection(null);
    } else {
      setSaveMessage('Unable to save changes. Please try again.');
    }
  };

  const handleRemoveSignal = (id: string) => {
    setEditedConfigs((current) => current.filter((c) => c.id !== id));
  };

  const handleConfigChange = (id: string, field: keyof EditableSignalConfig, value: string) => {
    setEditedConfigs((current) =>
      current.map((c) =>
        c.id === id
          ? { ...c, [field]: value }
          : c,
      ),
    );
  };

  const handleSaveAll = async () => {
    setSaveMessage('Saving changes...');
    const configsToSave = editedConfigs.map(toSignalConfig);
    const success = await onSaveSignalConfigs(configsToSave);
    if (success) {
      onSignalConfigsChange(configsToSave);
      setSaveMessage('All changes saved globally.');
    } else {
      setSaveMessage('Unable to save changes. Please try again.');
    }
  };

  const handleUndoAll = () => {
    setEditedConfigs(signalConfigs.map(toEditableConfig));
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
          <AdminAuthCard onAuthenticated={() => setLoggedIn(true)} />
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-2 gap-3">
              <span className="text-[10px] font-mono text-muted-foreground">Admin mode</span>
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
                <div className="rounded-lg border border-border bg-secondary/30 p-3 mb-3">
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
                      className="h-10 rounded-md bg-primary px-3 text-xs font-mono font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {savingIntersectionIPs ? 'Saving…' : 'Save IPs'}
                    </button>
                  </div>
                  <div className="grid gap-3 mt-3">
                    {intersections.map((intId) => (
                      <label key={intId} className="text-[10px] font-mono text-muted-foreground">
                        {intId} IP
                        <input
                          value={intersectionIPs[intId] || ''}
                          onChange={(e) => onIntersectionIpChange(intId, e.target.value)}
                          placeholder="e.g. 192.168.1.100"
                          className="mt-1 h-10 w-full rounded border border-border bg-background px-3 text-[11px] text-foreground"
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

              <TabsContent value="intersections" className="flex-1 overflow-auto pr-1 min-h-0">
                <div className="sticky top-0 z-20 border-b border-border bg-card/95 pb-3 pt-3">
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

                <div className="mt-3 grid gap-3 pb-4 min-h-0">
                  {intersections.map((intId) => {
                    const intSignals = editedConfigs.filter((c) => c.intersection === intId);
                    const isExpanded = expandedIntersections.has(intId);
                    const isActive = activeIntersection === intId;

                    return (
                      <div
                        key={intId}
                        className={`overflow-hidden rounded-xl border ${isActive ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-secondary/30'} transition-all duration-200`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleIntersection(intId)}
                          className="w-full px-3 py-2 text-left"
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
                          <div className="border-t border-border bg-card/80 px-2 py-2">
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {intSignals.length > 0 ? (
                                intSignals.map((config) => (
                                  <div key={config.id} className="rounded-xl border border-border bg-background p-2 shadow-sm">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
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

                                    <div className="grid gap-2 sm:grid-cols-3">
                                      <label className="sm:col-span-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                        Road
                                        <input
                                          value={config.roadName}
                                          onChange={(e) => handleConfigChange(config.id, 'roadName', e.target.value)}
                                          className="mt-1 h-8 w-full rounded border border-border bg-background px-2 text-sm text-foreground"
                                        />
                                      </label>
                                      <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                        Lat
                                        <input
                                          value={config.latitude}
                                          onChange={(e) => handleConfigChange(config.id, 'latitude', e.target.value)}
                                          className="mt-1 h-8 w-full rounded border border-border bg-background px-2 text-sm text-foreground"
                                          type="number"
                                          step="0.000001"
                                        />
                                      </label>
                                      <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                        Lng
                                        <input
                                          value={config.longitude}
                                          onChange={(e) => handleConfigChange(config.id, 'longitude', e.target.value)}
                                          className="mt-1 h-8 w-full rounded border border-border bg-background px-2 text-sm text-foreground"
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

              <TabsContent value="add" className="flex-1 overflow-y-auto pr-1 min-h-0">
                <div className="space-y-3 pb-6">
                  <div className="rounded-lg border border-border bg-secondary/30 p-3">
                    <h3 className="text-[10px] font-mono font-bold text-foreground uppercase tracking-wider mb-2">
                      New Intersection
                    </h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="text-[10px] font-mono text-muted-foreground">
                        Intersection ID
                        <input
                          value={newIntId}
                          onChange={(e) => setNewIntId(e.target.value)}
                          className="mt-1 h-9 w-full rounded border border-border bg-background px-3 text-[11px] text-foreground"
                        />
                      </label>
                      <label className="text-[10px] font-mono text-muted-foreground">
                        ESP32 IP
                        <input
                          value={newIntIp}
                          onChange={(e) => setNewIntIp(e.target.value)}
                          className="mt-1 h-9 w-full rounded border border-border bg-background px-3 text-[11px] text-foreground"
                        />
                      </label>
                    </div>
                    <p className="text-[9px] font-mono text-muted-foreground mt-1.5">
                      Auto-generated intersection ID and suggested signals are editable.
                    </p>
                    <button
                      type="button"
                      onClick={handleAddIntersection}
                      className="mt-3 w-full rounded-md bg-primary px-3 py-2 text-xs font-mono font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      Add Intersection
                    </button>
                  </div>

                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <h3 className="text-[10px] font-mono font-bold text-foreground uppercase tracking-wider">
                          Signal Suggestions
                        </h3>
                        <p className="text-[9px] font-mono text-muted-foreground mt-1">
                          Edit any suggested ID or road name, then add or remove signals as needed.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddSignal}
                        className="h-9 rounded-md bg-background px-3 text-xs font-mono font-semibold text-foreground hover:bg-secondary"
                      >
                        + Add Signal
                      </button>
                    </div>

                    <div className="grid gap-3 mt-3">
                      {currentNewSignals.map((signal) => (
                        <div key={signal.draftKey} className="rounded-xl border border-border bg-background p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{signal.id}</p>
                              <p className="text-[10px] text-muted-foreground">{signal.roadName}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveDraftSignal(signal.draftKey)}
                              className="rounded-md border border-destructive px-2 py-1 text-[10px] font-mono text-destructive hover:bg-destructive/10"
                            >
                              Remove
                            </button>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 mt-3">
                            <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                              Signal ID
                              <input
                                value={signal.id}
                                onChange={(e) => handleDraftSignalChange(signal.id, 'id', e.target.value)}
                                className="mt-1 h-9 w-full rounded border border-border bg-background px-2 text-sm text-foreground"
                              />
                            </label>
                            <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                              Road name
                              <input
                                value={signal.roadName}
                                onChange={(e) => handleDraftSignalChange(signal.draftKey, 'roadName', e.target.value)}
                                className="mt-1 h-9 w-full rounded border border-border bg-background px-2 text-sm text-foreground"
                              />
                            </label>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 mt-2">
                            <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                              Latitude
                              <input
                                value={signal.latitude}
                                onChange={(e) => handleDraftSignalChange(signal.id, 'latitude', e.target.value)}
                                className="mt-1 h-9 w-full rounded border border-border bg-background px-2 text-sm text-foreground"
                                type="number"
                                step="0.000001"
                              />
                            </label>
                            <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                              Longitude
                              <input
                                value={signal.longitude}
                                onChange={(e) => handleDraftSignalChange(signal.id, 'longitude', e.target.value)}
                                className="mt-1 h-9 w-full rounded border border-border bg-background px-2 text-sm text-foreground"
                                type="number"
                                step="0.000001"
                              />
                            </label>
                          </div>
                          <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 mt-2 block">
                            Type
                            <select
                              value={signal.type}
                              onChange={(e) => handleDraftSignalChange(signal.id, 'type', e.target.value)}
                              className="mt-1 h-9 w-full rounded border border-border bg-background px-2 text-sm text-foreground"
                            >
                              <option value="highway">Highway</option>
                              <option value="side">Side Road</option>
                            </select>
                          </label>
                        </div>
                      ))}
                    </div>

                    {error && <p className="text-[10px] text-destructive mt-2">{error}</p>}
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-[9px] font-mono text-muted-foreground">Use Save to persist the new intersection and signals.</p>
                      <button
                        onClick={handleSaveNew}
                        disabled={savingSignalConfigs || savingIntersectionIPs}
                        className="w-full rounded-md bg-primary px-3 py-2 text-xs font-mono font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 sm:w-auto"
                        type="button"
                      >
                        {savingSignalConfigs || savingIntersectionIPs ? 'Saving…' : 'Save'}
                      </button>
                    </div>
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
