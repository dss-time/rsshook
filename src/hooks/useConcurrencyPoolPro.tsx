import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// 单个任务函数：可以返回 Promise 或同步值，支持 AbortSignal
export type TaskFn<T = any> = (signal?: AbortSignal) => Promise<T> | T;

export interface AddTaskOptions {
  id?: string; // 任务ID，可选，不传就自动生成
  retry?: number; // 最大重试次数（失败后再试几次）
  retryDelay?: number; // 每次重试间隔 ms
  timeout?: number; // 超时时间 ms，0 或 undefined 表示不限制
}

// 内部任务结构
interface InternalTask<T = any> {
  id: string;
  fn: TaskFn<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
  options: {
    retry: number;
    retryDelay: number;
    timeout: number;
  };
  attempt: number; // 当前已经尝试的次数（从 0 开始）
  controller: AbortController;
  cleanup?: () => void;
}

// Hook 返回的 Pool 对象类型
export interface ConcurrencyPool {
  // 提交任务
  add<T = any>(fn: TaskFn<T>, options?: AddTaskOptions): Promise<T>;

  // 控制函数
  pause(): void;
  resume(): void;
  cancel(id: string): void; // 取消某个任务（队列中或运行中）
  clearQueue(): void; // 清空等待队列
  setConcurrency(n: number): void; // 动态调整并发数

  // 状态
  activeCount: number; // 正在执行中的任务数量
  pendingCount: number; // 等待中的任务数量
  completed: number; // 已完成（成功+失败+取消）
  total: number; // 总任务数（active + pending + completed）
  isPaused: boolean;
  isRunning: boolean; // 是否有任务在执行或等待
}

// 默认配置
const DEFAULT_RETRY = 0;
const DEFAULT_RETRY_DELAY = 0;
const DEFAULT_TIMEOUT = 0;

let globalTaskId = 0;

