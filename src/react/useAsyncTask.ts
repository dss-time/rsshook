import { useCallback, useEffect, useRef, useState } from 'react';
import { abortError } from '../core/request/taskQueue';
export interface AsyncTaskOptions {
  policy?: 'latest' | 'exhaust';
  signal?: AbortSignal;
}
export interface AsyncTaskState<T> {
  status: 'idle' | 'running' | 'success' | 'error' | 'cancelled';
  data?: T;
  error?: unknown;
  loading: boolean;
}
/** Service receives (...args, signal). Cancellation settles the caller even if I/O ignores signal. */
export function useAsyncTask<A extends unknown[], T>(
  service: (...args: [...A, AbortSignal]) => Promise<T> | T,
  options: AsyncTaskOptions = {}
) {
  const latest = useRef({ service, options });
  latest.current = { service, options };
  const mounted = useRef(true),
    sequence = useRef(0);
  const active = useRef<{
    controller: AbortController;
    reject: (error: unknown) => void;
    unlink: () => void;
  } | null>(null);
  const [state, setState] = useState<AsyncTaskState<T>>({
    status: 'idle',
    loading: false,
  });
  const stop = useCallback(() => {
    const task = active.current;
    if (!task) return;
    active.current = null;
    sequence.current++;
    task.unlink();
    task.controller.abort();
    task.reject(abortError());
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop();
    };
  }, [stop]);
  const cancel = useCallback(() => {
    const running = !!active.current;
    stop();
    if (running && mounted.current)
      setState(s => ({ ...s, status: 'cancelled', loading: false }));
  }, [stop]);
  const reset = useCallback(() => {
    stop();
    if (mounted.current) setState({ status: 'idle', loading: false });
  }, [stop]);
  const run = useCallback(
    (...args: A): Promise<T> => {
      if (!mounted.current) return Promise.reject(abortError());
      const { service, options } = latest.current;
      if (active.current && options.policy === 'exhaust')
        return Promise.reject(
          Object.assign(new Error('Task is busy'), { name: 'BusyError' })
        );
      stop();
      if (options.signal?.aborted) {
        setState(s => ({ ...s, status: 'cancelled', loading: false }));
        return Promise.reject(abortError(options.signal.reason));
      }
      const id = ++sequence.current,
        controller = new AbortController();
      setState(s => ({
        ...s,
        status: 'running',
        error: undefined,
        loading: true,
      }));
      return new Promise<T>((resolve, reject) => {
        const external = () => cancel();
        const unlink = () =>
          options.signal?.removeEventListener('abort', external);
        active.current = { controller, reject, unlink };
        options.signal?.addEventListener('abort', external, { once: true });
        Promise.resolve()
          .then(() => {
            if (controller.signal.aborted) throw abortError();
            return service(...args, controller.signal);
          })
          .then(
            value => {
              if (id !== sequence.current) return;
              active.current = null;
              unlink();
              if (mounted.current)
                setState({ status: 'success', data: value, loading: false });
              resolve(value);
            },
            error => {
              if (id !== sequence.current) return;
              active.current = null;
              unlink();
              if (mounted.current)
                setState(s => ({
                  ...s,
                  status: 'error',
                  error,
                  loading: false,
                }));
              reject(error);
            }
          );
      });
    },
    [stop, cancel]
  );
  return { ...state, run, cancel, reset };
}
