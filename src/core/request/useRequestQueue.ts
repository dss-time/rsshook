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

interface QueueTask<T = unknown> {
  id: number;
  task: () => Promise<T>;
  priority: number;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

const createClearError = () => {
  const error = new Error('Request queue task was cleared.');
  error.name = 'RequestQueueClearError';
  return error;
};

/**
 * Create a framework-agnostic request queue with concurrency control.
 *
 * @param options Queue options.
 * @returns Request queue instance.
 */
export function useRequestQueue(
  options: RequestQueueOptions = {}
): RequestQueueInstance {
  const { concurrency = 3, onSuccess, onError, onIdle } = options;
  const maxConcurrency = Math.max(1, concurrency);
  const queue: QueueTask[] = [];
  let running = 0;
  let paused = false;
  let taskId = 0;

  const emitIdle = () => {
    if (running === 0 && queue.length === 0) {
      onIdle?.();
    }
  };

  const sortQueue = () => {
    queue.sort((prev, next) => {
      if (next.priority !== prev.priority) {
        return next.priority - prev.priority;
      }

      return prev.id - next.id;
    });
  };

  const runNext = () => {
    if (paused) {
      emitIdle();
      return;
    }

    while (running < maxConcurrency && queue.length > 0) {
      sortQueue();
      const current = queue.shift();

      if (!current) {
        break;
      }

      running += 1;

      current
        .task()
        .then(
          value => {
            onSuccess?.(value);
            current.resolve(value);
          },
          error => {
            onError?.(error);
            current.reject(error);
          }
        )
        .finally(() => {
          running -= 1;
          runNext();
          emitIdle();
        });
    }

    emitIdle();
  };

  const add = <T>(
    task: () => Promise<T>,
    taskOptions: RequestQueueTaskOptions = {}
  ) => {
    return new Promise<T>((resolve, reject) => {
      queue.push({
        id: taskId,
        task,
        priority: taskOptions.priority ?? 0,
        resolve: value => {
          resolve(value as T);
        },
        reject,
      });
      taskId += 1;
      runNext();
    });
  };

  const pause = () => {
    paused = true;
  };

  const resume = () => {
    paused = false;
    runNext();
  };

  const clear = () => {
    const error = createClearError();
    const pendingTasks = queue.splice(0, queue.length);

    pendingTasks.forEach(task => {
      task.reject(error);
    });
    emitIdle();
  };

  const pendingCount = () => queue.length;
  const runningCount = () => running;

  return {
    add,
    pause,
    resume,
    clear,
    pendingCount,
    runningCount,
  };
}

/**
 * @example
 * const queue = useRequestQueue({
 *   concurrency: 3,
 * });
 *
 * queue.add(() => uploadFile(file1));
 * queue.add(() => uploadFile(file2));
 * queue.add(() => uploadFile(file3));
 * queue.add(() => uploadFile(file4), { priority: 10 });
 */
