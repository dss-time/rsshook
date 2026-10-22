import { useCallback, useRef, useState } from 'react';
import {
  createTaskQueue,
  integer,
  type TaskOptions,
} from '../core/request/taskQueue';
import { useAsyncTask } from './useAsyncTask';
import { abortableTask } from '../core/request/abort';
export type BatchResult<T> =
  | { index: number; status: 'fulfilled'; value: T }
  | { index: number; status: 'rejected'; reason: unknown };
export interface BatchTaskOptions<T> {
  concurrency?: number;
  collectResults?: boolean;
  retainFailed?: boolean;
  task?: Omit<TaskOptions, 'id' | 'signal'>;
  onResult?: (result: BatchResult<T>) => void | Promise<void>;
}
export interface BatchReport<T> {
  total: number;
  succeeded: number;
  failed: number;
  results: BatchResult<T>[];
}
/** Bounded producer: at most concurrency tasks are read/enqueued at once. */
export function useBatchTask<I, O>(
  worker: (
    item: I,
    context: { index: number; signal: AbortSignal }
  ) => Promise<O> | O,
  options: BatchTaskOptions<O> = {}
) {
  const latest = useRef({ worker, options });
  latest.current = { worker, options };
  const failures = useRef<I[]>([]);
  const [progress, setProgress] = useState({
    completed: 0,
    succeeded: 0,
    failed: 0,
  });
  const operation = useAsyncTask(
    async (
      items: Iterable<I> | AsyncIterable<I>,
      signal: AbortSignal
    ): Promise<BatchReport<O>> => {
      const { worker, options } = latest.current;
      const concurrency = integer(options.concurrency ?? 3, 'concurrency', 1);
      const queue = createTaskQueue({ concurrency });
      const report: BatchReport<O> = {
        total: 0,
        succeeded: 0,
        failed: 0,
        results: [],
      };
      const active = new Set<Promise<void>>();
      const iterator =
        (items as AsyncIterable<I>)[Symbol.asyncIterator]?.() ??
        (items as Iterable<I>)[Symbol.iterator]();
      let done = false,
        closed = false;
      failures.current = [];
      setProgress({ completed: 0, succeeded: 0, failed: 0 });
      const abort = () => queue.dispose();
      signal.addEventListener('abort', abort, { once: true });
      try {
        while (!signal.aborted) {
          const next = await abortableTask(
            Promise.resolve(iterator.next()),
            signal
          );
          if (signal.aborted) break;
          if (next.done) {
            done = true;
            break;
          }
          const index = report.total++;
          const task = queue
            .add(s => worker(next.value, { index, signal: s }), options.task)
            .then<BatchResult<O>, BatchResult<O>>(
              value => ({ index, status: 'fulfilled', value }),
              reason => ({ index, status: 'rejected', reason })
            )
            .then(async result => {
              if (signal.aborted || closed) return;
              if (result.status === 'fulfilled') report.succeeded++;
              else {
                report.failed++;
                if (options.retainFailed) failures.current.push(next.value);
              }
              if (options.collectResults !== false) report.results.push(result);
              await abortableTask(
                Promise.resolve(options.onResult?.(result)),
                signal
              );
              if (!signal.aborted && !closed)
                setProgress({
                  completed: report.succeeded + report.failed,
                  succeeded: report.succeeded,
                  failed: report.failed,
                });
            });
          active.add(task);
          task.then(
            () => active.delete(task),
            () => {}
          );
          if (active.size >= concurrency) await Promise.race(active);
        }
        await Promise.all(active);
        report.results.sort((a, b) => a.index - b.index);
        return report;
      } finally {
        closed = true;
        signal.removeEventListener('abort', abort);
        queue.dispose();
        // Attach handlers before abandoning in-flight consumers or a slow producer.
        void Promise.allSettled(active);
        if (!done && iterator.return)
          void Promise.resolve(iterator.return()).catch(() => {});
      }
    },
    { policy: 'exhaust' }
  );
  const { run, reset: resetOperation } = operation;
  const reset = useCallback(() => {
    resetOperation();
    failures.current = [];
    setProgress({ completed: 0, succeeded: 0, failed: 0 });
  }, [resetOperation]);
  const retryFailed = useCallback(() => run([...failures.current]), [run]);
  return { ...operation, ...progress, reset, retryFailed };
}