export function useConcurrencyPool(
  initialConcurrency: number = 5
): ConcurrencyPool {
  // 这些是暴露给组件使用的 UI 状态
  const [activeCount, setActiveCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  // ===== 内部可变数据，放在 ref 里，不触发重渲染 =====
  const concurrencyRef = useRef(Math.max(1, initialConcurrency));
  const activeCountRef = useRef(0);
  const completedRef = useRef(0);
  const pausedRef = useRef(false);
  const runningRef = useRef(false);

  const queueRef = useRef<InternalTask[]>([]);
  const runningTasksRef = useRef(new Set<InternalTask>());

  const retryTasksRef = useRef(
    new Map<InternalTask, ReturnType<typeof setTimeout>>()
  );
  const mountedRef = useRef(true);

  // 同步 ref -> state（做“快照”，用于 UI 展示）
  const syncState = useCallback(() => {
    if (!mountedRef.current) return;
    setActiveCount(activeCountRef.current);
    setPendingCount(queueRef.current.length + retryTasksRef.current.size);
    setCompleted(completedRef.current);
    setIsPaused(pausedRef.current);
    setIsRunning(runningRef.current);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    syncState();
    const runningTasks = runningTasksRef.current;
    const retryTasks = retryTasksRef.current;
    return () => {
      mountedRef.current = false;
      const tasks = new Set([
        ...queueRef.current,
        ...runningTasks,
        ...retryTasks.keys(),
      ]);
      retryTasks.forEach(timer => clearTimeout(timer));
      retryTasks.clear();
      queueRef.current = [];
      runningTasks.clear();
      activeCountRef.current = 0;
      runningRef.current = false;
      tasks.forEach(task => {
        task.cleanup?.();
        task.controller.abort();
        task.reject(new Error('Task cancelled (unmount)'));
      });
    };
  }, [syncState]);

  // 调度器：尝试从队列中拉任务执行
  const runNext = useCallback(
    function runNext() {
      if (!mountedRef.current || pausedRef.current) {
        return;
      }

      const runTask = (task: InternalTask) => {
        const { controller } = task;
        const { timeout, retry, retryDelay } = task.options;

        // 跟踪任务实例，用于取消和隔离已卸载的任务
        runningTasksRef.current.add(task);

        let timer: ReturnType<typeof setTimeout> | undefined;
        let onAbort: () => void;
        const p = new Promise<any>((resolve, reject) => {
          onAbort = () => reject(new Error('Task cancelled'));
          controller.signal.addEventListener('abort', onAbort, { once: true });
          if (timeout > 0) {
            timer = setTimeout(
              () => reject(new Error('Task timeout')),
              timeout
            );
          }
          Promise.resolve()
            .then(() => {
              if (controller.signal.aborted) throw new Error('Task cancelled');
              return task.fn(controller.signal);
            })
            .then(resolve, reject);
        });
        task.cleanup = () => {
          clearTimeout(timer);
          controller.signal.removeEventListener('abort', onAbort);
        };

        p.then(
          value => {
            task.cleanup?.();
            if (!runningTasksRef.current.has(task)) return;
            // 成功
            activeCountRef.current--;
            completedRef.current++;
            runningTasksRef.current.delete(task);

            task.resolve(value);
            runningRef.current =
              activeCountRef.current > 0 ||
              queueRef.current.length > 0 ||
              retryTasksRef.current.size > 0;
            syncState();
            runNext(); // 继续下一个
          },
          error => {
            task.cleanup?.();
            if (!runningTasksRef.current.has(task)) return;
            // 处理取消
            if (controller.signal.aborted) {
              activeCountRef.current--;
              completedRef.current++;
              runningTasksRef.current.delete(task);

              task.reject(error);
              runningRef.current =
                activeCountRef.current > 0 ||
                queueRef.current.length > 0 ||
                retryTasksRef.current.size > 0;
              syncState();
              runNext();
              return;
            }

            // 处理重试
            if (task.attempt < retry) {
              task.attempt++;

              activeCountRef.current--; // 当前这次占用的并发释放
              runningTasksRef.current.delete(task);

              // 延迟重试
              const retryTimer = setTimeout(() => {
                retryTasksRef.current.delete(task);
                queueRef.current.push(task);
                runningRef.current = true;
                syncState();
                runNext();
              }, retryDelay);
              retryTasksRef.current.set(task, retryTimer);
              runningRef.current = true;
              syncState();
              runNext();

              return;
            }

            // 最终失败
            activeCountRef.current--;
            completedRef.current++;
            runningTasksRef.current.delete(task);

            task.reject(error);
            runningRef.current =
              activeCountRef.current > 0 ||
              queueRef.current.length > 0 ||
              retryTasksRef.current.size > 0;
            syncState();
            runNext();
          }
        );
      };

      const concurrency = concurrencyRef.current;

      while (
        activeCountRef.current < concurrency &&
        queueRef.current.length > 0 &&
        !pausedRef.current
      ) {
        const task = queueRef.current.shift()!;
        activeCountRef.current++;
        runningRef.current = true;
        syncState();
        runTask(task);
      }

      // 队列空了，且没有运行中的任务 → 不再 running
      if (
        queueRef.current.length === 0 &&
        activeCountRef.current === 0 &&
        retryTasksRef.current.size === 0
      ) {
        runningRef.current = false;
        syncState();
      }
    },
    [syncState]
  );

  // 提交任务
  const add = useCallback(
    <T,>(fn: TaskFn<T>, options?: AddTaskOptions): Promise<T> => {
      if (!mountedRef.current)
        return Promise.reject(new Error('Pool unmounted'));
      const {
        id = `task-${globalTaskId++}`,
        retry = DEFAULT_RETRY,
        retryDelay = DEFAULT_RETRY_DELAY,
        timeout = DEFAULT_TIMEOUT,
      } = options || {};

      const controller = new AbortController();

      return new Promise<T>((resolve, reject) => {
        const task: InternalTask<T> = {
          id,
          fn,
          resolve,
          reject,
          options: { retry, retryDelay, timeout },
          attempt: 0,
          controller,
        };

        queueRef.current.push(task);
        runningRef.current = true;
        syncState();
        runNext();
      });
    },
    [runNext, syncState]
  );

  // 暂停：只是不再从队列取新任务，已经在跑的不会停
  const pause = useCallback(() => {
    pausedRef.current = true;
    syncState();
  }, [syncState]);

  // 恢复：继续从队列取任务
  const resume = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    runningRef.current =
      activeCountRef.current > 0 ||
      queueRef.current.length > 0 ||
      retryTasksRef.current.size > 0;
    syncState();
    runNext();
  }, [runNext, syncState]);

  // 取消某个任务
  const cancel = useCallback(
    (id: string) => {
      // 先从队列中找
      const q = queueRef.current;
      const index = q.findIndex(t => t.id === id);

      if (index !== -1) {
        const [task] = q.splice(index, 1);
        task.controller.abort();
        completedRef.current++;
        task.reject(new Error('Task cancelled'));
        runningRef.current =
          activeCountRef.current > 0 ||
          queueRef.current.length > 0 ||
          retryTasksRef.current.size > 0;
        syncState();
        return;
      }

      for (const [task, timer] of retryTasksRef.current) {
        if (task.id !== id) continue;
        clearTimeout(timer);
        retryTasksRef.current.delete(task);
        task.controller.abort();
        completedRef.current++;
        task.reject(new Error('Task cancelled'));
        runningRef.current =
          activeCountRef.current > 0 ||
          queueRef.current.length > 0 ||
          retryTasksRef.current.size > 0;
        syncState();
        return;
      }

      // 在运行中的任务里找
      const runningTask = [...runningTasksRef.current].find(
        task => task.id === id
      );
      if (runningTask) {
        runningTask.controller.abort();
        // 真正的 reject 会在 runTask 中统一处理
      }
    },
    [syncState]
  );

  // 清空等待队列（不影响正在执行的任务）
  const clearQueue = useCallback(() => {
    retryTasksRef.current.forEach((timer, task) => {
      clearTimeout(timer);
      task.controller.abort();
      completedRef.current++;
      task.reject(new Error('Task cancelled (clearQueue)'));
    });
    retryTasksRef.current.clear();
    const q = queueRef.current;
    while (q.length > 0) {
      const task = q.shift()!;
      task.controller.abort();
      completedRef.current++;
      task.reject(new Error('Task cancelled (clearQueue)'));
    }
    runningRef.current =
      activeCountRef.current > 0 ||
      queueRef.current.length > 0 ||
      retryTasksRef.current.size > 0;
    syncState();
  }, [syncState]);

  // 动态修改并发数
  const setConcurrency = useCallback(
    (n: number) => {
      concurrencyRef.current = Math.max(1, n);
      runNext();
    },
    [runNext]
  );

  const total = activeCount + pendingCount + completed;

  // 返回一个“Pool 对象”
  const pool: ConcurrencyPool = useMemo(
    () => ({
      add,
      pause,
      resume,
      cancel,
      clearQueue,
      setConcurrency,
      activeCount,
      pendingCount,
      completed,
      total,
      isPaused,
      isRunning,
    }),
    [
      add,
      pause,
      resume,
      cancel,
      clearQueue,
      setConcurrency,
      activeCount,
      pendingCount,
      completed,
      total,
      isPaused,
      isRunning,
    ]
  );

  return pool;
}
