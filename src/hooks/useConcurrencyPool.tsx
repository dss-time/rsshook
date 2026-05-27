import { useCallback, useRef, useState } from 'react';

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

  // 同步 state 和 ref，避免闭包问题
  const syncState = () => {
    setActiveCount(activeCountRef.current);
    setQueueLength(queueRef.current.length);
    setCompleted(completedRef.current);
    setResults([...resultsRef.current]);
    setIsRunning(runningRef.current);
  };

  // 调度器
  const runNext = useCallback(() => {
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

    const { fn, resolve, reject } = queueRef.current.shift()!;
    activeCountRef.current++;

    syncState();

    Promise.resolve()
      .then(fn)
      .then(
        value => {
          activeCountRef.current--;
          completedRef.current++;
          resultsRef.current.push(value);

          resolve(value);
          syncState();
          runNext();
        },
        error => {
          activeCountRef.current--;
          completedRef.current++;
          reject(error);

          syncState();
          runNext();
        }
      );
  }, []);

  // 接收任务
  const addTask = useCallback(
    (fn: () => Promise<T> | T): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        queueRef.current.push({ fn, resolve, reject });
        syncState();
        runNext();
      });
    },
    [runNext]
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
