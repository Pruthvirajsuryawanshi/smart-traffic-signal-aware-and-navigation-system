// Signal sync hook - follows DB state from ESP32 hardware
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TrafficSignal, SignalState, SignalRuntime } from '@/types/signal';
import { SIGNAL_METADATA, DEFAULT_SETTINGS } from '@/types/signal';

function signalSortKey(id: string): number {
  const parsed = Number(id.replace(/\D/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function useSignals() {
  const [signals, setSignals] = useState<TrafficSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const runtimesRef = useRef<Map<string, SignalRuntime>>(new Map());

  const fetchSignals = useCallback(async () => {
    const { data, error } = await supabase
      .from('traffic_signals')
      .select('*')
      .order('id', { ascending: true });

    if (!error && data) {
      const enriched = (data as unknown as TrafficSignal[]).map((signal) => ({
        ...signal,
        roadName: SIGNAL_METADATA[signal.id]?.roadName || signal.id,
        type: SIGNAL_METADATA[signal.id]?.type || 'highway',
      }));

      setSignals(enriched);

      const currentIds = new Set(enriched.map((signal) => signal.id));

      const byIntersection = new Map<string, TrafficSignal[]>();
      for (const signal of enriched) {
        const intersection = SIGNAL_METADATA[signal.id]?.intersection ?? 'default';
        if (!byIntersection.has(intersection)) byIntersection.set(intersection, []);
        byIntersection.get(intersection)!.push(signal);
      }

      for (const [, intSignalsRaw] of byIntersection) {
        const intSignals = [...intSignalsRaw].sort((a, b) => signalSortKey(a.id) - signalSortKey(b.id));
        const activeSignal =
          intSignals.find((signal) => signal.state === 'GREEN') ??
          intSignals.find((signal) => signal.state === 'YELLOW') ??
          intSignals
            .slice()
            .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];

        if (!activeSignal) continue;

        const activeIndex = intSignals.findIndex((signal) => signal.id === activeSignal.id);
        const anchorMs = Date.parse(activeSignal.updated_at);
        const safeAnchorMs = Number.isFinite(anchorMs) ? anchorMs : Date.now();

        const green = DEFAULT_SETTINGS.cycle.GREEN;
        const yellow = DEFAULT_SETTINGS.cycle.YELLOW;
        const slotDuration = green + yellow;
        const red = slotDuration * Math.max(intSignals.length - 1, 1);
        const totalCycle = slotDuration * Math.max(intSignals.length, 1);

        const elapsedFromAnchor = Math.max(0, Math.floor((Date.now() - safeAnchorMs) / 1000));
        const phasePos = elapsedFromAnchor % totalCycle;
        const slotShift = Math.floor(phasePos / slotDuration);
        const slotOffset = phasePos % slotDuration;
        const activeNowIndex = (activeIndex + slotShift) % intSignals.length;

        intSignals.forEach((signal, index) => {
          let state: SignalState = 'RED';
          let elapsed = green + yellow;

          if (index === activeNowIndex) {
            if (slotOffset < green) {
              state = 'GREEN';
              elapsed = slotOffset;
            } else {
              state = 'YELLOW';
              elapsed = green + (slotOffset - green);
            }
          } else {
            const distanceSlots = (activeNowIndex - index + intSignals.length) % intSignals.length;
            const redElapsed = Math.max(0, (distanceSlots - 1) * slotDuration + slotOffset);
            elapsed = green + yellow + Math.min(redElapsed, Math.max(red - 1, 0));
          }

          runtimesRef.current.set(signal.id, {
            elapsed,
            cycle: { GREEN: green, YELLOW: yellow, RED: red },
            state,
          });
        });
      }

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
    const interval = setInterval(fetchSignals, 1000);
    return () => clearInterval(interval);
  }, [fetchSignals]);

  const updateSignal = useCallback(async (id: string, state: SignalState) => {
    await supabase.functions.invoke('update-signals', {
      body: { [id]: state },
    });

    await fetchSignals();
  }, [fetchSignals]);

  const getRuntime = useCallback((id: string) => {
    return runtimesRef.current.get(id);
  }, []);

  return { signals, loading, updateSignal, getRuntime, runtimes: runtimesRef };
}
