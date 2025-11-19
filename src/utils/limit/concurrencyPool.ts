/**
 * 控制并发执行的任务池（跨框架通用）
 * @param tasks  任务数组（每个任务是无参函数，返回 Promise）
 * @param maxConcurrency 最大并发数
 * @param onProgress 可选：进度回调 (finished, total)
 */
export async function concurrencyPool<T>(
  tasks: (() => Promise<T>)[],
  maxConcurrency: number,
  onProgress?: (finished: number, total: number) => void,
): Promise<T[]> {
  if (!Array.isArray(tasks)) {
    throw new Error('tasks 必须为函数数组');
  }

  const total = tasks.length;
  let finished = 0;
  const results: T[] = [];
  const executing: Promise<void>[] = [];

  const runTask = (task: () => Promise<T>) =>
    Promise.resolve().then(async () => {
      try {
        const res = await task();
        results.push(res);
      } catch (err) {
        results.push(err as any);
      } finally {
        finished++;
        onProgress?.(finished, total);
      }
    });

  for (const task of tasks) {
    const p = runTask(task);
    executing.push(p);

    if (executing.length >= maxConcurrency) {
      await Promise.race(executing);
      executing.splice(executing.indexOf(p), 1);
    }
  }

  await Promise.all(executing);
  return results;
}
