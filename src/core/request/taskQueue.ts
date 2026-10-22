export function abortError(reason?: unknown): Error {
  const error = new Error('Task cancelled');
  error.name = 'AbortError';
  Object.defineProperty(error, 'cause', { value: reason });
  return error;
}
export function integer(value: number, name: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || value < minimum)
    throw new RangeError(`${name} must be an integer >= ${minimum}`);
  return value;
}
export interface TaskOptions {
  id?: string;
  signal?: AbortSignal;
  retry?: number;
  retryDelay?: number;
  timeout?: number;
  priority?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}
export interface QueueSnapshot {
  activeCount: number;
  pendingCount: number;
  completed: number;
  total: number;
  isPaused: boolean;
  isRunning: boolean;
}
interface Task {
  id: string;
  run: (signal: AbortSignal) => unknown;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  options: TaskOptions;
  attempt: number;
  state: 'pending' | 'running' | 'waiting' | 'done';
  controller?: AbortController;
  timer?: ReturnType<typeof setTimeout>;
  unlink: () => void;
}
/** A queue bounds logical tasks. Physical I/O must honor the supplied AbortSignal. */
export function createTaskQueue(options: { concurrency?: number } = {}) {
  let concurrency = integer(options.concurrency ?? 5, 'concurrency', 1);
  const tasks = new Map<string, Task>();
  const listeners = new Set<() => void>();
  let active = 0,
    completed = 0,
    sequence = 0,
    paused = false,
    disposed = false;
  let snapshot: QueueSnapshot = {
    activeCount: 0,
    pendingCount: 0,
    completed: 0,
    total: 0,
    isPaused: false,
    isRunning: false,
  };
  const emit = () => {
    snapshot = {
      activeCount: active,
      pendingCount: tasks.size - active,
      completed,
      total: completed + tasks.size,
      isPaused: paused,
      isRunning: tasks.size > 0,
    };
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        /* Observers cannot strand tasks. */
      }
    }
  };
  const finish = (task: Task, error: unknown, value?: unknown) => {
    if (task.state === 'done') return;
    if (task.state === 'running') active--;
    clearTimeout(task.timer);
    task.unlink();
    task.state = 'done';
    tasks.delete(task.id);
    completed++;
    if (error !== undefined) task.reject(error);
    else task.resolve(value);
    emit();
    pump();
  };
  const cancel = (id: string) => {
    const task = tasks.get(id);
    if (!task) return;
    const controller = task.controller;
    finish(task, abortError(task.options.signal?.reason));
    controller?.abort();
  };
  const failed = (task: Task, error: unknown) => {
    if (task.state !== 'running') return;
    clearTimeout(task.timer);
    let retry = false;
    try {
      retry =
        task.attempt < (task.options.retry ?? 0) &&
        (task.options.shouldRetry?.(error, task.attempt + 1) ?? true);
    } catch (cause) {
      finish(task, cause);
      return;
    }
    if (!retry) {
      finish(task, error);
      return;
    }
    active--;
    task.attempt++;
    task.state = 'waiting';
    task.timer = setTimeout(() => {
      if (task.state !== 'waiting') return;
      task.state = 'pending';
      emit();
      pump();
    }, task.options.retryDelay ?? 0);
    emit();
    pump();
  };
  function pump() {
    if (paused || disposed) return;
    while (active < concurrency) {
      const next = [...tasks.values()]
        .filter(t => t.state === 'pending')
        .sort(
          (a, b) => (b.options.priority ?? 0) - (a.options.priority ?? 0)
        )[0];
      if (!next) break;
      next.state = 'running';
      active++;
      const controller = new AbortController();
      next.controller = controller;
      emit();
      if (next.options.timeout) {
        next.timer = setTimeout(() => {
          if (next.state !== 'running' || next.controller !== controller)
            return;
          const error = new Error('Task timed out');
          error.name = 'TimeoutError';
          // Mark the attempt failed before its abort handler can settle the same task.
          failed(next, error);
          controller.abort(error);
        }, next.options.timeout);
      }
      Promise.resolve()
        .then(() => {
          if (controller.signal.aborted || next.state !== 'running')
            throw abortError();
          return next.run(controller.signal);
        })
        .then(
          value => {
            if (
              next.controller !== controller ||
              controller.signal.aborted ||
              next.state !== 'running'
            )
              return;
            finish(next, undefined, value);
          },
          error => {
            if (
              next.controller !== controller ||
              controller.signal.aborted ||
              next.state !== 'running'
            )
              return;
            failed(
              next,
              error === undefined ? new Error('Task rejected') : error
            );
          }
        );
    }
  }
  return {
    add<T>(
      run: (signal: AbortSignal) => T | Promise<T>,
      options: TaskOptions = {}
    ): Promise<T> {
      try {
        integer(options.retry ?? 0, 'retry');
        integer(options.retryDelay ?? 0, 'retryDelay');
        integer(options.timeout ?? 0, 'timeout');
        if (!Number.isFinite(options.priority ?? 0))
          throw new RangeError('priority must be finite');
        if (disposed || options.signal?.aborted)
          return Promise.reject(abortError(options.signal?.reason));
        const id = options.id ?? `task-${sequence++}`;
        if (tasks.has(id)) throw new Error(`Duplicate task id: ${id}`);
        return new Promise<T>((resolve, reject) => {
          const abort = () => cancel(id);
          const task: Task = {
            id,
            run,
            resolve: value => resolve(value as T),
            reject,
            options,
            attempt: 0,
            state: 'pending',
            unlink: () => options.signal?.removeEventListener('abort', abort),
          };
          tasks.set(id, task);
          options.signal?.addEventListener('abort', abort, { once: true });
          emit();
          pump();
        });
      } catch (error) {
        return Promise.reject(error);
      }
    },
    cancel,
    cancelAll() {
      const previous = paused;
      paused = true;
      for (const id of [...tasks.keys()]) cancel(id);
      paused = previous;
      emit();
    },
    clearQueue() {
      for (const task of [...tasks.values()])
        if (task.state !== 'running') cancel(task.id);
    },
    pause() {
      paused = true;
      emit();
    },
    resume() {
      paused = false;
      emit();
      pump();
    },
    setConcurrency(value: number) {
      concurrency = integer(value, 'concurrency', 1);
      pump();
    },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      disposed = true;
      for (const id of [...tasks.keys()]) cancel(id);
      listeners.clear();
    },
  };
}
export type TaskQueue = ReturnType<typeof createTaskQueue>;
