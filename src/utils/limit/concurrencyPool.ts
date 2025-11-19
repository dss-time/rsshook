export async function concurrencyPool<T>(
  tasks: (() => Promise<T>)[],
  maxConcurrency: number,
  onProgress?: (finished: number, total: number) => void,
): Promise<T[]> {
  if (!Array.isArray(tasks)) {
    throw new Error('tasks 必须为函数数组');
  }

  const total = tasks.length;
  const results: T[] = new Array(total);
  let finished = 0;
  let currentIndex = 0;

  const worker = async () => {
    while (true) {
      const taskIndex = currentIndex++;
      if (taskIndex >= total) break;

      try {
        const res = await tasks[taskIndex]();
        results[taskIndex] = res;
      } catch (err) {
        results[taskIndex] = err as any as T;
      } finally {
        finished++;
        onProgress?.(finished, total);
      }
    }
  };

  const workerCount = Math.min(maxConcurrency, total);
  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}
