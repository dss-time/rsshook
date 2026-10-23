import { abortError } from './taskQueue';
/** Observe late failures while promptly settling cancellation. */
export function abortableTask<T>(
  promise: PromiseLike<T>,
  signal: AbortSignal,
  createError: () => Error = () => abortError(signal.reason)
): Promise<T> {
  const source = Promise.resolve(promise);
  if (signal.aborted) {
    void source.catch(() => {});
    return Promise.reject(createError());
  }
  return new Promise((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(createError());
    };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    source.then(
      value => {
        cleanup();
        resolve(value);
      },
      error => {
        cleanup();
        reject(error);
      }
    );
  });
}
