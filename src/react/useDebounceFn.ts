import { useCallback, useEffect, useRef, useState } from 'react';
import { integer } from '../core/request/taskQueue';
/** Trailing-edge callback debounce. Async errors are handled by the caller callback. */
export function useDebounceFn<A extends unknown[], T>(
  callback: (...args: A) => T,
  delay = 300
) {
  integer(delay, 'delay');
  const latest = useRef(callback);
  latest.current = callback;
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const args = useRef<A>();
  const mounted = useRef(true);
  const [pending, setPending] = useState(false);
  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    args.current = undefined;
    if (mounted.current) setPending(false);
  }, []);
  const flush = useCallback((): T | undefined => {
    const values = args.current;
    cancel();
    return values ? latest.current(...values) : undefined;
  }, [cancel]);
  const run = useCallback(
    (...values: A) => {
      if (!mounted.current) return;
      clearTimeout(timer.current);
      args.current = values;
      setPending(true);
      timer.current = setTimeout(flush, delay);
    },
    [delay, flush]
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      args.current = undefined;
    };
  }, []);
  useEffect(() => cancel, [delay, cancel]);
  return { run, cancel, flush, pending };
}
