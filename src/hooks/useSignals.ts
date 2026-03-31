// Signal sync hook - Isolated version: prevents cross-interference
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TrafficSignal, SignalState, SignalRuntime } from '@/types/signal';
import { SIGNAL_METADATA, DEFAULT_SETTINGS } from '@/types/signal';

export function useSignals() {
  const [signals, setSignals] = useState<TrafficSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const runtimesRef = useRef<Map<string, SignalRuntime>>(new Map());
  // Cache to prevent signal loss during interference
  const signalCacheRef = useRef<Map<string, TrafficSignal>>(new Map());

  const fetchSignals = useCallback(async () => {
    const { data, error } = await supabase
      .from('traffic_signals')
      .select('*')
      .order('id', { ascending: true });

    if (!error && data) {
      // Merge with cache to prevent signal loss
      const mergedData = [...data];
      
      // Check if any cached signals are missing from fetch (interference detection)
      const fetchedIds = new Set(data.map(s => s.id));
      signalCacheRef.current.forEach((cachedSignal, id) => {
        if (!fetchedIds.has(id)) {
          // Signal missing from fetch - use cached version
          console.warn(`[useSignals] Signal ${id} missing from fetch, using cache`);
          mergedData.push(cachedSignal);
        }
      });

      // Enrich signals with metadata
      const enriched = (mergedData as unknown as TrafficSignal[]).map((signal) => ({
        ...signal,
        intersection: signal.intersection ?? SIGNAL_METADATA[signal.id]?.intersection,
        roadName: (signal.roadName ?? signal['road_name'] ?? SIGNAL_METADATA[signal.id]?.roadName) || 'default',
        type: (signal.type ?? SIGNAL_METADATA[signal.id]?.type) || 'highway',
      }));

      // Update cache with fresh data
      enriched.forEach(signal => {
        signalCacheRef.current.set(signal.id, signal);
      });

      setSignals(enriched);

      // Create runtime info for each signal - NO CYCLE CALCULATION
      // Just use the actual state from database
      enriched.forEach((signal) => {
        runtimesRef.current.set(signal.id, {
          elapsed: 0,
          cycle: { 
            GREEN: DEFAULT_SETTINGS.cycle.GREEN, 
            YELLOW: DEFAULT_SETTINGS.cycle.YELLOW, 
            RED: DEFAULT_SETTINGS.cycle.RED 
          },
          state: signal.state as SignalState,
        });
      });

      // Clean up removed signals
      const currentIds = new Set(enriched.map((signal) => signal.id));
      Array.from(runtimesRef.current.keys()).forEach((id) => {
        if (!currentIds.has(id)) {
          runtimesRef.current.delete(id);
        }
      });
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSignals();
    
    // Fast polling for responsive updates (500ms)
    const interval = setInterval(fetchSignals, 500);

    return () => {
      clearInterval(interval);
    };
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
