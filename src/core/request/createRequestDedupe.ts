/**
 * Options for request deduplication.
 */
export interface RequestDedupeOptions {
  /**
   * Cache TTL after a request settles, in milliseconds.
   */
  ttl?: number;
  /**
   * Cache rejected requests during TTL.
   *
   * @default false
   */
  cacheRejected?: boolean;
}

/**
 * Request deduplication instance.
 */
export interface RequestDedupeInstance {
  /**
   * Run a request by key. Same key reuses the existing promise.
   */
  run: <T>(key: string, request: () => Promise<T>) => Promise<T>;
  /**
   * Clear a cached key.
   */
  clear: (key: string) => void;
  /**
   * Clear all cached keys.
   */
  clearAll: () => void;
  /**
   * Get current cached keys.
   */
  getCacheKeys: () => string[];
}

interface CacheItem {
  promise: Promise<unknown>;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * Create a request dedupe helper that reuses promises for the same key.
 *
 * @param options Dedupe options.
 * @returns Request dedupe instance.
 */
export function createRequestDedupe(
  options: RequestDedupeOptions = {}
): RequestDedupeInstance {
  const { ttl, cacheRejected = false } = options;
  const cache = new Map<string, CacheItem>();

  const clear = (key: string) => {
    const item = cache.get(key);

    if (item?.timer) {
      clearTimeout(item.timer);
    }

    cache.delete(key);
  };

  const scheduleClear = (key: string) => {
    if (ttl === undefined) {
      clear(key);
      return;
    }

    const item = cache.get(key);

    if (!item) {
      return;
    }

    item.timer = setTimeout(() => {
      cache.delete(key);
    }, ttl);
  };

  const run = <T>(key: string, request: () => Promise<T>): Promise<T> => {
    const cached = cache.get(key);

    if (cached) {
      return cached.promise as Promise<T>;
    }

    const promise = request();
    cache.set(key, { promise });

    promise.then(
      () => {
        scheduleClear(key);
      },
      () => {
        if (cacheRejected) {
          scheduleClear(key);
        } else {
          clear(key);
        }
      }
    );

    return promise;
  };

  const clearAll = () => {
    Array.from(cache.keys()).forEach(clear);
  };

  const getCacheKeys = () => Array.from(cache.keys());

  return {
    run,
    clear,
    clearAll,
    getCacheKeys,
  };
}

/**
 * @example
 * const dedupe = createRequestDedupe({
 *   ttl: 1000,
 * });
 *
 * const user1 = dedupe.run('user-1', () => fetchUser(1));
 * const user2 = dedupe.run('user-1', () => fetchUser(1));
 *
 * // user1 and user2 reuse the same Promise.
 */
