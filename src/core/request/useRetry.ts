/**
 * Options for retrying an async task.
 *
 * @template T Async task result type.
 */
export interface UseRetryOptions<T = unknown> {
  /**
   * Maximum retry count after the first failed attempt.
   *
   * @default 3
   */
  retries?: number;
  /**
   * Delay before retrying in milliseconds.
   *
   * @default 0
   */
  delay?: number;
  /**
   * Use exponential backoff based on the current attempt.
   *
   * @default false
   */
  backoff?: boolean;
  /**
   * Abort signal used to cancel retrying.
   */
  signal?: AbortSignal;
  /**
   * Decide whether an error should be retried.
   */
  shouldRetry?: (error: unknown, attempt: number) => boolean | Promise<boolean>;
  /**
   * Called before each retry.
   */
  onRetry?: (error: unknown, attempt: number) => void;
}

const createAbortError = () => {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }

  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
};

const assertNotAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw createAbortError();
  }
};

const sleep = (ms: number, signal?: AbortSignal) => {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, ms);

    const handleAbort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };

    signal?.addEventListener('abort', handleAbort, { once: true });
  });
};

/**
 * Retry an async task when it fails.
 *
 * The first execution is attempt 0. Retry callbacks receive attempt numbers
 * starting from 1 for the next retry.
 *
 * @template T Async task result type.
 * @param fn Async task to run.
 * @param options Retry options.
 * @returns Resolved task result.
 */
export async function useRetry<T>(
  fn: () => Promise<T>,
  options: UseRetryOptions<T> = {}
): Promise<T> {
  const {
    retries = 3,
    delay = 0,
    backoff = false,
    signal,
    shouldRetry,
    onRetry,
  } = options;

  let attempt = 0;

  while (true) {
    assertNotAborted(signal);

    try {
      return await fn();
    } catch (error) {
      assertNotAborted(signal);

      if (attempt >= retries) {
        throw error;
      }

      const nextAttempt = attempt + 1;
      const canRetry = shouldRetry
        ? await shouldRetry(error, nextAttempt)
        : true;

      if (!canRetry) {
        throw error;
      }

      onRetry?.(error, nextAttempt);

      const retryDelay = backoff ? delay * 2 ** attempt : delay;
      await sleep(retryDelay, signal);

      attempt = nextAttempt;
    }
  }
}

/**
 * @example
 * const result = await useRetry(() => fetchData(), {
 *   retries: 3,
 *   delay: 1000,
 *   backoff: true,
 * });
 */
