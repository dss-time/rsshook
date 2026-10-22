import { ExcelError, checkAbort } from './errors';
import type { ExcelInput } from './types';

export type SheetJs = typeof import('xlsx');
let engine: Promise<SheetJs> | undefined;
export function loadEngine(): Promise<SheetJs> {
  if (!engine) {
    engine = import('xlsx')
      .then(module => {
        const candidate = module as unknown as Partial<SheetJs> & {
          default?: SheetJs;
        };
        const result = candidate.default ?? (candidate as SheetJs);
        if (!result?.read || !result?.utils)
          throw new ExcelError('ENGINE_UNAVAILABLE', 'SheetJS is unavailable');
        return result;
      })
      .catch(error => {
        engine = undefined;
        throw new ExcelError('ENGINE_UNAVAILABLE', 'Unable to load SheetJS', {
          cause: error,
        });
      });
  }
  return engine;
}
/** Race async I/O with cancellation without retaining event listeners. */
export function abortable<T>(
  promise: Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  checkAbort(signal);
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(
        new ExcelError('CANCELLED', 'Operation cancelled', {
          cause: signal.reason,
        })
      );
    };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
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
export async function readInput(
  input: ExcelInput,
  maxSize: number,
  signal?: AbortSignal
): Promise<Uint8Array> {
  checkAbort(signal);
  const size =
    input instanceof Uint8Array
      ? input.byteLength
      : input instanceof ArrayBuffer
        ? input.byteLength
        : input.size;
  if (!Number.isFinite(size) || size > maxSize)
    throw new ExcelError('FILE_SIZE_LIMIT', 'File exceeds size limit');
  if (size === 0) throw new ExcelError('EMPTY_FILE', 'File is empty');
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  try {
    return new Uint8Array(await abortable(input.arrayBuffer(), signal));
  } catch (error) {
    if (error instanceof ExcelError) throw error;
    throw new ExcelError('FILE_READ_FAILED', 'Unable to read file', {
      cause: error,
    });
  }
}
export function columnIndex(value: string): number {
  if (!/^[A-Z]{1,3}$/i.test(value))
    throw new ExcelError('INVALID_CONFIG', `Invalid column: ${value}`);
  const index =
    value
      .toUpperCase()
      .split('')
      .reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
  if (index >= 16_384)
    throw new ExcelError(
      'INVALID_CONFIG',
      `Column exceeds Excel limit: ${value}`
    );
  return index;
}
export function columnName(index: number): string {
  let result = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
  return result;
}

let codepages: Promise<void> | undefined;
/** Legacy XLS/non-UTF CSV codepages are loaded only when needed. */
export function ensureCodepages(engine: SheetJs): Promise<void> {
  if (typeof engine.set_cptable !== 'function') return Promise.resolve();
  if (!codepages)
    codepages = import('xlsx/dist/cpexcel.full.mjs')
      .then(table => {
        engine.set_cptable(table);
      })
      .catch(cause => {
        codepages = undefined;
        throw new ExcelError(
          'ENGINE_UNAVAILABLE',
          'Unable to load legacy codepages',
          { cause }
        );
      });
  return codepages;
}
