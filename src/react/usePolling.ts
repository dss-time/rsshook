import { useCallback, useEffect, useRef, useState } from 'react';
import { integer } from '../core/request/taskQueue';
export interface PollingOptions {
  interval?: number;
  enabled?: boolean;
  immediate?: boolean;
  pauseWhenHidden?: boolean;
  refreshOnFocus?: boolean;
  onError?: (error: unknown) => void;
}
/** Completion-based scheduling: timer/focus/visibility requests never overlap. */
export function usePolling(
  callback: (signal: AbortSignal) => void | Promise<void>,
  options: PollingOptions = {}
) {
  const {
    interval = 30000,
    enabled = true,
    immediate = true,
    pauseWhenHidden = true,
    refreshOnFocus = true,
  } = options;
  integer(interval, 'interval', 1);
  const latest = useRef({ callback, onError: options.onError });
  latest.current = { callback, onError: options.onError };
  const trigger = useRef<() => void>(() => {});
  const [state, setState] = useState<{ running: boolean; error?: unknown }>({
    running: false,
  });
  useEffect(() => {
    let stopped = false,
      busy = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const visible = () =>
      !pauseWhenHidden ||
      typeof document === 'undefined' ||
      document.visibilityState !== 'hidden';
    const schedule = () => {
      clearTimeout(timer);
      if (!stopped && enabled && visible()) timer = setTimeout(run, interval);
    };
    async function run() {
      if (stopped || !enabled || busy || !visible()) return;
      clearTimeout(timer);
      busy = true;
      controller = new AbortController();
      setState({ running: true });
      try {
        await latest.current.callback(controller.signal);
        if (!stopped) setState({ running: false });
      } catch (error) {
        if (!stopped) {
          setState({ running: false, error });
          try {
            latest.current.onError?.(error);
          } catch {
            /* Notification must not break scheduling. */
          }
        }
      } finally {
        busy = false;
        schedule();
      }
    }
    const refresh = () => {
      void run();
    };
    const visibility = () => {
      if (visible()) refresh();
      else clearTimeout(timer);
    };
    trigger.current = refresh;
    setState({ running: false });
    if (enabled) {
      if (immediate) refresh();
      else schedule();
    }
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', visibility);
    if (refreshOnFocus && typeof window !== 'undefined')
      window.addEventListener('focus', refresh);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      trigger.current = () => {};
      if (typeof document !== 'undefined')
        document.removeEventListener('visibilitychange', visibility);
      if (typeof window !== 'undefined')
        window.removeEventListener('focus', refresh);
    };
  }, [interval, enabled, immediate, pauseWhenHidden, refreshOnFocus]);
  const refresh = useCallback(() => trigger.current(), []);
  return { ...state, refresh };
}
