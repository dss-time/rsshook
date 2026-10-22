import { useCallback, useEffect, useRef, useState } from 'react';

export function useConcurrencyPool<T = unknown>(concurrency = 5) {
  const [activeCount, setActiveCount] = useState(0);
  const [queueLength, setQueueLength] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [results, setResults] = useState<T[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  // 用 ref 保存可变数据，不触发重渲染
  const activeCountRef = useRef(0);
  const queueRef = useRef<
    {
      fn: () => Promise<T> | T;
      resolve: (value: T) => void;
      reject: (error: any) => void;
    }[]
  >([]);
  const resultsRef = useRef<T[]>([]);
  const completedRef = useRef(0);
  const runningRef = useRef(false);
  const concurrencyRef = useRef(concurrency);

  const mountedRef = useRef(true);
  const runningTasksRef = useRef(new Set<(typeof queueRef.current)[number]>());

  // 同步 state 和 ref，避免闭包问题
  const syncState = useCallback(() => {
    if (!mountedRef.current) return;
    setActiveCount(activeCountRef.current);
    setQueueLength(queueRef.current.length);
    setCompleted(completedRef.current);
    setResults([...resultsRef.current]);
    setIsRunning(runningRef.current);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    syncState();
    const queue = queueRef.current;
    const runningTasks = runningTasksRef.current;
    return () => {
      mountedRef.current = false;
      const error = new Error('Task cancelled (unmount)');
      queue.splice(0).forEach(task => task.reject(error));
      runningTasks.forEach(task => task.reject(error));
      runningTasks.clear();
      activeCountRef.current = 0;
      runningRef.current = false;
    };
  }, [syncState]);

  // 调度器
  const runNext = useCallback(() => {
    if (!mountedRef.current) return;
    if (
      activeCountRef.current >= concurrencyRef.current ||
      queueRef.current.length === 0
    ) {
      if (queueRef.current.length === 0 && activeCountRef.current === 0) {
        runningRef.current = false;
        syncState();
      }
      return;
    }

    runningRef.current = true;

    const task = queueRef.current.shift()!;
    const { fn, resolve, reject } = task;
    runningTasksRef.current.add(task);
    activeCountRef.current++;

    syncState();

    Promise.resolve()
      .then(() => {
        if (!runningTasksRef.current.has(task))
          throw new Error('Task cancelled');
        return fn();
      })
      .then(
        value => {
          if (!runningTasksRef.current.delete(task)) return;
          activeCountRef.current--;
          completedRef.current++;
          resultsRef.current.push(value);

          resolve(value);
          syncState();
          runNext();
        },
        error => {
          if (!runningTasksRef.current.delete(task)) return;
          activeCountRef.current--;
          completedRef.current++;
          reject(error);

          syncState();
          runNext();
        }
      );
  }, [syncState]);

  // 接收任务
  const addTask = useCallback(
    (fn: () => Promise<T> | T): Promise<T> => {
      if (!mountedRef.current)
        return Promise.reject(new Error('Pool unmounted'));
      return new Promise<T>((resolve, reject) => {
        queueRef.current.push({ fn, resolve, reject });
        syncState();
        runNext();
      });
    },
    [runNext, syncState]
  );

  return {
    addTask,
    // 状态
    activeCount,
    queueLength,
    completed,
    total: completed + queueLength + activeCount,
    results,
    isRunning,
  };
}
