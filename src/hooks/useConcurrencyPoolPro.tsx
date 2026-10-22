import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  createTaskQueue,
  type TaskOptions,
  type QueueSnapshot,
} from '../core/request/taskQueue';
export type TaskFn<T = unknown> = (signal?: AbortSignal) => Promise<T> | T;
export interface AddTaskOptions extends TaskOptions {}
export interface ConcurrencyPool extends QueueSnapshot {
  add<T = unknown>(fn: TaskFn<T>, options?: AddTaskOptions): Promise<T>;
  pause(): void;
  resume(): void;
  cancel(id: string): void;
  cancelAll(): void;
  clearQueue(): void;
  setConcurrency(n: number): void;
}
export function useConcurrencyPool(initialConcurrency = 5): ConcurrencyPool {
  const [queue] = useState(() =>
    createTaskQueue({ concurrency: initialConcurrency })
  ); // Initial value; use setConcurrency for updates.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queue.cancelAll();
    };
  }, [queue]);
  const state = useSyncExternalStore(
    queue.subscribe,
    queue.getSnapshot,
    queue.getSnapshot
  );
  const add = useCallback(
    <T,>(fn: TaskFn<T>, options?: AddTaskOptions) =>
      mounted.current
        ? queue.add(fn, options)
        : Promise.reject(new Error('Pool unmounted')),
    [queue]
  );
  return useMemo(
    () => ({
      ...state,
      add,
      pause: queue.pause,
      resume: queue.resume,
      cancel: queue.cancel,
      cancelAll: queue.cancelAll,
      clearQueue: queue.clearQueue,
      setConcurrency: queue.setConcurrency,
    }),
    [state, add, queue]
  );
}
