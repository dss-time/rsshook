import { computed, ref } from 'vue';

export type TaskFn<T = unknown> = (signal?: AbortSignal) => Promise<T> | T;

export interface AddTaskOptions {
  id?: string;
  retry?: number;
  retryDelay?: number;
  timeout?: number;
}

interface InternalTask<T = unknown> {
  id: string;
  fn: TaskFn<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  options: Required<Omit<AddTaskOptions, 'id'>>;
  attempt: number;
  controller: AbortController;
}

let globalTaskId = 0;

export default function useConcurrencyPoolPro(initialConcurrency = 5) {
  const activeCount = ref(0);
  const pendingCount = ref(0);
  const completed = ref(0);
  const isPaused = ref(false);
  const isRunning = ref(false);
  const concurrency = ref(Math.max(1, initialConcurrency));

  const queue: InternalTask<any>[] = [];
  const runningMap = new Map<string, InternalTask<any>>();

  const syncState = () => {
    pendingCount.value = queue.length;
    isRunning.value = activeCount.value > 0 || queue.length > 0;
  };

  const runNext = () => {
    if (isPaused.value) return;

    while (
      activeCount.value < concurrency.value &&
      queue.length > 0 &&
      !isPaused.value
    ) {
      const task = queue.shift()!;
      activeCount.value++;
      syncState();
      runTask(task);
    }

    syncState();
  };

  const runTask = (task: InternalTask) => {
    const { controller } = task;
    const { timeout, retry, retryDelay } = task.options;

    runningMap.set(task.id, task);

    let promise: Promise<unknown> = Promise.resolve().then(() =>
      task.fn(controller.signal)
    );

    if (timeout > 0) {
      promise = Promise.race([
        promise,
        new Promise((_, reject) => {
          const timer = setTimeout(() => {
            if (!controller.signal.aborted) {
              reject(new Error('Task timeout'));
            }
          }, timeout);

          controller.signal.addEventListener('abort', () => clearTimeout(timer));
        }),
      ]);
    }

    promise.then(
      value => {
        activeCount.value--;
        completed.value++;
        runningMap.delete(task.id);
        task.resolve(value);
        syncState();
        runNext();
      },
      error => {
        activeCount.value--;
        runningMap.delete(task.id);

        if (!controller.signal.aborted && task.attempt < retry) {
          task.attempt++;
          setTimeout(() => {
            queue.push(task);
            syncState();
            runNext();
          }, retryDelay);
          syncState();
          runNext();
          return;
        }

        completed.value++;
        task.reject(error);
        syncState();
        runNext();
      }
    );
  };

  const add = <T = unknown>(
    fn: TaskFn<T>,
    options: AddTaskOptions = {}
  ): Promise<T> => {
    const {
      id = `task-${globalTaskId++}`,
      retry = 0,
      retryDelay = 0,
      timeout = 0,
    } = options;

    return new Promise<T>((resolve, reject) => {
      queue.push({
        id,
        fn,
        resolve,
        reject,
        options: { retry, retryDelay, timeout },
        attempt: 0,
        controller: new AbortController(),
      });
      syncState();
      runNext();
    });
  };

  const pause = () => {
    isPaused.value = true;
  };

  const resume = () => {
    isPaused.value = false;
    runNext();
  };

  const cancel = (id: string) => {
    const index = queue.findIndex(task => task.id === id);

    if (index !== -1) {
      const [task] = queue.splice(index, 1);
      task.controller.abort();
      completed.value++;
      task.reject(new Error('Task cancelled'));
      syncState();
      return;
    }

    runningMap.get(id)?.controller.abort();
  };

  const clearQueue = () => {
    while (queue.length > 0) {
      const task = queue.shift()!;
      task.controller.abort();
      completed.value++;
      task.reject(new Error('Task cancelled'));
    }
    syncState();
  };

  const setConcurrency = (value: number) => {
    concurrency.value = Math.max(1, value);
    runNext();
  };

  return {
    add,
    pause,
    resume,
    cancel,
    clearQueue,
    setConcurrency,
    activeCount,
    pendingCount,
    completed,
    total: computed(() => activeCount.value + pendingCount.value + completed.value),
    isPaused,
    isRunning,
  };
}

export { useConcurrencyPoolPro };
