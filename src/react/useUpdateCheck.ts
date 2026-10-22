import { useCallback, useRef, useState } from 'react';
import { usePolling } from './usePolling';
export interface UseCheckUpdateOptions {
  getVersion: (signal: AbortSignal) => Promise<string | null>;
  interval?: number;
  enabled?: boolean;
  onUpdate?: (version: string, previousVersion: string) => void;
}
/** Headless version detection; the host owns notifications, storage and refresh. */
export function useCheckUpdate(options: UseCheckUpdateOptions) {
  const latest = useRef(options);
  latest.current = options;
  const baseline = useRef<string>();
  const announced = useRef<string>();
  const [version, setVersion] = useState<string>();
  const [hasUpdate, setHasUpdate] = useState(false);
  const poll = usePolling(
    async signal => {
      const next = await latest.current.getVersion(signal);
      if (signal.aborted || !next) return;
      setVersion(next);
      if (baseline.current === undefined) {
        baseline.current = next;
        return;
      }
      const changed = next !== baseline.current;
      setHasUpdate(changed);
      if (changed && announced.current !== next) {
        announced.current = next;
        latest.current.onUpdate?.(next, baseline.current);
      }
    },
    { interval: options.interval ?? 3600000, enabled: options.enabled }
  );
  const accept = useCallback(() => {
    if (version) baseline.current = version;
    announced.current = undefined;
    setHasUpdate(false);
  }, [version]);
  return { ...poll, version, hasUpdate, accept, checkUpdate: poll.refresh };
}
export default useCheckUpdate;
