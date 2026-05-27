import { Ref, ref } from 'vue';

export default function useConcurrencyPool<T = unknown>(concurrency = 5) {
  const activeCount = ref(0);
  const queueLength = ref(0);
  const completed = ref(0);
  const results = ref<T[]>([]) as Ref<T[]>;
  const isRunning = ref(false);

  const queue: {
    fn: () => Promise<T> | T;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
  }[] = [];

  const syncState = () => {
    queueLength.value = queue.length;
    isRunning.value = activeCount.value > 0 || queue.length > 0;
  };

  const runNext = () => {
    if (activeCount.value >= concurrency || queue.length === 0) {
      syncState();
      return;
    }

    const { fn, resolve, reject } = queue.shift()!;
    activeCount.value++;
    syncState();

    Promise.resolve()
      .then(fn)
      .then(
        value => {
          activeCount.value--;
          completed.value++;
          results.value.push(value);
          resolve(value);
          syncState();
          runNext();
        },
        error => {
          activeCount.value--;
          completed.value++;
          reject(error);
          syncState();
          runNext();
        }
      );
  };

  const addTask = (fn: () => Promise<T> | T): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      syncState();
      runNext();
    });
  };

  return {
    addTask,
    activeCount,
    queueLength,
    completed,
    results,
    isRunning,
  };
}

export { useConcurrencyPool };
