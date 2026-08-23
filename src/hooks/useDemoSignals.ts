import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_SETTINGS, SIGNAL_METADATA, type SignalState, type TrafficSignal } from '@/types/signal';

/**
 * Demo (dummy) signal cycling used when the physical ESP32 controllers are
 * not reachable. Mirrors the firmware logic:
 *  - each signal of an intersection owns one slot (GREEN then YELLOW)
 *  - all other signals of that intersection stay RED
 *  - emergency override: the active signal is GREEN, everything else RED
 */
const GREEN = DEFAULT_SETTINGS.cycle.GREEN;
const YELLOW = DEFAULT_SETTINGS.cycle.YELLOW;
const SLOT = GREEN + YELLOW;

function numericId(id: string): number {
  const n = Number(id.replace(/\D/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function useDemoSignals(
  baseSignals: TrafficSignal[],
  enabled: boolean,
  emergencySignalId?: string | null,
): TrafficSignal[] {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [enabled]);

  return useMemo(() => {
    if (!enabled || baseSignals.length === 0) return baseSignals;

    // Group by intersection, ordered by signal number (same order as firmware)
    const groups = new Map<string, TrafficSignal[]>();
    baseSignals.forEach((s) => {
      const key = s.intersection ?? SIGNAL_METADATA[s.id]?.intersection ?? 'UNKNOWN';
      const list = groups.get(key) ?? [];
      list.push(s);
      groups.set(key, list);
    });

    const overrides = new Map<string, { state: SignalState; updated_at: string }>();

    groups.forEach((list) => {
      const ordered = [...list].sort((a, b) => numericId(a.id) - numericId(b.id));
      const total = SLOT * ordered.length;
      const emergencyHere = emergencySignalId
        ? ordered.find((s) => s.id === emergencySignalId)
        : undefined;

      if (emergencyHere) {
        ordered.forEach((s) => {
          overrides.set(s.id, {
            state: s.id === emergencyHere.id ? 'GREEN' : 'RED',
            updated_at: new Date(now).toISOString(),
          });
        });
        return;
      }

      const tSec = (now / 1000) % total;
      const activeIdx = Math.floor(tSec / SLOT);
      const inSlot = tSec % SLOT;

      ordered.forEach((s, idx) => {
        let state: SignalState;
        let phaseStartSec: number;

        if (idx === activeIdx) {
          if (inSlot < GREEN) {
            state = 'GREEN';
            phaseStartSec = inSlot;
          } else {
            state = 'YELLOW';
            phaseStartSec = inSlot - GREEN;
          }
        } else {
          state = 'RED';
          // seconds since this signal's slot ended
          const sinceSlotEnd = (tSec - (idx + 1) * SLOT + total) % total;
          phaseStartSec = sinceSlotEnd;
        }

        overrides.set(s.id, {
          state,
          updated_at: new Date(now - phaseStartSec * 1000).toISOString(),
        });
      });
    });

    return baseSignals.map((s) => {
      const o = overrides.get(s.id);
      return o ? { ...s, state: o.state, updated_at: o.updated_at } : s;
    });
  }, [baseSignals, enabled, emergencySignalId, now]);
}
