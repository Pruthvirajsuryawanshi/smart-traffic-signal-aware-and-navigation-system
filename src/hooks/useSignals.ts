// Signal sync hook - Isolated per-intersection tables to prevent cross-interference
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TrafficSignal, SignalState, SignalRuntime } from '@/types/signal';
import { SIGNAL_METADATA, DEFAULT_SETTINGS } from '@/types/signal';

// Intersection table config - add new intersections here
const INTERSECTION_TABLES = [
  'traffic_signals_int1',
  'traffic_signals_int2',
] as const;

export function useSignals() {
  const [signals, setSignals] = useState<TrafficSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const runtimesRef = useRef<Map<string, SignalRuntime>>(new Map());

  const fetchSignals = useCallback(async () => {
    // Fetch from each intersection table independently - no interference
    const results = await Promise.all(
      INTERSECTION_TABLES.map(table =>
        supabase.from(table).select('*').order('id', { ascending: true })
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
  }, []);

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

  const refreshSignals = useCallback(fetchSignals, [fetchSignals]);

  const getRuntime = useCallback((id: string) => {
    return runtimesRef.current.get(id);
  }, []);

  return { signals, loading, updateSignal, refreshSignals, getRuntime, runtimes: runtimesRef };
}
