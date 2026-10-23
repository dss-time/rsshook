import { useCallback, useEffect, useRef, useState } from 'react';
import { abortableTask } from '../core/request/abort';
import { integer } from '../core/request/taskQueue';
export interface PollingOptions {
  interval?: number;
  /** Milliseconds; 0 disables timeout. I/O must honor AbortSignal. */
  timeout?: number;
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
    timeout = 0,
    enabled = true,
    immediate = true,
    pauseWhenHidden = true,
    refreshOnFocus = true,
  } = options;
  integer(interval, 'interval', 1);
  integer(timeout, 'timeout');
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
      const attempt = controller;
      let timeoutError: Error | undefined;
      const deadline = timeout
        ? setTimeout(() => {
            timeoutError = Object.assign(new Error('Polling timed out'), {
              name: 'TimeoutError',
            });
            attempt.abort(timeoutError);
          }, timeout)
        : undefined;
      setState({ running: true });
      try {
        await abortableTask(
          Promise.resolve().then(() => {
            if (!attempt.signal.aborted)
              return latest.current.callback(attempt.signal);
          }),
          attempt.signal
        );
        if (!stopped) setState({ running: false });
      } catch (cause) {
        const error = timeoutError ?? cause;
        if (!stopped) {
          setState({ running: false, error });
          try {
            latest.current.onError?.(error);
          } catch {
            /* Notification must not break scheduling. */
          }
        }
      } finally {
        clearTimeout(deadline);
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
  }, [interval, timeout, enabled, immediate, pauseWhenHidden, refreshOnFocus]);
  const refresh = useCallback(() => trigger.current(), []);
  return { ...state, refresh };
}
