// Signal sync hook - Isolated per-intersection tables to prevent cross-interference
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TrafficSignal, SignalState, SignalRuntime } from '@/types/signal';
import { SIGNAL_METADATA, DEFAULT_SETTINGS } from '@/types/signal';

// Known intersection tables - dynamically extended when new ones are discovered
const KNOWN_TABLES = ['traffic_signals_int1', 'traffic_signals_int2'] as const;

export function useSignals() {
  const [signals, setSignals] = useState<TrafficSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const runtimesRef = useRef<Map<string, SignalRuntime>>(new Map());
  const extraTablesRef = useRef<string[]>([]);

  const discoverTables = useCallback(async () => {
    // Try to discover additional intersection tables (INT-3, INT-4, etc.)
    // by attempting to query them. Cache discoveries.
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
          break; // Stop at first missing table
        }
      } catch {
        break;
      }
    }
    extraTablesRef.current = newTables;
    return newTables;
  }, []);

  const fetchSignals = useCallback(async () => {
    const extraTables = await discoverTables();
    const allTableNames = [...KNOWN_TABLES, ...extraTables];

    // Fetch from each intersection table independently
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
      const enriched: TrafficSignal[] = allData.map((signal) => ({
        ...signal,
        intersection: signal.intersection ?? SIGNAL_METADATA[signal.id]?.intersection,
        roadName: (signal.road_name ?? signal.roadName ?? SIGNAL_METADATA[signal.id]?.roadName) || 'default',
        type: (signal.type ?? SIGNAL_METADATA[signal.id]?.type) || 'highway',
      }));

      setSignals(enriched);

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

      // Clean up removed signals
      const currentIds = new Set(enriched.map(s => s.id));
      for (const id of runtimesRef.current.keys()) {
        if (!currentIds.has(id)) runtimesRef.current.delete(id);
      }
    }

    setLoading(false);
  }, [discoverTables]);

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 500);
    return () => clearInterval(interval);
  }, [fetchSignals]);

  const updateSignal = useCallback(async (id: string, state: SignalState) => {
    await supabase.functions.invoke('update-signals', {
      body: { [id]: state },
    });
    await fetchSignals();
  }, [fetchSignals]);

  const refreshSignals = useCallback(async () => {
    // Force re-discovery of tables on next fetch
    extraTablesRef.current = [];
    await fetchSignals();
  }, [fetchSignals]);

  const getRuntime = useCallback((id: string) => {
    return runtimesRef.current.get(id);
  }, []);

  return { signals, loading, updateSignal, refreshSignals, getRuntime, runtimes: runtimesRef };
}
