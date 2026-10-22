import { ExcelError, checkAbort, config } from './errors';
import type { CsvInput, ExcelExecution, ExcelWorker } from './types';
import type { RawSource, ReadConfig, RawMeta, RawBatch } from './raw-types';

export function workerSession(
  execution: Extract<ExcelExecution, { mode: 'worker' }>,
  signal?: AbortSignal
) {
  checkAbort(signal);
  const timeout = execution.timeoutMs ?? 120_000;
  config(
    Number.isSafeInteger(timeout) && timeout > 0,
    'Worker timeoutMs must be a positive integer'
  );
  let worker: ExcelWorker;
  try {
    worker = execution.workerFactory();
  } catch (cause) {
    throw new ExcelError('WORKER_UNAVAILABLE', 'Unable to create Worker', {
      cause,
    });
  }
  let seq = 0;
  let closed = false;
  let failure: ExcelError | undefined;
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: unknown) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const close = (
    error = new ExcelError('CANCELLED', 'Worker operation closed')
  ) => {
    if (closed) return;
    closed = true;
    failure = error;
    signal?.removeEventListener('abort', abort);
    worker.removeEventListener('message', message);
    worker.removeEventListener('error', failed);
    worker.removeEventListener('messageerror', failed);
    worker.terminate();
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    pending.clear();
  };
  const abort = () =>
    close(
      new ExcelError('CANCELLED', 'Operation cancelled', {
        cause: signal?.reason,
      })
    );
  const failed = () =>
    close(
      new ExcelError(
        'WORKER_FAILED',
        'Worker crashed or returned an unreadable message'
      )
    );
  const message = (event: MessageEvent) => {
    const response = event.data;
    const request = pending.get(response?.id);
    if (!request) return;
    pending.delete(response.id);
    clearTimeout(request.timer);
    if (response.error) {
      const error = new ExcelError(
        response.error.code,
        response.error.message,
        { issues: response.error.issues }
      );
      request.reject(error);
      close(error);
    } else request.resolve(response.value);
  };
  worker.addEventListener('message', message);
  worker.addEventListener('error', failed);
  worker.addEventListener('messageerror', failed);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  return {
    close,
    request<R>(
      type: string,
      payload?: unknown,
      transfer: Transferable[] = []
    ): Promise<R> {
      if (closed) return Promise.reject(failure);
      const id = ++seq;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () =>
            close(
              new ExcelError('WORKER_TIMEOUT', 'Worker response timed out')
            ),
          timeout
        );
        pending.set(id, {
          resolve: value => resolve(value as R),
          reject,
          timer,
        });
        try {
          worker.postMessage({ id, type, payload }, transfer);
        } catch (cause) {
          close(
            new ExcelError(
              'WORKER_TRANSFER_FAILED',
              'Unable to transfer Worker request',
              { cause }
            )
          );
        }
      });
    },
  };
}
export async function openWorkerSource(
  input: CsvInput,
  options: ReadConfig,
  format: 'excel' | 'csv',
  execution: Extract<ExcelExecution, { mode: 'worker' }>,
  signal?: AbortSignal
): Promise<RawSource> {
  config(
    typeof (input as ReadableStream<Uint8Array>).getReader !== 'function',
    'Worker import accepts Blob, ArrayBuffer or Uint8Array; use main mode for ReadableStream'
  );
  const size =
    input instanceof Uint8Array || input instanceof ArrayBuffer
      ? input.byteLength
      : (input as Blob).size;
  if (!Number.isFinite(size) || size > options.limits.maxFileSize)
    throw new ExcelError('FILE_SIZE_LIMIT', 'File exceeds size limit');
  if (size === 0) throw new ExcelError('EMPTY_FILE', 'File is empty');
  const session = workerSession(execution, signal);
  try {
    // Copy caller-owned buffers so transferring never detaches application data.
    const payload =
      input instanceof Uint8Array
        ? new Uint8Array(input).buffer
        : input instanceof ArrayBuffer
          ? input.slice(0)
          : input;
    const meta = await session.request<RawMeta>(
      'read',
      { input: payload, options, format },
      payload instanceof ArrayBuffer ? [payload] : []
    );
    return {
      meta,
      next: size => session.request<RawBatch>('pull', size),
      close: () => session.close(),
    };
  } catch (error) {
    session.close();
    throw error;
  }
}
