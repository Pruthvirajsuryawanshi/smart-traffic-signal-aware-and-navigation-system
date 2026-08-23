import { AlertTriangle, ChevronDown, ChevronRight, Cpu, RefreshCw, Wifi } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { HardwareState } from '@/hooks/useHardwareStatus';

interface Props {
  hardware: HardwareState;
}

/**
 * Shown when the physical ESP32 signals are not reachable:
 * tells the user the app is running on simulated (demo) signal states.
 */
const HardwareStatusBanner = ({ hardware }: Props) => {
  const [collapsed, setCollapsed] = useState(false);
  if (hardware.status === 'online') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-signal-green/40 bg-signal-green/10 px-3 py-2">
        <Wifi className="h-3.5 w-3.5 text-signal-green" />
        <span className="text-[10px] font-mono text-foreground">
          Hardware live · {hardware.onlineIntersections.join(', ')}
        </span>
      </div>
    );
  }

  if (hardware.status === 'checking') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/50 px-3 py-2">
        <Cpu className="h-3.5 w-3.5 animate-pulse text-muted-foreground" />
        <span className="text-[10px] font-mono text-muted-foreground">
          Checking hardware controllers…
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-signal-yellow/50 bg-signal-yellow/10 px-3 py-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal-yellow" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-foreground">
            Demo mode — physical signals not connected
          </p>
          <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
            Hardware integration is needed for live control. You can explore the full demo with
            dummy signal states in the meantime.
          </p>
          {hardware.reason && (
            <p className="mt-1 text-[10px] leading-snug text-muted-foreground/80">
              {hardware.reason}
            </p>
          )}
          <Button
            size="sm"
            variant="outline"
            className="mt-2 h-6 px-2 text-[10px]"
            onClick={hardware.recheck}
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Retry hardware check
          </Button>
        </div>
      </div>
    </div>
  );
};

export default HardwareStatusBanner;
