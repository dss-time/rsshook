import { createTaskQueue } from './taskQueue';
/**
 * Options for creating a request queue.
 */
export interface RequestQueueOptions {
  /**
   * Maximum number of tasks running at the same time.
   *
   * @default 3
   */
  concurrency?: number;
  /**
   * Called when a task resolves.
   */
  onSuccess?: (value: unknown) => void;
  /**
   * Called when a task rejects.
   */
  onError?: (error: unknown) => void;
  /**
   * Called when there are no pending or running tasks.
   */
  onIdle?: () => void;
}

/**
 * Options for an added queue task.
 */
export interface RequestQueueTaskOptions {
  /**
   * Task priority. Larger values run earlier.
   *
   * @default 0
   */
  priority?: number;
}

/**
 * Request queue instance.
 */
export interface RequestQueueInstance {
  /**
   * Add a task to the queue and return its own promise.
   */
  add: <T>(
    task: () => Promise<T>,
    options?: RequestQueueTaskOptions
  ) => Promise<T>;
  /**
   * Pause scheduling new tasks.
   */
  pause: () => void;
  /**
   * Resume scheduling new tasks.
   */
  resume: () => void;
  /**
   * Clear pending tasks without interrupting running tasks.
   */
  clear: () => void;
  /**
   * Get pending task count.
   */
  pendingCount: () => number;
  /**
   * Get running task count.
   */
  runningCount: () => number;
}

/** Framework-independent queue; observer errors never affect task settlement. */
export function createRequestQueue(
  options: RequestQueueOptions = {}
): RequestQueueInstance {
  const queue = createTaskQueue({ concurrency: options.concurrency ?? 3 });
  let wasBusy = false;
  const notify = (callback: (() => void) | undefined) => {
    try {
      callback?.();
    } catch {
      /* Isolate observers. */
    }
  };
  queue.subscribe(() => {
    const busy = queue.getSnapshot().isRunning;
    if (wasBusy && !busy) {
      wasBusy = false;
      queueMicrotask(() => {
        if (!queue.getSnapshot().isRunning) notify(options.onIdle);
      });
    } else wasBusy = busy;
  });
  return {
    add: async <T>(
      task: () => Promise<T>,
      settings?: RequestQueueTaskOptions
    ) => {
      let started = false;
      try {
        const value = await queue.add(() => {
          started = true;
          return task();
        }, settings);
        notify(() => options.onSuccess?.(value));
        return value;
      } catch (error) {
        if (!started && error instanceof Error && error.name === 'AbortError') {
          throw Object.assign(new Error('Request queue task was cleared.'), {
            name: 'RequestQueueClearError',
          });
        }
        notify(() => options.onError?.(error));
        throw error;
      }
    },
    pause: queue.pause,
    resume: queue.resume,
    clear: queue.clearQueue,
    pendingCount: () => queue.getSnapshot().pendingCount,
    runningCount: () => queue.getSnapshot().activeCount,
  };
}
/** @deprecated This is a factory, not a React Hook. Use createRequestQueue. */
export const useRequestQueue = createRequestQueue;
