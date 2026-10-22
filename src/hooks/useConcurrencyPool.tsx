import { useCallback, useEffect, useRef, useState } from 'react';
import { useConcurrencyPool as usePool } from './useConcurrencyPoolPro';
/** Legacy convenience API. Disable collection for large jobs. */
export function useConcurrencyPool<T = unknown>(
  concurrency = 5,
  options: { collectResults?: boolean } = {}
) {
  const pool = usePool(concurrency);
  const { add } = pool;
  const [results, setResults] = useState<T[]>([]);
  const mounted = useRef(true),
    generation = useRef(0);
  useEffect(() => {
    mounted.current = true;
    const currentGeneration = generation.current;
    return () => {
      mounted.current = false;
      generation.current = currentGeneration + 1;
    };
  }, []);
  const collect = options.collectResults !== false;
  const addTask = useCallback(
    async (fn: () => T | Promise<T>) => {
      const current = generation.current;
      const value = await add(fn);
      if (collect && mounted.current && current === generation.current)
        setResults(previous => [...previous, value]);
      return value;
    },
    [add, collect]
  );
  return {
    addTask,
    activeCount: pool.activeCount,
    queueLength: pool.pendingCount,
    completed: pool.completed,
    total: pool.total,
    results,
    isRunning: pool.isRunning,
  };
}
