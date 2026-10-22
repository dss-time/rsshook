import { ExcelError, checkAbort, config } from './errors';
export function batchSize(size = 1000): number {
  config(
    Number.isSafeInteger(size) && size > 0 && size <= 10_000,
    'batchSize must be an integer from 1 to 10000'
  );
  return size;
}
export function chunkBytes(size = 64 * 1024): number {
  config(
    Number.isSafeInteger(size) && size > 0 && size <= 1024 * 1024,
    'chunkBytes must be an integer from 1 to 1048576'
  );
  return size;
}
export function yieldToHost(signal?: AbortSignal): Promise<void> {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, 0);
    const abort = () => {
      clearTimeout(timer);
      cleanup();
      reject(
        new ExcelError('CANCELLED', 'Operation cancelled', {
          cause: signal?.reason,
        })
      );
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}
export function fireCleanup(action: (() => unknown) | undefined): void {
  try {
    const result = action?.();
    if (result) void Promise.resolve(result).catch(() => {});
  } catch {
    /* Best-effort release must not hide the original error. */
  }
}
