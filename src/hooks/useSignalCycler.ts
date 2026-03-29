import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useSignalCycler() {
  const [cycling, setCycling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRef = useRef(0);

  const signalIds = ['SIG-101', 'SIG-102', 'SIG-103'];

  const cycleStep = async () => {
    // Highway signals (SIG-101, SIG-102) are green together,
    // side road (SIG-103) alternates
    const step = stepRef.current % 2;
    const updates: Record<string, string> = {};

    if (step === 0) {
      // Highway green phase
      updates['SIG-101'] = 'GREEN';
      updates['SIG-102'] = 'GREEN';
      updates['SIG-103'] = 'RED';
    } else {
      // Side road green phase
      updates['SIG-101'] = 'RED';
      updates['SIG-102'] = 'RED';
      updates['SIG-103'] = 'GREEN';
    }

    await supabase.functions.invoke('update-signals', { body: updates });
    stepRef.current++;
  };

  const startCycling = () => {
    if (intervalRef.current) return;
    setCycling(true);
    cycleStep();
    intervalRef.current = setInterval(cycleStep, 5000);
  };

  const stopCycling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setCycling(false);
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { cycling, startCycling, stopCycling };
}
