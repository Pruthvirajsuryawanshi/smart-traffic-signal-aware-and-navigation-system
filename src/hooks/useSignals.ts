// Signal sync hook - Uses Realtime + fast polling fallback
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TrafficSignal, SignalState, SignalRuntime } from '@/types/signal';
import { SIGNAL_METADATA, DEFAULT_SETTINGS } from '@/types/signal';

const KNOWN_TABLES = ['traffic_signals_int1', 'traffic_signals_int2'] as const;

export function useSignals() {
  const [signals, setSignals] = useState<TrafficSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const runtimesRef = useRef<Map<string, SignalRuntime>>(new Map());
  const extraTablesRef = useRef<string[]>([]);
  const lastFetchRef = useRef<number>(0);

  const discoverTables = useCallback(async () => {
    const maxCheck = 10;
    const newTables: string[] = [];
    for (let i = 3; i <= maxCheck; i++) {
      const tableName = `traffic_signals_int${i}`;
      if (extraTablesRef.current.includes(tableName)) {
        newTables.push(tableName);
        continue;
      }
      try {
        const { data, error } = await supabase.from(tableName as any).select('id').limit(1);
        if (!error && data) {
          newTables.push(tableName);
        } else {
          break;
        }
      } catch {
        break;
      }
    }
    extraTablesRef.current = newTables;
    return newTables;
  }, []);

  const enrichSignals = useCallback((allData: any[]): TrafficSignal[] => {
    return allData.map((signal) => ({
      ...signal,
      intersection: signal.intersection ?? SIGNAL_METADATA[signal.id]?.intersection,
      roadName: (signal.road_name ?? signal.roadName ?? SIGNAL_METADATA[signal.id]?.roadName) || 'default',
      type: (signal.type ?? SIGNAL_METADATA[signal.id]?.type) || 'highway',
    }));
  }, []);

  const updateRuntimes = useCallback((enriched: TrafficSignal[]) => {
    enriched.forEach((signal) => {
      runtimesRef.current.set(signal.id, {
        elapsed: 0,
        cycle: {
          GREEN: DEFAULT_SETTINGS.cycle.GREEN,
          YELLOW: DEFAULT_SETTINGS.cycle.YELLOW,
          RED: DEFAULT_SETTINGS.cycle.RED,
        },
        state: signal.state as SignalState,
      });
    });
    const currentIds = new Set(enriched.map(s => s.id));
    for (const id of runtimesRef.current.keys()) {
      if (!currentIds.has(id)) runtimesRef.current.delete(id);
    }
  }, []);

  const fetchSignals = useCallback(async () => {
    // Throttle: skip if last fetch was < 200ms ago
    const now = Date.now();
    if (now - lastFetchRef.current < 200) return;
    lastFetchRef.current = now;

    const extraTables = await discoverTables();
    const allTableNames = [...KNOWN_TABLES, ...extraTables];

    const results = await Promise.all(
      allTableNames.map(table =>
        supabase.from(table as any).select('*').order('id', { ascending: true })
      )
    );

    const allData: any[] = [];
    for (const { data, error } of results) {
      if (!error && data) {
        allData.push(...data);
      }
    }

    if (allData.length > 0) {
      const enriched = enrichSignals(allData);
      setSignals(enriched);
      updateRuntimes(enriched);
    }

    setLoading(false);
  }, [discoverTables, enrichSignals, updateRuntimes]);

  // Apply a single realtime change instantly without full refetch
  const applyRealtimeChange = useCallback((payload: any) => {
    const newRecord = payload.new;
    if (!newRecord || !newRecord.id) return;

    setSignals(prev => {
      const idx = prev.findIndex(s => s.id === newRecord.id);
      const enrichedRecord: TrafficSignal = {
        ...newRecord,
        intersection: newRecord.intersection ?? SIGNAL_METADATA[newRecord.id]?.intersection,
        roadName: (newRecord.road_name ?? newRecord.roadName ?? SIGNAL_METADATA[newRecord.id]?.roadName) || 'default',
        type: (newRecord.type ?? SIGNAL_METADATA[newRecord.id]?.type) || 'highway',
      };

      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = enrichedRecord;
        return updated;
      } else if (payload.eventType === 'INSERT') {
        return [...prev, enrichedRecord];
      }
      return prev;
    });

    // Update runtime for this signal
    if (newRecord.id) {
      runtimesRef.current.set(newRecord.id, {
        elapsed: 0,
        cycle: {
          GREEN: DEFAULT_SETTINGS.cycle.GREEN,
          YELLOW: DEFAULT_SETTINGS.cycle.YELLOW,
          RED: DEFAULT_SETTINGS.cycle.RED,
        },
        state: newRecord.state as SignalState,
      });
    }
  }, []);

  useEffect(() => {
    fetchSignals();

    // Subscribe to realtime changes on all known tables for instant updates
    const channels: ReturnType<typeof supabase.channel>[] = [];

    const allTables = [...KNOWN_TABLES, ...extraTablesRef.current];
    allTables.forEach(table => {
      const channel = supabase
        .channel(`realtime-${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
          console.log(`[Realtime] ${table} change:`, payload.eventType, (payload.new as any)?.id);
          if (payload.eventType === 'DELETE') {
            setSignals(prev => prev.filter(s => s.id !== (payload.old as any)?.id));
          } else {
            applyRealtimeChange(payload);
          }
        })
        .subscribe();
      channels.push(channel);
    });

    // Slower fallback poll (every 2s) for table discovery & missed events
    const interval = setInterval(fetchSignals, 2000);

    return () => {
      clearInterval(interval);
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [fetchSignals, applyRealtimeChange]);

  const updateSignal = useCallback(async (id: string, state: SignalState) => {
    await supabase.functions.invoke('update-signals', {
      body: { [id]: state },
    });
    // Realtime will handle the update, but force fetch as backup
    setTimeout(fetchSignals, 100);
  }, [fetchSignals]);

  const refreshSignals = useCallback(async () => {
    extraTablesRef.current = [];
    await fetchSignals();
  }, [fetchSignals]);

  const getRuntime = useCallback((id: string) => {
    return runtimesRef.current.get(id);
  }, []);

  return { signals, loading, updateSignal, refreshSignals, getRuntime, runtimes: runtimesRef };
}
