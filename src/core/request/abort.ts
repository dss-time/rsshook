import { abortError } from './taskQueue';
/** Observe late failures while promptly settling cancellation. */
export function abortableTask<T>(
  promise: PromiseLike<T>,
  signal: AbortSignal
): Promise<T> {
  const source = Promise.resolve(promise);
  if (signal.aborted) {
    void source.catch(() => {});
    return Promise.reject(abortError(signal.reason));
  }
  return new Promise((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(abortError(signal.reason));
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
